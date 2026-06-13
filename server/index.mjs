import 'dotenv/config'

/**
 * FajuARC Backend
 * - Circle Developer Controlled Wallets (wallet signing)
 * Auth: Privy (frontend-only) — backend is wallet-only
 * Port: 3002
 */

import express from 'express'
import cors from 'cors'
import agentRouter from './agent.mjs'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets'
import { executeContractCall, getCircleClient } from './circle.mjs'
import { fetchAddressTransactions, fetchTokenTransfers, fetchAddressInfo } from './arcscan.mjs'

const __dir = dirname(fileURLToPath(import.meta.url))
const ROOT  = resolve(__dir, '..')

// ── Env ──────────────────────────────────────────────────────────────────────
function loadEnv() {
  const file = resolve(ROOT, '.env')
  if (!existsSync(file)) return {}
  return Object.fromEntries(
    readFileSync(file, 'utf-8').split('\n')
      .map(l => l.match(/^([^#=\s]+)\s*=\s*(.*)$/))
      .filter(Boolean).map(m => [m[1], m[2].trim()])
  )
}

const env = loadEnv()
const get = (key) => (process.env[key] || env[key] || '').trim()

const CIRCLE_API_KEY       = get('CIRCLE_API_KEY')
const CIRCLE_ENTITY_SECRET = get('CIRCLE_ENTITY_SECRET')
const CIRCLE_WALLET_SET_ID = get('CIRCLE_WALLET_SET_ID')
// Allow both the legacy port (3000) and Vite's default (5173)
const FRONTEND_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3003',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
  'http://127.0.0.1:3003',
  'http://127.0.0.1:5173',
]

// ── Token & Contract Addresses ────────────────────────────────────────────────
const ADDR = {
  USDC:    '0x3600000000000000000000000000000000000000',
  FAJU:    '0x0e8147CdB023474f440636051AA26f7DCaf2aEa7',
  ARCX:    '0xA99F353665F89784F0442FB666ea775b6C1af87d',
  FAUCET:  '0xb6e4c250394Bb0f9b577991C7f4aCF9f6E652017',
  NFT:     '0x1499947A89Ef05B023176D31191BDC5CCF3d0B7E',
  AGENTIC: '0x0747EEf0706327138c69792bF28Cd525089e4583',
}

if (!CIRCLE_API_KEY || !CIRCLE_ENTITY_SECRET || !CIRCLE_WALLET_SET_ID) {
  console.error('❌ Credenciais Circle não encontradas no .env')
  process.exit(1)
}

// ── Circle client ─────────────────────────────────────────────────────────────
const circle = initiateDeveloperControlledWalletsClient({
  apiKey: CIRCLE_API_KEY,
  entitySecret: CIRCLE_ENTITY_SECRET,
})

// ── Simple JSON DB ────────────────────────────────────────────────────────────
const DB_FILE = resolve(__dir, 'wallets-db.json')

function dbRead() {
  if (!existsSync(DB_FILE)) return {}
  return JSON.parse(readFileSync(DB_FILE, 'utf-8'))
}

function dbWrite(data) {
  writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8')
}

function findUserByAddress(address) {
  const db = dbRead()
  return Object.values(db).find(
    (u) => u.address?.toLowerCase() === address?.toLowerCase()
  ) ?? null
}

function findWalletByEmail(email) {
  const normalized = (email ?? '').toLowerCase().trim()
  if (!normalized) return null
  const db = dbRead()
  for (const [userId, entry] of Object.entries(db)) {
    if (entry.email?.toLowerCase() === normalized) return { userId, ...entry }
  }
  return null
}

function resolveWalletId(_req, fromAddress) {
  if (fromAddress) {
    const entry = findUserByAddress(fromAddress)
    if (entry?.walletId) return entry.walletId
  }
  return null
}

async function getOrCreateWallet(userId, email = '') {
  const db = dbRead()
  if (db[userId]) {
    if (email && !db[userId].email) { db[userId].email = email; dbWrite(db) }
    return db[userId]
  }

  console.log('[Circle] Criando wallet para', userId.slice(0, 12) + '...')
  const response = await circle.createWallets({
    idempotencyKey: randomUUID(),
    blockchains: ['ARC-TESTNET'],
    count: 1,
    walletSetId: CIRCLE_WALLET_SET_ID,
  })

  const wallet = response.data?.wallets?.[0]
  if (!wallet?.address) throw new Error('Circle não retornou endereço')

  db[userId] = {
    address: wallet.address,
    walletId: wallet.id,
    email: email || undefined,
    createdAt: new Date().toISOString(),
  }
  dbWrite(db)
  console.log('[Circle] ✅ Wallet criada:', wallet.address)
  return db[userId]
}

// ── Express ───────────────────────────────────────────────────────────────────
const app = express()

app.use(cors({ origin: FRONTEND_ORIGINS, credentials: true }))
app.use(express.json())

// ── Rotas ─────────────────────────────────────────────────────────────────────

app.get('/api/health', (_req, res) => res.json({ ok: true }))

// Carteira Circle — lookup por email ou address
app.get('/api/wallet/info', async (req, res) => {
  try {
    const email = (req.query.email ?? '').toString().trim()
    if (email) {
      let entry = findWalletByEmail(email)
      if (!entry) {
        const userId = 'email:' + email.toLowerCase()
        entry = { userId, ...(await getOrCreateWallet(userId, email)) }
      }
      return res.json({ walletId: entry.walletId, walletAddress: entry.address, email })
    }

    const address = (req.query.address ?? '').toString().trim()
    if (address) {
      const entry = findUserByAddress(address)
      if (!entry) return res.status(404).json({ error: 'Wallet não encontrada' })
      return res.json({ walletId: entry.walletId, walletAddress: entry.address })
    }

    return res.status(400).json({ error: 'email ou address obrigatório' })
  } catch (err) {
    return res.status(500).json({ error: err?.message ?? 'Erro ao buscar carteira' })
  }
})

// ── Arc RPC helper ────────────────────────────────────────────────────────────
const ARC_RPC      = 'https://rpc.testnet.arc.network'
const ARC_CHAIN_ID = 5042002

// Legacy contract call route (backward compat)
app.post('/api/contract-call', async (req, res) => {
  const { fromAddress, contractAddress, abiFunctionSignature, abiParameters = [] } = req.body
  if (!fromAddress || !contractAddress || !abiFunctionSignature) {
    return res.status(400).json({ error: 'fromAddress, contractAddress e abiFunctionSignature são obrigatórios' })
  }
  const walletId = resolveWalletId(req, fromAddress)
  if (!walletId) return res.status(404).json({ error: 'Wallet não encontrada para este endereço' })
  try {
    const txHash = await executeContractCall({ walletId, contractAddress, functionSignature: abiFunctionSignature, parameters: abiParameters })
    return res.json({ success: true, txHash })
  } catch (err) {
    console.error('[contract-call] Erro:', err?.response?.data?.message ?? err?.message)
    return res.status(500).json({ error: err?.response?.data?.message ?? err?.message ?? String(err) })
  }
})

// Enviar USDC via Circle Developer Controlled Wallet
app.post('/api/send-usdc', async (req, res) => {
  const { fromAddress, toAddress, amountUsdc } = req.body
  if (!fromAddress || !toAddress || !amountUsdc) {
    return res.status(400).json({ error: 'fromAddress, toAddress e amountUsdc são obrigatórios' })
  }
  try {
    const db = dbRead()
    const userEntry = Object.values(db).find(u => u.address?.toLowerCase() === fromAddress.toLowerCase())
    if (!userEntry) return res.status(404).json({ error: 'Wallet não encontrada para este endereço' })

    const valueWei = BigInt(Math.round(parseFloat(amountUsdc) * 1e18))

    const [nonceRes, gasPriceRes] = await Promise.all([
      fetch(ARC_RPC, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_getTransactionCount', params: [fromAddress, 'latest'], id: 1 }) }),
      fetch(ARC_RPC, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_gasPrice', params: [], id: 2 }) }),
    ])
    const nonce = parseInt((await nonceRes.json()).result, 16)
    const gasPrice = (await gasPriceRes.json()).result

    console.log('[Circle] Assinando transação:', fromAddress, '→', toAddress, amountUsdc, 'USDC')

    const signRes = await circle.signTransaction({
      walletId: userEntry.walletId,
      blockchain: 'ARC-TESTNET',
      transaction: JSON.stringify({
        to: toAddress,
        nonce: '0x' + nonce.toString(16),
        value: '0x' + valueWei.toString(16),
        gasLimit: '0x5208',
        gasPrice,
        chainId: ARC_CHAIN_ID,
      }),
    })

    const signature = signRes.data?.signature
    if (!signature) throw new Error('Circle não retornou assinatura: ' + JSON.stringify(signRes.data))

    const sendData = await (await fetch(ARC_RPC, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_sendRawTransaction', params: [signature], id: 3 }),
    })).json()

    if (sendData.error) throw new Error(sendData.error.message)
    console.log('[Arc] ✅ Transação enviada:', sendData.result)
    return res.json({ success: true, txHash: sendData.result })
  } catch (err) {
    console.error('[Circle] ❌ Erro ao enviar:', err?.message ?? err)
    return res.status(500).json({ error: err?.message ?? 'Erro ao enviar' })
  }
})

// Cria ou recupera wallet Circle por userId (Privy user ID)
app.post('/api/wallet/get-or-create', async (req, res) => {
  const { userId } = req.body
  if (!userId) return res.status(400).json({ error: 'userId obrigatório' })
  try {
    const wallet = await getOrCreateWallet(userId)
    return res.json({ address: wallet.address, walletId: wallet.walletId })
  } catch (err) {
    return res.status(500).json({ error: err?.message ?? 'Erro interno' })
  }
})

// Debug: balance por walletId
app.get('/api/debug/circle-balance', async (req, res) => {
  const walletId = req.query.walletId ?? '05bf6b47-a96d-5aa5-b732-c6f7fa2926c2'
  try {
    const result = await getCircleClient().listWalletBalance({ id: walletId })
    return res.json({ walletId, balances: result?.data?.tokenBalances ?? [], raw: result?.data })
  } catch (err) {
    return res.status(500).json({ error: err.message, walletId })
  }
})

// Debug: inspecionar entrada da wallet
app.get('/api/debug/wallet', (req, res) => {
  const address = req.query.address
  if (!address) return res.status(400).json({ error: 'address query param required' })
  const entry = findUserByAddress(address)
  if (!entry) return res.status(404).json({ error: 'Wallet not found in DB', address })
  res.json({
    address: entry.address,
    walletId: entry.walletId,
    walletIdIsUuid: /^[0-9a-f-]{36}$/i.test(entry.walletId ?? ''),
    createdAt: entry.createdAt,
  })
})

app.get('/api/wallet/balance', async (req, res) => {
  const address = req.query.address
  if (!address) return res.status(400).json({ error: 'Endereço não encontrado' })
  const walletId = resolveWalletId(req, address)
  if (!walletId) return res.status(404).json({ error: 'Wallet ID não encontrado' })
  try {
    const result = await getCircleClient().listWalletBalance({ id: walletId })
    return res.json({ balances: result?.data?.tokenBalances ?? [] })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
})

app.post('/api/wallet/claim-faju', async (req, res) => {
  const fromAddress = req.body.fromAddress
  const walletId    = resolveWalletId(req, fromAddress)
  console.log(`[Faucet/FAJU] fromAddress: ${fromAddress}  walletId: ${walletId}`)
  if (!walletId) return res.status(404).json({ error: 'Wallet ID não encontrado. Faça login novamente.' })
  try {
    const txHash = await executeContractCall({ walletId, contractAddress: ADDR.FAUCET, functionSignature: 'claim(address)', parameters: [ADDR.FAJU] })
    console.log(`[Faucet] ✅ FAJU claimed: ${txHash}`)
    return res.json({ success: true, txHash, token: 'FAJU' })
  } catch (err) {
    console.error('[Faucet] FAJU error:', err.message)
    return res.status(500).json({ error: err.message })
  }
})

app.post('/api/wallet/claim-arcx', async (req, res) => {
  const fromAddress = req.body.fromAddress
  const walletId    = resolveWalletId(req, fromAddress)
  if (!walletId) return res.status(404).json({ error: 'Wallet ID não encontrado. Faça login novamente.' })
  try {
    const txHash = await executeContractCall({ walletId, contractAddress: ADDR.FAUCET, functionSignature: 'claim(address)', parameters: [ADDR.ARCX] })
    console.log(`[Faucet] ✅ ARCX claimed: ${txHash}`)
    return res.json({ success: true, txHash, token: 'ARCX' })
  } catch (err) {
    console.error('[Faucet] ARCX error:', err.message)
    return res.status(500).json({ error: err.message })
  }
})

app.post('/api/wallet/mint-nft', async (req, res) => {
  const { fromAddress, modelId } = req.body
  const walletId = resolveWalletId(req, fromAddress)
  if (!walletId) return res.status(404).json({ error: 'Wallet ID não encontrado' })
  if (![1, 2, 3].includes(Number(modelId))) return res.status(400).json({ error: 'modelId inválido (1, 2 ou 3)' })
  try {
    const txHash = await executeContractCall({ walletId, contractAddress: ADDR.NFT, functionSignature: 'mintById(uint256)', parameters: [String(modelId)] })
    console.log(`[NFT] ✅ Minted modelId=${modelId}: ${txHash}`)
    return res.json({ success: true, txHash, modelId })
  } catch (err) {
    console.error('[NFT] mint error:', err.message)
    return res.status(500).json({ error: err.message })
  }
})

app.post('/api/wallet/execute', async (req, res) => {
  const { fromAddress, contractAddress, functionSignature, parameters = [] } = req.body
  if (!contractAddress || !functionSignature) {
    return res.status(400).json({ error: 'contractAddress e functionSignature obrigatórios' })
  }
  const walletId = resolveWalletId(req, fromAddress)
  if (!walletId) return res.status(404).json({ error: 'Wallet ID não encontrado' })
  try {
    const txHash = await executeContractCall({ walletId, contractAddress, functionSignature, parameters })
    return res.json({ success: true, txHash })
  } catch (err) {
    console.error('[Execute] error:', err.message)
    return res.status(500).json({ error: err.message })
  }
})

// ── Withdrawal address (EVM external wallet for payouts) ─────────────────────
app.get('/api/wallet/withdrawal-address/:address', (req, res) => {
  const { address } = req.params
  if (!address) return res.status(400).json({ error: 'address obrigatório' })
  const user = findUserByAddress(address)
  return res.json({ withdrawalAddress: user?.withdrawalAddress ?? null })
})

app.post('/api/wallet/withdrawal-address', (req, res) => {
  const { walletAddress, withdrawalAddress } = req.body
  if (!walletAddress || !withdrawalAddress) {
    return res.status(400).json({ error: 'walletAddress e withdrawalAddress obrigatórios' })
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(withdrawalAddress)) {
    return res.status(400).json({ error: 'Endereço EVM inválido' })
  }
  const db = dbRead()
  const entry = Object.values(db).find(
    (u) => u.address?.toLowerCase() === walletAddress.toLowerCase()
  )
  if (!entry) {
    // Cria entrada mínima se não existir ainda
    const key = `ext_${walletAddress.toLowerCase()}`
    db[key] = { address: walletAddress.toLowerCase(), withdrawalAddress }
  } else {
    entry.withdrawalAddress = withdrawalAddress
  }
  dbWrite(db)
  console.log(`[Withdrawal] Endereço salvo: ${walletAddress.slice(0, 10)}... → ${withdrawalAddress}`)
  return res.json({ success: true })
})

// ── Arc Testnet Explorer proxy (via ArcScan, see server/arcscan.mjs) ──────────

app.get('/api/explorer/address/:address', async (req, res) => {
  console.log('[Explorer] GET transactions for', req.params.address)
  try {
    const data = await fetchAddressTransactions(req.params.address)
    console.log('[Explorer] OK – items:', data?.items?.length ?? 'N/A')
    res.json(data)
  } catch(err) {
    console.error('[Explorer] FAIL:', err.message)
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/explorer/address/:address/token-transfers', async (req, res) => {
  console.log('[Explorer] GET token-transfers for', req.params.address)
  try {
    const data = await fetchTokenTransfers(req.params.address)
    console.log('[Explorer] token-transfers OK – items:', data?.items?.length ?? 'N/A')
    res.json(data)
  } catch(err) {
    console.error('[Explorer] token-transfers FAIL:', err.message)
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/explorer/address/:address/info', async (req, res) => {
  console.log('[Explorer] GET info for', req.params.address)
  try {
    const data = await fetchAddressInfo(req.params.address)
    console.log('[Explorer] info OK')
    res.json(data)
  } catch(err) {
    console.error('[Explorer] info FAIL:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ── Agent chat (Claude claude-sonnet-4-6 + tool_use) ─────────────────────────
app.use('/api/agent', agentRouter)

const PORT = 3002
app.listen(PORT, () => {
  console.log(`\n🟢 FajuARC Backend em http://localhost:${PORT}`)
  console.log('   Auth: Privy (frontend-only)')
  console.log('   Circle Wallet Set:', CIRCLE_WALLET_SET_ID)
  console.log(`   Explorer proxy: GET /api/explorer/address/:address`)

  // Startup test: verify ArcScan API is reachable
  fetch('https://testnet.arcscan.app/api/v2/addresses/0xd4de2458b99D029EF7ca75F3087CAD28E17e20A2/transactions', { headers: { Accept: 'application/json' } })
    .then(r => r.json())
    .then(d => console.log('   ✅ ArcScan API OK – items:', d?.items?.length ?? JSON.stringify(d).slice(0, 80)))
    .catch(e => console.error('   ❌ ArcScan API FAIL:', e.message))
})
