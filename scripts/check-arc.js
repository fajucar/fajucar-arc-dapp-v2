#!/usr/bin/env node
/**
 * Verificador on-chain para contratos Arc Network
 * 
 * Verifica:
 * - chainId do RPC
 * - bytecode dos contratos (NFT e MINTER)
 * - suporte ERC-721 (supportsInterface)
 * - name() e symbol() do NFT
 * - balanceOf(wallet) se wallet fornecida
 * 
 * Uso:
 *   node scripts/check-arc.js [0xWALLET_ADDRESS]
 * 
 * Ou com RPC customizado:
 *   $env:RPC_URL="https://rpc.testnet.arc.network"
 *   node scripts/check-arc.js 0xSUA_WALLET
 * 
 * Ou via npm (se script adicionado):
 *   npm run check:arc -- 0xSUA_WALLET
 */

import 'dotenv/config'
import { JsonRpcProvider, Contract, getAddress } from 'ethers'

// RPC: usar do env se válido, senão fallback
const rpcFromEnv = process.env.RPC_URL || process.env.VITE_ARC_RPC_URL
const RPC = (rpcFromEnv && 
             rpcFromEnv.startsWith('http') && 
             !rpcFromEnv.includes('SEU_RPC') &&
             !rpcFromEnv.includes('PLACEHOLDER')) 
  ? rpcFromEnv 
  : 'https://rpc.testnet.arc.network'

const NFT_ADDRESS = process.env.VITE_GIFT_CARD_NFT_ADDRESS
const MINTER_ADDRESS = process.env.VITE_GIFT_CARD_MINTER_ADDRESS
const wallet = process.argv[2]

