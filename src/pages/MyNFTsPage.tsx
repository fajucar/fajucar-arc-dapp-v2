import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import React from 'react'
import { usePublicClient, useChainId } from 'wagmi'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useArcWallet } from '@/hooks/useArcWallet'
import { RefreshCw, ExternalLink, Copy, CheckCircle2, Image as ImageIcon, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { useWalletModal } from '@/contexts/WalletModalContext'
import { FAJUCAR_COLLECTION_ADDRESS } from '@/config/contracts'
import { ARC_COLLECTION, getImageURL } from '@/config/arcCollection'
import { AppShell } from '@/components/Layout/AppShell'
import { motion, AnimatePresence } from 'framer-motion'
import { CONSTANTS } from '@/config/constants'
import {
  clearRecentMint,
  clearStaleOptimisticUserNfts,
  getOptimisticUserNfts,
  getRecentMint,
  isRecentMintFresh,
  OPTIMISTIC_NFTS_EVENT,
  RECENT_MINT_EVENT,
  removeOptimisticUserNfts,
  type OptimisticUserNft,
  type RecentMintRecord,
} from '@/lib/recentMint'
import { withTimeout } from '@/lib/async'

const GLOBAL_TIMEOUT_MS = 30000
/** Hard cap for the full fetch (metadata + scan); avoids infinite skeleton if RPC hangs. */
const FULL_LOAD_TIMEOUT_MS = 180000
/** Default 200; can be increased to 1000 in this file if the collection has more token IDs. */
const MAX_TOKEN_ID_SCAN = 200
const OWNER_OF_CONCURRENCY = 10
const FIXED_IPFS_TOKEN_URI = 'ipfs://bafkreicisecsndv777lv3hfafh3kfgvxf25al2mf7rifrqbdbbjqvcrs6u'
const RECENT_MINT_CONFIRMATION_DELAY_MS = 5000

interface NFTInfo {
  id: string
  contractAddress: string
  tokenId?: string
  owner: string
  tokenUri?: string
  name?: string
  image?: string
  txHash?: string
  isPending?: boolean
}

const FAJUCAR_READ_ABI = [
  { type: 'function' as const, name: 'balanceOf' as const, stateMutability: 'view' as const, inputs: [{ name: 'owner', type: 'address' as const }], outputs: [{ type: 'uint256' }] },
  { type: 'function' as const, name: 'tokenOfOwnerByIndex' as const, stateMutability: 'view' as const, inputs: [{ name: 'owner', type: 'address' as const }, { name: 'index', type: 'uint256' as const }], outputs: [{ type: 'uint256' }] },
  { type: 'function' as const, name: 'getUserTokens' as const, stateMutability: 'view' as const, inputs: [{ name: 'user', type: 'address' as const }], outputs: [{ type: 'uint256[]' }] },
  { type: 'function' as const, name: 'ownerOf' as const, stateMutability: 'view' as const, inputs: [{ name: 'tokenId', type: 'uint256' as const }], outputs: [{ type: 'address' }] },
  { type: 'function' as const, name: 'tokenURI' as const, stateMutability: 'view' as const, inputs: [{ name: 'tokenId', type: 'uint256' as const }], outputs: [{ type: 'string' }] },
] as const

function ipfsToHttp(uri: string): string {
  const s = (uri || '').trim()
  if (s.startsWith('http://') || s.startsWith('https://')) return s
  if (s.startsWith('ipfs://')) return `https://ipfs.io/ipfs/${s.replace(/^ipfs:\/\//, '')}`
  if (s.startsWith('ipfs/')) return `https://ipfs.io/ipfs/${s.replace(/^ipfs\//, '')}`
  return s
}

/** Resolve image URL so it loads in the browser: relative paths and localhost use current origin. */
function resolveImageUrl(imageUrl: string, metadataOrigin?: string): string {
  const s = (imageUrl || '').trim()
  if (!s) return ''
  let normalized = ipfsToHttp(s)
  // Relative path (e.g. /assets/nfts/arc_explorer.png) -> use current origin so image loads
  if (normalized.startsWith('/')) {
    const origin = typeof window !== 'undefined' ? window.location.origin : metadataOrigin || ''
    return origin ? `${origin}${normalized}` : normalized
  }
  // If metadata points to localhost but app is served from another origin, use current origin for same path (e.g. deployed app)
  if (typeof window !== 'undefined' && window.location.origin && (normalized.includes('localhost') || normalized.includes('127.0.0.1'))) {
    try {
      const u = new URL(normalized)
      const path = u.pathname + u.search
      if (path && path !== '/') normalized = `${window.location.origin}${path}`
    } catch {
      // keep normalized as-is
    }
  }
  return normalized
}

async function fetchMetadata(tokenUri: string): Promise<{ name?: string; image?: string }> {
  let url = ipfsToHttp(tokenUri)
  // Resolve relative metadata URLs (e.g. /metadata/arc-explorer.json) so fetch works
  if (url.startsWith('/') && typeof window !== 'undefined') {
    url = `${window.location.origin}${url}`
  }
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000), mode: 'cors' })
    if (!res.ok) return {}
    const json = (await res.json()) as { name?: string; image?: string; image_url?: string }
    const name = typeof json.name === 'string' ? json.name : undefined
    const rawImage = typeof json.image === 'string' ? json.image : typeof json.image_url === 'string' ? json.image_url : undefined
    let origin: string | undefined
    try {
      origin = new URL(url).origin
    } catch {
      origin = typeof window !== 'undefined' ? window.location.origin : undefined
    }
    const image = rawImage ? resolveImageUrl(rawImage, origin) : undefined
    return { name, image }
  } catch {
    return {}
  }
}

