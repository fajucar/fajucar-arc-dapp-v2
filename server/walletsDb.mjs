/**
 * Shared wallets-db.json helpers.
 * Extracted from index.mjs so other server modules (e.g. the payment
 * scheduler) can resolve a Circle walletId for a wallet address without
 * duplicating the read/write/lookup logic.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dir = dirname(fileURLToPath(import.meta.url))
const DB_FILE = resolve(__dir, 'wallets-db.json')

export function dbRead() {
  if (!existsSync(DB_FILE)) return {}
  return JSON.parse(readFileSync(DB_FILE, 'utf-8'))
}

export function dbWrite(data) {
  writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8')
}

export function findUserByAddress(address) {
  const db = dbRead()
  return Object.values(db).find(
    (u) => u.address?.toLowerCase() === address?.toLowerCase()
  ) ?? null
}

/**
 * Look up a wallets-db.json entry by its stable owner key (Privy user id,
 * e.g. "did:privy:..." or "google:..." — the same key getOrCreateWallet
 * stores under), NOT by address. Used where the caller's on-chain address
 * doesn't (and structurally can't) have a Circle-managed entry of its own —
 * e.g. a Privy embedded wallet — but we still want to find/attach that
 * user's separate Circle automation wallet, if one already exists.
 */
export function findUserById(userId) {
  if (!userId) return null
  const db = dbRead()
  return db[userId] ? { userId, ...db[userId] } : null
}

/**
 * Look up a wallets-db.json entry by the `.email` field stored on it —
 * NOT by key. This is the identity that's actually stable across login
 * methods: the same physical person can get a different Privy DID
 * depending on which social network they authenticated with (Privy does
 * not retroactively merge accounts), but their email doesn't change.
 * Prefer this over findUserById(privyUserId) wherever an email is
 * available — see resolveCircleOwner in agent.mjs.
 */
export function findUserByEmail(email) {
  const normalized = (email ?? '').toLowerCase().trim()
  if (!normalized) return null
  const db = dbRead()
  for (const [userId, entry] of Object.entries(db)) {
    if (entry.email?.toLowerCase() === normalized) return { userId, ...entry }
  }
  return null
}

export function resolveWalletId(_req, fromAddress) {
  if (fromAddress) {
    const entry = findUserByAddress(fromAddress)
    if (entry?.walletId) return entry.walletId
  }
  return null
}
