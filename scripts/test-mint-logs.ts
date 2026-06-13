/**
 * Script de teste para validar se o mint emite eventos Transfer
 * 
 * Uso: npm run test:mint-logs -- <TX_HASH>
 * Exemplo: npm run test:mint-logs -- 0x1234...
 */

import { createPublicClient, http, decodeEventLog, getAddress } from 'viem'
import { arcTestnet } from '../src/config/chains.js'
import * as dotenv from 'dotenv'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { readFileSync } from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load .env
dotenv.config({ path: path.resolve(__dirname, '../.env') })

// Transfer event topic0: keccak256("Transfer(address,address,uint256)")
const TRANSFER_TOPIC0 = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'

// Load ABI
const FajuARC_ABI = JSON.parse(
  readFileSync(path.resolve(__dirname, '../src/abis/FajuARC.json'), 'utf-8')
)

async function main() {
  const txHash = process.argv[2] as `0x${string}` | undefined

  if (!txHash || !txHash.startsWith('0x')) {
    console.error('❌ Usage: npm run test:mint-logs -- <TX_HASH>')
    console.error('   Example: npm run test:mint-logs -- 0x1234...')
    process.exit(1)
  }

  const rpcUrl = process.env.RPC_URL || arcTestnet.rpcUrls.default.http[0]
  const nftAddress = process.env.VITE_GIFT_CARD_NFT_ADDRESS
  const minterAddress = process.env.VITE_GIFT_CARD_MINTER_ADDRESS

  console.log('🔍 Testing mint transaction logs...\n')
  console.log('Transaction Hash:', txHash)
  console.log('RPC URL:', rpcUrl)
  console.log('NFT Address:', nftAddress || '❌ NOT SET')
  console.log('Minter Address:', minterAddress || '❌ NOT SET')
  console.log('')

  const publicClient = createPublicClient({
    chain: arcTestnet,
    transport: http(rpcUrl),
  })

  try {
    // Get transaction receipt
    const receipt = await publicClient.getTransactionReceipt({ hash: txHash })

    console.log('📋 Receipt Details:')
    console.log('  Block Number:', receipt.blockNumber.toString())
    console.log('  Status:', receipt.status === 'success' ? '✅ Success' : '❌ Failed')
    console.log('  Logs Count:', receipt.logs.length)
    console.log('')

    if (receipt.logs.length === 0) {
      console.error('❌ NO LOGS FOUND!')
      console.error('   This transaction did not emit any events.')
      console.error('   The mint function may not be calling _safeMint or _mint.')
      process.exit(1)
    }

    console.log('🔍 Analyzing logs...\n')

    let transferEventFound = false
    let transferEventCount = 0

    for (let i = 0; i < receipt.logs.length; i++) {
      const log = receipt.logs[i]
      console.log(`Log ${i + 1}:`)
      console.log('  Contract:', log.address)
      console.log('  Topics:', log.topics.length)

      // Check if this is a Transfer event
      if (log.topics[0] === TRANSFER_TOPIC0) {
        transferEventCount++
        console.log('  ✅ Transfer event detected!')

        try {
          const decoded = decodeEventLog({
            abi: FajuARC_ABI,
            data: log.data,
            topics: log.topics,
          })

          if (decoded.eventName === 'Transfer' && decoded.args) {
            const args = decoded.args as {
              from?: `0x${string}`
              to?: `0x${string}`
              tokenId?: bigint
            }

            console.log('  Decoded Transfer:')
            console.log('    From:', args.from)
            console.log('    To:', args.to)
            console.log('    Token ID:', args.tokenId?.toString())

            const zeroAddress = '0x0000000000000000000000000000000000000000'
            const isMint = args.from?.toLowerCase() === zeroAddress.toLowerCase()

            if (isMint) {
              transferEventFound = true
              console.log('    ✅ This is a MINT (from == 0x0)')
            } else {
              console.log('    ⚠️  This is a TRANSFER (not a mint)')
            }

            // Check if contract matches NFT address
            if (nftAddress) {
              const logAddr = getAddress(log.address)
              const nftAddr = getAddress(nftAddress)
              if (logAddr === nftAddr) {
                console.log('    ✅ Contract matches NFT_ADDRESS')
              } else {
                console.log('    ⚠️  Contract does NOT match NFT_ADDRESS')
                console.log('    Expected:', nftAddr)
                console.log('    Got:', logAddr)
              }
            }
          }
        } catch (error) {
          console.log('  ⚠️  Could not decode as Transfer event:', (error as Error).message)
        }
      } else {
        console.log('  Event:', log.topics[0]?.slice(0, 10) + '...')
      }

      console.log('')
    }

    console.log('📊 Summary:')
    console.log('  Total logs:', receipt.logs.length)
    console.log('  Transfer events found:', transferEventCount)
    console.log('  Mint Transfer found:', transferEventFound ? '✅ YES' : '❌ NO')
    console.log('')

    if (transferEventFound) {
      console.log('✅ SUCCESS: Mint transaction emitted Transfer event!')
      process.exit(0)
    } else {
      console.error('❌ FAILURE: No Transfer event found for mint!')
      console.error('')
      console.error('Possible issues:')
      console.error('  1. Contract mint() function does not call _safeMint() or _mint()')
      console.error('  2. Contract is not ERC-721 compliant')
      console.error('  3. Transfer event is emitted from wrong contract')
      console.error('')
      console.error('Fix: Ensure mint() calls _safeMint(to, tokenId) which emits Transfer')
      process.exit(1)
    }
  } catch (error: any) {
    console.error('❌ Error:', error.message)
    if (error.cause) {
      console.error('   Cause:', error.cause)
    }
    process.exit(1)
  }
}

main()