async function runWithConcurrency<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = []
  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency)
    const chunkResults = await Promise.all(chunk.map(fn))
    results.push(...chunkResults)
  }
  return results
}

export function MyNFTsPage() {
  const { t } = useTranslation()
  const { address, isConnected } = useArcWallet()
  const publicClient = usePublicClient()
  const chainId = useChainId()
  const [searchParams] = useSearchParams()
  const { openModal } = useWalletModal()

  const [nfts, setNfts] = useState<NFTInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [selectedNft, setSelectedNft] = useState<NFTInfo | null>(null)
  const [userNFTs, setUserNFTs] = useState<NFTInfo[]>([])
  const [recentMint, setRecentMint] = useState<RecentMintRecord | null>(() => {
    const record = getRecentMint()
    return isRecentMintFresh(record) ? record : null
  })
  const [isChecking, setIsChecking] = useState(false)

  const loadingRef = useRef(false)
  /** Bumps on each new load or disconnect; stale async work must not overwrite state (fixes stuck skeleton / empty after reconnect). */
  const nftLoadIdRef = useRef(0)
  const abortControllerRef = useRef<AbortController | null>(null)
  const highlightedTokenIdRef = useRef<HTMLDivElement>(null)

  const highlightParam = searchParams.get('highlight')
  const highlightedTokenId = highlightParam ?? recentMint?.tokenId ?? null
  const mergedNFTs = useMemo(() => {
    const map = new Map<string, NFTInfo>()

    for (const nft of [...userNFTs, ...nfts]) {
      const key = nft.tokenId
        ? `${nft.contractAddress.toLowerCase()}-${nft.tokenId}`
        : nft.id
      if (!map.has(key) || !map.get(key)?.tokenId) {
        map.set(key, nft)
      }
    }

    return Array.from(map.values()).sort((a, b) => {
      const idA = BigInt(a.tokenId || '0')
      const idB = BigInt(b.tokenId || '0')
      return idA < idB ? -1 : idA > idB ? 1 : 0
    })
  }, [nfts, userNFTs])

  // Cada usuário vê apenas os NFTs que possui (carteira conectada)
  const ownerAddress = address ?? null

  // Listagem 100% on-chain: balanceOf -> tokenOfOwnerByIndex ou getUserTokens ou ownerOf(tokenId) scan. Sem mocks, totalSupply isolado ou IDs fixos.
  const loadNFTs = useCallback(async (): Promise<NFTInfo[]> => {
    const loadId = ++nftLoadIdRef.current
    const isCurrent = () => loadId === nftLoadIdRef.current

    // Abort previous RPC batch (signal used in catch only; new load supersedes old via loadId)
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    abortControllerRef.current = new AbortController()
    const abortSignal = abortControllerRef.current.signal

    loadingRef.current = true
    setLoading(true)
    setError(null)

    if (!publicClient) {
      if (isCurrent()) {
        setNfts([])
        setError(null)
        setLoading(false)
        loadingRef.current = false
      }
      return []
    }

    if (!ownerAddress) {
      if (isCurrent()) {
        setNfts([])
        setError(null)
        setLoading(false)
        loadingRef.current = false
      }
      return []
    }

    if (!chainId) {
      if (isCurrent()) {
        setNfts([])
        setError(null)
        setLoading(false)
        loadingRef.current = false
      }
      return []
    }

    if (!FAJUCAR_COLLECTION_ADDRESS) {
      if (isCurrent()) {
        setError('Invalid contract. Check VITE_FAJUCAR_COLLECTION_ADDRESS (no quotes or spaces).')
        setNfts([])
        setLoading(false)
        loadingRef.current = false
      }
      return []
    }
    const contract = FAJUCAR_COLLECTION_ADDRESS as `0x${string}`
    const owner = ownerAddress as `0x${string}`

    try {
      return await withTimeout(
        (async (): Promise<NFTInfo[]> => {
          const balance = await withTimeout(
            publicClient.readContract({
              address: contract,
              abi: FAJUCAR_READ_ABI,
              functionName: 'balanceOf',
              args: [owner],
            }),
            GLOBAL_TIMEOUT_MS,
            'balanceOf'
          )

          if (balance === undefined || balance === null || balance === 0n) {
            if (isCurrent()) {
              setNfts([])
              setError(null)
            }
            return []
          }

          let tokenIds: string[] = []
          let enumerableSupported = false
          try {
            await withTimeout(
              publicClient.readContract({
                address: contract,
                abi: FAJUCAR_READ_ABI,
                functionName: 'tokenOfOwnerByIndex',
                args: [owner, 0n],
              }),
              GLOBAL_TIMEOUT_MS,
              'tokenOfOwnerByIndex_probe'
            )
            enumerableSupported = true
          } catch {
            // tokenOfOwnerByIndex not available
          }

          if (enumerableSupported) {
            for (let i = 0; i < Number(balance); i++) {
              try {
                const tokenId = await withTimeout(
                  publicClient.readContract({
                    address: contract,
                    abi: FAJUCAR_READ_ABI,
                    functionName: 'tokenOfOwnerByIndex',
                    args: [owner, BigInt(i)],
                  }),
                  GLOBAL_TIMEOUT_MS,
                  `tokenOfOwnerByIndex_${i}`
                )
                tokenIds.push(tokenId.toString())
              } catch {
                // skip failed index
              }
            }
          }

          if (tokenIds.length === 0) {
            try {
              const userTokens = await withTimeout(
                publicClient.readContract({
                  address: contract,
                  abi: FAJUCAR_READ_ABI,
                  functionName: 'getUserTokens',
                  args: [owner],
                }),
                GLOBAL_TIMEOUT_MS,
                'getUserTokens'
              )
              if (Array.isArray(userTokens) && userTokens.length > 0) {
                tokenIds = userTokens.map((id: bigint) => id.toString())
              }
            } catch {
              // getUserTokens not available or reverted
            }
          }

          if (tokenIds.length === 0) {
            const scanIds = Array.from({ length: Number(MAX_TOKEN_ID_SCAN) }, (_, i) => i + 1)
            const owners = await runWithConcurrency(scanIds, OWNER_OF_CONCURRENCY, async (tokenId) => {
              try {
                return await withTimeout(
                  publicClient.readContract({
                    address: contract,
                    abi: FAJUCAR_READ_ABI,
                    functionName: 'ownerOf',
                    args: [BigInt(tokenId)],
                  }),
                  GLOBAL_TIMEOUT_MS,
                  `ownerOf_${tokenId}`
                )
              } catch {
                return null
              }
            })
            tokenIds = scanIds
              .map((id, i) => (owners[i]?.toLowerCase() === owner.toLowerCase() ? String(id) : null))
              .filter((id): id is string => id !== null)
          }

          const allNFTs: NFTInfo[] = []
          for (const tokenIdStr of tokenIds) {
            let tokenUri: string | undefined
            try {
              tokenUri = await withTimeout(
                publicClient.readContract({
                  address: contract,
                  abi: FAJUCAR_READ_ABI,
                  functionName: 'tokenURI',
                  args: [BigInt(tokenIdStr)],
                }),
                GLOBAL_TIMEOUT_MS,
                `tokenURI_${tokenIdStr}`
              )
            } catch {
              tokenUri = FIXED_IPFS_TOKEN_URI
            }
            const uriToFetch = tokenUri || FIXED_IPFS_TOKEN_URI
            let name: string | undefined
            let image: string | undefined
            try {
              const meta = await fetchMetadata(uriToFetch)
              name = meta.name
              image = meta.image
            } catch {
              // leave name/image undefined
            }
            // Fallback: if metadata had no image but tokenURI is a direct image URL, use it
            if (!image && /\.(png|jpg|jpeg|gif|webp|svg)(\?|$)/i.test(uriToFetch)) {
              image = resolveImageUrl(uriToFetch)
            }
            // Fallback FajucarCollection: use app assets so images always show when contract tokenURI is localhost or fails (tokenId 1..5 = modelo exato; 6+ = ciclo)
            const tokenIdNum = parseInt(tokenIdStr, 10)
            if (!image && !isNaN(tokenIdNum) && tokenIdNum >= 1 && ARC_COLLECTION.length > 0) {
              const index = (tokenIdNum - 1) % ARC_COLLECTION.length
              const item = ARC_COLLECTION[index]
              if (item?.image) {
                image = getImageURL(item.image)
                if (!name) name = item.name
              }
            }
            allNFTs.push({
              id: `${contract.toLowerCase()}-${tokenIdStr}`,
              contractAddress: contract,
              tokenId: tokenIdStr,
              owner: ownerAddress,
              tokenUri: uriToFetch,
              name,
              image,
            })
          }

          allNFTs.sort((a, b) => {
            const idA = BigInt(a.tokenId || '0')
            const idB = BigInt(b.tokenId || '0')
            return idA < idB ? -1 : idA > idB ? 1 : 0
          })

          if (isCurrent()) {
            setNfts(allNFTs)
            setError(null)
          }
          return allNFTs
        })(),
        FULL_LOAD_TIMEOUT_MS,
        'loadNFTs_full'
      )
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error)

      if (abortSignal.aborted || errorMsg.includes('aborted')) {
        if (isCurrent()) {
          setError('Operation cancelled or timeout.')
          setNfts([])
        }
        return []
      }

      if (isCurrent()) {
        const friendly =
          errorMsg.includes('loadNFTs_full') || errorMsg.includes('Timeout:')
            ? 'Network took too long to load NFTs. Tap Refresh or check your connection / Arc Testnet RPC.'
            : errorMsg || 'Error loading NFTs'
        toast.error(friendly)
        setError(friendly)
        setNfts([])
      }
      return []
    } finally {
      if (isCurrent()) {
        setLoading(false)
        loadingRef.current = false
        abortControllerRef.current = null
      }
    }
  }, [publicClient, ownerAddress, chainId])

  // Use ref to store loadNFTs to avoid dependency issues
  const loadNFTsRef = useRef(loadNFTs)
  useEffect(() => {
    loadNFTsRef.current = loadNFTs
  }, [loadNFTs])

  useEffect(() => {
    clearStaleOptimisticUserNfts()

    const syncOptimisticNfts = (owner?: string | null) => {
      const nextItems = getOptimisticUserNfts(owner).map((item: OptimisticUserNft) => ({
        id: item.id,
        contractAddress: item.contractAddress,
        tokenId: item.tokenId ?? undefined,
        owner: item.ownerAddress,
        name: item.name,
        image: item.image,
        txHash: item.txHash,
        isPending: true,
      }))
      setUserNFTs(nextItems)
    }

    const record = getRecentMint()
    if (!isRecentMintFresh(record)) {
      clearRecentMint()
      setRecentMint(null)
    }
    syncOptimisticNfts(ownerAddress)

    const handleRecentMint = (event: Event) => {
      const customEvent = event as CustomEvent<RecentMintRecord>
      const nextRecord = customEvent.detail ?? getRecentMint()
      setRecentMint(isRecentMintFresh(nextRecord) ? nextRecord : null)
      syncOptimisticNfts(nextRecord?.ownerAddress ?? ownerAddress)
    }

    const handleStorage = () => {
      const nextRecord = getRecentMint()
      setRecentMint(isRecentMintFresh(nextRecord) ? nextRecord : null)
      syncOptimisticNfts(ownerAddress)
    }

    const handleOptimisticNfts = () => {
      syncOptimisticNfts(ownerAddress)
    }

    window.addEventListener(RECENT_MINT_EVENT, handleRecentMint as EventListener)
    window.addEventListener('storage', handleStorage)
    window.addEventListener(OPTIMISTIC_NFTS_EVENT, handleOptimisticNfts)

    return () => {
      window.removeEventListener(RECENT_MINT_EVENT, handleRecentMint as EventListener)
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener(OPTIMISTIC_NFTS_EVENT, handleOptimisticNfts)
    }
  }, [ownerAddress])

  useEffect(() => {
    if (ownerAddress && chainId && publicClient) {
      void loadNFTsRef.current()
    } else if (!ownerAddress || !publicClient) {
      nftLoadIdRef.current += 1
      setNfts([])
      setError(null)
      setLoading(false)
      loadingRef.current = false
    }
    // Intentionally do not clear NFTs when chainId is briefly undefined after reconnect — wait for next effect tick.
  }, [ownerAddress, chainId, publicClient])

  // Reload NFTs when highlight param changes (e.g., after mint)
  useEffect(() => {
    if (highlightParam && ownerAddress && chainId && publicClient) {
      void loadNFTsRef.current()
    }
  }, [highlightParam, ownerAddress, chainId, publicClient])

  useEffect(() => {
    const shouldSyncRecentMint = Boolean(
      recentMint &&
      isRecentMintFresh(recentMint) &&
      recentMint.contractAddress.toLowerCase() === FAJUCAR_COLLECTION_ADDRESS.toLowerCase() &&
      recentMint.ownerAddress.toLowerCase() === ownerAddress?.toLowerCase()
    )

    if (!shouldSyncRecentMint || !ownerAddress || !chainId || !publicClient) {
      setIsChecking(false)
      return
    }

    let cancelled = false
    setIsChecking(true)

    const timeoutId = window.setTimeout(async () => {
      if (cancelled) return
      await loadNFTsRef.current()
      if (cancelled) return
      setIsChecking(false)
      clearRecentMint()
      setRecentMint(null)
    }, RECENT_MINT_CONFIRMATION_DELAY_MS)

    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [recentMint, ownerAddress, chainId, publicClient])

  useEffect(() => {
    if (!ownerAddress) return

    const onChainTokenIds = new Set(
      nfts
        .filter((item) => item.contractAddress.toLowerCase() === FAJUCAR_COLLECTION_ADDRESS.toLowerCase())
        .map((item) => item.tokenId)
    )

    if (onChainTokenIds.size === 0) return

    removeOptimisticUserNfts((item) =>
      item.ownerAddress.toLowerCase() === ownerAddress.toLowerCase() &&
      item.contractAddress.toLowerCase() === FAJUCAR_COLLECTION_ADDRESS.toLowerCase() &&
      Boolean(item.tokenId && onChainTokenIds.has(item.tokenId))
    )

    setUserNFTs(
      getOptimisticUserNfts(ownerAddress).map((item) => ({
        id: item.id,
        contractAddress: item.contractAddress,
        tokenId: item.tokenId ?? undefined,
        owner: item.ownerAddress,
        name: item.name,
        image: item.image,
        txHash: item.txHash,
        isPending: true,
      }))
    )
  }, [nfts, ownerAddress])

  // Note: periodic auto-refresh was removed — overlapping loads could leave loading=true forever
  // when a superseded request's finally skipped setLoading(false). Use Refresh or remount.

  // Scroll to highlighted NFT when it appears
  useEffect(() => {
    if (highlightedTokenId && highlightedTokenIdRef.current) {
      setTimeout(() => {
        highlightedTokenIdRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        })
      }, 500)
    }
  }, [highlightedTokenId, nfts])

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(label)
      toast.success(`${label} copied!`)
      setTimeout(() => setCopied(null), 2000)
    } catch (err) {
      toast.error('Failed to copy')
    }
  }

  // Gate: usuário precisa conectar a carteira para ver seus NFTs
  if (!isConnected) {
    return (
      <AppShell
        title="My NFTs"
        subtitle="Connect your wallet to view your NFTs"
      >
        <div className="text-center py-12">
          <ImageIcon className="h-16 w-16 mx-auto text-cyan-400 mb-4" />
          <h2 className="text-2xl font-bold mb-2 text-white">Connect Your Wallet</h2>
          <p className="text-slate-400 mb-6">Connect your wallet to view your NFTs</p>
          <button
            className="px-6 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-semibold hover:from-cyan-400 hover:to-blue-400 transition-all"
            onClick={() => openModal?.()}
          >
            Connect Wallet
          </button>
        </div>
      </AppShell>
    )
  }

  const subtitle = ownerAddress ? `${ownerAddress.slice(0, 6)}…${ownerAddress.slice(-4)}` : ''
  const showRecentMintBanner = Boolean(
    recentMint &&
    isRecentMintFresh(recentMint) &&
    recentMint.ownerAddress.toLowerCase() === ownerAddress?.toLowerCase()
  )

  return (
    <AppShell
      title="My NFTs"
      subtitle={subtitle}
      titleClassName="text-xl md:text-2xl font-semibold tracking-tight"
    >
      {showRecentMintBanner && (
        <div className="mb-4 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-medium text-cyan-200">
                NFT minted successfully{recentMint?.nftName ? `: ${recentMint.nftName}` : ''}.
              </p>
              <p className="text-xs text-slate-300">
                {isChecking
                  ? 'Finalizing on-chain confirmation...'
                  : 'Mint detected. Wallet view updated with local state while on-chain sync completes.'}
              </p>
              {recentMint?.tokenId && (
                <p className="mt-1 text-xs text-cyan-300">Expected token ID: #{recentMint.tokenId}</p>
              )}
            </div>
            <a
              href={`${CONSTANTS.LINKS.explorer}/tx/${recentMint?.txHash ?? ''}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm font-medium text-cyan-300 hover:text-cyan-200"
            >
              <ExternalLink className="h-4 w-4" />
              View mint tx
            </a>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => {
            setError(null)
            loadNFTsRef.current()
          }}
          disabled={loading}
          className="px-3 py-1.5 rounded-lg bg-slate-800/40 border border-slate-700/40 text-slate-300 hover:bg-slate-800/60 hover:border-slate-600 hover:text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-xs font-medium"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-xl bg-red-900/15 border border-red-500/20 px-4 py-3">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {loading && mergedNFTs.length === 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0.6 }}
              animate={{ opacity: [0.6, 1, 0.6] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
              className="rounded-2xl border border-slate-700/40 bg-slate-800/40 overflow-hidden"
            >
              <div className="aspect-square bg-slate-700/50 animate-pulse" />
              <div className="p-3 space-y-2">
                <div className="h-4 bg-slate-700/50 rounded animate-pulse" />
                <div className="h-3 w-2/3 bg-slate-700/50 rounded animate-pulse" />
              </div>
            </motion.div>
          ))}
        </div>
      ) : error ? (
        <div className="rounded-xl bg-slate-800/40 border border-red-500/20 px-6 py-8 text-center">
          <p className="text-red-400 text-sm font-medium mb-2">{error}</p>
          <p className="text-slate-500 text-xs mb-4">{t('myNfts.clickRefreshToRetry')}</p>
          <button
            onClick={() => { setError(null); loadNFTsRef.current() }}
            className="px-4 py-2 rounded-lg bg-slate-700/50 text-slate-300 text-sm hover:bg-slate-600/50 transition-colors"
          >
            Refresh
          </button>
        </div>
      ) : mergedNFTs.length === 0 ? (
        <div className="rounded-xl bg-slate-800/40 border border-slate-700/40 px-6 py-10 text-center">
          <p className="text-white font-medium text-sm mb-1">
            {showRecentMintBanner ? 'Finalizing your newly minted NFT...' : 'No NFTs found'}
          </p>
          <p className="text-slate-500 text-xs mb-4">
            {showRecentMintBanner
              ? 'Your NFT is already added locally. We are doing one extra on-chain confirmation in the background.'
              : 'Only after the wallet scan completes will this empty state be shown.'}
          </p>
          <button
            onClick={() => { setError(null); loadNFTsRef.current() }}
            className="px-4 py-2 rounded-lg bg-cyan-500/20 text-cyan-300 text-sm border border-cyan-500/30 hover:bg-amber-500/30 transition-colors"
          >
            {showRecentMintBanner ? 'Check Again Now' : 'Refresh'}
          </button>
        </div>
      ) : (
        <div className="w-full">
          <div className={`grid gap-4 ${mergedNFTs.length <= 3 ? 'grid-cols-3 w-fit mx-auto' : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5'}`}>
            {mergedNFTs.map((nft, index) => (
              <motion.div
                key={`${nft.contractAddress}-${nft.tokenId ?? nft.id}`}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.05, ease: 'easeOut' }}
              >
                <NFTCard
                  nft={nft}
                  isHighlighted={highlightedTokenId === nft.tokenId}
                  ref={highlightedTokenId === nft.tokenId ? highlightedTokenIdRef : undefined}
                  onClick={() => setSelectedNft(nft)}
                />
              </motion.div>
            ))}
          </div>
          <NFTModal nft={selectedNft} copied={copied} onCopy={copyToClipboard} onClose={() => setSelectedNft(null)} />
        </div>
      )}
    </AppShell>
  )
}

