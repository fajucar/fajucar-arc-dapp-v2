/**
 * ArcScan (blockscout) API-based NFT discovery for FajucarCollection.
 *
 * WHY: tokenOfOwnerByIndex is broken (enumerable out of sync with balanceOf),
 * eth_getLogs has a 10,000-block range limit on Arc Testnet (47M+ blocks total),
 * and all tokens share the same IPFS tokenURI so we can't distinguish model type
 * via tokenURI alone.
 *
 * SOLUTION: ArcScan's /token-transfers endpoint returns the full transfer history
 * for an address in one call. For mints (from=0x0), we decode the modelId from
 * each tx's raw_input (mintById selector 0x3c51c82b + uint256 modelId).
 */

export const ARCSCAN_BASE = 'https://testnet.arcscan.app/api/v2'

/** keccak256("mintById(uint256)") first 4 bytes */
const MINTBYID_SELECTOR = '0x3c51c82b'
const ZERO_ADDRESS       = '0x0000000000000000000000000000000000000000'

export interface ArcScanMint {
  tokenId:  string
  /** 1=Explorer, 2=Guardian, 3=Builder; null when tx uses a different function */
  modelId:  number | null
}

type TransferItem = {
  from:             { hash: string }
  token:            { address_hash: string }
  total:            { token_id?: string }
  transaction_hash: string
}

// Session cache keyed by `${owner}-${contract}`.
// Avoids re-fetching on component remount or soft navigation.
// Busted explicitly via invalidateArcScanCache() on manual refresh.
const _cache = new Map<string, { mints: ArcScanMint[]; ts: number }>()
const CACHE_TTL_MS = 2 * 60 * 1000  // 2 minutes

export function invalidateArcScanCache(ownerAddress: string, contractAddress: string) {
  _cache.delete(`${ownerAddress.toLowerCase()}-${contractAddress.toLowerCase()}`)
}

/**
 * Return all tokens minted (Transfer from 0x0) for `ownerAddress` from
 * `contractAddress`, with the modelId decoded from the minting tx's raw_input.
 *
 * All tx detail fetches are fired in parallel (Promise.all) — no sequential
 * batching — so total time ≈ slowest single request rather than N * batch_time.
 */
export async function fetchMintsFromArcScan(
  ownerAddress:    string,
  contractAddress: string,
): Promise<ArcScanMint[]> {
  const key = `${ownerAddress.toLowerCase()}-${contractAddress.toLowerCase()}`
  const cached = _cache.get(key)
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    console.log('[ArcScan] cache hit —', cached.mints.length, 'mints')
    return cached.mints
  }

  // ── Step 1: fetch full transfer list (one request) ───────────────────────
  const t0 = Date.now()
  const res = await fetch(
    `${ARCSCAN_BASE}/addresses/${ownerAddress}/token-transfers?type=ERC-721`,
    { signal: AbortSignal.timeout(12000) },
  )
  console.log(`[ArcScan] token-transfers: ${Date.now() - t0}ms`)
  if (!res.ok) throw new Error(`ArcScan token-transfers HTTP ${res.status}`)

  const { items = [] } = await res.json() as { items?: TransferItem[] }

  const mints = items.filter(item =>
    item.from?.hash?.toLowerCase()          === ZERO_ADDRESS &&
    item.token?.address_hash?.toLowerCase() === contractAddress.toLowerCase() &&
    !!item.transaction_hash &&
    !!item.total?.token_id,
  )
  console.log(`[ArcScan] mints to decode: ${mints.length}`)

  if (mints.length === 0) {
    _cache.set(key, { mints: [], ts: Date.now() })
    return []
  }

  // ── Step 2: decode modelId from all mint txs in parallel ─────────────────
  // Promise.all fires all requests simultaneously instead of batching so that
  // total time = max(individual latency) rather than batches * max(batch).
  const t1 = Date.now()
  const results = await Promise.all(mints.map(async mint => {
    let modelId: number | null = null
    try {
      const txRes = await fetch(
        `${ARCSCAN_BASE}/transactions/${mint.transaction_hash}`,
        { signal: AbortSignal.timeout(10000) },
      )
      if (txRes.ok) {
        const tx = await txRes.json() as { raw_input?: string }
        const raw = tx?.raw_input ?? ''
        if (raw.startsWith(MINTBYID_SELECTOR)) {
          const mid = parseInt(raw.slice(-64), 16)
          if (mid >= 1 && mid <= 3) modelId = mid
        }
      }
    } catch { /* tx fetch failed — modelId stays null */ }
    return { tokenId: mint.total.token_id!, modelId } satisfies ArcScanMint
  }))
  console.log(`[ArcScan] tx-details (${mints.length} parallel): ${Date.now() - t1}ms`)

  _cache.set(key, { mints: results, ts: Date.now() })
  return results
}
