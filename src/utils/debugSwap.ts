/**
 * Utilitário para debugar swap no ArcDEX (Router/Factory/Pair).
 * Verifica factory, pair, reservas, getAmountsOut, allowance/balance e simula swap
 * para capturar motivo do revert (decodificado quando possível).
 *
 * Uso (exemplo no browser ou Node):
 *   import { debugSwap } from '@/utils/debugSwap'
 *   import { ARCDEX } from '@/config/arcDex'
 *   const r = await debugSwap({
 *     rpcUrl: 'https://rpc.testnet.arc.network',
 *     router: ARCDEX.router,
 *     tokenIn: ARCDEX.usdc,
 *     tokenOut: ARCDEX.eurc,
 *     amountInHuman: '52',
 *     tokenInDecimals: ARCDEX.decimals.USDC,
 *     recipient: '0x...', // endereço da carteira
 *   })
 *   console.log(r)
 */
import {
  createPublicClient,
  http,
  parseUnits,
  decodeErrorResult,
  type Address,
} from 'viem'

// ABIs mínimas (UniswapV2 / ArcDEX style)
const RouterAbi = [
  {
    name: 'factory',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address' }],
  },
  {
    name: 'supportsPrecompileTokens',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'bool' }],
  },
  {
    name: 'getAmountsOut',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ type: 'uint256' }, { type: 'address[]' }],
    outputs: [{ type: 'uint256[]' }],
  },
  {
    name: 'swapExactTokensForTokens',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { type: 'uint256' },
      { type: 'uint256' },
      { type: 'address[]' },
      { type: 'address' },
      { type: 'uint256' },
    ],
    outputs: [{ type: 'uint256[]' }],
  },
] as const

const FactoryAbi = [
  {
    name: 'getPair',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ type: 'address' }, { type: 'address' }],
    outputs: [{ type: 'address' }],
  },
] as const

const PairAbi = [
  {
    name: 'getReserves',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint112' }, { type: 'uint112' }],
  },
  {
    name: 'token0',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address' }],
  },
  {
    name: 'token1',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address' }],
  },
] as const

const Erc20Abi = [
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ type: 'address' }, { type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
] as const

const ErrorAbi = [
  { name: 'Error', type: 'error', inputs: [{ name: 'message', type: 'string' }] },
  { name: 'Panic', type: 'error', inputs: [{ name: 'code', type: 'uint256' }] },
] as const

export type DebugSwapParams = {
  rpcUrl: string
  router: `0x${string}`
  tokenIn: `0x${string}`
  tokenOut: `0x${string}`
  amountInHuman: string
  tokenInDecimals: number
  recipient: `0x${string}`
}

export type DebugSwapResult = {
  router: string
  factory: string
  pair: string
  /** true = Router novo (TransferHelper), false ou undefined = Router antigo ou falha na chamada */
  routerSupportsPrecompile?: boolean
  problem?: 'PAIR_NOT_FOUND_IN_FACTORY' | 'NO_LIQUIDITY_RESERVES_ZERO'
  pairToken0?: string
  pairToken1?: string
  reserve0?: string
  reserve1?: string
  amountsOut?: string[]
  amountOutMin?: string
  simulationOk?: boolean
  simulation?: unknown
  simulationError?: string
  simulationDecodedError?: string
  rawError?: unknown
  allowance?: string
  balanceRecipient?: string
}

