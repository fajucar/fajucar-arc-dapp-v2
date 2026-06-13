/**
 * balances.ts — leitura de saldo on-chain na Arc Testnet.
 *
 * USDC é o token nativo de gas da Arc Testnet (precompile 0x3600...).
 * Arc usa USDC com 6 decimals (igual ao ERC-20 padrão), NÃO 18.
 * getBalance() retorna raw units com 6 decimals → formatUnits(raw, 6).
 * Todos os outros tokens ERC-20 usam balanceOf com seus próprios decimals.
 */

import { createPublicClient, http, formatUnits } from 'viem'
import { arcTestnet } from '@/config/chains'

const ERC20_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

// Endereço do precompile USDC nativo na Arc Testnet
const USDC_NATIVE_ADDRESS = '0x3600000000000000000000000000000000000000'

// Client standalone para leitura de saldos — não precisa de carteira conectada
export const arcReadClient = createPublicClient({
  chain: arcTestnet,
  transport: http(),
})

export interface BalanceToken {
  address: string
  decimals: number
  /** Se true, força getBalance(). Detectado automaticamente pelo endereço USDC. */
  isNative?: boolean
}

/**
 * Lê o saldo de um token para uma conta na Arc Testnet.
 *
 * - USDC (precompile nativo): usa getBalance() com formatUnits(..., 6)
 * - ERC20: usa balanceOf() com token.decimals
 *
 * Retorna string human-readable. Retorna '0' em caso de erro.
 */
export async function getTokenBalance(
  account: string,
  token: BalanceToken,
): Promise<string> {
  try {
    const addr = account as `0x${string}`
    const isNative =
      token.isNative ||
      token.address.toLowerCase() === USDC_NATIVE_ADDRESS.toLowerCase()

    if (isNative) {
      // Arc Testnet: USDC nativo tem 6 decimals (não 18 como ETH padrão)
      const raw = await arcReadClient.getBalance({ address: addr })
      return formatUnits(raw, 6)
    }

    const raw = (await arcReadClient.readContract({
      address: token.address as `0x${string}`,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [addr],
    })) as bigint

    return formatUnits(raw, token.decimals)
  } catch {
    return '0'
  }
}
