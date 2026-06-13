/**
 * useV3Positions — lista posições NFT do usuário no NonfungiblePositionManager
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePublicClient, useChainId } from 'wagmi'
import { useArcWallet } from '@/hooks/useArcWallet'
import { getV3Addresses } from '../config'
import { getSqrtRatioAtTick, getAmountsForLiquidity } from '../lib/liquidityMath'
import { ARC_TESTNET_TOKENS } from '@/constants/tokens'
import UniswapV3FactoryAbi from '@/abis/v3/UniswapV3Factory.json'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

const CACHE_KEY = 'fajucar-v3-positions-v2'
const CACHE_TTL_MS = 30_000 // 30s

const NPM_ABI = [
  {
    inputs: [{ name: 'owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'index', type: 'uint256' },
    ],
    name: 'tokenOfOwnerByIndex',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'ownerOf',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'positions',
    outputs: [
      { name: 'nonce', type: 'uint96' },
      { name: 'operator', type: 'address' },
      { name: 'token0', type: 'address' },
      { name: 'token1', type: 'address' },
      { name: 'fee', type: 'uint24' },
      { name: 'tickLower', type: 'int24' },
      { name: 'tickUpper', type: 'int24' },
      { name: 'liquidity', type: 'uint128' },
      { name: 'feeGrowthInside0LastX128', type: 'uint256' },
      { name: 'feeGrowthInside1LastX128', type: 'uint256' },
      { name: 'tokensOwed0', type: 'uint128' },
      { name: 'tokensOwed1', type: 'uint128' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const

const POOL_SLOT0_ABI = [
  {
    inputs: [],
    name: 'slot0',
    outputs: [
      { name: 'sqrtPriceX96', type: 'uint160' },
      { name: 'tick', type: 'int24' },
      { name: 'observationIndex', type: 'uint16' },
      { name: 'observationCardinality', type: 'uint16' },
      { name: 'observationCardinalityNext', type: 'uint16' },
      { name: 'feeProtocol', type: 'uint8' },
      { name: 'unlocked', type: 'bool' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const

export interface V3PositionInfo {
  tokenId: bigint
  token0: `0x${string}`
  token1: `0x${string}`
  fee: number
  tickLower: number
  tickUpper: number
  liquidity: bigint
  tokensOwed0: bigint
  tokensOwed1: bigint
  amount0: bigint
  amount1: bigint
  symbol0: string
  symbol1: string
  decimals0: number
  decimals1: number
  pairLabel: string
  feeLabel: string
  inRange: boolean
  currentTick: number
}

/** Limpa o cache de posições (ex.: após mint) */
export function clearV3PositionsCache(): void {
  try {
    localStorage.removeItem(CACHE_KEY)
  } catch {
    // ignore
  }
}

function readCache(chainId: number, user: string): bigint[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const { chainId: c, address: a, tokenIds, ts } = JSON.parse(raw) as {
      chainId: number
      address: string
      tokenIds: string[]
      ts: number
    }
    if (c !== chainId || a.toLowerCase() !== user.toLowerCase()) return null
    if (Date.now() - ts > CACHE_TTL_MS) return null
    return tokenIds.map((id) => BigInt(id))
  } catch {
    return null
  }
}

function writeCache(chainId: number, user: string, tokenIds: bigint[]) {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        chainId,
        address: user.toLowerCase(),
        tokenIds: tokenIds.map(String),
        ts: Date.now(),
      })
    )
  } catch {
    // ignore
  }
}

function getTokenInfo(addr: string): { symbol: string; decimals: number } {
  const a = addr.toLowerCase()
  const found = ARC_TESTNET_TOKENS.find((t) => t.address.toLowerCase() === a)
  return found
    ? { symbol: found.symbol, decimals: found.decimals }
    : { symbol: addr.slice(0, 6) + '…', decimals: 18 }
}