// ABIs mínimos
const ERC721_ABI = [
  {
    type: 'function',
    name: 'supportsInterface',
    stateMutability: 'view',
    inputs: [{ name: 'interfaceId', type: 'bytes4' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'name',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
  {
    type: 'function',
    name: 'symbol',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
]

// ERC-721 interface ID: 0x80ac58cd
const ERC721_INTERFACE_ID = '0x80ac58cd'

async function main() {
  console.log('🔍 Verificando contratos Arc Network on-chain...\n')

  // Validar endereços obrigatórios
  if (!NFT_ADDRESS) {
    console.error('❌ ERRO: VITE_GIFT_CARD_NFT_ADDRESS não configurado no .env')
    process.exit(1)
  }

  if (!MINTER_ADDRESS) {
    console.error('❌ ERRO: VITE_GIFT_CARD_MINTER_ADDRESS não configurado no .env')
    process.exit(1)
  }

  // Normalizar endereços (checksum)
  // getAddress funciona mesmo com lowercase, mas converte para checksum correto
  let nftAddress, minterAddress, walletAddress
  try {
    // getAddress aceita lowercase e converte para checksum
    nftAddress = getAddress(NFT_ADDRESS.toLowerCase())
    minterAddress = getAddress(MINTER_ADDRESS.toLowerCase())
    if (wallet) {
      walletAddress = getAddress(wallet.toLowerCase())
    }
  } catch (error) {
    console.error('❌ ERRO: Endereço inválido:', error.message)
    console.error('  NFT_ADDRESS:', NFT_ADDRESS)
    console.error('  MINTER_ADDRESS:', MINTER_ADDRESS)
    if (wallet) {
      console.error('  Wallet:', wallet)
    }
    process.exit(1)
  }

  console.log('📋 Configuração:')
  console.log('  RPC:', RPC)
  console.log('  NFT Address:', nftAddress)
  console.log('  MINTER Address:', minterAddress)
  if (walletAddress) {
    console.log('  Wallet:', walletAddress)
  }
  console.log('')

  try {
    // Conectar ao RPC
    const provider = new JsonRpcProvider(RPC)

    // 1) Verificar chainId
    console.log('1️⃣  Verificando chainId...')
    const network = await provider.getNetwork()
    const chainId = Number(network.chainId)
    console.log('  chainId:', chainId)
    if (chainId === 5042002) {
      console.log('  ✅ Arc Testnet correto (5042002)')
    } else {
      console.log('  ⚠️  Esperado: 5042002, recebido:', chainId)
    }
    console.log('')

    // 2) Verificar bytecode dos contratos
    console.log('2️⃣  Verificando bytecode dos contratos...')
    
    const nftCode = await provider.getCode(nftAddress)
    const nftHasCode = nftCode && nftCode !== '0x'
    console.log('  NFT code:', nftHasCode ? '✅ YES' : '❌ NO')
    if (!nftHasCode) {
      console.log('  ⚠️  NFT contract não tem bytecode (não deployado ou endereço inválido)')
    }

    const minterCode = await provider.getCode(minterAddress)
    const minterHasCode = minterCode && minterCode !== '0x'
    console.log('  MINTER code:', minterHasCode ? '✅ YES' : '❌ NO')
    if (!minterHasCode) {
      console.log('  ⚠️  MINTER contract não tem bytecode (não deployado ou endereço inválido)')
    }
    console.log('')

    if (!nftHasCode) {
      console.error('❌ NFT contract não encontrado. Verifique o endereço.')
      process.exit(1)
    }

    // 3) Verificar suporte ERC-721
    console.log('3️⃣  Verificando suporte ERC-721...')
    const nftContract = new Contract(nftAddress, ERC721_ABI, provider)
    
    try {
      const supportsERC721 = await nftContract.supportsInterface(ERC721_INTERFACE_ID)
      console.log('  supportsInterface(0x80ac58cd):', supportsERC721 ? '✅ true' : '❌ false')
      if (!supportsERC721) {
        console.log('  ⚠️  Contrato não suporta interface ERC-721')
      }
    } catch (error) {
      console.log('  ❌ Erro ao verificar supportsInterface:', error.message)
      console.log('  ⚠️  Contrato pode não implementar supportsInterface')
    }
    console.log('')

    // 4) Verificar name() e symbol()
    console.log('4️⃣  Verificando name() e symbol()...')
    
    try {
      const name = await nftContract.name()
      console.log('  name():', name || '(vazio)')
    } catch (error) {
      console.log('  ❌ Erro ao ler name():', error.message)
      console.log('  ⚠️  Contrato pode não implementar name()')
    }

    try {
      const symbol = await nftContract.symbol()
      console.log('  symbol():', symbol || '(vazio)')
    } catch (error) {
      console.log('  ❌ Erro ao ler symbol():', error.message)
      console.log('  ⚠️  Contrato pode não implementar symbol()')
    }
    console.log('')

    // 5) Verificar balanceOf(wallet) se wallet fornecida
    if (walletAddress) {
      console.log('5️⃣  Verificando balanceOf(wallet)...')
      try {
        const balance = await nftContract.balanceOf(walletAddress)
        const balanceNum = Number(balance)
        console.log('  balanceOf(' + walletAddress + '):', balanceNum)
        if (balanceNum > 0) {
          console.log('  ✅ Wallet possui', balanceNum, 'NFT(s)')
        } else {
          console.log('  ℹ️  Wallet não possui NFTs')
        }
      } catch (error) {
        console.log('  ❌ Erro ao ler balanceOf():', error.message)
        console.log('  ⚠️  Contrato pode não implementar balanceOf() ou wallet inválida')
      }
      console.log('')
    } else {
      console.log('5️⃣  balanceOf: ⏭️  Wallet não fornecida (pule esta verificação)')
      console.log('')
    }

    console.log('✅ Verificação concluída!')
    process.exit(0)
  } catch (error) {
    console.error('❌ Erro durante verificação:', error.message)
    if (error.cause) {
      console.error('   Cause:', error.cause)
    }
    process.exit(1)
  }
}

main()
