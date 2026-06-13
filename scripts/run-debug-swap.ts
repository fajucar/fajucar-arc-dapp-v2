#!/usr/bin/env npx tsx
/**
 * Roda o debug do swap (Router / Factory / Pair / simulação).
 *
 * Uso:
 *   npm run debug:swap -- 0xSUA_CARTEIRA
 *   npm run debug:swap -- 0xSUA_CARTEIRA 52
 *
 * 1º arg: endereço do recipient (obrigatório)
 * 2º arg: valor em USDC para simular (opcional, default "52")
 */
import { debugSwap } from '../src/utils/debugSwap'
import { ARCDEX } from '../src/config/arcDex'
import { arcTestnet } from '../src/config/chains'

const recipient = process.argv[2] as `0x${string}` | undefined
const amount = process.argv[3] ?? '52'

if (!recipient || !recipient.startsWith('0x') || recipient.length !== 42) {
  console.error('Uso: npm run debug:swap -- 0xSUA_CARTEIRA [valor_usdc]')
  console.error('Exemplo: npm run debug:swap -- 0xa296...D1 52')
  process.exit(1)
}

const rpcUrl = arcTestnet.rpcUrls.default.http[0]

console.log('Debug Swap ArcDEX')
console.log('Router:', ARCDEX.router)
console.log('TokenIn (USDC):', ARCDEX.usdc)
console.log('TokenOut (EURC):', ARCDEX.eurc)
console.log('Amount:', amount, 'USDC')
console.log('Recipient:', recipient)
console.log('RPC:', rpcUrl)
console.log('---')

const result = await debugSwap({
  rpcUrl,
  router: ARCDEX.router,
  tokenIn: ARCDEX.usdc,
  tokenOut: ARCDEX.eurc,
  amountInHuman: amount,
  tokenInDecimals: ARCDEX.decimals.USDC,
  recipient,
})

console.log(JSON.stringify(result, null, 2))

// Diagnóstico: Router on-chain é o novo (com TransferHelper)?
if (result.routerSupportsPrecompile !== true) {
  console.error('')
  console.error('>>> DIAGNÓSTICO: O CONTRATO NESTE ENDEREÇO É O ROUTER ANTIGO <<<')
  console.error('    Router no config:', ARCDEX.router)
  console.error('    supportsPrecompileTokens():', result.routerSupportsPrecompile ?? 'falhou ou não existe')
  console.error('')
  console.error('O swap só funciona com o Router que tem TransferHelper (compatível com USDC).')
  console.error('1. Abra docs/ArcDEXRouter_Remix.sol (versão ATUAL do repo).')
  console.error('2. Cole TODO o conteúdo no Remix, compile (0.8.20), deploy na Arc Testnet.')
  console.error('3. Construtor: Factory = 0x386c7CEcFc46E3E6c989B0F27f44BEeC3C11ab3F')
  console.error('4. Copie o NOVO endereço do contrato deployado.')
  console.error('5. Em src/config/deployments.arc-testnet.json substitua "router" por esse endereço.')
  console.error('6. No app: Approve USDC de novo (para o novo Router) e tente o Swap.')
  console.error('')
  process.exit(4)
}

if (result.problem) {
  console.error('Problema:', result.problem)
  process.exit(2)
}
if (result.simulationOk) {
  console.log('Simulação: OK')
} else {
  console.error('Simulação: FALHOU')
  if (result.simulationDecodedError) {
    console.error('Erro decodificado:', result.simulationDecodedError)
  }
  if (result.simulationError) {
    console.error('Erro:', result.simulationError)
  }
  process.exit(3)
}
