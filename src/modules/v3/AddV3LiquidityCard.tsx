/**
 * Add V3 Liquidity — Modal no formato de referência
 * Seleção de tokens · Select range · Visualize range · Statistics
 */

import { useState, useEffect, useMemo } from 'react'
import { usePublicClient, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi'
import { useArcWriteContract } from '@/hooks/useArcWriteContract'
import { useArcWallet } from '@/hooks/useArcWallet'
import { parseUnits, formatUnits } from 'viem'
import { Plus, Loader2, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { getV3Addresses, getV3ConfigError } from './config'
import { ensureAllowance } from '@/lib/allowance'
import { formatNumber } from '@/lib/format'
import { useChainId } from 'wagmi'
import { ARCDEX } from '@/config/arcDex'
import { ARC_TESTNET_TOKENS } from '@/config/tokens.arc-testnet'
import { TokenSelectButton } from '@/components/TokenSelect'
import type { TokenSelectItem } from '@/components/TokenSelect'
import { RangeChart, priceAtTick } from './components/RangeChart'
import { getSqrtRatioAtTick, getAmount1FromAmount0, getAmount0FromAmount1 } from './lib/liquidityMath'
import { clearV3PositionsCache } from './hooks/useV3Positions'

import NonfungiblePositionManagerAbi from '@/abis/v3/NonfungiblePositionManager.json'
import UniswapV3PoolAbi from '@/abis/v3/UniswapV3Pool.json'
import UniswapV3FactoryAbi from '@/abis/v3/UniswapV3Factory.json'

const FEE_500 = 500
const TICK_SPACING_500 = 10
const MIN_TICK = -887272
const MAX_TICK = 887272

const V3_TOKENS: TokenSelectItem[] = ARC_TESTNET_TOKENS.map((t) => ({
  address: t.address,
  symbol: t.symbol,
  name: t.name,
  decimals: t.decimals,
}))

const ERC20_ABI = [
  { name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'approve', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] },
] as const

function fullRangeTicks(): { tickLower: number; tickUpper: number } {
  const sp = TICK_SPACING_500
  const tickLower = Math.ceil(MIN_TICK / sp) * sp
  const tickUpper = Math.floor(MAX_TICK / sp) * sp
  return { tickLower, tickUpper }
}

function narrowRangeTicks(): { tickLower: number; tickUpper: number } {
  return { tickLower: -100, tickUpper: 100 }
}

/** tick → price aproximado (1.0001^tick) */
function tickToPrice(tick: number): number {
  return priceAtTick(tick)
}

interface AddV3LiquidityCardProps {
  onMintSuccess?: () => void
}

export function AddV3LiquidityCard({ onMintSuccess }: AddV3LiquidityCardProps = {}) {
  const chainId = useChainId()
  const { address, isConnected } = useArcWallet()
  const publicClient = usePublicClient()
  const { writeContractAsync: _arcWrite, isPending } = useArcWriteContract()
  const [writeHash, setWriteHash] = useState<`0x${string}` | undefined>()
  const writeContractAsync = async (params: any) => { const h = await _arcWrite(params); setWriteHash(h); return h }
  const { isLoading: isConfirming, isSuccess, isError } = useWaitForTransactionReceipt({ hash: writeHash, query: { enabled: !!writeHash } })
  const { switchChain } = useSwitchChain()

  const addrs = getV3Addresses(chainId ?? 0)
  const configError = getV3ConfigError(chainId ?? 0)
  const isWrongChain = chainId != null && chainId !== ARCDEX.chainId

  const [open, setOpen] = useState(false)
  const [amount0, setAmount0] = useState('')
  const [amount1, setAmount1] = useState('')
  const [rangePreset, setRangePreset] = useState<'full' | 'narrow'>('narrow')
  const [balance0, setBalance0] = useState<bigint>(0n)
  const [balance1, setBalance1] = useState<bigint>(0n)
  const [currentTick, setCurrentTick] = useState(0)
  const [currentPrice, setCurrentPrice] = useState<string>('')
  const [focusedInput, setFocusedInput] = useState<'0' | '1' | null>(null)

  const positionManager = addrs?.v3PositionManager
  const factoryAddress = addrs?.v3Factory

  const [tokenA, setTokenA] = useState<TokenSelectItem | null>(() => V3_TOKENS.find((t) => t.symbol === 'USDC') ?? V3_TOKENS[0])
  const [tokenB, setTokenB] = useState<TokenSelectItem | null>(() => V3_TOKENS.find((t) => t.symbol === 'EURC') ?? V3_TOKENS[1])
  const [poolAddress, setPoolAddress] = useState<`0x${string}` | null>(null)
  const [poolLoading, setPoolLoading] = useState(false)
  const [poolError, setPoolError] = useState<string | null>(null)

  const sameToken = tokenA && tokenB && tokenA.address.toLowerCase() === tokenB.address.toLowerCase()
  const token0Addr =
    tokenA && tokenB && !sameToken
      ? (tokenA.address.toLowerCase() < tokenB.address.toLowerCase() ? tokenA.address : tokenB.address) as `0x${string}`
      : undefined
  const token1Addr =
    tokenA && tokenB && !sameToken
      ? (tokenA.address.toLowerCase() < tokenB.address.toLowerCase() ? tokenB.address : tokenA.address) as `0x${string}`
      : undefined

  const token0 = tokenA && tokenB && token0Addr ? (token0Addr.toLowerCase() === tokenA.address.toLowerCase() ? tokenA : tokenB) : null
  const token1 = tokenA && tokenB && token1Addr ? (token1Addr.toLowerCase() === tokenA.address.toLowerCase() ? tokenA : tokenB) : null
  const decimals0 = token0?.decimals ?? 6
  const decimals1 = token1?.decimals ?? 6
  const symbol0 = token0?.symbol ?? '—'
  const symbol1 = token1?.symbol ?? '—'

  const { tickLower, tickUpper } = rangePreset === 'full' ? fullRangeTicks() : narrowRangeTicks()
  const inRange = currentTick >= tickLower && currentTick <= tickUpper

  // Resolve pool when token pair changes
  useEffect(() => {
    if (!publicClient || !factoryAddress || !token0Addr || !token1Addr) {
      setPoolAddress(null)
      setPoolError(null)
      return
    }
    setPoolLoading(true)
    setPoolError(null)
    publicClient
      .readContract({
        address: factoryAddress,
        abi: UniswapV3FactoryAbi as never[],
        functionName: 'getPool',
        args: [token0Addr, token1Addr, FEE_500],
      })
      .then((addr) => {
        const a = addr as string
        if (a && a !== '0x0000000000000000000000000000000000000000') {
          setPoolAddress(a as `0x${string}`)
          setPoolError(null)
        } else {
          setPoolAddress(null)
          const s0 = V3_TOKENS.find((t) => t.address.toLowerCase() === token0Addr?.toLowerCase())?.symbol ?? '?'
          const s1 = V3_TOKENS.find((t) => t.address.toLowerCase() === token1Addr?.toLowerCase())?.symbol ?? '?'
          setPoolError(`Pool V3 para ${s0}/${s1} ainda não existe na Arc Testnet. Para este par, use V2 Pools.`)
        }
      })
      .catch(() => {
        setPoolAddress(null)
        setPoolError('Erro ao verificar o pool.')
      })
      .finally(() => setPoolLoading(false))
  }, [publicClient, factoryAddress, token0Addr, token1Addr])

  // Reset amounts when token pair changes
  useEffect(() => {
    setAmount0('')
    setAmount1('')
  }, [token0Addr, token1Addr])

  useEffect(() => {
    if (!address || !publicClient || !token0Addr || !token1Addr) return
    Promise.all([
      publicClient.readContract({ address: token0Addr as `0x${string}`, abi: ERC20_ABI, functionName: 'balanceOf', args: [address] }) as Promise<bigint>,
      publicClient.readContract({ address: token1Addr as `0x${string}`, abi: ERC20_ABI, functionName: 'balanceOf', args: [address] }) as Promise<bigint>,
    ]).then(([b0, b1]) => {
      setBalance0(b0)
      setBalance1(b1)
    }).catch(() => {})
  }, [address, publicClient, token0Addr, token1Addr, open])

  useEffect(() => {
    if (!publicClient || !poolAddress) return
    publicClient.readContract({
      address: poolAddress,
      abi: UniswapV3PoolAbi as never[],
      functionName: 'slot0',
    }).then((slot) => {
      const [, tick] = slot as [bigint, number]
      setCurrentTick(tick)
      const p = tickToPrice(tick)
      setCurrentPrice(p.toFixed(4))
    }).catch(() => {})
  }, [publicClient, poolAddress, open])

  const amount0Raw = useMemo(() => {
    try {
      const v = (amount0 ?? '').trim()
      if (!v) return null
      const n = parseFloat(v)
      if (isNaN(n) || n < 0) return null
      return parseUnits(v, decimals0)
    } catch { return null }
  }, [amount0, decimals0])
  const amount1Raw = useMemo(() => {
    try {
      const v = (amount1 ?? '').trim()
      if (!v) return null
      const n = parseFloat(v)
      if (isNaN(n) || n < 0) return null
      return parseUnits(v, decimals1)
    } catch { return null }
  }, [amount1, decimals1])

  const sqrtCurrent = getSqrtRatioAtTick(currentTick)
  const sqrtLower = getSqrtRatioAtTick(Math.min(tickLower, tickUpper))
  const sqrtUpper = getSqrtRatioAtTick(Math.max(tickLower, tickUpper))

  const priceNum = parseFloat(currentPrice) || 1
  const tickLo = Math.min(tickLower, tickUpper)
  const tickHi = Math.max(tickLower, tickUpper)
  const priceBelowRange = currentTick < tickLo
  const priceAboveRange = currentTick > tickHi

  const computedAmount1From0 = useMemo(() => {
    if (!amount0Raw || amount0Raw <= 0n) return null
    if (priceBelowRange) return '0'
    if (priceAboveRange) return null
    if (inRange) {
      try {
        const a1 = getAmount1FromAmount0(amount0Raw, sqrtCurrent, sqrtLower, sqrtUpper)
        return formatUnits(a1, decimals1)
      } catch { return null }
    }
    return (parseFloat(amount0) || 0) * priceNum
  }, [amount0Raw, amount0, sqrtCurrent, sqrtLower, sqrtUpper, decimals1, inRange, priceBelowRange, priceAboveRange, priceNum])

  const computedAmount0From1 = useMemo(() => {
    if (!amount1Raw || amount1Raw <= 0n) return null
    if (priceAboveRange) return '0'
    if (priceBelowRange) return null
    if (inRange) {
      try {
        const a0 = getAmount0FromAmount1(amount1Raw, sqrtCurrent, sqrtLower, sqrtUpper)
        return formatUnits(a0, decimals0)
      } catch { return null }
    }
    return priceNum > 0 ? (parseFloat(amount1) || 0) / priceNum : null
  }, [amount1Raw, amount1, sqrtCurrent, sqrtLower, sqrtUpper, decimals0, inRange, priceBelowRange, priceAboveRange, priceNum])

  function formatAmountDisplay(val: number | string, maxDecimals = 6): string {
    const num = typeof val === 'number' ? val : parseFloat(String(val))
    if (isNaN(num) || num === 0) return '0'
    if (Math.abs(num) >= 1e9) return num.toLocaleString('en-US', { maximumFractionDigits: 0 })
    if (Math.abs(num) < 1e-12) return '0'
    const fixed = num.toFixed(maxDecimals)
    const trimmed = fixed.replace(/\.?0+$/, '')
    return trimmed
  }

  useEffect(() => {
    if (focusedInput !== '0') return
    if (computedAmount1From0 != null && amount0) {
      const num = typeof computedAmount1From0 === 'number' ? computedAmount1From0 : parseFloat(String(computedAmount1From0))
      const formatted = formatAmountDisplay(num)
      setAmount1((prev) => (prev !== formatted ? formatted : prev))
    } else if (!amount0) {
      setAmount1('')
    }
  }, [amount0, computedAmount1From0, focusedInput])

  useEffect(() => {
    if (focusedInput !== '1') return
    if (computedAmount0From1 != null && amount1) {
      const num = typeof computedAmount0From1 === 'number' ? computedAmount0From1 : parseFloat(String(computedAmount0From1))
      const formatted = formatAmountDisplay(num)
      setAmount0((prev) => (prev !== formatted ? formatted : prev))
    } else if (!amount1) {
      setAmount0('')
    }
  }, [amount1, computedAmount0From1, focusedInput])

  const handleMint = async () => {
    if (!address || !publicClient || !positionManager || !token0Addr || !token1Addr || !addrs) {
      toast.error('Conecte a carteira e verifique a configuração V3.')
      return
    }
    if (isWrongChain && switchChain) {
      try {
        await switchChain({ chainId: ARCDEX.chainId })
        return
      } catch {
        toast.error('Troque para Arc Testnet manualmente.')
        return
      }
    }
    if (!amount0Raw || !amount1Raw || amount0Raw <= 0n || amount1Raw <= 0n) {
      toast.error('Informe valores válidos para ambos os tokens.')
      return
    }
    if (balance0 < amount0Raw || balance1 < amount1Raw) {
      toast.error('Saldo insuficiente.')
      return
    }

    const writeOpts = (opts: { address: `0x${string}`; abi: readonly unknown[]; functionName: string; args: unknown[] }) =>
      writeContractAsync({ address: opts.address, abi: opts.abi, functionName: opts.functionName, args: opts.args })

    try {
      await ensureAllowance(publicClient, writeOpts, token0Addr as `0x${string}`, address, positionManager, amount0Raw)
      await ensureAllowance(publicClient, writeOpts, token1Addr as `0x${string}`, address, positionManager, amount1Raw)
    } catch (e) {
      toast.error((e as { message?: string })?.message ?? 'Aprovação falhou')
      return
    }

    const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200)
    const params = {
      token0: token0Addr,
      token1: token1Addr,
      fee: FEE_500,
      tickLower,
      tickUpper,
      amount0Desired: amount0Raw,
      amount1Desired: amount1Raw,
      amount0Min: 0n,
      amount1Min: 0n,
      recipient: address,
      deadline,
    }

    const toastId = 'v3-mint'
    try {
      toast.loading('Confirme na sua carteira...', { id: toastId })
      await writeContractAsync({
        address: positionManager,
        abi: NonfungiblePositionManagerAbi as never,
        functionName: 'mint',
        args: [params],
      })
      toast.loading('Confirmando na blockchain...', { id: toastId })
    } catch (e: unknown) {
      toast.dismiss(toastId)
      const msg = (e as { message?: string })?.message ?? 'Mint failed'
      const isRejected = /reject|denied|cancelado|cancelled/i.test(msg)
      toast.error(isRejected ? 'Transação cancelada na carteira.' : msg)
    }
  }

  useEffect(() => {
    if (isSuccess && writeHash) {
      toast.dismiss('v3-mint')
      toast.success('Posição criada!')
      setAmount0('')
      setAmount1('')
      setOpen(false)
      clearV3PositionsCache()
      onMintSuccess?.()
    }
  }, [isSuccess, writeHash, onMintSuccess])

  useEffect(() => {
    if (isError && writeHash) {
      toast.dismiss('v3-mint')
      toast.error('Transação falhou na blockchain. Verifique os dados e tente novamente.')
    }
  }, [isError, writeHash])

  if (configError || !addrs) return null

  const isLoading = isPending || isConfirming
  const hasValidPool = !!poolAddress && !poolError
  const canMint =
    isConnected &&
    !!address &&
    hasValidPool &&
    !!amount0Raw &&
    !!amount1Raw &&
    amount0Raw > 0n &&
    amount1Raw > 0n &&
    balance0 >= amount0Raw &&
    balance1 >= amount1Raw &&
    !isWrongChain

  const minPrice = tickToPrice(Math.min(tickLower, tickUpper))
  const maxPrice = tickToPrice(Math.max(tickLower, tickUpper))

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all"
        style={{ background: 'linear-gradient(135deg,#4ea3ff,#b14cff)', boxShadow: '0 0 18px rgba(78,163,255,0.35)' }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 24px rgba(78,163,255,0.5)' }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 0 18px rgba(78,163,255,0.35)' }}
      >
        <Plus className="h-4 w-4" />
        Adicionar Liquidez V3
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 overflow-y-auto">
          <div className="w-full max-w-4xl rounded-2xl border border-slate-700/50 bg-slate-900 shadow-xl my-8">
            <div className="flex items-center justify-between p-6 border-b border-slate-700/50">
              <h2 className="text-xl font-semibold text-white">Adicionar Liquidez V3</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/50 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6">
              <div className="flex flex-wrap items-center gap-3 mb-6">
                <TokenSelectButton
                  tokens={V3_TOKENS}
                  selected={tokenA}
                  onSelect={setTokenA}
                  excludedAddress={tokenB?.address}
                  showBalance
                  placeholder="Token A"
                />
                <span className="text-slate-500">/</span>
                <TokenSelectButton
                  tokens={V3_TOKENS}
                  selected={tokenB}
                  onSelect={setTokenB}
                  excludedAddress={tokenA?.address}
                  showBalance
                  placeholder="Token B"
                />
                <span className="text-slate-500 text-sm">— 0.05% fee</span>
                {poolLoading && <span className="text-slate-400 text-sm">Verificando pool...</span>}
                {poolError && <span className="text-amber-400 text-sm">{poolError}</span>}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Coluna esquerda */}
                <div className="space-y-6">
                  {/* Select range */}
                  <div className="rounded-2xl border border-slate-700/50 bg-slate-800/30 p-5">
                    <h3 className="text-sm font-semibold text-white mb-3">Selecionar intervalo</h3>
                    <p className="text-xs text-slate-400 mb-4">
                      Preço atual: {currentPrice || '—'} {symbol1} por {symbol0}
                    </p>
                    {!inRange && (
                      <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs mb-4">
                        <span>⚠</span>
                        <span>Você está prestes a depositar fora do intervalo de preço atual. {symbol1} pode não ser necessário neste depósito.</span>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setRangePreset('full')}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors ${rangePreset === 'full' ? 'bg-cyan-500/30 text-cyan-300 border border-cyan-500/50' : 'bg-slate-800/60 text-slate-400 border border-slate-600 hover:bg-slate-700/60'}`}
                      >
                        Intervalo completo
                      </button>
                      <button
                        type="button"
                        onClick={() => setRangePreset('narrow')}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors ${rangePreset === 'narrow' ? 'bg-cyan-500/30 text-cyan-300 border border-cyan-500/50' : 'bg-slate-800/60 text-slate-400 border border-slate-600 hover:bg-slate-700/60'}`}
                      >
                        Estreito (-100 a 100)
                      </button>
                    </div>
                    <div className="mt-3 flex gap-4 text-xs text-slate-500">
                      <span>Mín: {minPrice.toFixed(4)} · Tick: {Math.min(tickLower, tickUpper)}</span>
                      <span>Máx: {maxPrice.toFixed(4)} · Tick: {Math.max(tickLower, tickUpper)}</span>
                    </div>
                  </div>

                  {/* Amount */}
                  <div className="rounded-2xl border border-slate-700/50 bg-slate-800/30 p-5">
                    <h3 className="text-sm font-semibold text-white mb-4">Valor</h3>
                    <div className="space-y-4">
                      <div className="rounded-xl bg-slate-900/60 border border-slate-700/50 p-4">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-xs text-slate-400">{symbol0}</span>
                          <span className="text-xs text-slate-500">Saldo {formatNumber(formatUnits(balance0, decimals0), 4)}</span>
                        </div>
                        <input
                          type="text"
                          inputMode="decimal"
                          placeholder="0"
                          value={amount0}
                          onChange={(e) => setAmount0(e.target.value.replace(/,/g, '.'))}
                          onFocus={() => setFocusedInput('0')}
                          onBlur={() => setFocusedInput(null)}
                          className="w-full bg-transparent text-xl font-semibold text-white focus:outline-none"
                        />
                      </div>
                      <div className="rounded-xl bg-slate-900/60 border border-slate-700/50 p-4">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-xs text-slate-400">{symbol1}</span>
                          <span className="text-xs text-slate-500">Saldo {formatNumber(formatUnits(balance1, decimals1), 4)}</span>
                        </div>
                        <input
                          type="text"
                          inputMode="decimal"
                          placeholder="0"
                          value={amount1}
                          onChange={(e) => setAmount1(e.target.value.replace(/,/g, '.'))}
                          onFocus={() => setFocusedInput('1')}
                          onBlur={() => setFocusedInput(null)}
                          className="w-full bg-transparent text-xl font-semibold text-white focus:outline-none"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleMint}
                        disabled={!canMint || isLoading}
                        className="w-full py-3.5 rounded-xl font-semibold bg-amber-500 hover:bg-amber-600 text-white disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
                      >
                        {isLoading ? (
                          <>
                            <Loader2 className="h-5 w-5 animate-spin" />
                            Criando posição...
                          </>
                        ) : !isConnected ? (
                          'Conecte a carteira'
                        ) : (
                          'Criar Posição'
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Coluna direita */}
                <div className="space-y-6">
                  {/* Visualize range */}
                  <div className="rounded-2xl border border-slate-700/50 bg-slate-800/30 p-5">
                    <RangeChart
                      tickLower={tickLower}
                      tickUpper={tickUpper}
                      currentTick={currentTick}
                      symbol0={symbol0}
                      symbol1={symbol1}
                      inRange={inRange}
                      label="Visualizar intervalo"
                    />
                  </div>

                  {/* Statistics */}
                  <div className="rounded-2xl border border-slate-700/50 bg-slate-800/30 p-5">
                    <h3 className="text-sm font-semibold text-white mb-4">Estatísticas</h3>
                    <div className="space-y-3 text-sm">
                      <div className="flex justify-between">
                        <span className="text-slate-400">TVL</span>
                        <span className="text-slate-200">—</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Volume 24h</span>
                        <span className="text-slate-200">—</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Taxa</span>
                        <span className="text-slate-200">0.05%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Par</span>
                        <span className="text-slate-200">{symbol0}/{symbol1}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