// Card: imagem + ID, hover zoom, click to open modal
const NFTCard = React.forwardRef<HTMLDivElement, {
  nft: NFTInfo
  isHighlighted?: boolean
  onClick?: () => void
}>(({ nft, isHighlighted, onClick }, ref) => {
  const [imageError, setImageError] = useState(false)
  const showImage = nft.image && !imageError

  return (
    <motion.div
      ref={ref}
      onClick={onClick}
      whileHover={{ scale: 1.03 }}
      className={`cursor-pointer rounded-2xl border overflow-hidden transition-all duration-300 ease-in-out
        ${isHighlighted
          ? 'border-cyan-400/60 shadow-[0_0_24px_rgba(34,211,238,0.2)] ring-1 ring-cyan-400/30 scale-[1.02]'
          : 'border-slate-700/40 hover:border-cyan-500/30 hover:shadow-[0_0_20px_rgba(34,211,238,0.12)]'
        }`}
    >
      <div className="relative aspect-square bg-slate-800/50 flex items-center justify-center overflow-hidden group">
        {showImage ? (
          <img
            src={nft.image}
            alt={nft.tokenId ? `#${nft.tokenId}` : nft.name || 'NFT'}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
            onError={() => setImageError(true)}
          />
        ) : (
          <ImageIcon className="w-12 h-12 text-slate-600" />
        )}
      </div>
      <div className="px-3 py-2.5 bg-slate-900/60 border-t border-slate-700/40 flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2 min-w-0">
          <span className="font-mono text-xs text-slate-300 truncate">{nft.tokenId ? `#${nft.tokenId}` : 'Pending token ID'}</span>
          <span className="text-xs text-slate-400 truncate">{nft.name || 'Unknown'}</span>
        </div>
        {nft.isPending && (
          <span className="inline-flex w-fit items-center rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-medium text-cyan-300">
            Pending sync
          </span>
        )}
      </div>
    </motion.div>
  )
})

