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

/**
 * Return all tokens minted (Transfer from 0x0) for `ownerAddress` from
 * `contractAddress`, with the modelId decoded from the minting tx's raw_input.
 *
 * Concurrent tx fetches (default concurrency = 5) keep latency low.
 */
export async function fetchMintsFromArcScan(
  ownerAddress:    string,
  contractAddress: string,
  concurrency      = 5,
): Promise<ArcScanMint[]> {
  const res = await fetch(
    `${ARCSCAN_BASE}/addresses/${ownerAddress}/token-transfers?type=ERC-721`,
    { signal: AbortSignal.timeout(10000) },
  )
  if (!res.ok) throw new Error(`ArcScan token-transfers HTTP ${res.status}`)

  const { items = [] } = await res.json() as { items?: TransferItem[] }

  const mints = items.filter(item =>
    item.from?.hash?.toLowerCase()          === ZERO_ADDRESS &&
    item.token?.address_hash?.toLowerCase() === contractAddress.toLowerCase() &&
    !!item.transaction_hash &&
    !!item.total?.token_id,
  )

  if (mints.length === 0) return []

  // Decode modelId from each mint tx in batches
  const results: ArcScanMint[] = []
  for (let i = 0; i < mints.length; i += concurrency) {
    const chunk = mints.slice(i, i + concurrency)
    const chunkResults = await Promise.all(chunk.map(async mint => {
      let modelId: number | null = null
      try {
        const txRes = await fetch(
          `${ARCSCAN_BASE}/transactions/${mint.transaction_hash}`,
          { signal: AbortSignal.timeout(8000) },
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
    results.push(...chunkResults)
  }

  return results
}
