export type RecentMintRecord = {
  contractAddress: string
  nftName: string
  ownerAddress: string
  txHash: string
  tokenId?: string | null
  timestamp: number
}

export type OptimisticUserNft = {
  id: string
  contractAddress: string
  ownerAddress: string
  txHash: string
  name: string
  image?: string
  tokenId?: string | null
  timestamp: number
}

const STORAGE_KEY = 'fajuarc:nft:recent-mint'
const OPTIMISTIC_NFTS_KEY = 'fajuarc:nft:optimistic-list'
export const RECENT_MINT_EVENT = 'fajuarc:nft:recent-mint'
export const OPTIMISTIC_NFTS_EVENT = 'fajuarc:nft:optimistic-list'

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined'
}

export function saveRecentMint(record: RecentMintRecord) {
  if (!canUseStorage()) return

  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(record))
    window.dispatchEvent(new CustomEvent<RecentMintRecord>(RECENT_MINT_EVENT, { detail: record }))
  } catch {
    // Ignore storage failures. Mint success UI still works without shared refresh state.
  }
}

export function getRecentMint(): RecentMintRecord | null {
  if (!canUseStorage()) return null

  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as RecentMintRecord
  } catch {
    return null
  }
}

export function clearRecentMint() {
  if (!canUseStorage()) return

  try {
    window.sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // Ignore storage failures.
  }
}

export function isRecentMintFresh(record: RecentMintRecord | null, maxAgeMs = 120000) {
  if (!record) return false
  return Date.now() - record.timestamp <= maxAgeMs
}

function readOptimisticList(): OptimisticUserNft[] {
  if (!canUseStorage()) return []

  try {
    const raw = window.sessionStorage.getItem(OPTIMISTIC_NFTS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as OptimisticUserNft[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeOptimisticList(list: OptimisticUserNft[]) {
  if (!canUseStorage()) return

  try {
    window.sessionStorage.setItem(OPTIMISTIC_NFTS_KEY, JSON.stringify(list))
    window.dispatchEvent(new CustomEvent<OptimisticUserNft[]>(OPTIMISTIC_NFTS_EVENT, { detail: list }))
  } catch {
    // Ignore storage failures.
  }
}

export function getOptimisticUserNfts(ownerAddress?: string | null) {
  const list = readOptimisticList()
  if (!ownerAddress) return list
  return list.filter((item) => item.ownerAddress.toLowerCase() === ownerAddress.toLowerCase())
}

export function addOptimisticUserNft(nft: OptimisticUserNft) {
  const current = readOptimisticList()
  const exists = current.some((item) => item.id === nft.id || (item.tokenId && nft.tokenId && item.tokenId === nft.tokenId))
  if (exists) return
  writeOptimisticList([nft, ...current])
}

export function removeOptimisticUserNfts(match: (nft: OptimisticUserNft) => boolean) {
  const current = readOptimisticList()
  const next = current.filter((item) => !match(item))
  if (next.length !== current.length) {
    writeOptimisticList(next)
  }
}

export function clearStaleOptimisticUserNfts(maxAgeMs = 10 * 60 * 1000) {
  const threshold = Date.now() - maxAgeMs
  removeOptimisticUserNfts((item) => item.timestamp < threshold)
}
