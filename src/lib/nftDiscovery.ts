import { PublicClient, Address, pad } from 'viem'

/**
 * ERC-721 Transfer event signature
 * keccak256("Transfer(address,address,uint256)")
 */
const TRANSFER_TOPIC0 = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'

/**
 * ERC-165 interface ID for ERC-721
 */
const ERC721_INTERFACE_ID = '0x80ac58cd'

/**
 * Standard ERC-721 ABI for basic functions
 */
const ERC721_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'tokenOfOwnerByIndex',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'index', type: 'uint256' },
    ],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'ownerOf',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ type: 'address' }],
  },
  {
    type: 'function',
    name: 'supportsInterface',
    stateMutability: 'view',
    inputs: [{ name: 'interfaceId', type: 'bytes4' }],
    outputs: [{ type: 'bool' }],
  },
] as const

export interface DiscoveredNFT {
  contractAddress: `0x${string}`
  tokenIds: bigint[]
}

/**
 * Get owned token IDs for a given contract and owner.
 * 
 * Strategy:
 * 1. Try ERC721Enumerable (balanceOf + tokenOfOwnerByIndex)
 * 2. If that fails, use Transfer event logs
 * 3. Confirm ownership with ownerOf for each token
 * 
 * @param publicClient - Viem public client
 * @param contractAddress - ERC-721 contract address
 * @param ownerAddress - Wallet address to check
 * @returns Array of token IDs (as strings) owned by the address
 */
export async function getOwnedTokenIds(
  publicClient: PublicClient,
  contractAddress: Address,
  ownerAddress: Address
): Promise<string[]> {
  try {
    // Step 1: Try ERC721Enumerable approach
    try {
      const balance = await publicClient.readContract({
        address: contractAddress,
        abi: ERC721_ABI,
        functionName: 'balanceOf',
        args: [ownerAddress],
      }) as bigint

      if (balance === 0n) {
        return []
      }

      // Try to get tokens using tokenOfOwnerByIndex
      const tokenIds: bigint[] = []
      for (let i = 0n; i < balance; i++) {
        try {
          const tokenId = await publicClient.readContract({
            address: contractAddress,
            abi: ERC721_ABI,
            functionName: 'tokenOfOwnerByIndex',
            args: [ownerAddress, i],
          }) as bigint
          tokenIds.push(tokenId)
        } catch (err) {
          // tokenOfOwnerByIndex doesn't exist or failed, fall back to logs
          throw new Error('ERC721Enumerable not available')
        }
      }

      // Verify ownership for each token
      const verifiedTokenIds: string[] = []
      for (const tokenId of tokenIds) {
        try {
          const owner = await publicClient.readContract({
            address: contractAddress,
            abi: ERC721_ABI,
            functionName: 'ownerOf',
            args: [tokenId],
          }) as Address

          if (owner.toLowerCase() === ownerAddress.toLowerCase()) {
            verifiedTokenIds.push(tokenId.toString())
          }
        } catch (err) {
          // Token doesn't exist or ownerOf failed, skip it
          console.warn(`[nftDiscovery] Failed to verify ownerOf for token ${tokenId}:`, err)
        }
      }

      return verifiedTokenIds
    } catch (enumError) {
      // ERC721Enumerable approach failed, use logs
      console.log(`[nftDiscovery] ERC721Enumerable not available for ${contractAddress}, using logs method`)
    }

    // Step 2: Use Transfer event logs
    const tokenIdsFromLogs = new Set<string>()

    try {
      // Get all Transfer events where 'to' is the owner
      // Use topics filter: topic[0] = Transfer signature, topic[2] = to (indexed address)
      const ownerAddressPadded = ownerAddress.toLowerCase().padStart(66, '0x0')
      
      const logs = await publicClient.getLogs({
        address: contractAddress,
        event: {
          type: 'event',
          name: 'Transfer',
          inputs: [
            { type: 'address', indexed: true, name: 'from' },
            { type: 'address', indexed: true, name: 'to' },
            { type: 'uint256', indexed: true, name: 'tokenId' },
          ],
        },
        args: {
          to: ownerAddress,
        },
        fromBlock: 'earliest',
        toBlock: 'latest',
      }).catch(() => {
        // Fallback: use topics filter if args doesn't work
        return (publicClient.getLogs as (args: { address: Address; topics: (string | null)[]; fromBlock: 'earliest'; toBlock: 'latest' }) => ReturnType<PublicClient['getLogs']>)({
          address: contractAddress,
          topics: [
            TRANSFER_TOPIC0,
            null,
            ownerAddressPadded as `0x${string}`,
            null,
          ],
          fromBlock: 'earliest',
          toBlock: 'latest',
        })
      })

      // Extract tokenIds from logs
      for (const log of logs) {
        try {
          if (log.topics && log.topics.length >= 4) {
            // topic[0] = Transfer signature
            // topic[1] = from (indexed)
            // topic[2] = to (indexed)
            // topic[3] = tokenId (indexed)
            const tokenIdHex = log.topics[3]
            if (tokenIdHex) {
              const tokenId = BigInt(tokenIdHex).toString()
              tokenIdsFromLogs.add(tokenId)
            }
          }
        } catch (err) {
          console.warn(`[nftDiscovery] Failed to extract tokenId from log:`, err)
        }
      }
    } catch (logsError: any) {
      console.warn(`[nftDiscovery] Failed to get logs for ${contractAddress}:`, logsError.message)
      // Continue with empty set
    }

    // Step 3: Verify ownership and filter out transfers away from owner
    const verifiedTokenIds: string[] = []

    for (const tokenIdStr of tokenIdsFromLogs) {
      try {
        const tokenId = BigInt(tokenIdStr)
        const owner = await publicClient.readContract({
          address: contractAddress,
          abi: ERC721_ABI,
          functionName: 'ownerOf',
          args: [tokenId],
        }) as Address

        if (owner.toLowerCase() === ownerAddress.toLowerCase()) {
          verifiedTokenIds.push(tokenIdStr)
        }
      } catch (err) {
        // Token doesn't exist or ownerOf failed, skip it
        console.warn(`[nftDiscovery] Failed to verify ownerOf for token ${tokenIdStr}:`, err)
      }
    }

    // Deduplicate and return
    return Array.from(new Set(verifiedTokenIds))
  } catch (error: any) {
    console.error(`[nftDiscovery] Error getting owned token IDs for ${contractAddress}:`, error)
    return []
  }
}

