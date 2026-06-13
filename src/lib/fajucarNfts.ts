import { PublicClient, Address, parseAbiItem } from 'viem'

const FAJUCAR_ABI = [
  { type: 'function' as const, name: 'ownerOf', stateMutability: 'view' as const, inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ type: 'address' }] },
  { type: 'function' as const, name: 'tokenURI', stateMutability: 'view' as const, inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ type: 'string' }] },
] as const

/**
 * Get owned token IDs for the Fajucar collection using only Transfer event logs.
 * No ERC721Enumerable (tokenOfOwnerByIndex).
 * Uses chunked queries (< 10,000 blocks) to avoid RPC limits.
 */
export async function getOwnedTokenIdsFromTransferLogs(
  publicClient: PublicClient,
  collectionAddress: Address,
  owner: Address
): Promise<bigint[]> {
  const CHUNK_SIZE = 9000n // Safe chunk size (< 10,000 limit)
  const MAX_WINDOWS = 10 // Max windows to search
  
  // Get latest block
  const latestBlock = await publicClient.getBlockNumber()
  
  const tokenIdsRaw = new Set<string>()
  let currentTo = latestBlock
  let windowsSearched = 0
  
  // Search backwards in chunks
  while (windowsSearched < MAX_WINDOWS && currentTo >= 0n) {
    // Calculate fromBlock ensuring window size <= CHUNK_SIZE
    // Never use 0n directly - always ensure window is < 10,000 blocks
    const fromBlock = currentTo >= CHUNK_SIZE ? currentTo - CHUNK_SIZE + 1n : 0n
    const toBlock = currentTo
    
    // Skip if window would be too small (already searched or invalid)
    if (fromBlock > toBlock) {
      break
    }
    
    try {
      const logs = await publicClient.getLogs({
        address: collectionAddress,
        event: parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)'),
        args: { to: owner },
        fromBlock,
        toBlock,
      })
      
      // Extract tokenIds from logs
      for (const log of logs) {
        const args = (log as { args?: { tokenId?: bigint } }).args
        if (args?.tokenId !== undefined) {
          tokenIdsRaw.add(String(args.tokenId))
        } else if (log.topics && log.topics.length >= 4 && log.topics[3]) {
          tokenIdsRaw.add(log.topics[3])
        }
      }
      
      windowsSearched++
      
      // Move to next window (backwards)
      if (fromBlock === 0n) {
        break // Reached genesis
      }
      currentTo = fromBlock - 1n
    } catch (err: any) {
      console.warn(`[fajucarNfts] Failed to get logs for window ${fromBlock}-${toBlock}:`, err)
      // Continue to next window
      if (fromBlock === 0n) {
        break
      }
      currentTo = fromBlock - 1n
      windowsSearched++
    }
  }
  
  // Verify ownership for each tokenId
  const verified: bigint[] = []
  for (const hex of tokenIdsRaw) {
    const tokenId = BigInt(hex)
    try {
      const currentOwner = await publicClient.readContract({
        address: collectionAddress,
        abi: FAJUCAR_ABI,
        functionName: 'ownerOf',
        args: [tokenId],
      }) as Address
      if (String(currentOwner).toLowerCase() === String(owner).toLowerCase()) {
        verified.push(tokenId)
      }
    } catch {
      // token burned or invalid, skip
    }
  }
  verified.sort((a, b) => (a > b ? -1 : a < b ? 1 : 0))
  return verified
}

/**
 * Detect if string is a CID (IPFS Content Identifier).
 * Common prefixes: bafy, bafkrei, Qm, etc.
 */
function isIpfsCid(input: string): boolean {
  const s = (input || '').trim()
  // Common IPFS CID prefixes
  return /^(bafy|bafkrei|Qm|z[a-z0-9]+)/i.test(s) || s.length >= 32 && /^[a-z0-9]+$/i.test(s)
}

/**
 * Extract CID + path from IPFS URI or raw CID.
 * Handles:
 * - "ipfs://<cid>/<path>"
 * - "<cid>/<path>"
 * - "<cid>" (raw CID)
 * Returns: "<cid>/<path>" or "<cid>" or null if not IPFS
 */
