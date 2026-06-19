/**
 * useNFTOwnership — shared hook for both AgentAchievements and MyNFTsPage.
 *
 * Strategy:
 *  1. On mount / address change: read localStorage cache → apply immediately (zero loading flash).
 *  2. Always revalidate in background (ArcScan + ownerOf in parallel).
 *  3. On explicit refresh(): bust both caches → show loading spinner → re-fetch.
 *
 * This eliminates the 10-second wait on every page visit after the first load.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { fetchMintsFromArcScan, invalidateArcScanCache, type ArcScanMint } from '@/lib/arcScanNfts'
import { arcClient } from '@/lib/arcClient'
import { withTimeout } from '@/lib/async'

const OWNEROF_ABI = [
  {
    type:            'function' as const,
    name:            'ownerOf'  as const,
    stateMutability: 'view'     as const,
    inputs:  [{ name: 'tokenId', type: 'uint256' as const }],
    outputs: [{ type: 'address' }],
  },
] as const

const OWNEROF_TIMEOUT_MS = 10_000

// ── localStorage cache ────────────────────────────────────────────────────────
// Persists across page reloads; busted on explicit refresh().
// There is no TTL — stale data is always shown while fresh data loads in background.
interface StoredCache {
  mints:         ArcScanMint[]
  ownedTokenIds: string[]
  ts:            number
}

function lsKey(owner: string, contract: string) {
  return `nftOwnership_${owner.toLowerCase()}_${contract.toLowerCase()}`
}

function readCache(owner: string, contract: string): StoredCache | null {
  try {
    const raw = localStorage.getItem(lsKey(owner, contract))
    return raw ? (JSON.parse(raw) as StoredCache) : null
  } catch { return null }
}

function writeCache(owner: string, contract: string, data: StoredCache) {
  try { localStorage.setItem(lsKey(owner, contract), JSON.stringify(data)) } catch { }
}

function clearCacheLS(owner: string, contract: string) {
  try { localStorage.removeItem(lsKey(owner, contract)) } catch { }
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface NFTOwnershipResult {
  /** All mint records found via ArcScan (includes unverified transfers). */
  mints:         ArcScanMint[]
  /** Token IDs confirmed as currently owned via ownerOf. */
  ownedTokenIds: Set<string>
  /** True only on first load with no localStorage cache. Shows skeleton. */
  loading:       boolean
  /** True when fresh data is fetching in background while cache is shown. */
  revalidating:  boolean
  /** Non-null only when the fetch failed AND there is no cached data to fall back to. */
  error:         string | null
  /** Bust both caches and force a fresh fetch. */
  refresh:       () => void
}

export function useNFTOwnership(
  ownerAddress:    string | null | undefined,
  contractAddress: string | null | undefined,
): NFTOwnershipResult {
  const [mints,         setMints]         = useState<ArcScanMint[]>([])
  const [ownedTokenIds, setOwnedTokenIds] = useState<Set<string>>(new Set())
  const [loading,       setLoading]       = useState(false)
  const [revalidating,  setRevalidating]  = useState(false)
  const [error,         setError]         = useState<string | null>(null)

  const runIdRef = useRef(0)
  const aliveRef = useRef(true)
  useEffect(() => {
    aliveRef.current = true
    return () => { aliveRef.current = false }
  }, [])

  const doFetch = useCallback(async (force: boolean) => {
    if (!ownerAddress || !contractAddress) return

    const runId = ++runIdRef.current
    const live  = () => runId === runIdRef.current && aliveRef.current

    if (force) {
      invalidateArcScanCache(ownerAddress, contractAddress)
      clearCacheLS(ownerAddress, contractAddress)
    }

    // ── Show cached data immediately (no spinner) ─────────────────────────────
    const cached = !force ? readCache(ownerAddress, contractAddress) : null
    if (cached) {
      if (live()) {
        setMints(cached.mints)
        setOwnedTokenIds(new Set(cached.ownedTokenIds))
        setLoading(false)
        setRevalidating(true)
        setError(null)
      }
    } else {
      if (live()) {
        setLoading(true)
        setRevalidating(false)
        setError(null)
      }
    }

    const t0 = Date.now()
    try {
      // ── ArcScan mint history ──────────────────────────────────────────────
      // fetchMintsFromArcScan fires all /transactions/{hash} fetches in parallel
      // internally, and also maintains its own in-memory session cache.
      const freshMints = await fetchMintsFromArcScan(ownerAddress, contractAddress)
      console.log(`[NFTOwnership] ArcScan: ${freshMints.length} mints in ${Date.now() - t0}ms`)
      if (!live()) return

      // ── ownerOf — all tokens in parallel ─────────────────────────────────
      const t1 = Date.now()
      const ownerChecks = await Promise.all(freshMints.map(async mint => {
        try {
          const owner = await withTimeout(
            arcClient.readContract({
              address:      contractAddress as `0x${string}`,
              abi:          OWNEROF_ABI,
              functionName: 'ownerOf',
              args:         [BigInt(mint.tokenId)],
            }) as Promise<string>,
            OWNEROF_TIMEOUT_MS,
            `ownerOf_${mint.tokenId}`,
          )
          return owner.toLowerCase() === ownerAddress.toLowerCase() ? mint.tokenId : null
        } catch {
          return null
        }
      }))
      console.log(
        `[NFTOwnership] ownerOf (${freshMints.length} parallel): ${Date.now() - t1}ms`,
        `— total: ${Date.now() - t0}ms`,
      )
      if (!live()) return

      const ownedIds = ownerChecks.filter((id): id is string => id !== null)

      // Persist result for instant display on next visit
      writeCache(ownerAddress, contractAddress, {
        mints: freshMints, ownedTokenIds: ownedIds, ts: Date.now(),
      })

      if (live()) {
        setMints(freshMints)
        setOwnedTokenIds(new Set(ownedIds))
        setError(null)
      }
    } catch (err) {
      if (!live()) return
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[NFTOwnership] error:', msg)
      // Surface error only if there is no cached data to fall back to
      if (!cached && live()) setError(msg)
    } finally {
      if (live()) {
        setLoading(false)
        setRevalidating(false)
      }
    }
  }, [ownerAddress, contractAddress])

  // Run on mount and whenever owner/contract changes
  useEffect(() => {
    if (!ownerAddress || !contractAddress) {
      setMints([])
      setOwnedTokenIds(new Set())
      setLoading(false)
      setRevalidating(false)
      setError(null)
      return
    }
    void doFetch(false)
  }, [ownerAddress, contractAddress, doFetch])

  const refresh = useCallback(() => { void doFetch(true) }, [doFetch])

  return { mints, ownedTokenIds, loading, revalidating, error, refresh }
}
