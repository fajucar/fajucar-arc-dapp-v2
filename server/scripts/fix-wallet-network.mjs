/**
 * Fix Circle wallet network mismatch.
 *
 * Root cause (confirmed via getWallet() — see the "1a" log output when you
 * run this): the wallets already in wallets-db.json were created with
 * blockchain=ETH-SEPOLIA, not ARC-TESTNET. That's the real reason Circle's
 * own getWalletTokenBalance always came back empty — it was checking the
 * wallet's balance on Sepolia (where it genuinely holds nothing), not a
 * Circle-side indexing bug on Arc Testnet. The same 0x address happens to
 * hold real USDC on Arc Testnet because EVM addresses are chain-agnostic
 * (same secp256k1 keypair).
 *
 * Uses client.deriveWalletByAddress({ sourceBlockchain, walletAddress,
 * targetBlockchain }) — the SDK method purpose-built for "create a wallet
 * on another chain using the same address as an existing wallet." An
 * earlier version of this script tried plain createWallets() instead and
 * got a DIFFERENT address for the primary wallet (only matched for the
 * secondary one, by what turned out to be sequence-position luck — this
 * wallet set has had many wallets created in it over this project's
 * lifetime, so "the next derived address" is not reliably "the same slot
 * as an existing wallet on another chain"). deriveWalletByAddress is
 * deterministic by design; don't go back to createWallets for this.
 *
 * Safe by construction: if the derived wallet's address does NOT match the
 * expected funded address (shouldn't happen with this method, but checked
 * anyway), this script logs a clear warning and does NOT touch
 * wallets-db.json. It only ever adds/updates a walletId + legacy field on
 * an existing entry — it never deletes anything.
 *
 * Run: node server/scripts/fix-wallet-network.mjs
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getCircleClient } from '../circle.mjs'

const __dir  = dirname(fileURLToPath(import.meta.url))
const DB_FILE = resolve(__dir, '..', 'wallets-db.json')

const SOURCE_BLOCKCHAIN = 'ETH-SEPOLIA'
const TARGET_BLOCKCHAIN = 'ARC-TESTNET'

// The two legacy wallets we know about, and the address each currently has
// on Sepolia (deriveWalletByAddress will register that SAME address on
// ARC-TESTNET — it doesn't create a new address, so "expected" here is just
// what we assert against the API response as a sanity check).
const LEGACY_WALLETS = [
  { oldWalletId: '05bf6b47-a96d-5aa5-b732-c6f7fa2926c2', expectedAddress: '0xfa09e25016e8ab4325cee2da7513d8a8ffc65aaa', label: 'primary (fajucar@gmail.com)' },
  { oldWalletId: '9b122946-dd7c-5ab7-8288-bc5b392f4c83', expectedAddress: '0x0d60861b4d6919b956b10c226f85d7456d9d2114', label: 'secondary' },
]

function section(title) {
  console.log('\n' + '='.repeat(72))
  console.log(title)
  console.log('='.repeat(72))
}

function dbRead() {
  if (!existsSync(DB_FILE)) return {}
  return JSON.parse(readFileSync(DB_FILE, 'utf-8'))
}

function dbWrite(data) {
  writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8')
}

/** Step 1a — inspect every wallet currently referenced in wallets-db.json. */
async function inspectExistingWallets(client, db) {
  section('1a. Inspecionando wallets existentes (wallets-db.json)')
  for (const [userId, entry] of Object.entries(db)) {
    if (!entry.walletId) continue
    try {
      const res = await client.getWallet({ id: entry.walletId })
      const w = res.data.wallet
      console.log(`  ${userId}`)
      console.log(`    walletId:   ${w.id}`)
      console.log(`    address:    ${w.address}`)
      console.log(`    blockchain: ${w.blockchain}`)
    } catch (err) {
      console.error(`  ${userId} (walletId ${entry.walletId}): ERRO ao consultar —`, err.message)
    }
  }
}

/**
 * Steps 1b-1f for a single legacy wallet: derive a wallet with the SAME
 * address on ARC-TESTNET, verify the address matches, update
 * wallets-db.json if it does, then check the new wallet's balance and log
 * the USDC tokenId.
 */
