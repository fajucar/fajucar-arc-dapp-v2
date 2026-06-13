import { Chain } from 'viem'

export const arcTestnet = {
  id: 5042002, // Arc Testnet chainId
  name: 'Arc Testnet',
  nativeCurrency: {
    name: 'USDC',
    symbol: 'USDC',
    decimals: 6, // Arc uses USDC as native gas token — 6 decimals (same as ERC-20 USDC, not 18)
  },
  rpcUrls: {
    default: {
      http: [
        'https://rpc.testnet.arc.network',
        'https://rpc.blockdaemon.testnet.arc.network',
        'https://rpc.drpc.testnet.arc.network',
        'https://rpc.quicknode.testnet.arc.network',
      ],
      webSocket: [
        'wss://rpc.testnet.arc.network',
        'wss://rpc.drpc.testnet.arc.network',
        'wss://rpc.quicknode.testnet.arc.network',
      ],
    },
    public: {
      http: [
        'https://rpc.testnet.arc.network',
        'https://rpc.blockdaemon.testnet.arc.network',
        'https://rpc.drpc.testnet.arc.network',
        'https://rpc.quicknode.testnet.arc.network',
      ],
      webSocket: [
        'wss://rpc.testnet.arc.network',
        'wss://rpc.drpc.testnet.arc.network',
        'wss://rpc.quicknode.testnet.arc.network',
      ],
    },
  },
  blockExplorers: {
    default: {
      name: 'ArcScan',
      url: 'https://testnet.arcscan.app'
    },
  },
  testnet: true,
} as const satisfies Chain

// Exportar também mainnet quando disponível
export const arcMainnet = {
  id: 1337, // AJUSTAR quando mainnet estiver disponível
  name: 'Arc Network',
  nativeCurrency: {
    name: 'USDC',
    symbol: 'USDC',
    decimals: 6,
  },
  rpcUrls: {
    default: { 
      http: ['https://rpc.arc.network'],
    },
    public: { 
      http: ['https://rpc.arc.network'],
    },
  },
  blockExplorers: {
    default: { 
      name: 'ArcScan', 
      url: 'https://arcscan.app'
    },
  },
  testnet: false,
} as const satisfies Chain