function extractIpfsCidAndPath(input: string): string | null {
  const s = (input || '').trim()
  
  // Already HTTP URL
  if (s.startsWith('http://') || s.startsWith('https://')) {
    return null
  }
  
  // ipfs:// prefix
  if (s.startsWith('ipfs://')) {
    return s.replace(/^ipfs:\/\//, '')
  }
  
  // ipfs/ prefix
  if (s.startsWith('ipfs/')) {
    return s.replace(/^ipfs\//, '')
  }
  
  // Raw CID (detect by common prefixes)
  if (isIpfsCid(s)) {
    return s
  }
  
  // CID with path (e.g., "bafy.../path/to/file.json")
  const cidMatch = s.match(/^([a-z0-9]+)(\/.*)?$/i)
  if (cidMatch && isIpfsCid(cidMatch[1])) {
    return s
  }
  
  return null
}

/**
 * Convert IPFS URI/CID to HTTP gateway URLs (with fallback gateways).
 * Accepts: "ipfs://<cid>/<path>", "<cid>/<path>", "<cid>", or HTTP URL
 * Returns array of URLs to try in order.
 */
export function toIpfsHttpCandidates(input: string): string[] {
  const s = (input || '').trim()
  if (!s) {
    return []
  }
  
  // Already HTTP URL, return as-is
  if (s.startsWith('http://') || s.startsWith('https://')) {
    return [s]
  }
  
  const cidPath = extractIpfsCidAndPath(s)
  if (!cidPath) {
    // Not IPFS, return as-is (might be relative URL or invalid)
    return [s]
  }
  
  // Return gateways in order (4 gateways - Pinata first, then Cloudflare, then ipfs.io)
  return [
    `https://red-cheap-koala-836.mypinata.cloud/ipfs/${cidPath}`,
    `https://gateway.pinata.cloud/ipfs/${cidPath}`,
    `https://cloudflare-ipfs.com/ipfs/${cidPath}`,
    `https://ipfs.io/ipfs/${cidPath}`,
  ]
}

/**
 * @deprecated Use toIpfsHttpCandidates instead
 */
export function ipfsToHttp(uri: string): string[] {
  return toIpfsHttpCandidates(uri)
}

/**
 * Fetch from URL with timeout and abort signal.
 */
async function fetchWithTimeout(url: string, timeoutMs: number = 10000): Promise<Response> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    clearTimeout(t)
    return res
  } catch (err) {
    clearTimeout(t)
    throw err
  }
}

/**
 * Try fetching from multiple URLs (gateways) until one succeeds.
 * Returns the successful Response with URL, or error info if all fail.
 * Logs which gateway succeeded/failed (dev only).
 */
async function fetchWithFallback(
  urls: string[],
  context?: { tokenId?: string; type?: 'metadata' | 'image' }
): Promise<{ response: Response; url: string } | { error: string; lastUrl: string; lastStatus?: number }> {
  let lastError: string | undefined
  let lastUrl: string | undefined
  let lastStatus: number | undefined
  
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i]
    try {
      const res = await fetchWithTimeout(url, 10000)
      
      // Check if status is 200-299 (success)
      if (res.status >= 200 && res.status < 300) {
        if (import.meta.env.DEV) {
          const contextStr = context?.tokenId ? `tokenId=${context.tokenId} ` : ''
          const typeStr = context?.type ? `(${context.type}) ` : ''
          if (i > 0) {
            console.log(`[fajucarNfts] ${contextStr}${typeStr}Gateway ${i + 1}/${urls.length} succeeded:`, url)
          } else {
            console.log(`[fajucarNfts] ${contextStr}${typeStr}Gateway ${i + 1}/${urls.length} succeeded (first try):`, url)
          }
        }
        return { response: res, url }
      } else {
        // Status not OK (200-299), try next gateway
        lastStatus = res.status
        lastUrl = url
        lastError = `HTTP ${res.status}`
        
        if (import.meta.env.DEV) {
          const contextStr = context?.tokenId ? `tokenId=${context.tokenId} ` : ''
          const typeStr = context?.type ? `(${context.type}) ` : ''
          console.warn(`[fajucarNfts] ${contextStr}${typeStr}Gateway ${i + 1}/${urls.length} returned ${res.status}:`, url)
        }
      }
    } catch (err: any) {
      // Network error, timeout, or CORS
      lastUrl = url
      lastError = err.name === 'AbortError' ? 'timeout' : err.message || String(err)
      
      if (import.meta.env.DEV) {
        const contextStr = context?.tokenId ? `tokenId=${context.tokenId} ` : ''
        const typeStr = context?.type ? `(${context.type}) ` : ''
        console.warn(`[fajucarNfts] ${contextStr}${typeStr}Gateway ${i + 1}/${urls.length} failed:`, url, err.name || err.message || err)
      }
      // Try next gateway
      continue
    }
  }
  
  // All gateways failed
  if (import.meta.env.DEV) {
    const contextStr = context?.tokenId ? `tokenId=${context.tokenId} ` : ''
    const typeStr = context?.type ? `(${context.type}) ` : ''
    console.error(`[fajucarNfts] ${contextStr}${typeStr}All gateways failed. URLs tried:`, urls, 'Last error:', lastError, 'Last status:', lastStatus)
  }
  
  return {
    error: lastError || 'All gateways failed',
    lastUrl: lastUrl || urls[urls.length - 1] || '',
    lastStatus,
  }
}

