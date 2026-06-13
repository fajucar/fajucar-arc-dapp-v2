/**
 * Uniswap V3 liquidity math — amounts from liquidity + price range
 * Based on LiquidityAmounts.sol and TickMath
 */

const Q96 = 2n ** 96n
const Q32 = 2n ** 32n

/** mulShift: (val * mulBy) >> 128 */
function mulShift(val: bigint, mulBy: string): bigint {
  return (val * BigInt(mulBy)) >> 128n
}

/** sqrt(1.0001^tick) * 2^96 — ported from Uniswap TickMath for precision */
export function getSqrtRatioAtTick(tick: number): bigint {
  const absTick = tick < 0 ? -tick : tick
  let ratio: bigint =
    (absTick & 0x1) !== 0
      ? 0xfffcb933bd6fad37aa2d162d1a594001n
      : 0x100000000000000000000000000000000n
  if ((absTick & 0x2) !== 0) ratio = mulShift(ratio, '0xfff97272373d413259a46990580e213a')
  if ((absTick & 0x4) !== 0) ratio = mulShift(ratio, '0xfff2e50f5f656932ef12357cf3c7fdcc')
  if ((absTick & 0x8) !== 0) ratio = mulShift(ratio, '0xffe5caca7e10e4e61c3624eaa0941cd0')
  if ((absTick & 0x10) !== 0) ratio = mulShift(ratio, '0xffcb9843d60f6159c9db58835c926644')
  if ((absTick & 0x20) !== 0) ratio = mulShift(ratio, '0xff973b41fa98c081472e6896dfb254c0')
  if ((absTick & 0x40) !== 0) ratio = mulShift(ratio, '0xff2ea16466c96a3843ec78b326b52861')
  if ((absTick & 0x80) !== 0) ratio = mulShift(ratio, '0xfe5dee046a99a2a811c461f1969c3053')
  if ((absTick & 0x100) !== 0) ratio = mulShift(ratio, '0xfcbe86c7900a88aedcffc83b479aa3a4')
  if ((absTick & 0x200) !== 0) ratio = mulShift(ratio, '0xf987a7253ac413176f2b074cf7815e54')
  if ((absTick & 0x400) !== 0) ratio = mulShift(ratio, '0xf3392b0822b70005940c7a398e4b70f3')
  if ((absTick & 0x800) !== 0) ratio = mulShift(ratio, '0xe7159475a2c29b7443b29c7fa6e889d9')
  if ((absTick & 0x1000) !== 0) ratio = mulShift(ratio, '0xd097f3bdfd2022b8845ad8f792aa5825')
  if ((absTick & 0x2000) !== 0) ratio = mulShift(ratio, '0xa9f746462d870fdf8a65dc1f90e061e5')
  if ((absTick & 0x4000) !== 0) ratio = mulShift(ratio, '0x70d869a156d2a1b890bb3df62baf32f7')
  if ((absTick & 0x8000) !== 0) ratio = mulShift(ratio, '0x31be135f97d08fd981231505542fcfa6')
  if ((absTick & 0x10000) !== 0) ratio = mulShift(ratio, '0x9aa508b5b7a84e1c677de54f3e99bc9')
  if ((absTick & 0x20000) !== 0) ratio = mulShift(ratio, '0x5d6af8dedb81196699c329225ee604')
  if ((absTick & 0x40000) !== 0) ratio = mulShift(ratio, '0x2216e584f5fa1ea926041bedfe98')
  if ((absTick & 0x80000) !== 0) ratio = mulShift(ratio, '0x48a170391f7dc42444e8fa2')

  if (tick > 0) ratio = (2n ** 256n - 1n) / ratio

  return ratio % Q32 > 0n ? ratio / Q32 + 1n : ratio / Q32
}

/** amount0 = liquidity * (1/sqrt(Pa) - 1/sqrt(Pb)) — token0 in range */
function getAmount0ForLiquidity(sqrtRatioAX96: bigint, sqrtRatioBX96: bigint, liquidity: bigint): bigint {
  if (sqrtRatioAX96 > sqrtRatioBX96) [sqrtRatioAX96, sqrtRatioBX96] = [sqrtRatioBX96, sqrtRatioAX96]
  const diff = sqrtRatioBX96 - sqrtRatioAX96
  if (diff === 0n) return 0n
  return ((liquidity << 96n) * diff) / sqrtRatioBX96 / sqrtRatioAX96
}

