# Construindo pagamentos agendados on-chain na Arc: erros, descobertas e acertos

> Rascunho de artigo técnico baseado na construção do FajuARC — um DApp com
> agente de IA que executa ações on-chain na Arc Testnet (chain onde o USDC é
> o token de gas nativo). Este texto documenta a jornada real de depuração de
> um recurso de pagamentos agendados: o que quebrou, por que quebrou, e como
> resolvemos. Cada seção aponta a documentação oficial consultada, para que
> você possa verificar as fontes.

---

## O contexto

O FajuARC tem um agente conversacional que executa ações on-chain. Uma delas:
**pagamentos agendados** — o usuário pede "envie 5 USDC para 0x... toda
sexta-feira", e um scheduler no backend (cron rodando a cada minuto) executa
o envio no horário certo, sozinho.

O detalhe que torna tudo mais interessante: na **Arc**, o USDC é o **token de
gas nativo**. Isso cria armadilhas que não existem em chains onde gas e token
transferido são coisas separadas.

Stack relevante:
- Backend Node.js (Express) com um cron scheduler
- Carteiras: Circle Developer-Controlled Wallets, EOA via viem, e Privy embedded wallets
- Arc Testnet — chainId 5042002, RPC `https://rpc.testnet.arc.network`

📚 **Docs base:**
- Visão geral de integração e as 3 diferenças-chave da Arc (USDC como gas,
  finalidade determinística, interface dupla do USDC): [Integrate with Arc](https://docs.arc.network/integrate)
- Endpoints RPC e parâmetros de rede: [RPC endpoints](https://docs.arc.network/arc/references/rpc-endpoints)

---

## Erro nº 1 — "insufficient asset amount" mesmo com saldo on-chain

### O sintoma

Todos os pagamentos agendados falhavam. O log do banco mostrava sempre:

```json
{
  "status": "failed",
  "lastError": "Circle API error: the asset amount owned by the wallet is insufficient for the transaction."
}
```

O estranho: a carteira **tinha** USDC on-chain. Mas o Circle recusava a
transação dizendo que o saldo era insuficiente.

### A investigação

Consultei o saldo direto pela API do Circle:

```
GET /api/debug/circle-balance?walletId=...
→ { "balances": [], "raw": { "tokenBalances": [] } }
```

Vazio. As Circle wallets retornavam `tokenBalances: []`, apesar de terem
saldo real on-chain.

### A causa raiz

A leitura de saldo pela API do provedor não era confiável nessa chain, e o
motivo está numa peculiaridade da Arc documentada oficialmente: o **modelo de
"decimais duplos" do USDC**. Na Arc, o USDC nativo e a interface ERC-20 são o
mesmo ativo, mas com decimais diferentes (nativo = 18, ERC-20 = 6). A visão
ERC-20 trunca valores, então um `balanceOf` de 0 não significa saldo nativo
zero. *(Conteúdo reformulado da doc para conformidade.)*

📚 **Docs consultadas:**
- O modelo de USDC como gas nativo e a interface dupla (18 vs 6 decimais),
  incluindo o aviso de que isso afeta as APIs de saldo:
  [EVM differences → USDC as the native gas token](https://docs.arc.network/arc/references/evm-differences#usdc-as-the-native-gas-token)
- Confirmação do endereço e dos 6 decimais da interface ERC-20 do USDC:
  [Contract addresses → USDC](https://docs.arc.network/arc/references/contract-addresses#usdc)

Conclusão: **não dá pra confiar na API de saldo do provedor nessa chain.** A
fonte de verdade tem que ser on-chain.

### O código ERRADO (dependia do Circle)

```javascript
// scheduler.mjs — versão problemática
const walletId = resolveWalletId(null, payment.walletAddress)
const amountWei = parseUnits(payment.amount, USDC.decimals).toString()

// Circle valida o saldo internamente pela SUA API e recusa a transação
// com "insufficient asset amount".
const txHash = await executeContractCall({
  walletId,
  contractAddress:   USDC.address,
  functionSignature: 'transfer(address,uint256)',
  parameters:        [payment.recipient, amountWei],
})
```

### O acerto — ler saldo on-chain e assinar via viem

A correção foi parar de depender da API de saldo do provedor e passar a:
1. **Ler o saldo direto do contrato** (`balanceOf` via RPC) — fonte de verdade real
2. **Assinar com uma EOA dedicada via viem**

```javascript
// onchain.mjs — fonte de verdade on-chain
export async function getUsdcBalance(address) {
  return getPublicClient().readContract({
    address:      USDC.address,
    abi:          ERC20_ABI,
    functionName: 'balanceOf',   // lê do contrato, não do indexer do provedor
    args:         [address],
  })
}
```

```javascript
// signer-viem.mjs — assinatura direta com uma EOA dedicada
export async function sendUsdc(toAddress, amountHuman) {
  const decimals  = await getUsdcDecimals()          // on-chain, nunca hardcoded
  const amountWei = parseUnits(amountHuman, decimals)

  const txHash = await getWalletClient().writeContract({
    address:      USDC.address,
    abi:          USDC_TRANSFER_ABI,
    functionName: 'transfer',
    args:         [toAddress, amountWei],
  })

  const receipt = await getPublicClient().waitForTransactionReceipt({ hash: txHash })
  return { txHash, status: receipt.status }
}
```

**Resultado:** transação confirmada com sucesso no ArcScan. ✅

📚 A própria doc da Arc recomenda usar a interface ERC-20 padrão para ler
saldos e enviar transferências, e sempre ler `decimals()` do contrato em vez
de assumir um valor fixo: [Contract addresses → USDC (nota sobre decimais)](https://docs.arc.network/arc/references/contract-addresses#usdc).

### Lição nº 1
> Numa chain com modelo de token incomum (como USDC nativo com decimais duplos),
> **a API de saldo do provedor de carteira pode não ser confiável.** Sempre que
> possível, use `balanceOf` on-chain como fonte de verdade — e leia `decimals()`
> do contrato, nunca hardcode.

---

## Erro nº 2 — "transfer amount exceeds balance" mesmo com o valor "cabendo"

### O sintoma

Depois de resolver o erro nº 1, um novo apareceu. Tentei enviar **3.9 USDC** de
uma carteira que tinha **3.99 USDC**. Deveria caber. Mas:

```
ERC20: transfer amount exceeds balance
function: transfer(address to, uint256 amount)
sender: 0x15144Ace...430C65
```

### A causa raiz

Aqui está a armadilha da Arc: **o gas é pago em USDC, do mesmo saldo que está
sendo transferido.** A sequência real é:

1. Saldo: 3.99 USDC
2. Gas da transação é debitado do saldo → sobra menos de 3.9
3. O `transfer` de 3.9 agora excede o que restou → **revert**

A checagem de saldo só comparava `saldo >= valor`, **ignorando o gas**.

📚 **Docs consultadas:**
- Modelo de taxas: todas as taxas são denominadas em USDC (gas em USDC, 18
  decimais de precisão nativa): [Gas and fees](https://docs.arc.network/arc/references/gas-and-fees)
- O erro clássico `insufficient funds for gas * price + value` — quando o
  saldo não cobre valor + taxa — está listado na tabela de erros comuns:
  [Gas and fees → Common errors](https://docs.arc.network/arc/references/gas-and-fees#common-errors)

### O código ERRADO (ignora o gas)

```javascript
// scheduler.mjs — checagem ingênua
const amountWei = parseUnits(payment.amount, decimals)
const onChainBalance = await getUsdcBalance(executionAddress)

if (onChainBalance < amountWei) {          // ❌ só compara saldo vs valor
  throw new Error('Insufficient balance...')
}
// passa na checagem, mas reverte on-chain porque o gas não coube
```

### O acerto — reservar margem de gas no saldo NATIVO

Duas sacadas importantes:
1. O gas sai do **saldo nativo (18 decimais)**, não da visão ERC-20 (6 decimais)
2. Precisamos exigir `saldo nativo >= valor + gas estimado`

```javascript
// onchain.mjs — novos helpers
export async function getNativeBalance(address) {
  return getPublicClient().getBalance({ address }) // saldo nativo, 18 decimais
}

export async function estimateUsdcTransferGasCost({ from, to, amountWei }) {
  const client = getPublicClient()
  const [gas, gasPrice] = await Promise.all([
    client.estimateContractGas({
      address: USDC.address, abi: USDC_TRANSFER_ABI,
      functionName: 'transfer', args: [to, amountWei], account: from,
    }),
    client.getGasPrice(),
  ])
  return (gas * gasPrice * 15n) / 10n   // +50% de margem de segurança
}
```

```javascript
// scheduler.mjs — checagem consciente do gas
const amountWei    = parseUnits(payment.amount, decimals)
// ERC-20 (6 dec) → nativo (18 dec): mesmo saldo, precisão diferente
const amountNative = amountWei * 10n ** BigInt(18 - decimals)

const [nativeBalance, gasCost] = await Promise.all([
  getNativeBalance(executionAddress),
  estimateUsdcTransferGasCost({ from: executionAddress, to: payment.recipient, amountWei }),
])

const gasReserve = gasCost ?? (10n ** 16n)  // fallback: 0.01 USDC
const required   = amountNative + gasReserve

if (nativeBalance < required) {             // ✅ valor + gas
  throw new Error(
    `Insufficient balance: precisa ~${formatUnits(required, 18)} USDC ` +
    `(${payment.amount} para enviar + ${formatUnits(gasReserve, 18)} de gas). ` +
    `Na Arc, o gas é pago em USDC do mesmo saldo.`
  )
}
```

**Validação real contra a Arc:**
- Enviar 0.05 com saldo 0.089 → ✅ passa (tem margem pro gas)
- Enviar 0.088 com saldo 0.089 → ❌ bloqueado ANTES de reverter (não sobra pro gas)

### Lição nº 2
> Quando o gas é pago no mesmo token que você transfere, `saldo >= valor` não
> basta. A regra correta é `saldo >= valor + gas`. E cuidado com os decimais:
> na Arc o gas sai do saldo nativo (18 dec), então a conta tem que ser feita
> nessa unidade, convertendo o valor ERC-20 (6 dec) antes de comparar.

---

## Descoberta nº 3 — fazer o envio sair da carteira do próprio usuário

### O problema de design

Os agendamentos saíam de uma **carteira do bot** (uma EOA compartilhada). Isso
tinha problemas: fundos de todos misturados, o usuário não sabia qual endereço
abastecer, e uma chave só controlava o dinheiro de todo mundo.

A pergunta certa: **dá pra usar a carteira que o usuário já logou?**

O obstáculo técnico: a carteira do usuário é uma **embedded wallet do Privy** —
ele autoriza via popup, e o backend não tem a chave. Mas o pagamento agendado
roda no futuro, quando o usuário está offline e não pode assinar.

### A descoberta — Privy Session Signers

O Privy tem um recurso oficial pra exatamente isso: **Session Signers**. O
usuário concede consentimento uma vez, e a partir daí o app pode assinar
transações da carteira dele a partir do servidor — inclusive com o usuário
offline (o próprio guia cita limit orders e bots de trading como casos de uso).

📚 **Docs consultadas:**
- Guia de habilitar usuários ou servidores a executar transações (o passo a
  passo de authorization key + key quorum + addSessionSigners):
  [Signers → Quickstart](https://docs.privy.io/wallets/using-wallets/signers/quickstart)
- Configurar signers (criar authorization key / key quorum no Dashboard):
  [Signers → Configure signers](https://docs.privy.io/wallets/using-wallets/signers/configure-signers)
- Adicionar o signer à carteira do usuário (consentimento):
  [Signers → Add signers](https://docs.privy.io/wallets/using-wallets/signers/add-signers)

### Lição nº 3
> Custódia importa. Em vez de o backend guardar os fundos de todos numa carteira
> compartilhada, delegue a assinatura com escopo limitado (session signers).
> O dinheiro fica com o usuário; o app só ganha permissão pontual pra executar
> o que foi combinado.

---

## Capítulo 4 — Implementando o Session Signer de verdade (e os bugs no caminho)

Descobrir o recurso é uma coisa; fazer funcionar é outra. Aqui estão os erros
reais que enfrentamos integrando o Privy Node SDK no backend.

### Bug 4.1 — `sendTransaction is not a function`

Primeira tentativa acessando o método de envio:

```javascript
// ❌ ERRADO
await privy.walletsService.ethereum.sendTransaction({ ... })
// TypeError: privy.walletsService.ethereum.sendTransaction is not a function
```

Inspecionando o SDK, descobri que `.ethereum` é uma **função** (getter), não o
objeto de serviço. O objeto certo é `.ethereumService`:

```javascript
// ✅ CERTO
await privy.walletsService.ethereumService.sendTransaction(walletId, input)
```

### Bug 4.2 — o método é keyed por walletId, não por endereço

O `sendTransaction` não aceita o endereço `0x...` diretamente — ele espera o
**walletId interno do Privy**. Foi preciso resolver o id a partir do endereço:

```javascript
// resolve o walletId a partir do endereço on-chain
const res = await privy.walletsService._client.wallets.getWalletByAddress({ address })
const walletId = res.id
// (getWalletByAddress só aceita { address } — passar chain_type dá erro 400)
```

Um bônus dessa chamada: a resposta traz `additional_signers`, o que permite
confirmar que o nosso key quorum realmente foi adicionado à carteira do usuário.

📚 Referência do SDK server-side e do formato de envio de transação:
[Send an Ethereum transaction](https://docs.privy.io/wallets/using-wallets/ethereum/send-a-transaction)
e o recipe de [enviar USDC / ERC-20](https://docs.privy.io/recipes/send-usdc).

### Bug 4.3 — o App Secret precisa do prefixo `privy_app_secret_`

Este custou tempo. A chamada retornava:

```
401 { "error": "Invalid app ID or app secret." }
```

O `PrivyClient` instancia sem erro mesmo com secret errado — só a **chamada
real à API** valida. O problema: ao copiar o App Secret do Dashboard, o prefixo
`privy_app_secret_` ficou de fora. O valor completo tem a forma:

```
PRIVY_APP_SECRET=privy_app_secret_<resto do valor>
```

Sem o prefixo, 401 garantido.

📚 Setup do Node SDK (app id + app secret):
[NodeJS → Setup](https://docs.privy.io/basics/nodeJS/setup).

### Bug 4.4 — "Duplicate signer(s)" não é erro, é sucesso

O consentimento (`addSessionSigners`) é **uma vez por carteira**. Na segunda
vez, o Privy responde:

```
Duplicate signer(s) provided when updating wallet.
```

Isso significa que o signer **já está** na carteira — ou seja, sucesso. A
correção foi tratar essa mensagem como "já autorizado" em vez de erro:

```javascript
try {
  await addSessionSigners({ address, signers: [{ signerId: KEY_QUORUM_ID }] })
  return true
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err)
  if (/duplicate signer/i.test(msg) || /already been added/i.test(msg)) {
    return true // já autorizado — não é falha
  }
  throw err
}
```

### O formato final que funcionou

```javascript
// signer-privy.mjs — envio a partir da carteira do usuário
const walletId = await resolveWalletId(privy, fromAddress)

const result = await privy.walletsService.ethereumService.sendTransaction(walletId, {
  caip2: `eip155:${ARC_CHAIN_ID}`,          // eip155:5042002
  params: {
    transaction: {
      to: USDC.address,
      data,                                  // transfer(to, amount) via encodeFunctionData
      value: '0x0',
      chain_id: ARC_CHAIN_ID,                // snake_case!
    },
  },
  authorization_context: {                   // a chave delegada autentica a request
    authorization_private_keys: [authorizationKey],
  },
})
```

**Resultado — confirmado on-chain:** o pagamento saiu da carteira do próprio
usuário (`from: 0xd4de...20A2`), assinado headless pelo backend, com o usuário
podendo estar offline. Dois testes passaram: envio direto e via scheduler no
horário agendado.

### Lição nº 4
> SDKs evoluem e a doc nem sempre cobre 100% do server-side. Vale inspecionar a
> superfície do SDK (métodos disponíveis, tipos `.d.ts`) para achar o caminho
> certo. E credenciais têm formato: um prefixo faltando vira um 401 silencioso.

---

## Capítulo 5 — "Enviar EURC" não é "trocar EURC por USDC"

### O sintoma

Ao pedir "envie 5 EURC para 0x...", a transação revertia. No ArcScan, o método
da tx era `exactInputSingle` — ou seja, um **swap**, não um envio.

### A causa raiz

A ferramenta do agente (`sendUSDC`) era **fixa em USDC**. Sem uma forma de
enviar outros tokens, o agente "improvisou": fez um swap de EURC→USDC para
depois enviar USDC. Além de não ser o que o usuário pediu, o swap revertia.

### O acerto — transfer direto de qualquer token

Generalizei a ferramenta para aceitar um `token` (default USDC) e sempre fazer
um `transfer` ERC-20 direto, com instrução explícita ao agente: **nunca trocar
um token por outro para cumprir um pedido de envio.**

```javascript
// handler de envio — token dinâmico, sempre transfer (nunca swap)
const symbol    = (params.token || 'USDC').toUpperCase()
const sendToken = token(symbol)                    // resolve address + decimals
const txHash = await writeContractAsync({
  address:      sendToken.address,
  abi:          USDC_TRANSFER_ABI,                 // transfer(address,uint256) padrão ERC-20
  functionName: 'transfer',
  args:         [to, parseUnits(amount, sendToken.decimals)],
})
```

Confirmado on-chain: o envio de EURC passou a sair como `transfer` no contrato
do EURC (`FiatTokenV2_2`), direto da carteira do usuário.

📚 Endereços e decimais oficiais dos tokens da Arc Testnet (USDC, EURC, etc.):
[Contract addresses](https://docs.arc.network/arc/references/contract-addresses).

### Lição nº 5
> Um agente de IA vai "dar um jeito" quando faltar ferramenta — às vezes um jeito
> errado e caro. Modele as ações de forma explícita ("enviar" é sempre transfer)
> e restrinja atalhos indesejados (nunca swap para cumprir um send).

---

## Resumo das lições

| # | Erro | Causa raiz | Acerto |
|---|------|-----------|--------|
| 1 | `insufficient asset amount` com saldo real | API de saldo do provedor não confiável na Arc (decimais duplos do USDC) | Ler `balanceOf` on-chain + assinar via viem |
| 2 | `transfer amount exceeds balance` com valor "cabendo" | Gas pago em USDC do mesmo saldo, ignorado na checagem | Exigir `saldo nativo >= valor + gas estimado` |
| 3 | Carteira do bot compartilhada (design ruim) | Backend não pode assinar a carteira embedded do usuário offline | Privy Session Signers (autoriza 1x, assina depois) |
| 4 | 401 / `is not a function` no SDK do Privy | Caminho do método errado + App Secret sem prefixo | `ethereumService.sendTransaction(walletId, ...)` + `privy_app_secret_` |
| 5 | "Enviar EURC" virava swap e revertia | Ferramenta fixa em USDC; agente improvisou swap | Transfer direto de qualquer token; proibir swap para envios |

## Conclusão

O fio condutor é o mesmo: **a Arc não é uma EVM comum.** O USDC ser o token de
gas nativo, com decimais duplos, quebra suposições que funcionariam em qualquer
outra chain — desde ler saldo até calcular se um envio cabe. Some a isso o
design de custódia (a carteira do usuário é dele, não do backend) e as
particularidades de cada SDK.

A regra de ouro: **leia a fonte de verdade on-chain, respeite o modelo de token
da chain, delegue permissões com escopo em vez de custodiar, e modele as ações
do agente de forma explícita.**

---

## Fontes oficiais consultadas

**Arc:**
- Integrate with Arc: https://docs.arc.network/integrate
- EVM differences (USDC como gas, decimais duplos): https://docs.arc.network/arc/references/evm-differences
- Contract addresses (USDC/EURC, decimais): https://docs.arc.network/arc/references/contract-addresses
- Gas and fees (erros comuns, fee em USDC): https://docs.arc.network/arc/references/gas-and-fees
- RPC endpoints: https://docs.arc.network/arc/references/rpc-endpoints
- Interact with contracts: https://docs.arc.network/arc/tutorials/interact-with-contracts

**Privy:**
- Session signers — quickstart: https://docs.privy.io/wallets/using-wallets/signers/quickstart
- Configure signers: https://docs.privy.io/wallets/using-wallets/signers/configure-signers
- Add signers: https://docs.privy.io/wallets/using-wallets/signers/add-signers
- Send an Ethereum transaction: https://docs.privy.io/wallets/using-wallets/ethereum/send-a-transaction
- Sending USDC (recipe): https://docs.privy.io/recipes/send-usdc
- NodeJS setup: https://docs.privy.io/basics/nodeJS/setup

*Conteúdo das fontes reformulado para conformidade com licenciamento. Verifique
sempre a documentação oficial, pois APIs e endereços podem mudar (a Arc está em
fase de testnet).*
