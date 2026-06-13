/**
 * ArcDEX config — derivado de arcTestnet.ts (fonte única de verdade).
 * Swap: approve → Router. Add Liquidity: approve → LiquidityHelper.
 */

import { ARC_TESTNET, ARC_PAIRS_TO_DISCOVER } from './arcTestnet'

export const ARCDEX = {
  chainId: ARC_TESTNET.chainId,
  factory: ARC_TESTNET.addresses.factory,
  router: ARC_TESTNET.addresses.router,
  pair: ARC_TESTNET.addresses.pair,
  liquidityHelper: ARC_TESTNET.addresses.liquidityHelper,
  usdc: ARC_TESTNET.addresses.usdc,
  eurc: ARC_TESTNET.addresses.eurc,
  faju: ARC_TESTNET.addresses.faju,
  arcx: ARC_TESTNET.addresses.arcx,
  decimals: {
    USDC: ARC_TESTNET.tokens.USDC.decimals,
    EURC: ARC_TESTNET.tokens.EURC.decimals,
    FAJU: ARC_TESTNET.tokens.FAJU.decimals,
    ARCX: ARC_TESTNET.tokens.ARCX.decimals,
  },
  explorer: ARC_TESTNET.explorer,
  explorerName: ARC_TESTNET.explorerName,
  tokens: ARC_TESTNET.tokens,
  pairsToDiscover: ARC_PAIRS_TO_DISCOVER,
} as const