/**
 * Fetch token metadata from tokenURI (handles IPFS with gateway fallback).
 * Returns metadata with image URLs array for fallback in component.
 */
export async function fetchTokenMetadata(
  tokenUri: string,
  context?: { tokenId?: string }
): Promise<{ 
  name?: string
  description?: string
  image?: string
  imageUrls?: string[]
  tokenUrls?: string[]
  error?: string
  lastTriedUrl?: string
  lastStatus?: number
}> {
  if (!tokenUri || !tokenUri.trim()) {
    return {}
  }
  
  // Resolve tokenURI (may be IPFS or raw CID)
  const tokenUrls = toIpfsHttpCandidates(tokenUri)
  
  if (import.meta.env.DEV) {
    const contextStr = context?.tokenId ? `tokenId=${context.tokenId} ` : ''
    console.log(`[fajucarNfts] ${contextStr}tokenURI="${tokenUri}" -> URLs:`, tokenUrls)
  }
  
  const tokenRes = await fetchWithFallback(tokenUrls, { tokenId: context?.tokenId, type: 'metadata' })
  
  if ('error' in tokenRes) {
    console.warn('[fajucarNfts] Failed to fetch tokenURI metadata from all gateways:', tokenUri, {
      urlsTried: tokenUrls,
      lastTriedUrl: tokenRes.lastUrl,
      lastStatus: tokenRes.lastStatus,
      error: tokenRes.error,
    })
    // Return error info so caller can display it
    return { 
      tokenUrls,
      error: tokenRes.error,
      lastTriedUrl: tokenRes.lastUrl,
      lastStatus: tokenRes.lastStatus,
    }
  }
  
  if (import.meta.env.DEV) {
    const contextStr = context?.tokenId ? `tokenId=${context.tokenId} ` : ''
    console.log(`[fajucarNfts] ${contextStr}Metadata fetch succeeded from:`, tokenRes.url)
  }
  
  try {
    const json = await tokenRes.response.json()
    
    // Resolve image URL (may also be IPFS or raw CID) - return all candidate URLs for fallback
    let imageUrl: string | undefined
    let imageUrls: string[] | undefined
    let imageError: string | undefined
    let imageLastTriedUrl: string | undefined
    let imageLastStatus: number | undefined
    
    if (json.image) {
      imageUrls = toIpfsHttpCandidates(String(json.image))
      const imageRes = await fetchWithFallback(imageUrls, { tokenId: context?.tokenId, type: 'image' })
      
      if ('error' in imageRes) {
        // If all gateways failed, still return the first URL (browser will try to load it)
        // The component can handle onError and use local fallback
        imageUrl = imageUrls[0]
        imageError = imageRes.error
        imageLastTriedUrl = imageRes.lastUrl
        imageLastStatus = imageRes.lastStatus
        console.warn('[fajucarNfts] All image gateways failed, using first URL:', imageUrl, {
          error: imageError,
          lastStatus: imageLastStatus,
        })
      } else {
        // Use the URL that succeeded
        imageUrl = imageRes.url
        if (import.meta.env.DEV) {
          const contextStr = context?.tokenId ? `tokenId=${context.tokenId} ` : ''
          console.log(`[fajucarNfts] ${contextStr}Image fetch succeeded from:`, imageRes.url)
        }
      }
    }
    
    return {
      name: json.name ?? undefined,
      description: json.description ?? undefined,
      image: imageUrl,
      imageUrls, // Return all URLs for fallback in component
      tokenUrls, // Return tokenUrls for debugging
      error: imageError, // Image fetch error (if any)
      lastTriedUrl: imageLastTriedUrl, // Last image URL tried (if failed)
      lastStatus: imageLastStatus, // Last image status (if failed)
    }
  } catch (err) {
    console.warn('[fajucarNfts] Failed to parse metadata JSON:', err)
    // Return tokenUrls even on parse error
    return { 
      tokenUrls,
      error: `JSON parse error: ${err instanceof Error ? err.message : String(err)}`,
      lastTriedUrl: tokenRes.url,
    }
  }
}