export function useV3Positions(enabled: boolean) {
  const chainId = useChainId()
  const { address } = useArcWallet()
  const publicClient = usePublicClient()
  const [positions, setPositions] = useState<V3PositionInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cancelledRef = useRef(false)
  const addrs = useMemo(() => getV3Addresses(chainId ?? 0), [chainId])

  const fetchPositions = useCallback(async () => {
    if (!address || !publicClient || !addrs || !enabled) {
      setPositions([])
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    cancelledRef.current = false
    try {
      let tokenIds: bigint[] = readCache(chainId ?? 0, address) ?? []
      if (tokenIds.length === 0) {
        const balance = (await publicClient.readContract({
          address: addrs.v3PositionManager,
          abi: NPM_ABI,
          functionName: 'balanceOf',
          args: [address as `0x${string}`],
        })) as bigint
        const ids: bigint[] = []
        for (let i = 0; i < Number(balance) && !cancelledRef.current; i++) {
          const id = (await publicClient.readContract({
            address: addrs.v3PositionManager,
            abi: NPM_ABI,
            functionName: 'tokenOfOwnerByIndex',
            args: [address as `0x${string}`, BigInt(i)],
          })) as bigint
          ids.push(id)
        }
        tokenIds = ids
        writeCache(chainId ?? 0, address, tokenIds)
      }
      const owned = tokenIds
      // Cache pool slot0 lookups per (token0,token1,fee) — different positions may share a pool
      const poolSlot0Cache = new Map<string, { currentTick: number; sqrtPriceX96: bigint }>()
      const getPoolSlot0 = async (token0: `0x${string}`, token1: `0x${string}`, fee: number) => {
        const key = `${token0.toLowerCase()}-${token1.toLowerCase()}-${fee}`
        const cached = poolSlot0Cache.get(key)
        if (cached) return cached
        let currentTick = 0
        let sqrtPriceX96 = 0n
        try {
          const poolAddr = (await publicClient.readContract({
            address: addrs.v3Factory,
            abi: UniswapV3FactoryAbi as never[],
            functionName: 'getPool',
            args: [token0, token1, fee],
          })) as `0x${string}`
          if (poolAddr && poolAddr.toLowerCase() !== ZERO_ADDRESS) {
            const slot0 = (await publicClient.readContract({
              address: poolAddr,
              abi: POOL_SLOT0_ABI,
              functionName: 'slot0',
            })) as readonly [bigint, number, number, number, number, number, boolean]
            currentTick = slot0[1]
            sqrtPriceX96 = slot0[0]
          }
        } catch {
          // pool not found / not initialized
        }
        const result = { currentTick, sqrtPriceX96 }
        poolSlot0Cache.set(key, result)
        return result
      }
      const result: V3PositionInfo[] = []
      for (const id of owned) {
        if (cancelledRef.current) return
        try {
          const pos = await publicClient.readContract({
            address: addrs.v3PositionManager,
            abi: NPM_ABI,
            functionName: 'positions',
            args: [id],
          })
          const [
            , , token0, token1, fee, tickLower, tickUpper, liquidity,
            , , tokensOwed0, tokensOwed1
          ] = pos as readonly [unknown, unknown, `0x${string}`, `0x${string}`, number, number, number, bigint, unknown, unknown, bigint, bigint]
          const info0 = getTokenInfo(token0)
          const info1 = getTokenInfo(token1)
          const sym0 = info0.symbol
          const sym1 = info1.symbol
          const pairLabel = `${sym0}/${sym1}`
          const feePct = fee / 1_000_000
          const feeLabel = feePct >= 1 ? `${feePct}%` : `${fee / 10_000}%`
          const { currentTick, sqrtPriceX96 } = await getPoolSlot0(token0, token1, fee)
          const inRange = currentTick >= tickLower && currentTick <= tickUpper
          const sqrtA = getSqrtRatioAtTick(tickLower)
          const sqrtB = getSqrtRatioAtTick(tickUpper)
          const { amount0, amount1 } = getAmountsForLiquidity(sqrtPriceX96, sqrtA, sqrtB, liquidity)
          result.push({
            tokenId: id,
            token0,
            token1,
            fee,
            tickLower,
            tickUpper,
            liquidity,
            tokensOwed0,
            tokensOwed1,
            amount0,
            amount1,
            symbol0: sym0,
            symbol1: sym1,
            decimals0: info0.decimals,
            decimals1: info1.decimals,
            pairLabel,
            feeLabel,
            inRange,
            currentTick,
          })
        } catch {
          // skip invalid positions
        }
      }
      if (!cancelledRef.current) setPositions(result)
    } catch (e) {
      if (!cancelledRef.current) {
        setError(e instanceof Error ? e.message : 'Failed to load V3 positions')
        setPositions([])
      }
    } finally {
      if (!cancelledRef.current) setLoading(false)
    }
  }, [address, publicClient, addrs, enabled, chainId])

  useEffect(() => {
    fetchPositions()
    return () => {
      cancelledRef.current = true
    }
  }, [fetchPositions])

  return { positions, loading, error, refetch: fetchPositions }
}

export function formatLiquidity(liquidity: bigint): string {
  if (liquidity === 0n) return '0'
  const s = liquidity.toString()
  if (s.length <= 6) return s
  const exp = s.length - 4
  return `${s.slice(0, 4)}e${exp}`
}