export async function debugSwap(p: DebugSwapParams): Promise<DebugSwapResult> {
  const publicClient = createPublicClient({ transport: http(p.rpcUrl) })

  const amountIn = parseUnits(p.amountInHuman, p.tokenInDecimals)
  const path = [p.tokenIn, p.tokenOut] as readonly [`0x${string}`, `0x${string}`]

  const factory = (await publicClient.readContract({
    address: p.router,
    abi: RouterAbi,
    functionName: 'factory',
  })) as Address

  let routerSupportsPrecompile: boolean | undefined
  try {
    routerSupportsPrecompile = (await publicClient.readContract({
      address: p.router,
      abi: RouterAbi,
      functionName: 'supportsPrecompileTokens',
    })) as boolean
  } catch {
    routerSupportsPrecompile = undefined
  }

  const pair = (await publicClient.readContract({
    address: factory,
    abi: FactoryAbi,
    functionName: 'getPair',
    args: [p.tokenIn, p.tokenOut],
  })) as Address

  const out: DebugSwapResult = { router: p.router, factory, pair, routerSupportsPrecompile }

  if (!pair || pair === '0x0000000000000000000000000000000000000000') {
    out.problem = 'PAIR_NOT_FOUND_IN_FACTORY'
    return out
  }

  const reserves = (await publicClient.readContract({
    address: pair,
    abi: PairAbi,
    functionName: 'getReserves',
  })) as [bigint, bigint]

  const [r0, r1] = reserves
  const token0 = (await publicClient.readContract({
    address: pair,
    abi: PairAbi,
    functionName: 'token0',
  })) as Address
  const token1 = (await publicClient.readContract({
    address: pair,
    abi: PairAbi,
    functionName: 'token1',
  })) as Address

  out.pairToken0 = token0
  out.pairToken1 = token1
  out.reserve0 = r0.toString()
  out.reserve1 = r1.toString()

  if (r0 === 0n || r1 === 0n) {
    out.problem = 'NO_LIQUIDITY_RESERVES_ZERO'
    return out
  }

  const amountsOut = (await publicClient.readContract({
    address: p.router,
    abi: RouterAbi,
    functionName: 'getAmountsOut',
    args: [amountIn, path],
  })) as bigint[]

  out.amountsOut = amountsOut.map((x) => x.toString())
  const expectedOut = amountsOut[amountsOut.length - 1]
  const amountOutMin = (expectedOut * 98n) / 100n
  out.amountOutMin = amountOutMin.toString()

  // Allowance e balance do recipient (útil para diagnóstico)
  try {
    const [allowance, balance] = await Promise.all([
      publicClient.readContract({
        address: p.tokenIn,
        abi: Erc20Abi,
        functionName: 'allowance',
        args: [p.recipient, p.router],
      }),
      publicClient.readContract({
        address: p.tokenIn,
        abi: Erc20Abi,
        functionName: 'balanceOf',
        args: [p.recipient],
      }),
    ])
    out.allowance = (allowance as bigint).toString()
    out.balanceRecipient = (balance as bigint).toString()
  } catch {
    // token pode não expor allowance/balance (ex.: precompile)
  }

  const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 20)

  try {
    const sim = await publicClient.simulateContract({
      address: p.router,
      abi: RouterAbi,
      functionName: 'swapExactTokensForTokens',
      args: [amountIn, amountOutMin, [...path], p.recipient, deadline],
      account: p.recipient,
    })
    out.simulationOk = true
    out.simulation = sim
  } catch (e: unknown) {
    const err = e as { shortMessage?: string; message?: string; data?: string; cause?: { data?: string } }
    out.simulationOk = false
    out.simulationError = err?.shortMessage ?? err?.message ?? String(e)
    out.rawError = e

    const errorData = (err?.data ?? err?.cause?.data) as string | undefined
    if (errorData && typeof errorData === 'string' && errorData.startsWith('0x')) {
      try {
        const decoded = decodeErrorResult({
          abi: ErrorAbi,
          data: errorData as `0x${string}`,
        })
        if (decoded.errorName === 'Error' && decoded.args?.[0]) {
          out.simulationDecodedError = String(decoded.args[0])
        } else if (decoded.errorName === 'Panic' && decoded.args?.[0] !== undefined) {
          out.simulationDecodedError = `Panic(${decoded.args[0]})`
        }
      } catch {
        // ignorar falha de decodificação
      }
    }
  }

  return out
}
