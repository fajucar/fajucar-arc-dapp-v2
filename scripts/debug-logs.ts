#!/usr/bin/env node
/**
 * Debug script to test getLogs directly in Node.js
 * Tests Transfer event logs for a given owner address
 * 
 * Usage:
 *   npm run debug:logs -- 0xYOUR_ADDRESS
 */

import { createPublicClient, http, decodeEventLog, getAddress, padHex, keccak256, toBytes } from 'viem'
import { arcTestnet } from '../src/config/chains.js'
import * as dotenv from 'dotenv'
import * as path from 'path'
import { fileURLToPath } from 'url'

// Load .env file
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
dotenv.config({ path: path.join(__dirname, '../.env') })

// Transfer event ABI
const TRANSFER_EVENT_ABI = {
  type: 'event',
  name: 'Transfer',
  inputs: [
    { indexed: true, name: 'from', type: 'address' },
    { indexed: true, name: 'to', type: 'address' },
    { indexed: true, name: 'tokenId', type: 'uint256' },
  ],
} as const

// Calculate topic0: keccak256("Transfer(address,address,uint256)")
const TRANSFER_TOPIC0 = keccak256(toBytes('Transfer(address,address,uint256)'))

async function main() {
  // Get owner address from CLI args
  const ownerArg = process.argv[2]
  if (!ownerArg) {
    console.error('❌ Error: Owner address required')
    console.log('Usage: npm run debug:logs -- 0xYOUR_ADDRESS')
    process.exit(1)
  }

  // Validate and normalize owner address
  let ownerAddress: `0x${string}`
  try {
    ownerAddress = getAddress(ownerArg.toLowerCase())
  } catch (error) {
    console.error('❌ Error: Invalid address format:', ownerArg)
    process.exit(1)
  }

  // Read config from .env
  const nftAddressEnv = process.env.VITE_GIFT_CARD_NFT_ADDRESS
  const deployBlockEnv = process.env.VITE_NFT_DEPLOY_BLOCK
  const rpcUrlEnv = process.env.RPC_URL

  if (!nftAddressEnv) {
    console.error('❌ Error: VITE_GIFT_CARD_NFT_ADDRESS not found in .env')
    process.exit(1)
  }

  if (!deployBlockEnv) {
    console.error('❌ Error: VITE_NFT_DEPLOY_BLOCK not found in .env')
    process.exit(1)
  }

  // Validate and normalize NFT address
  let nftAddress: `0x${string}`
  try {
    nftAddress = getAddress(nftAddressEnv.toLowerCase())
  } catch (error) {
    console.error('❌ Error: Invalid NFT address in .env:', nftAddressEnv)
    process.exit(1)
  }

  // Parse deploy block
  let deployBlock: bigint
  try {
    deployBlock = BigInt(deployBlockEnv.trim())
    if (deployBlock < 0n) {
      throw new Error('Deploy block must be >= 0')
    }
  } catch (error) {
    console.error('❌ Error: Invalid VITE_NFT_DEPLOY_BLOCK:', deployBlockEnv)
    process.exit(1)
  }

  // Use RPC_URL from .env or fallback to default Arc Testnet RPC
  const rpcUrl = rpcUrlEnv || arcTestnet.rpcUrls.default.http[0]

  console.log('='.repeat(60))
  console.log('🔍 Debug: Testing getLogs for Transfer events')
  console.log('='.repeat(60))
  console.log(`📍 Chain: ${arcTestnet.name} (ID: ${arcTestnet.id})`)
  console.log(`🔗 RPC: ${rpcUrl}`)
  console.log(`📦 NFT Address: ${nftAddress}`)
  console.log(`👤 Owner: ${ownerAddress}`)
  console.log(`📊 Deploy Block: ${deployBlock.toString()}`)
  console.log('')

  // Create public client
  const publicClient = createPublicClient({
    chain: arcTestnet,
    transport: http(rpcUrl),
  })

  try {
    // Get latest block
    console.log('⏳ Fetching latest block...')
    const latestBlock = await publicClient.getBlockNumber()
    console.log(`✅ Latest block: ${latestBlock.toString()}`)
    console.log('')

    // Test with small range first (10k blocks - RPC limit)
    // Note: Some RPCs limit getLogs to 10,000 blocks
    const testRange = 10000n
    const fromBlock = deployBlock
    const toBlock = fromBlock + testRange > latestBlock ? latestBlock : fromBlock + testRange

    console.log(`📊 Testing range: ${fromBlock.toString()} → ${toBlock.toString()} (${(toBlock - fromBlock).toString()} blocks)`)
    console.log('')

    // Pad owner address to 32 bytes for topic filtering
    const ownerTopic = padHex(ownerAddress.toLowerCase() as `0x${string}`, { size: 32 })

    // Build topics filters
    // Transfer(address indexed from, address indexed to, uint256 indexed tokenId)
    // topics[0] = event signature
    // topics[1] = from (indexed)
    // topics[2] = to (indexed)
    // topics[3] = tokenId (indexed)
    const topicsTo: [`0x${string}`, null, `0x${string}`, null] = [
      TRANSFER_TOPIC0,
      null,
      ownerTopic,
      null,
    ]
    const topicsFrom: [`0x${string}`, `0x${string}`, null, null] = [
      TRANSFER_TOPIC0,
      ownerTopic,
      null,
      null,
    ]

    // Fetch logs where to == owner
    console.log('📥 Fetching logsTo (Transfer where to == owner)...')
    const logsTo = await publicClient.getLogs({
      address: nftAddress,
      topics: topicsTo,
      fromBlock,
      toBlock,
    })
    console.log(`✅ Found ${logsTo.length} logsTo`)
    console.log('')

    // Fetch logs where from == owner
    console.log('📤 Fetching logsFrom (Transfer where from == owner)...')
    const logsFrom = await publicClient.getLogs({
      address: nftAddress,
      topics: topicsFrom,
      fromBlock,
      toBlock,
    })
    console.log(`✅ Found ${logsFrom.length} logsFrom`)
    console.log('')

    // Filter Transfer events only (check topic0)
    const transferLogsTo = logsTo.filter((log) => {
      return log.topics && log.topics[0] === TRANSFER_TOPIC0
    })
    const transferLogsFrom = logsFrom.filter((log) => {
      return log.topics && log.topics[0] === TRANSFER_TOPIC0
    })

    // Decode and show first 3 tokenIds from logsTo
    console.log('='.repeat(60))
    console.log('📋 Results:')
    console.log('='.repeat(60))
    console.log(`📥 logsTo count: ${logsTo.length} (${transferLogsTo.length} Transfer events)`)
    console.log(`📤 logsFrom count: ${logsFrom.length} (${transferLogsFrom.length} Transfer events)`)
    console.log('')

    if (transferLogsTo.length === 0 && transferLogsFrom.length === 0) {
      console.log('⚠️  0 Transfer events encontrados nesse range.')
      if (logsTo.length > 0 || logsFrom.length > 0) {
        console.log(`ℹ️  Nota: Encontrados ${logsTo.length + logsFrom.length} logs, mas nenhum é Transfer event.`)
        console.log(`   Isso pode indicar que o contrato emite outros eventos além de Transfer.`)
      }
      console.log('')
      console.log('Possíveis causas:')
      console.log('  - Endereço do owner está incorreto')
      console.log('  - Chain/RPC está incorreto')
      console.log('  - Range de blocos insuficiente (RPC limita a 10k blocos por request)')
      console.log('  - NFT contract não emitiu Transfer events nesse range')
      console.log('')
      console.log(`💡 Dica: O RPC limita getLogs a 10,000 blocos por request.`)
      console.log(`   Para buscar mais blocos, seria necessário fazer paginação (chunks de 10k).`)
      console.log(`   Range testado: ${fromBlock.toString()} → ${toBlock.toString()}`)
      console.log(`   Latest block: ${latestBlock.toString()}`)
    } else {
      // Decode first 3 tokenIds from logsTo
      const tokenIds: bigint[] = []
      for (let i = 0; i < Math.min(3, transferLogsTo.length); i++) {
        try {
          const decoded = decodeEventLog({
            abi: [TRANSFER_EVENT_ABI],
            data: transferLogsTo[i].data,
            topics: transferLogsTo[i].topics,
          })
          if (decoded.eventName === 'Transfer' && decoded.args) {
            const args = decoded.args as {
              from?: `0x${string}`
              to?: `0x${string}`
              tokenId?: bigint
            }
            if (args.tokenId) {
              tokenIds.push(args.tokenId)
            }
          }
        } catch (error: any) {
          console.warn(`⚠️  Erro ao decodificar log ${i + 1}:`, error.message || error)
        }
      }
      
      if (transferLogsTo.length < logsTo.length) {
        console.log(`ℹ️  Filtrados ${logsTo.length - transferLogsTo.length} logs que não são Transfer events`)
      }

      if (tokenIds.length > 0) {
        console.log('🎯 Primeiros tokenIds encontrados (logsTo):')
        tokenIds.forEach((tokenId, idx) => {
          console.log(`  ${idx + 1}. Token ID: ${tokenId.toString()}`)
        })
      }

      // Decode first 3 tokenIds from logsFrom
      const tokenIdsFrom: bigint[] = []
      for (let i = 0; i < Math.min(3, transferLogsFrom.length); i++) {
        try {
          const decoded = decodeEventLog({
            abi: [TRANSFER_EVENT_ABI],
            data: transferLogsFrom[i].data,
            topics: transferLogsFrom[i].topics,
          })
          if (decoded.eventName === 'Transfer' && decoded.args) {
            const args = decoded.args as {
              from?: `0x${string}`
              to?: `0x${string}`
              tokenId?: bigint
            }
            if (args.tokenId) {
              tokenIdsFrom.push(args.tokenId)
            }
          }
        } catch (error: any) {
          console.warn(`⚠️  Erro ao decodificar log ${i + 1}:`, error.message || error)
        }
      }
      
      if (transferLogsFrom.length < logsFrom.length) {
        console.log(`ℹ️  Filtrados ${logsFrom.length - transferLogsFrom.length} logs que não são Transfer events`)
      }

      if (tokenIdsFrom.length > 0) {
        console.log('')
        console.log('🎯 Primeiros tokenIds encontrados (logsFrom):')
        tokenIdsFrom.forEach((tokenId, idx) => {
          console.log(`  ${idx + 1}. Token ID: ${tokenId.toString()}`)
        })
      }
    }

    console.log('')
    console.log('='.repeat(60))
    console.log('✅ Debug concluído')
    console.log('='.repeat(60))
  } catch (error: any) {
    console.error('')
    console.error('❌ Error:', error.message)
    if (error.code) {
      console.error(`   Code: ${error.code}`)
    }
    if (error.data) {
      console.error(`   Data:`, error.data)
    }
    console.error('')
    process.exit(1)
  }

  // Ensure script exits
  process.exit(0)
}

// Run main
main().catch((error) => {
  console.error('❌ Fatal error:', error)
  process.exit(1)
})
