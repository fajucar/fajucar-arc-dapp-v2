import { PublicClient, Address, parseAbiItem } from 'viem'

const ERC721_ABI = [
  {
    type: 'function' as const,
    name: 'ownerOf',
    stateMutability: 'view' as const,
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ type: 'address' }],
  },
  {
    type: 'function' as const,
    name: 'tokenURI',
    stateMutability: 'view' as const,
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ type: 'string' }],
  },
] as const

const TransferEvent = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)'
)

export interface MyNftItem {
  contractAddress: string
  tokenId: string
  tokenUri?: string
  name?: string
  image?: string
}

/**
 * Normalize IPFS URI to HTTP gateway URL
 */
function ipfsToHttp(uri: string): string {
  const s = (uri || '').trim()
  if (s.startsWith('http://') || s.startsWith('https://')) return s
  if (s.startsWith('ipfs://')) {
    const path = s.replace(/^ipfs:\/\//, '')
    return `https://ipfs.io/ipfs/${path}`
  }
  if (s.startsWith('ipfs/')) {
    return `https://ipfs.io/ipfs/${s.replace(/^ipfs\//, '')}`
  }
  return s
}

/**
 * Fetch JSON metadata and extract name + image (image normalized from IPFS if needed)
 */
async function fetchMetadata(tokenUri: string): Promise<{ name?: string; image?: string }> {
  const url = ipfsToHttp(tokenUri)
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return {}
    const json = (await res.json()) as { name?: string; image?: string }
    const name = typeof json.name === 'string' ? json.name : undefined
    let image = typeof json.image === 'string' ? json.image : undefined
    if (image) image = ipfsToHttp(image)
    return { name, image }
  } catch {
    return {}
  }
}

/**
 * Load NFTs owned by owner from a fixed list of contracts.
 * Uses Transfer(to=owner) logs, validates ownerOf, optionally fetches tokenURI and metadata.
 */
export async function loadMyNftsFromContracts({
  publicClient,
  owner,
  contracts,
  fromBlock,
}: {
  publicClient: PublicClient
  owner: Address
  contracts: readonly Address[]
  fromBlock?: bigint
}): Promise<MyNftItem[]> {
  const from = fromBlock ?? 0n
  const toBlock = 'latest' as const
  const results: MyNftItem[] = []
  const seen = new Set<string>()

  for (const contract of contracts) {
    if (!contract || contract.length !== 42) continue

    let logs: { args: { to?: Address; tokenId?: bigint } }[]
    try {
      logs = await publicClient.getLogs({
        address: contract,
        event: TransferEvent,
        args: { to: owner },
        fromBlock: from,
        toBlock,
      })
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn('[myNfts] getLogs failed for', contract, err)
      }
      continue
    }

    for (const log of logs) {
      const tokenId = log.args?.tokenId
      if (tokenId === undefined) continue

      const key = `${contract.toLowerCase()}-${tokenId.toString()}`
      if (seen.has(key)) continue
      seen.add(key)

      let currentOwner: Address
      try {
        currentOwner = await publicClient.readContract({
          address: contract,
          abi: ERC721_ABI,
          functionName: 'ownerOf',
          args: [tokenId],
        })
      } catch {
        continue
      }

      if (currentOwner.toLowerCase() !== owner.toLowerCase()) continue

      const item: MyNftItem = {
        contractAddress: contract,
        tokenId: tokenId.toString(),
      }

      try {
        const uri = await publicClient.readContract({
          address: contract,
          abi: ERC721_ABI,
          functionName: 'tokenURI',
          args: [tokenId],
        })
        if (uri && typeof uri === 'string') {
          item.tokenUri = uri
          const meta = await fetchMetadata(uri)
          if (meta.name) item.name = meta.name
          if (meta.image) item.image = meta.image
        }
      } catch {
        // keep item without metadata
      }

      results.push(item)
    }
  }

  return results
}
