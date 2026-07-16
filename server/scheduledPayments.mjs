/**
 * Scheduled payments storage — simple JSON file DB, same pattern as
 * wallets-db.json (see walletsDb.mjs).
 *
 * A payment record unifies one-time and recurring schedules behind a single
 * `nextRun` timestamp: the scheduler just asks "which pending payments have
 * nextRun <= now" — it doesn't need separate code paths for "due date" vs
 * "due recurrence".
 *
 *   {
 *     id, walletAddress, recipient, amount, token,
 *     scheduledFor,      // ISO string | null — set for one-time payments
 *     recurrence,        // 'daily'|'weekly'|'monthly' | null
 *     recurrenceDay,     // weekday name (weekly) or day-of-month (monthly) | null
 *     recurrenceTime,    // 'HH:mm' | null
 *     nextRun,           // ISO string — when the scheduler should fire next
 *     status,            // 'pending' | 'executed' | 'failed' | 'cancelled'
 *     txHash,            // last successful tx hash | null
 *     lastError,         // last failure message | null
 *     history,           // [{ executedAt, txHash? , error? }, ...] — recurring run log
 *     createdAt, executedAt,
 *   }
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'

const __dir = dirname(fileURLToPath(import.meta.url))
const DB_FILE = resolve(__dir, 'scheduled-payments-db.json')

function dbRead() {
  if (!existsSync(DB_FILE)) return []
  return JSON.parse(readFileSync(DB_FILE, 'utf-8'))
}

function dbWrite(payments) {
  writeFileSync(DB_FILE, JSON.stringify(payments, null, 2), 'utf-8')
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

function parseWeekday(day) {
  if (day == null) return null
  const s = String(day).trim().toLowerCase()
  if (/^\d+$/.test(s)) {
    const n = Number(s)
    return n >= 0 && n <= 6 ? n : null
  }
  const idx = WEEKDAYS.findIndex(w => w === s || w.startsWith(s.slice(0, 3)))
  return idx === -1 ? null : idx
}

function parseTimeOfDay(time) {
  const m = /^(\d{1,2}):(\d{2})$/.exec((time ?? '').trim())
  if (!m) return { hours: 9, minutes: 0 } // default 09:00
  const hours = Math.min(23, Math.max(0, Number(m[1])))
  const minutes = Math.min(59, Math.max(0, Number(m[2])))
  return { hours, minutes }
}

/**
 * Compute the next fire time (ISO string) strictly after `fromDate`.
 * One-time payments just use `scheduledFor` as-is (only called once, at creation).
 *
 * All arithmetic below uses the UTC-suffixed Date methods deliberately —
 * recurrenceTime/recurrenceDay are interpreted as UTC (matching the "Z"
 * suffix already used for scheduledFor). Using local-time methods here would
 * make "every day at 09:00" fire at a different real-world instant depending
 * on the server process's OS timezone, which is not something we control or
 * want this feature's correctness to depend on.
 */
export function computeNextRun({ scheduledFor, recurrence, recurrenceDay, recurrenceTime }, fromDate = new Date()) {
  if (!recurrence) {
    const d = new Date(scheduledFor)
    if (Number.isNaN(d.getTime())) throw new Error('Invalid scheduledFor datetime')
    return d.toISOString()
  }

  const { hours, minutes } = parseTimeOfDay(recurrenceTime)
  const next = new Date(fromDate)
  next.setUTCSeconds(0, 0)
  next.setUTCHours(hours, minutes, 0, 0)

  if (recurrence === 'daily') {
    if (next <= fromDate) next.setUTCDate(next.getUTCDate() + 1)
    return next.toISOString()
  }

  if (recurrence === 'weekly') {
    const targetDow = parseWeekday(recurrenceDay)
    if (targetDow === null) throw new Error('recurrenceDay is required and must be a weekday for weekly recurrence')
    while (next.getUTCDay() !== targetDow || next <= fromDate) {
      next.setUTCDate(next.getUTCDate() + 1)
    }
    return next.toISOString()
  }

  if (recurrence === 'monthly') {
    const dom = Number(recurrenceDay)
    if (!Number.isInteger(dom) || dom < 1 || dom > 31) {
      throw new Error('recurrenceDay is required and must be a day of month (1-31) for monthly recurrence')
    }
    next.setUTCDate(1)
    const daysInMonth = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
    const clampedDay = Math.min(dom, daysInMonth(next.getUTCFullYear(), next.getUTCMonth()))
    next.setUTCDate(clampedDay)
    if (next <= fromDate) {
      next.setUTCMonth(next.getUTCMonth() + 1, 1)
      const clamped = Math.min(dom, daysInMonth(next.getUTCFullYear(), next.getUTCMonth()))
      next.setUTCDate(clamped)
    }
    return next.toISOString()
  }

  throw new Error(`Unknown recurrence: ${recurrence}`)
}

