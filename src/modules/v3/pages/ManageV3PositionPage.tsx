/**
 * ManageV3PositionPage — Icarus-style layout
 * Collect fees, Increase/Decrease liquidity, range selector
 *
 * Layout: 2-column fixed-height on lg+, single-column scroll on mobile.
 * Header height assumed ~3.5rem (56px) — adjust calc() if your header differs.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, Link, useLocation } from 'react-router-dom'
import { useAccount, useChainId, usePublicClient, useWaitForTransactionReceipt } from 'wagmi'
import { useArcWriteContract } from '@/hooks/useArcWriteContract'
import { parseUnits, formatUnits, maxUint256 } from 'viem'
import { toast } from 'react-hot-toast'
import { ArrowLeft, Loader2, Coins, Plus, Minus, AlertCircle, ExternalLink } from 'lucide-react'
import { getV3Addresses, getV3ConfigError } from '../config'
import { getSqrtRatioAtTick, getAmountsForLiquidity } from '../lib/liquidityMath'
import { RangeChart, priceAtTick } from '../components/RangeChart'
import { ensureAllowance } from '@/lib/allowance'
import { formatNumber } from '@/lib/format'
import { ARCDEX } from '@/config/arcDex'

import NonfungiblePositionManagerAbi from '@/abis/v3/NonfungiblePositionManager.json'
import UniswapV3PoolAbi from '@/abis/v3/UniswapV3Pool.json'

const ERC20_ABI = [
  { name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'allowance', type: 'function', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'approve', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] },
] as const

const TICK_SPACING: Record<number, number> = { 500: 10, 3000: 60, 10000: 200 }
const MIN_TICK = -887272
const MAX_TICK = 887272
const Q192 = 2n ** 192n

/** sqrtPriceX96 → price (token1 per token0, e.g. EURC per USDC) */
function priceFromSqrtX96(sqrtPriceX96: bigint): number {
  const p = (sqrtPriceX96 * sqrtPriceX96 * 10n ** 18n) / Q192
  return Number(p) / 1e18
}

type TxState = 'idle' | 'loading' | 'pending' | 'success' | 'error'

function fullRangeTicks(fee: number): { tickLower: number; tickUpper: number } {
  const sp = TICK_SPACING[fee] ?? 60
  const tickLower = Math.ceil(MIN_TICK / sp) * sp
  const tickUpper = Math.floor(MAX_TICK / sp) * sp
  return { tickLower, tickUpper }
}

// ── Shared compact card style ──────────────────────────────────────────────
const CARD = 'rounded-2xl border border-slate-700/50 bg-slate-800/30 p-4'