async function migrateLegacyWallet(client, db, { oldWalletId, expectedAddress, label }) {
  section(`Migrando wallet legada — ${label}`)
  console.log(`  oldWalletId (Sepolia): ${oldWalletId}`)
  console.log(`  endereço esperado:     ${expectedAddress}`)

  // Is this wallet actually referenced by anything in wallets-db.json?
  const referencingKeys = Object.entries(db)
    .filter(([, entry]) => entry.walletId === oldWalletId)
    .map(([userId]) => userId)

  if (referencingKeys.length === 0) {
    console.log(`  Nenhuma entrada em wallets-db.json usa ${oldWalletId} — não está em uso no fluxo atual.`)
    console.log(`  (Se já foi migrada antes, isso é esperado — o walletId antigo não aparece mais.)`)
    return { migrated: false, tokenId: null }
  }

  console.log(`  Em uso por: ${referencingKeys.join(', ')}`)

  // ── 1b. Derive a wallet with the SAME address on ARC-TESTNET ───────────
  console.log(`\n  1b. Derivando wallet em ${TARGET_BLOCKCHAIN} com o mesmo endereço (deriveWalletByAddress)...`)
  let newWallet
  try {
    const res = await client.deriveWalletByAddress({
      sourceBlockchain: SOURCE_BLOCKCHAIN,
      walletAddress:    expectedAddress,
      targetBlockchain: TARGET_BLOCKCHAIN,
    })
    newWallet = res.data?.wallet
    if (!newWallet) throw new Error('Circle não retornou nenhuma wallet na resposta')
    console.log(`    id:         ${newWallet.id}`)
    console.log(`    address:    ${newWallet.address}`)
    console.log(`    blockchain: ${newWallet.blockchain}`)
  } catch (err) {
    console.error('    ERRO ao derivar wallet em ARC-TESTNET:', err.message)
    return { migrated: false, tokenId: null }
  }

  // ── 1c. Confirm the address matches what we expect (sanity check) ──────
  console.log('\n  1c. Conferindo se o endereço bate com o esperado...')
  const matches = newWallet.address?.toLowerCase() === expectedAddress.toLowerCase()
  console.log(`    esperado: ${expectedAddress}`)
  console.log(`    recebido: ${newWallet.address}`)

  if (!matches) {
    console.warn('\n    ⚠️  AVISO: o endereço da wallet derivada NÃO bate com o endereço esperado.')
    console.warn('       Isso não deveria acontecer com deriveWalletByAddress — investigue antes')
    console.warn('       de confiar nesse resultado. wallets-db.json NÃO foi alterado.')
    return { migrated: false, tokenId: null }
  }
  console.log('    ✅ Endereço bate!')

  // ── 1d. Update wallets-db.json ───────────────────────────────────────────
  console.log('\n  1d. Atualizando wallets-db.json...')
  let updatedCount = 0
  for (const userId of referencingKeys) {
    const entry = db[userId]
    db[userId] = {
      ...entry,
      walletId:              newWallet.id,
      address:                newWallet.address,
      legacySepoliaWalletId: oldWalletId,
      migratedAt:             new Date().toISOString(),
    }
    updatedCount++
    console.log(`    ${userId}: walletId ${oldWalletId} → ${newWallet.id}`)
  }
  dbWrite(db)
  console.log(`    wallets-db.json salvo (${updatedCount} entrada(s) atualizada(s)).`)

  // ── 1e. Check the new wallet's balance ──────────────────────────────────
  console.log('\n  1e. Conferindo saldo (getWalletTokenBalance, includeAll: true)...')
  let tokenId = null
  try {
    const res = await client.getWalletTokenBalance({ id: newWallet.id, includeAll: true })
    console.log('    ' + JSON.stringify(res.data))
    const balances = res.data?.tokenBalances ?? []
    if (balances.length === 0) {
      console.warn('    ⚠️  Vazio — pode levar alguns instantes pra Circle indexar a wallet nova.')
      console.warn('       Rode o script de novo em ~30-60s se isso persistir.')
    } else {
      for (const b of balances) {
        const symbol = b.token?.symbol ?? b.token?.name ?? '?'
        const isErc20 = b.token?.isNative === false
        console.log(`    token.id=${b.token?.id}  symbol=${symbol}  amount=${b.amount}  isNative=${b.token?.isNative}  tokenAddress=${b.token?.tokenAddress ?? '(native)'}`)
        // Prefer the ERC-20 representation's tokenId (isNative: false) — that's
        // the one matching the USDC precompile contract the scheduler calls
        // transfer() on, not the "isNative: true" duplicate entry Circle also
        // reports for this chain's gas-token-as-USDC design.
        if (symbol.toUpperCase() === 'USDC' && (isErc20 || tokenId == null)) tokenId = b.token?.id
      }
    }
  } catch (err) {
    console.error('    ERRO ao consultar saldo:', err.message)
  }

  // ── 1f. Log the USDC tokenId ────────────────────────────────────────────
  console.log('\n  1f. tokenId do USDC (representação ERC-20, isNative: false):')
  console.log(tokenId ? `    ${tokenId}` : '    (não encontrado — veja o log da seção 1e acima)')

  return { migrated: true, tokenId }
}

async function main() {
  const client = getCircleClient()
  const db = dbRead()

  await inspectExistingWallets(client, db)

  const results = []
  for (const legacy of LEGACY_WALLETS) {
    const result = await migrateLegacyWallet(client, db, legacy)
    results.push({ ...legacy, ...result })
  }

  section('RESUMO')
  for (const r of results) {
    console.log(`  ${r.label}: ${r.migrated ? '✅ migrada' : '⏭️  pulada (não referenciada, ou já migrada antes)'}${r.tokenId ? ` — tokenId USDC: ${r.tokenId}` : ''}`)
  }
  console.log('')
}

main().catch(err => {
  console.error('\nErro fatal:', err)
  process.exit(1)
})