export function listPayments(walletAddress) {
  const addr = (walletAddress ?? '').toLowerCase()
  return dbRead()
    .filter(p => p.walletAddress === addr)
    .sort((a, b) => new Date(a.nextRun ?? a.scheduledFor) - new Date(b.nextRun ?? b.scheduledFor))
}

export function createPayment({ walletAddress, notifyAddress, senderAddress, recipient, amount, token, scheduledFor, recurrence, recurrenceDay, recurrenceTime }) {
  const nextRun = computeNextRun({ scheduledFor, recurrence, recurrenceDay, recurrenceTime })
  const payment = {
    id:             randomUUID(),
    // walletAddress is the Circle-managed automation wallet the scheduler
    // signs with (resolveWalletId looks this up) — it can be a different
    // address than the one the browser session is actually using (see
    // resolveCircleOwner in agent.mjs). notifyAddress is that browsing-
    // session address, kept separately so the scheduler can tell the SSE
    // stream who to notify — broadcasting under walletAddress would target
    // an address no open browser tab is ever subscribed to.
    walletAddress:  (walletAddress ?? '').toLowerCase(),
    notifyAddress:  (notifyAddress ?? walletAddress ?? '').toLowerCase(),
    // senderAddress is the user's own Privy embedded wallet — the funds
    // source when AUTOMATION_SIGNER=privy. Falls back to notifyAddress (the
    // browsing-session address, which for Privy users IS their wallet).
    senderAddress:  (senderAddress ?? notifyAddress ?? '').toLowerCase(),
    recipient,
    amount:         String(amount),
    token:          token || 'USDC',
    scheduledFor:   scheduledFor ?? null,
    recurrence:     recurrence ?? null,
    recurrenceDay:  recurrenceDay ?? null,
    recurrenceTime: recurrenceTime ?? null,
    nextRun,
    status:         'pending',
    txHash:         null,
    lastError:      null,
    history:        [],
    createdAt:      new Date().toISOString(),
    executedAt:     null,
  }
  const payments = dbRead()
  payments.push(payment)
  dbWrite(payments)
  return payment
}

export function cancelPayment(id, walletAddress) {
  const payments = dbRead()
  const addr = (walletAddress ?? '').toLowerCase()
  const payment = payments.find(p => p.id === id && p.walletAddress === addr)
  if (!payment) return null
  if (payment.status !== 'pending') return payment // already terminal — nothing to cancel
  payment.status = 'cancelled'
  dbWrite(payments)
  return payment
}

export function getDuePayments() {
  const now = new Date()
  return dbRead().filter(p => p.status === 'pending' && p.nextRun && new Date(p.nextRun) <= now)
}

export function markExecuted(id, txHash) {
  const payments = dbRead()
  const payment = payments.find(p => p.id === id)
  if (!payment) return null
  const executedAt = new Date().toISOString()
  payment.txHash = txHash
  payment.lastError = null
  payment.executedAt = executedAt
  payment.history.push({ executedAt, txHash })

  if (payment.recurrence) {
    // Recurring: stays pending, schedule the next occurrence.
    payment.nextRun = computeNextRun(payment, new Date())
  } else {
    payment.status = 'executed'
  }
  dbWrite(payments)
  return payment
}

export function markFailed(id, error) {
  const payments = dbRead()
  const payment = payments.find(p => p.id === id)
  if (!payment) return null
  const executedAt = new Date().toISOString()
  payment.lastError = error
  payment.history.push({ executedAt, error })

  if (payment.recurrence) {
    // Recurring: keep retrying on the normal cadence instead of dying forever.
    payment.nextRun = computeNextRun(payment, new Date())
  } else {
    payment.status = 'failed'
  }
  dbWrite(payments)
  return payment
}