NFTCard.displayName = 'NFTCard'

// Modal: glass background, large preview, metadata, copy contract, explorer link
function NFTModal({ nft, copied, onCopy, onClose }: {
  nft: NFTInfo | null
  copied: string | null
  onCopy: (text: string, label: string) => void
  onClose: () => void
}) {
  const [imageError, setImageError] = useState(false)

  return (
    <AnimatePresence mode="wait">
      {nft && (
      <motion.div
        key={`modal-${nft.contractAddress}-${nft.tokenId ?? nft.id}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ type: 'spring', duration: 0.3 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md rounded-2xl border border-slate-700/50 bg-slate-900/90 backdrop-blur-xl shadow-2xl overflow-hidden"
        >
          <div className="relative aspect-square bg-slate-800/50 flex items-center justify-center overflow-hidden">
            {(nft.image && !imageError) ? (
              <img src={nft.image} alt={nft.tokenId ? `#${nft.tokenId}` : nft.name || 'NFT'} className="w-full h-full object-contain" onError={() => setImageError(true)} />
            ) : (
              <ImageIcon className="w-20 h-20 text-slate-600" />
            )}
            <button onClick={onClose} className="absolute top-3 right-3 p-2 rounded-full bg-slate-800/80 hover:bg-slate-700/80 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-4 space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-white">{nft.name || (nft.tokenId ? `Token #${nft.tokenId}` : 'Pending NFT')}</h3>
              <p className="font-mono text-sm text-slate-400">{nft.tokenId ? `#${nft.tokenId}` : 'Pending token ID'}</p>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-slate-800/60 px-3 py-2">
              <span className="font-mono text-xs text-slate-300 truncate flex-1 mr-2">{nft.contractAddress}</span>
              <button onClick={() => onCopy(nft.contractAddress, 'Address')} className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/20 text-cyan-300 hover:bg-amber-500/30 transition-colors text-sm font-medium">
                {copied === 'Address' ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                Copy Contract
              </button>
            </div>
            {nft.tokenId ? (
              <a
                href={`${CONSTANTS.LINKS.explorer}/token/${nft.contractAddress}?a=${nft.tokenId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-3 rounded-xl border border-cyan-500/40 text-cyan-300 hover:bg-amber-500/10 transition-colors font-medium"
              >
                View on Explorer
                <ExternalLink className="w-4 h-4" />
              </a>
            ) : (
              <div className="flex items-center justify-center gap-2 w-full py-3 rounded-xl border border-slate-700/50 text-slate-400 font-medium">
                Finalizing on-chain confirmation...
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
      )}
    </AnimatePresence>
  )
}
