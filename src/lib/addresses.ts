import { Address, getAddress } from 'viem'

/**
 * NFT Contract Address (VITE_GIFT_CARD_NFT_ADDRESS)
 * This is the ERC721 NFT contract address
 */
export const NFT_ADDRESS: Address | undefined = (() => {
  const env = import.meta.env.VITE_GIFT_CARD_NFT_ADDRESS
  if (!env || typeof env !== 'string' || env.trim() === '') {
    return undefined
  }
  try {
    return getAddress(env.trim().toLowerCase())
  } catch {
    return undefined
  }
})()

/**
 * Minter Contract Address (VITE_GIFT_CARD_MINTER_ADDRESS)
 * This is the contract that mints NFTs (calls mint on NFT contract)
 */
export const MINTER_ADDRESS: Address | undefined = (() => {
  const env = import.meta.env.VITE_GIFT_CARD_MINTER_ADDRESS
  if (!env || typeof env !== 'string' || env.trim() === '') {
    return undefined
  }
  try {
    return getAddress(env.trim().toLowerCase())
  } catch {
    return undefined
  }
})()

/**
 * NFT Deploy Block (VITE_NFT_DEPLOY_BLOCK)
 * Required: Block number when NFT contract was deployed.
 * Used to limit getLogs queries and avoid RPC timeouts.
 * In dev mode, will show warning if not set.
 */
export const DEPLOY_BLOCK: bigint | undefined = (() => {
  const env = import.meta.env.VITE_NFT_DEPLOY_BLOCK
  if (!env || typeof env !== 'string' || env.trim() === '') {
    if (import.meta.env.DEV) {
      console.warn('⚠️ VITE_NFT_DEPLOY_BLOCK não configurado. Configure no .env para evitar RPC limits.')
    }
    return undefined
  }
  try {
    const block = BigInt(env.trim())
    if (block < 0n) {
      if (import.meta.env.DEV) {
        console.error('❌ VITE_NFT_DEPLOY_BLOCK deve ser um número positivo')
      }
      return undefined
    }
    return block
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('❌ Erro ao parsear VITE_NFT_DEPLOY_BLOCK:', error)
    }
    return undefined
  }
})()

/**
 * Validate that required addresses are configured
 */
export function validateConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  
  if (!NFT_ADDRESS) {
    errors.push('VITE_GIFT_CARD_NFT_ADDRESS não configurado')
  }
  
  if (!DEPLOY_BLOCK) {
    errors.push('VITE_NFT_DEPLOY_BLOCK não configurado (obrigatório para evitar RPC limits)')
  }
  
  return {
    valid: errors.length === 0,
    errors,
  }
}
