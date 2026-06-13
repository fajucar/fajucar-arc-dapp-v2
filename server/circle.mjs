/**
 * Circle Developer Controlled Wallets helper
 * Handles contract execution + transaction polling for Google login users
 */

import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets'
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// ── Load .env ourselves so we don't depend on index.mjs load order ───────────
const __dir = dirname(fileURLToPath(import.meta.url))
const ROOT  = resolve(__dir, '..')

function loadEnvFile() {
  const file = resolve(ROOT, '.env')
  if (!existsSync(file)) return {}
  return Object.fromEntries(
    readFileSync(file, 'utf-8').split('\n')
      .map(l => l.match(/^([^#=\s]+)\s*=\s*(.*)$/))
      .filter(Boolean)
      .map(([, k, v]) => [k, v.trim()])
  )
}

const _envFile = loadEnvFile()
const getEnv = (key) => (process.env[key] || _envFile[key] || '').trim()

// ── Lazy Circle client — created on first use so env is always loaded ─────────
let _circleClient = null

export function getCircleClient() {
  if (_circleClient) return _circleClient

  const apiKey       = getEnv('CIRCLE_API_KEY')
  const entitySecret = getEnv('CIRCLE_ENTITY_SECRET')

  if (!apiKey || !entitySecret) {
    throw new Error('Circle env vars missing: CIRCLE_API_KEY / CIRCLE_ENTITY_SECRET')
  }

  console.log('[Circle] Initializing client, key prefix:', apiKey.split(':')[0])

  _circleClient = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret })
  return _circleClient
}

// Keep backward-compat export (resolves lazily)
export const circleClient = new Proxy({}, {
  get(_t, prop) {
    const client = getCircleClient()
    const value = client[prop]
    return typeof value === 'function' ? value.bind(client) : value
  },
})

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

const TERMINAL_STATES  = new Set(['COMPLETE', 'CONFIRMED', 'FAILED', 'CANCELLED', 'DENIED'])
const SUCCESS_STATES   = new Set(['COMPLETE', 'CONFIRMED'])
const MAX_POLL_SECONDS = 120
const POLL_INTERVAL_MS = 3000

/**
 * Poll a Circle transaction until it reaches a terminal state.
 * Returns the on-chain txHash on success.
 */
export async function waitForTransaction(transactionId) {
  const maxTries = Math.ceil((MAX_POLL_SECONDS * 1000) / POLL_INTERVAL_MS)

  for (let i = 0; i < maxTries; i++) {
    await sleep(POLL_INTERVAL_MS)

    let tx
    try {
      const res = await circleClient.getTransaction({ id: transactionId })
      tx = res.data?.transaction
    } catch (pollErr) {
      console.warn(`[Circle] poll error (attempt ${i + 1}):`, pollErr.message)
      continue
    }

    const state = tx?.state ?? tx?.status
    console.log(`[Circle] tx ${transactionId} state: ${state}`)

    if (SUCCESS_STATES.has(state)) {
      const hash = tx.txHash ?? tx.transactionHash
      if (!hash) throw new Error(`Circle: tx COMPLETE but txHash missing. Response: ${JSON.stringify(tx)}`)
      return hash
    }

    if (TERMINAL_STATES.has(state)) {
      throw new Error(`Circle: transaction ${state}. Details: ${JSON.stringify(tx)}`)
    }
  }

  throw new Error(`Circle: transaction ${transactionId} timed out after ${MAX_POLL_SECONDS}s`)
}

/**
 * Execute a smart contract function via Circle developer-controlled wallet.
 * Handles the createContractExecutionTransaction + polling.
 *
 * @param {object} opts
 * @param {string} opts.walletId          – Circle wallet ID (not address)
 * @param {string} opts.contractAddress   – On-chain contract address
 * @param {string} opts.functionSignature – e.g. "claim(address)"
 * @param {string[]} opts.parameters      – ABI-encoded parameter values as strings
 * @returns {Promise<string>}             – on-chain txHash
 */
export async function executeContractCall({ walletId, contractAddress, functionSignature, parameters = [] }) {
  // ── Debug: verify walletId is Circle internal ID (not 0x address) ──────────
  console.log(`[Circle] executeContractCall`)
  console.log(`  walletId:  ${walletId}`)
  console.log(`  walletId is address? ${String(walletId).startsWith('0x')} (should be FALSE — must be Circle internal ID)`)
  console.log(`  contract:  ${contractAddress}`)
  console.log(`  fn:        ${functionSignature}`)
  console.log(`  params:    ${JSON.stringify(parameters)}`)

  if (!walletId || String(walletId).startsWith('0x')) {
    throw new Error(
      `walletId inválido: "${walletId}". Deve ser o ID interno do Circle (ex: "abc123-..."), não o endereço 0x. ` +
      `Verifique se o walletId está sendo salvo corretamente no banco.`
    )
  }

  let response
  try {
    // ── Exact debug logging as requested ─────────────────────────────────────
    console.log('walletId:', walletId)

    try {
      const balance = await circleClient.listWalletBalance({ id: walletId })
      console.log('Wallet balance:', JSON.stringify(balance.data, null, 2))
    } catch (balErr) {
      console.log('Wallet balance fetch error:', balErr.message)
    }

    console.log('Contract:', contractAddress)
    console.log('Function:', functionSignature)
    console.log('Parameters:', JSON.stringify(parameters))
    // ─────────────────────────────────────────────────────────────────────────

    // fee field is REQUIRED — SDK reads fee.config internally and throws
    // "Cannot read properties of undefined (reading 'config')" when omitted.
    response = await circleClient.createContractExecutionTransaction({
      idempotencyKey:       randomUUID(),
      walletId,
      blockchain:           'ARC-TESTNET',
      contractAddress,
      abiFunctionSignature: functionSignature,
      abiParameters:        parameters.map(String),
      fee: {
        type:   'level',
        config: { feeLevel: 'LOW' },
      },
    })
  } catch (err) {
    const msg = err?.response?.data?.message ?? err?.message ?? String(err)
    console.error('[Circle] createContractExecutionTransaction failed:', msg)
    // Log full response for debugging
    if (err?.response?.data) {
      console.error('[Circle] full error response:', JSON.stringify(err.response.data))
    }
    throw new Error(`Circle API error: ${msg}`)
  }

  console.log('[Circle] createContractExecution response:', JSON.stringify(response?.data ?? response))

  // Circle returns either a transactionId or the tx object directly
  const transactionId =
    response?.data?.transaction?.id ??
    response?.data?.id ??
    response?.data?.transactionId

  if (!transactionId) {
    throw new Error(`Circle did not return a transactionId. Response: ${JSON.stringify(response?.data)}`)
  }

  console.log(`[Circle] polling tx ${transactionId}...`)
  return waitForTransaction(transactionId)
}

// Import randomUUID for idempotency keys
import { randomUUID } from 'node:crypto'