export function ManageV3PositionPage() {
  const { tokenId } = useParams<{ tokenId: string }>()
  const { hash: locationHash } = useLocation()
  const chainId = useChainId()
  const { address } = useAccount()
  const publicClient = usePublicClient()
  const { writeContractAsync: _arcWrite, isPending } = useArcWriteContract()
  const [writeHash, setWriteHash] = useState<`0x${string}` | undefined>()
  const writeContractAsync = async (params: any) => { const h = await _arcWrite(params); setWriteHash(h); return h }
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: writeHash, query: { enabled: !!writeHash } })

  const addrs = useMemo(() => getV3Addresses(chainId ?? 0), [chainId])
  const configError = getV3ConfigError(chainId ?? 0)
  const isWrongChain = chainId != null && chainId !== ARCDEX.chainId

  const [pos, setPos] = useState<{
    token0: `0x${string}`
    token1: `0x${string}`
    fee: number
    tickLower: number
    tickUpper: number
    liquidity: bigint
    tokensOwed0: bigint
    tokensOwed1: bigint
  } | null>(null)
  const [currentTick, setCurrentTick] = useState<number>(0)
  const [sqrtPriceX96, setSqrtPriceX96] = useState<bigint | null>(null)
  const [balance0, setBalance0] = useState<string>('')
  const [balance1, setBalance1] = useState<string>('')
  const [amount0, setAmount0] = useState('')
  const [amount1, setAmount1] = useState('')
  const [rangeMode, setRangeMode] = useState<'full' | 'manual'>('full')
  const [manualTickLower, setManualTickLower] = useState('')
  const [manualTickUpper, setManualTickUpper] = useState('')
  const [decreasePct, setDecreasePct] = useState<25 | 50 | 75 | 100 | null>(null)
  const [txState, setTxState] = useState<TxState>('idle')

  const tid = useMemo(() => (tokenId ? BigInt(tokenId) : 0n), [tokenId])
  const inRange = pos ? currentTick >= pos.tickLower && currentTick <= pos.tickUpper : false
  const sym0 = addrs?.tokens.USDC.address.toLowerCase() === pos?.token0?.toLowerCase() ? 'USDC' : 'EURC'
  const sym1 = addrs?.tokens.EURC.address.toLowerCase() === pos?.token1?.toLowerCase() ? 'EURC' : 'USDC'
  const decimals0 = 6
  const decimals1 = 6

  const loadPosition = useCallback(async () => {
    if (!publicClient || !addrs || tid === 0n) return
    try {
      const [rawPosition, slot0] = await Promise.all([
        publicClient.readContract({
          address: addrs.v3PositionManager,
          abi: NonfungiblePositionManagerAbi as unknown[],
          functionName: 'positions',
          args: [tid],
        }),
        publicClient.readContract({
          address: addrs.v3Pool_USDC_EURC_500,
          abi: UniswapV3PoolAbi as unknown[],
          functionName: 'slot0',
        }) as Promise<[bigint, number, number, number, number, number, boolean]>,
      ])
      const raw = rawPosition as readonly [unknown, unknown, `0x${string}`, `0x${string}`, number, number, number, bigint, unknown, unknown, bigint, bigint]
      const position = {
        token0: raw[2],
        token1: raw[3],
        fee: raw[4],
        tickLower: raw[5],
        tickUpper: raw[6],
        liquidity: raw[7],
        tokensOwed0: raw[10],
        tokensOwed1: raw[11],
      }
      setPos(position)
      setCurrentTick(slot0[1])
      setSqrtPriceX96(slot0[0])
      setManualTickLower(String(position.tickLower))
      setManualTickUpper(String(position.tickUpper))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load position')
      setPos(null)
    }
  }, [publicClient, addrs, tid])

  useEffect(() => { loadPosition() }, [loadPosition])

  useEffect(() => {
    if (locationHash === '#collect') {
      document.getElementById('collect')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [locationHash, pos])

  useEffect(() => {
    if (!address || !publicClient || !pos) return
    let cancelled = false
    Promise.all([
      publicClient.readContract({ address: pos.token0, abi: ERC20_ABI, functionName: 'balanceOf', args: [address] }) as Promise<bigint>,
      publicClient.readContract({ address: pos.token1, abi: ERC20_ABI, functionName: 'balanceOf', args: [address] }) as Promise<bigint>,
    ]).then(([b0, b1]) => {
      if (!cancelled) { setBalance0(formatUnits(b0, decimals0)); setBalance1(formatUnits(b1, decimals1)) }
    }).catch(() => { if (!cancelled) { setBalance0(''); setBalance1('') } })
    return () => { cancelled = true }
  }, [address, publicClient, pos?.token0, pos?.token1])

  useEffect(() => {
    if (isSuccess) { setTxState('success'); toast.success('Transaction confirmed'); loadPosition() }
  }, [isSuccess, loadPosition])

  const collectFees = async () => {
    if (!address || !addrs || tid === 0n) return
    setTxState('loading')
    try {
      toast.loading('Collecting fees...', { id: 'collect' })
      const h = await writeContractAsync({
        address: addrs.v3PositionManager,
        abi: NonfungiblePositionManagerAbi as unknown[],
        functionName: 'collect',
        args: [{ tokenId: tid, recipient: address, amount0Max: maxUint256, amount1Max: maxUint256 }],
      })
      setTxState('pending')
      await publicClient!.waitForTransactionReceipt({ hash: h })
      toast.dismiss('collect'); toast.success('Fees collected')
    } catch (e) {
      setTxState('error'); toast.dismiss('collect')
      toast.error(e instanceof Error ? e.message : 'Failed to collect')
    }
  }

  const increaseLiquidity = async () => {
    if (!address || !publicClient || !addrs || tid === 0n || !pos) return
    const a0 = amount0 ? parseUnits(amount0, decimals0) : 0n
    const a1 = amount1 ? parseUnits(amount1, decimals1) : 0n
    if (a0 === 0n && a1 === 0n) { toast.error('Enter amounts'); return }
    setTxState('loading')
    const writeOpts = (opts: { address: `0x${string}`; abi: readonly unknown[]; functionName: string; args: unknown[] }) =>
      writeContractAsync({ address: opts.address, abi: opts.abi, functionName: opts.functionName, args: opts.args })
    try {
      if (a0 > 0n) { toast.loading(`Approving ${sym0}...`, { id: 'ap0' }); await ensureAllowance(publicClient, writeOpts, pos.token0, address, addrs.v3PositionManager, a0); toast.dismiss('ap0') }
      if (a1 > 0n) { toast.loading(`Approving ${sym1}...`, { id: 'ap1' }); await ensureAllowance(publicClient, writeOpts, pos.token1, address, addrs.v3PositionManager, a1); toast.dismiss('ap1') }
      toast.loading('Increasing liquidity...', { id: 'inc' })
      const h = await writeContractAsync({
        address: addrs.v3PositionManager,
        abi: NonfungiblePositionManagerAbi as unknown[],
        functionName: 'increaseLiquidity',
        args: [{ tokenId: tid, amount0Desired: a0, amount1Desired: a1, amount0Min: 0n, amount1Min: 0n, deadline: BigInt(Math.floor(Date.now() / 1000) + 600) }],
      })
      setTxState('pending')
      await publicClient.waitForTransactionReceipt({ hash: h })
      toast.dismiss('inc'); toast.success('Liquidity increased')
      setAmount0(''); setAmount1('')
    } catch (e) {
      setTxState('error'); toast.dismiss()
      toast.error(e instanceof Error ? e.message : 'Failed')
    }
  }

  const decreaseLiquidity = async () => {
    if (!address || !publicClient || !addrs || tid === 0n || !pos || pos.liquidity === 0n || decreasePct == null) return
    const liq = (pos.liquidity * BigInt(decreasePct)) / 100n
    if (liq === 0n) return
    setTxState('loading')
    try {
      toast.loading('Decreasing liquidity...', { id: 'dec' })
      const h = await writeContractAsync({
        address: addrs.v3PositionManager, abi: NonfungiblePositionManagerAbi as unknown[],
        functionName: 'decreaseLiquidity',
        args: [{ tokenId: tid, liquidity: liq, amount0Min: 0n, amount1Min: 0n, deadline: BigInt(Math.floor(Date.now() / 1000) + 600) }],
      })
      await publicClient.waitForTransactionReceipt({ hash: h })
      toast.dismiss('dec'); toast.loading('Collecting tokens...', { id: 'col' })
      await writeContractAsync({
        address: addrs.v3PositionManager, abi: NonfungiblePositionManagerAbi as unknown[],
        functionName: 'collect',
        args: [{ tokenId: tid, recipient: address, amount0Max: maxUint256, amount1Max: maxUint256 }],
      })
      toast.dismiss('col'); toast.success('Liquidity decreased'); setDecreasePct(null)
    } catch (e) {
      setTxState('error'); toast.dismiss()
      toast.error(e instanceof Error ? e.message : 'Failed')
    }
  }

  const price = sqrtPriceX96 != null ? priceFromSqrtX96(sqrtPriceX96) : 1
  const computeAmount1From0 = (a0: string) => {
    const v = parseFloat(a0); if (isNaN(v) || v <= 0) return ''; return (v * price).toFixed(4)
  }
  const computeAmount0From1 = (a1: string) => {
    const v = parseFloat(a1); if (isNaN(v) || v <= 0 || price <= 0) return ''; return (v / price).toFixed(4)
  }

  const tickLower = rangeMode === 'full' && pos ? fullRangeTicks(pos.fee).tickLower : parseInt(manualTickLower, 10)
  const tickUpper = rangeMode === 'full' && pos ? fullRangeTicks(pos.fee).tickUpper : parseInt(manualTickUpper, 10)
  const rangeValid = !isNaN(tickLower) && !isNaN(tickUpper) && tickLower < tickUpper
  const sp = pos ? (TICK_SPACING[pos.fee] ?? 60) : 10
  const manualAligned = rangeMode === 'manual' ? (tickLower % sp === 0 && tickUpper % sp === 0) : true

  const busy = txState === 'loading' || txState === 'pending' || isPending || isConfirming

  // ── Error / loading states ─────────────────────────────────────────────────
  if (isWrongChain || configError) {
    return (
      <div className="py-6 px-4 max-w-3xl mx-auto">
        <Link to="/pools?tab=v3" className="inline-flex items-center gap-2 text-sm text-cyan-400 hover:text-cyan-300 mb-4">
          <ArrowLeft className="h-4 w-4" /> Back to Pools
        </Link>
        <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-200">
          <AlertCircle className="h-5 w-5 inline-block mr-2" />
          {configError ?? 'Connect to Arc Testnet'}
        </div>
      </div>
    )
  }

  if (!pos && tid > 0n) {
    return (
      <div className="py-6 px-4 max-w-3xl mx-auto">
        <Link to="/pools?tab=v3" className="inline-flex items-center gap-2 text-sm text-cyan-400 hover:text-cyan-300 mb-4">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        <div className="p-8 text-center rounded-2xl border border-slate-700/50 bg-slate-800/20">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400 mx-auto mb-3" />
          <p className="text-slate-400 text-sm">Loading position #{tokenId}...</p>
        </div>
      </div>
    )
  }

  if (!pos) {
    return (
      <div className="py-6 px-4 max-w-3xl mx-auto">
        <Link to="/pools?tab=v3" className="inline-flex items-center gap-2 text-sm text-cyan-400 hover:text-cyan-300 mb-4">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        <div className="p-8 text-center rounded-2xl border border-slate-700/50 bg-slate-800/20">
          <p className="text-slate-400 text-sm">Position not found</p>
        </div>
      </div>
    )
  }

  const { amount0: posAmount0, amount1: posAmount1 } = sqrtPriceX96 != null
    ? getAmountsForLiquidity(sqrtPriceX96, getSqrtRatioAtTick(pos.tickLower), getSqrtRatioAtTick(pos.tickUpper), pos.liquidity)
    : { amount0: 0n, amount1: 0n }

  const priceLow  = priceAtTick(Math.min(pos.tickLower, pos.tickUpper))
  const priceHigh = priceAtTick(Math.max(pos.tickLower, pos.tickUpper))
  const curPrice  = sqrtPriceX96 != null ? priceFromSqrtX96(sqrtPriceX96) : priceAtTick(currentTick)

  // ── Main layout ────────────────────────────────────────────────────────────
  // Desktop (lg+): fixed-height 2-column layout, each column scrolls independently.
  // Mobile:        single column, page scrolls normally.
  return (
    <div className="
      px-3 lg:px-4 max-w-5xl mx-auto
      pt-2 pb-4
      lg:h-[calc(100vh-3.5rem)] lg:flex lg:flex-col lg:overflow-hidden
    ">
      {/* Back link — shrinks to minimum on desktop so grid gets all remaining space */}
      <Link
        to="/pools?tab=v3"
        className="inline-flex items-center gap-2 text-sm text-cyan-400 hover:text-cyan-300 mb-2 lg:shrink-0"
      >
        <ArrowLeft className="h-4 w-4" /> Back to V3 Positions
      </Link>

      {/* 2-column grid — on desktop takes all remaining height */}
      <div className="
        grid grid-cols-1 lg:grid-cols-[58fr_42fr] gap-3
        lg:flex-1 lg:min-h-0 lg:overflow-hidden
      ">

        {/* ── LEFT column: Manage · Select range · Amount · Decrease ── */}
        <div className="space-y-3 lg:overflow-y-auto lg:min-h-0 lg:pr-1 pb-2">

          {/* Manage position ───────────────────────────────────────── */}
          <div id="collect" className={`${CARD} scroll-mt-4`}>
            <div className="flex items-center justify-between mb-2.5">
              <h2 className="text-base font-semibold text-white">Manage position</h2>
              <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-xs font-medium ${inRange ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${inRange ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                {inRange ? 'In range' : 'Out of range'}
              </span>
            </div>

            <p className="text-slate-400 text-xs mb-0.5">Position #{tokenId}</p>
            <p className="text-slate-300 text-xs font-medium mb-2.5">
              {priceLow.toFixed(4)} ⇌ {priceHigh.toFixed(4)} {sym1}
            </p>

            {/* APR / Staked / Deposited — 3 columns, compact */}
            <div className="grid grid-cols-3 gap-2 mb-2.5">
              <div>
                <span className="text-slate-500 text-xs block">APR</span>
                <span className="text-slate-200 text-xs font-medium">0.00%</span>
              </div>
              <div>
                <span className="text-slate-500 text-xs block">Staked</span>
                <span className="text-slate-200 text-xs font-medium">$—</span>
              </div>
              <div>
                <span className="text-slate-500 text-xs block">Deposited</span>
                <span className="text-slate-200 text-xs font-medium">
                  {formatNumber(formatUnits(posAmount0, decimals0), 2)} {sym0}
                  {' + '}
                  {formatNumber(formatUnits(posAmount1, decimals1), 2)} {sym1}
                </span>
              </div>
            </div>

            {(pos.tokensOwed0 > 0n || pos.tokensOwed1 > 0n) && (
              <p className="text-xs text-amber-400 mb-2">
                Rewards: {formatNumber(formatUnits(pos.tokensOwed0, decimals0), 4)} {sym0}
                {' / '}
                {formatNumber(formatUnits(pos.tokensOwed1, decimals1), 4)} {sym1}
              </p>
            )}

            {/* Action buttons — compact height */}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={collectFees}
                disabled={busy || (pos.tokensOwed0 === 0n && pos.tokensOwed1 === 0n)}
                title={pos.tokensOwed0 === 0n && pos.tokensOwed1 === 0n ? 'No fees to collect yet.' : undefined}
                className="inline-flex items-center gap-1.5 px-3 py-[7px] rounded-xl text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Coins className="h-3.5 w-3.5" />}
                Claim reward
              </button>
              <button
                onClick={() => setDecreasePct(null)}
                className="inline-flex items-center gap-1.5 px-3 py-[7px] rounded-xl text-xs font-medium border border-cyan-500/50 bg-cyan-500/10 text-cyan-400 hover:bg-amber-500/20 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" /> Increase
              </button>
              {pos.liquidity > 0n && (
                <button
                  onClick={() => document.getElementById('decrease')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                  className="inline-flex items-center gap-1.5 px-3 py-[7px] rounded-xl text-xs font-medium border border-slate-600 bg-slate-800/60 text-slate-200 hover:bg-slate-700/60 transition-colors"
                >
                  <Minus className="h-3.5 w-3.5" /> Decrease
                </button>
              )}
            </div>
          </div>

          {/* Select range ──────────────────────────────────────────── */}
          <div className={CARD}>
            <h3 className="text-xs font-semibold text-white mb-1.5">Select range</h3>
            <p className="text-xs text-slate-400 mb-2.5">
              Current price: {curPrice.toFixed(4)} {sym1} per {sym0}
            </p>

            {!inRange && (
              <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs mb-2.5">
                <span className="shrink-0">⚠</span>
                <span>Your range does not include the active tick. Single-sided position.</span>
              </div>
            )}

            <div className="flex gap-2 mb-2.5">
              <button
                onClick={() => setRangeMode('full')}
                className={`flex-1 py-1.5 rounded-xl text-xs font-medium transition-colors ${rangeMode === 'full' ? 'bg-cyan-500/30 text-cyan-300 border border-cyan-500/50' : 'bg-slate-800/60 text-slate-400 border border-slate-600'}`}
              >
                Full range
              </button>
              <button
                onClick={() => setRangeMode('manual')}
                className={`flex-1 py-1.5 rounded-xl text-xs font-medium transition-colors ${rangeMode === 'manual' ? 'bg-cyan-500/30 text-cyan-300 border border-cyan-500/50' : 'bg-slate-800/60 text-slate-400 border border-slate-600'}`}
              >
                Manual
              </button>
            </div>

            {rangeMode === 'manual' && (
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs text-slate-400 block mb-1">Min price · Tick</label>
                  <input
                    type="text" inputMode="numeric"
                    value={manualTickLower}
                    onChange={(e) => setManualTickLower(e.target.value)}
                    className="w-full bg-slate-900/60 border border-slate-600 rounded-xl px-3 py-2 text-white text-xs"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-slate-400 block mb-1">Max price · Tick</label>
                  <input
                    type="text" inputMode="numeric"
                    value={manualTickUpper}
                    onChange={(e) => setManualTickUpper(e.target.value)}
                    className="w-full bg-slate-900/60 border border-slate-600 rounded-xl px-3 py-2 text-white text-xs"
                  />
                </div>
              </div>
            )}
            {rangeMode === 'manual' && (!rangeValid || !manualAligned) && (
              <p className="text-xs text-amber-400 mt-1.5">
                {!rangeValid ? 'Min < Max' : `Ticks must be multiples of ${sp}`}
              </p>
            )}
          </div>

          {/* Amount (Increase liquidity) ────────────────────────────── */}
          <div className={CARD}>
            <h3 className="text-xs font-semibold text-white mb-2.5">Amount</h3>
            <div className="space-y-2.5">
              {/* Token 0 input */}
              <div className="rounded-xl bg-slate-900/60 border border-slate-700/50 px-3 py-2.5">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs text-slate-400">{sym0}</span>
                  <span className="text-xs text-slate-500">Balance {formatNumber(balance0, 4)}</span>
                </div>
                <input
                  type="text" inputMode="decimal"
                  value={amount0}
                  onChange={(e) => { const v = e.target.value.replace(/,/g, '.'); setAmount0(v); if (v) setAmount1(computeAmount1From0(v)) }}
                  placeholder="0"
                  className="w-full bg-transparent text-base font-semibold text-white focus:outline-none"
                />
              </div>
              {/* Token 1 input */}
              <div className="rounded-xl bg-slate-900/60 border border-slate-700/50 px-3 py-2.5">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs text-slate-400">{sym1}</span>
                  <span className="text-xs text-slate-500">Balance {formatNumber(balance1, 4)}</span>
                </div>
                <input
                  type="text" inputMode="decimal"
                  value={amount1}
                  onChange={(e) => { const v = e.target.value.replace(/,/g, '.'); setAmount1(v); if (v) setAmount0(computeAmount0From1(v)) }}
                  placeholder="0"
                  className="w-full bg-transparent text-base font-semibold text-white focus:outline-none"
                />
              </div>
              <button
                onClick={increaseLiquidity}
                disabled={busy || (!amount0 && !amount1)}
                className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Deposit
              </button>
            </div>
          </div>

          {/* Decrease liquidity ─────────────────────────────────────── */}
          {pos.liquidity > 0n && (
            <div id="decrease" className={`${CARD} scroll-mt-4`}>
              <h3 className="text-xs font-semibold text-white mb-1.5">Decrease liquidity</h3>
              <p className="text-xs text-slate-400 mb-2">Select how much to remove:</p>
              <div className="flex flex-wrap gap-2 mb-2">
                {([25, 50, 75, 100] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setDecreasePct(decreasePct === p ? null : p)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${decreasePct === p ? 'bg-red-500/30 text-red-400 border-2 border-red-500/60' : 'bg-slate-800/60 text-slate-400 border border-slate-600 hover:bg-slate-700/60'}`}
                  >
                    {p}%
                  </button>
                ))}
              </div>
              <button
                onClick={decreaseLiquidity}
                disabled={busy || decreasePct == null}
                className="w-full py-2 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-400 text-sm font-semibold border border-red-500/40 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Minus className="h-4 w-4" />}
                {decreasePct != null ? `Decrease ${decreasePct}%` : 'Select % above'}
              </button>
            </div>
          )}
        </div>

        {/* ── RIGHT column: Visualize range · Statistics ── */}
        <div className="space-y-3 lg:overflow-y-auto lg:min-h-0 lg:pr-1 pb-2">

          {/* Visualize range ───────────────────────────────────────── */}
          <div className={CARD}>
            <RangeChart
              tickLower={pos.tickLower}
              tickUpper={pos.tickUpper}
              currentTick={currentTick}
              symbol0={sym0}
              symbol1={sym1}
              inRange={inRange}
              label="Visualize range"
            />
          </div>

          {/* Statistics ─────────────────────────────────────────────── */}
          <div className={CARD}>
            <h3 className="text-xs font-semibold text-white mb-2">Statistics</h3>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">TVL</span>
                <span className="text-slate-200">—</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">24h Volume</span>
                <span className="text-slate-200">—</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">{sym0}</span>
                <span className="text-slate-200 font-medium">{formatNumber(formatUnits(posAmount0, decimals0), 4)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">{sym1}</span>
                <span className="text-slate-200 font-medium">{formatNumber(formatUnits(posAmount1, decimals1), 4)}</span>
              </div>
              <div className="flex justify-between pt-1.5 border-t border-slate-700/50">
                <span className="text-slate-400">Fees ({sym0})</span>
                <span className="text-slate-200">{formatNumber(formatUnits(pos.tokensOwed0, decimals0), 4)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Fees ({sym1})</span>
                <span className="text-slate-200">{formatNumber(formatUnits(pos.tokensOwed1, decimals1), 4)}</span>
              </div>
              <div className="pt-1">
                <a
                  href={`${ARCDEX.explorer}/address/${addrs?.v3PositionManager ?? '0xC61608f54EEFf2b229e3a4858236e47f2701a80f'}?a=${tid.toString()}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
                >
                  View on ArcScan <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