/**
 * Discover all ERC-721 tokens owned by the wallet (factory/clone model support).
 * 
 * Strategy:
 * 1. Get all Transfer events where 'to' = owner (across all contracts)
 * 2. Extract contract addresses and tokenIds from logs
 * 3. Deduplicate and group by contract
 * 4. Validate each contract is ERC721 (supportsInterface or try ownerOf)
 * 5. Confirm current ownership with ownerOf for each tokenId
 * 
 * @param publicClient - Viem public client
 * @param owner - Wallet address to check
 * @param fromBlock - Block number to start searching from (optional, defaults to 0n)
 * @returns Array of discovered NFTs with contract address and token IDs (as bigint[])
 */
export async function discoverErc721TokensForOwner(params: {
  publicClient: PublicClient
  owner: `0x${string}`
  fromBlock?: bigint
}): Promise<Array<{ contractAddress: `0x${string}`, tokenIds: bigint[] }>> {
  const { publicClient, owner, fromBlock } = params
  
  console.log('[MYNFTS] owner', owner)
  const startBlock = fromBlock !== undefined ? fromBlock : 0n
  console.log('[MYNFTS] fromBlock', startBlock.toString())

  try {
    // Step 1: Get all Transfer events where 'to' = owner
    // Pad address to 32 bytes using viem pad function
    const ownerAddressPadded = pad(owner, { size: 32 })
    
    console.log('[MYNFTS] Fetching Transfer logs...')
    
    let logs: any[] = []
    try {
      // Try with event filter first
      logs = await publicClient.getLogs({
        event: {
          type: 'event',
          name: 'Transfer',
          inputs: [
            { type: 'address', indexed: true, name: 'from' },
            { type: 'address', indexed: true, name: 'to' },
            { type: 'uint256', indexed: true, name: 'tokenId' },
          ],
        },
        args: {
          to: owner,
        },
        fromBlock: startBlock,
        toBlock: 'latest',
      })
    } catch (err) {
      // Fallback: use topics filter
      console.log('[MYNFTS] Event filter failed, using topics filter')
      logs = await (publicClient.getLogs as (args: { topics: (`0x${string}` | null)[]; fromBlock: bigint; toBlock: 'latest' }) => ReturnType<PublicClient['getLogs']>)({
        topics: [
          TRANSFER_TOPIC0 as `0x${string}`,
          null,
          ownerAddressPadded,
          null,
        ],
        fromBlock: startBlock,
        toBlock: 'latest',
      })
    }

    console.log('[MYNFTS] raw logs count', logs.length)

    // Step 2: Extract contract addresses and tokenIds from logs, deduplicate and group
    const contractTokenMap = new Map<string, Set<bigint>>()

    for (const log of logs) {
      try {
        if (!log.address || !log.topics || log.topics.length < 4) {
          continue
        }

        const contractAddress = log.address.toLowerCase()
        const tokenIdHex = log.topics[3]
        
        if (!tokenIdHex) {
          continue
        }

        const tokenId = BigInt(tokenIdHex)
        
        if (!contractTokenMap.has(contractAddress)) {
          contractTokenMap.set(contractAddress, new Set())
        }
        contractTokenMap.get(contractAddress)!.add(tokenId)
      } catch (err) {
        console.warn('[MYNFTS] Failed to process log:', err)
      }
    }

    console.log('[MYNFTS] discovered contracts', contractTokenMap.size)

    // Step 3: Validate contracts are ERC721 and confirm ownership
    const result: Array<{ contractAddress: `0x${string}`, tokenIds: bigint[] }> = []

    for (const [contractAddress, tokenIdsSet] of contractTokenMap.entries()) {
      try {
        // Validate ERC721: try supportsInterface first, then fallback to ownerOf
        let isValidERC721 = false
        try {
          const supports = await publicClient.readContract({
            address: contractAddress as Address,
            abi: ERC721_ABI,
            functionName: 'supportsInterface',
            args: [ERC721_INTERFACE_ID as `0x${string}`],
          }) as boolean
          isValidERC721 = supports
        } catch (err) {
          // supportsInterface not available, try ownerOf with first tokenId
          const firstTokenId = Array.from(tokenIdsSet)[0]
          if (firstTokenId !== undefined) {
            try {
              await publicClient.readContract({
                address: contractAddress as Address,
                abi: ERC721_ABI,
                functionName: 'ownerOf',
                args: [firstTokenId],
              })
              isValidERC721 = true
            } catch (err2) {
              // Not ERC721 or contract doesn't exist
              console.warn(`[MYNFTS] Contract ${contractAddress} is not ERC721`)
            }
          }
        }

        if (!isValidERC721) {
          console.log(`[MYNFTS] Skipping ${contractAddress} (not ERC721)`)
          continue
        }

        // Step 4: Confirm current ownership for each tokenId
        const verifiedTokenIds: bigint[] = []
        for (const tokenId of tokenIdsSet) {
          try {
            const tokenOwner = await publicClient.readContract({
              address: contractAddress as Address,
              abi: ERC721_ABI,
              functionName: 'ownerOf',
              args: [tokenId],
            }) as Address

            if (tokenOwner.toLowerCase() === owner.toLowerCase()) {
              verifiedTokenIds.push(tokenId)
            }
          } catch (err) {
            // Token doesn't exist or ownerOf failed, skip it
            console.warn(`[MYNFTS] Failed to verify token ${tokenId.toString()} in ${contractAddress}:`, err)
          }
        }

        if (verifiedTokenIds.length > 0) {
          result.push({
            contractAddress: contractAddress as `0x${string}`,
            tokenIds: verifiedTokenIds,
          })
        }
      } catch (err) {
        console.warn(`[MYNFTS] Error validating contract ${contractAddress}:`, err)
      }
    }

    console.log('[MYNFTS] final tokens', result.reduce((sum, nft) => sum + nft.tokenIds.length, 0))
    
    return result
  } catch (error: any) {
    console.error('[MYNFTS] Error during discovery:', error)
    return []
  }
}