/** amount1 = liquidity * (sqrt(Pb) - sqrt(Pa)) / 2^96 — token1 in range */
function getAmount1ForLiquidity(sqrtRatioAX96: bigint, sqrtRatioBX96: bigint, liquidity: bigint): bigint {
  if (sqrtRatioAX96 > sqrtRatioBX96) [sqrtRatioAX96, sqrtRatioBX96] = [sqrtRatioBX96, sqrtRatioAX96]
  const diff = sqrtRatioBX96 - sqrtRatioAX96
  return (liquidity * diff) / Q96
}

/**
 * Amounts of token0 and token1 for given liquidity at current price.
 * Price below range → all token0. Price above range → all token1. In range → both.
 */
export function getAmountsForLiquidity(
  sqrtRatioX96: bigint,
  sqrtRatioAX96: bigint,
  sqrtRatioBX96: bigint,
  liquidity: bigint
): { amount0: bigint; amount1: bigint } {
  if (sqrtRatioAX96 > sqrtRatioBX96) [sqrtRatioAX96, sqrtRatioBX96] = [sqrtRatioBX96, sqrtRatioAX96]

  if (sqrtRatioX96 <= sqrtRatioAX96) {
    return {
      amount0: getAmount0ForLiquidity(sqrtRatioAX96, sqrtRatioBX96, liquidity),
      amount1: 0n,
    }
  }
  if (sqrtRatioX96 >= sqrtRatioBX96) {
    return {
      amount0: 0n,
      amount1: getAmount1ForLiquidity(sqrtRatioAX96, sqrtRatioBX96, liquidity),
    }
  }
  return {
    amount0: getAmount0ForLiquidity(sqrtRatioX96, sqrtRatioBX96, liquidity),
    amount1: getAmount1ForLiquidity(sqrtRatioAX96, sqrtRatioX96, liquidity),
  }
}

/**
 * Dado amount0, retorna amount1 equivalente para uma posição no range.
 * Usado para preencher automaticamente o campo B quando o usuário informa A.
 */
export function getAmount1FromAmount0(
  amount0: bigint,
  sqrtRatioCurrentX96: bigint,
  sqrtRatioLowerX96: bigint,
  sqrtRatioUpperX96: bigint
): bigint {
  if (sqrtRatioLowerX96 > sqrtRatioUpperX96) [sqrtRatioLowerX96, sqrtRatioUpperX96] = [sqrtRatioUpperX96, sqrtRatioLowerX96]
  if (amount0 === 0n) return 0n
  if (sqrtRatioCurrentX96 >= sqrtRatioUpperX96) return 0n
  if (sqrtRatioCurrentX96 <= sqrtRatioLowerX96) return 0n
  const liquidity = (amount0 * sqrtRatioCurrentX96 * sqrtRatioUpperX96) / (sqrtRatioUpperX96 - sqrtRatioCurrentX96) / Q96
  return getAmount1ForLiquidity(sqrtRatioLowerX96, sqrtRatioCurrentX96, liquidity)
}

/**
 * Dado amount1, retorna amount0 equivalente para uma posição no range.
 */
export function getAmount0FromAmount1(
  amount1: bigint,
  sqrtRatioCurrentX96: bigint,
  sqrtRatioLowerX96: bigint,
  sqrtRatioUpperX96: bigint
): bigint {
  if (sqrtRatioLowerX96 > sqrtRatioUpperX96) [sqrtRatioLowerX96, sqrtRatioUpperX96] = [sqrtRatioUpperX96, sqrtRatioLowerX96]
  if (amount1 === 0n) return 0n
  if (sqrtRatioCurrentX96 <= sqrtRatioLowerX96) return 0n
  if (sqrtRatioCurrentX96 >= sqrtRatioUpperX96) return 0n
  const liquidity = (amount1 * Q96) / (sqrtRatioCurrentX96 - sqrtRatioLowerX96)
  return getAmount0ForLiquidity(sqrtRatioCurrentX96, sqrtRatioUpperX96, liquidity)
}
