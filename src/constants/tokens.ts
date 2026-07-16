/**
 * Shared Arc Testnet token list.
 * V2 and V3 swap selectors must import this same list.
 */
export const ARC_TESTNET_TOKENS = [
  {
    symbol: 'USDC',
    name: 'USD Coin',
    address: '0x3600000000000000000000000000000000000000' as `0x${string}`,
    decimals: 6,
    flag: '🇺🇸',
    logo: '🇺🇸',
  },
  {
    symbol: 'EURC',
    name: 'Euro Coin',
    address: '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a' as `0x${string}`,
    decimals: 6,
    flag: '🇪🇺',
    logo: '🇪🇺',
  },
  {
    symbol: 'QCAD',
    name: 'Canadian Dollar',
    address: '0x23d7CFFd0876f3ABb6B074287ba2aeefBc83825d' as `0x${string}`,
    decimals: 6,
    flag: '🇨🇦',
    logo: '🇨🇦',
  },
  {
    symbol: 'USYC',
    name: 'US Yield Coin',
    address: '0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C' as `0x${string}`,
    decimals: 6,
    flag: '📈',
    logo: '📈',
  },
  {
    symbol: 'FAJU',
    name: 'Faju Token',
    address: '0x0e8147CdB023474f440636051AA26f7DCaf2aEa7' as `0x${string}`,
    decimals: 18,
    flag: '⚡',
    logo: '⚡',
  },
  {
    symbol: 'ARCX',
    name: 'ArcX Token',
    address: '0xA99F353665F89784f0442FB666ea775b6C1af87d' as `0x${string}`,
    decimals: 18,
    flag: '🔵',
    logo: '🔵',
  },
  {
    symbol: 'cirBTC',
    name: 'Circle BTC',
    address: '0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF' as `0x${string}`,
    decimals: 8,
    flag: '🟠',
    logo: '🟠',
  },
  {
    symbol: 'LINK',
    name: 'ChainLink Token',
    address: '0x3F1f176e347235858DD6Db905DDBA09Eaf25478a' as `0x${string}`,
    decimals: 18,
    flag: '🔗',
    logo: '🔗',
  },
] as const

export type ArcTestnetToken = (typeof ARC_TESTNET_TOKENS)[number]
