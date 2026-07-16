# Resumo da Sessão — FajuARC DApp

> Para retomar: peça ao assistente "leia o RESUMO-SESSAO.md" no começo da próxima conversa.

## Contexto do projeto
- App: DApp na Arc Testnet (chainId 5042002), USDC é o token de gas nativo.
- Frontend: Vite (porta **3000**). Backend: Express (porta **3002**). Rodar com `npm run dev`.
- USDC ERC-20: `0x3600000000000000000000000000000000000000`, **6 decimais**.
- RPC: `https://rpc.testnet.arc.network`.

## O que foi feito nesta sessão

### 1. Porta do frontend
- Ajustada de volta para **3000** (vite.config.ts). Backend em 3002.
- Se a porta 3000 estiver ocupada: matar o processo (`netstat -ano | findstr :3000` → `taskkill /F /PID <pid>`).

### 2. Tentativa de trocar Claude → Gemini (REVERTIDO)
- Tentamos migrar `server/agent.mjs` para Google Gemini.
- **Falhou**: a chave gratuita do Gemini (GEMINI_API_KEY) retorna 404 em todos os modelos
  (gemini-2.0-flash-exp, gemini-1.5-flash, gemini-pro). Chave gratuita não funciona.
- **Revertido para Claude (Anthropic)** — usa `ANTHROPIC_API_KEY`, modelo `claude-sonnet-4-6`.
- Estado atual: `server/agent.mjs` está de volta com Anthropic. ✅

### 3. Bug dos pagamentos agendados (RESOLVIDO — causa raiz identificada)
- **Sintoma**: agendamentos falhavam com `Circle API error: insufficient asset amount`.
- **Causa raiz**: a API de saldo do Circle tem uma falha de indexação na ARC-TESTNET —
  retorna `tokenBalances: []` mesmo com saldo real on-chain. Confirmado via curl (as Circle
  wallets retornavam balances vazios). Isso é agravado pelo modelo de "decimais duplos" do
  USDC na Arc (nativo=18 decimais, ERC-20=6 decimais) — documentado em
  https://docs.arc.network/arc/references/evm-differences
- **Correção (já no código)**: o `server/scheduler.mjs` agora usa `AUTOMATION_SIGNER=viem`
  (default) — assina direto com uma EOA dedicada (`server/signer-viem.mjs`) e lê saldo
  on-chain via `balanceOf` (`server/onchain.mjs`), nunca pela API do Circle.
- A carteira do bot (automation wallet viem) é: **`0x15144Ace9C2E1D3E1d96e02e562AaFCdBC430C65`**
  (derivada de AUTOMATION_PRIVATE_KEY no .env).

### 4. Melhorias que EU adicionei (revisar consistência depois)
- `server/circle.mjs`: nova função `getWalletUsdcBalance()` (usa API do Circle — a não-confiável).
- `server/agent.mjs`: checagem de saldo ao agendar (B1) + mostra endereço/saldo no
  listScheduledPayments (B2).
- ⚠️ **PROBLEMA CONHECIDO**: essas melhorias usam a API de saldo do Circle, que é justamente
  a fonte não-confiável. Com AUTOMATION_SIGNER=viem, deveriam usar `getUsdcBalance` (on-chain)
  e o endereço `getAutomationSignerAddress()`. **Pendente de ajuste.**

### 5. Recuperação de USDC (CONCLUÍDA)
- A carteira do bot tinha ~48.99 USDC presos. Recuperamos quase tudo agendando envios de
  volta para a carteira do usuário `0xd4de2458b99D029EF7ca75F3087CAD28E17e20A2`.
- Saldo final da carteira do bot: **~0.09 USDC** (poeira, deixar lá).
- Script útil criado: `server/scripts/check-automation-balance.mjs` (mostra saldo on-chain do bot).
- **Aprendizado**: numa chain onde o gas é pago no mesmo token transferido (USDC), checar
  `saldo >= valor` NÃO basta — precisa `saldo >= valor + gas`. Envios de 3.9/3.8 reverteram
  com `transfer amount exceeds balance` mesmo "cabendo", porque o gas saía do mesmo saldo.

## Como usar o bot (comandos no chat)
- **Envio instantâneo** (sai da carteira Privy do usuário `0xd4de...20A2`, usuário assina):
  `Send 5 USDC 0x...`
- **Agendamento** (sai da carteira do BOT `0x1514...0C65`, backend assina sozinho):
  `agenda um envio de 3 usdc para 0x... daqui 1 minuto`

### 6. Correção da margem de gas nos agendamentos (RESOLVIDO)
- **Problema**: a checagem de saldo do scheduler só comparava `saldo >= valor`, ignorando
  que na Arc o gas é pago no mesmo USDC transferido. Envios que "cabiam" revertiam com
  `transfer amount exceeds balance` (ex: 3.9 USDC com saldo de 3.99).
- **Correção** em `server/onchain.mjs` + `server/scheduler.mjs`:
  - Novo `getNativeBalance()` — saldo nativo (18 decimais), de onde o gas sai.
  - Novo `estimateUsdcTransferGasCost()` — estima gas on-chain + 50% de margem.
  - Checagem agora exige `saldo nativo >= valor + gas` (em unidades nativas 18 dec).
  - Se estimativa de gas falhar, usa reserva fixa de 0.01 USDC.
  - Mensagem de erro clara explicando o modelo de gas em USDC da Arc.
- **Validado** contra a Arc: 0.05 passa, 0.088 (com saldo 0.089) é bloqueado antes de reverter.

## TAREFAS PENDENTES (próxima sessão)

### A) Popup de notificação em qualquer página (pedido do usuário)
- O usuário quer que o aviso de pagamento agendado apareça em QUALQUER tela, não só no Chat.
- **Descoberta**: a arquitetura JÁ EXISTE e parece correta:
  - `main.tsx` → `<Toaster />` global (react-hot-toast)
  - `src/components/Layout/Layout.tsx` → monta `useTransactionNotifications()` na raiz
  - `src/hooks/useTransactionNotifications.ts` → escuta SSE, dispara toasts globais
  - `src/lib/notify.tsx` → toasts (pending/executed/failed)
  - backend: `server/index.mjs` GET /api/notifications/stream (filtra por address)
- **Suspeita da causa**: o `address` do `useArcWallet()` no Layout pode ser diferente do
  `notifyAddress` gravado no pagamento (que o backend usa para filtrar o broadcast).
  INVESTIGAR essa diferença de endereço.

### B) Prefund on-chain para agendamentos (ideia do usuário — RECOMENDADA)
- Ideia: quando o usuário agenda, no MESMO momento (ele está no navegador) ele assina um
  envio da SUA carteira `0xd4de...20A2` → carteira do bot. Os fundos ficam "estacionados"
  no bot e o pagamento agendado nunca falha por saldo.
- Reaproveita o fluxo de envio instantâneo (usuário já assina transfer via Privy).
- Alternativa mais "pura": approve + transferFrom (fundos ficam com o usuário até a hora).
- **Próximo passo**: investigar o handler `sendUSDC` no agent.mjs e o fluxo de assinatura
  Privy no frontend, para montar plano de implementação.

### C) Ajustar melhorias B1/B2 para usar saldo on-chain
- Trocar `getWalletUsdcBalance` (Circle) por `getUsdcBalance` (on-chain) nas checagens que
  adicionei, e olhar o endereço do signer viem, para ficar consistente com a correção real.

## DECISÃO DE ARQUITETURA: pagamento agendado sai da carteira DO USUÁRIO (Privy Session Signers)

### Decisão tomada
- O usuário quer que o pagamento agendado saia da carteira Privy que ele logou
  (`0xd4de2458b99D029EF7ca75F3087CAD28E17e20A2`, embedded wallet), NÃO da carteira do bot.
- A carteira Privy é embedded (usuário não guarda a chave; autoriza via popup "Approve transfer").
- **Solução escolhida: Privy Session Signers / Delegated Actions** — recurso oficial do Privy
  feito exatamente para "app executa transações da carteira do usuário mesmo offline"
  (ex: limit orders, bots de Telegram). Doc: https://docs.privy.io/wallets/using-wallets/signers/quickstart
- Saldo atual da carteira do usuário: ~259.47 USDC.

### Como funciona (fluxo)
1. Dev cria uma chave de autorização do app (par EC via openssl).
2. Registra a public key no Privy Dashboard como "key quorum" (threshold 1).
3. Usuário autoriza UMA vez (popup Privy) → app vira "signer" da carteira dele (`addSigners`).
4. Backend assina `transfer` da carteira do usuário no horário agendado, SEM popup, mesmo offline.
5. (Recomendado) Policy limitando: só USDC, valor máximo, expiração — segurança.

### PASSOS MANUAIS (só o Fábio pode fazer — Dashboard/CLI)
1. Gerar chave de autorização localmente:
   `openssl ecparam -name prime256v1 -genkey -noout -out private.pem && openssl ec -in private.pem -pubout -out public.pem`
   - Guardar as duas chaves com segurança (Privy NÃO recupera a private key).
2. Dashboard Privy → Authorization keys (https://dashboard.privy.io/apps?authorization-keys)
   → New key → "Register key quorum instead" → colar a PUBLIC key → threshold 1 → nomear.
   - **SALVAR o `id` do key quorum** (usado no addSigners e no backend).
3. (Opcional/recomendado) Criar uma Policy: só permite `transfer` de USDC, valor máx, expiração.
   - Salvar o `policyId`.
4. Guardar a PRIVATE key da chave de autorização no `.env` do backend (ex: PRIVY_AUTHORIZATION_KEY).

### PROGRESSO (feito nesta sessão)
- ✅ Key quorum criado no Privy (via "Create new key"): ID = `py0n712hv4siiiwvgxfu45jv`
- ✅ SDK `@privy-io/node` instalado (com --legacy-peer-deps)
- ✅ `src/config/privy.ts`: `createOnLogin` mudado para `'all-users'`
- ✅ Variáveis adicionadas ao `.env` (PRIVY_KEY_QUORUM_ID, PRIVY_APP_ID já preenchidos)
- ⏳ FALTA o Fábio colar no .env: PRIVY_APP_SECRET e PRIVY_AUTHORIZATION_KEY (wallet-auth:MIGH...)
  - A authorization private key só aparece 1x no modal "Save new key" — se perdeu, criar outra.
  - O App Secret também só aparece 1x — se não tiver guardado, criar novo (máx 5 por app).

### PROGRESSO ADICIONAL (sessão de 05/jul continuação)
- ✅ TODAS as 4 variáveis do Privy preenchidas no .env:
  - PRIVY_APP_ID, PRIVY_APP_SECRET (novo, criado hoje, termina em JTSo),
    PRIVY_AUTHORIZATION_KEY (wallet-auth:...), PRIVY_KEY_QUORUM_ID=ejiaf2es4o4zycvc52iqmm9h
- ✅ Validado que o PrivyClient instancia OK com app id/secret.
- ✅ Inspecionado o SDK: método de envio é `privy.walletsService.ethereum.sendTransaction(...)`
  (também existe signTransaction, rawSign). authorizationContext carrega a chave delegada.
- ✅ Criado `server/signer-privy.mjs` — sendUsdcFromUserWallet({fromAddress,toAddress,amountHuman}).
  ⚠️ NÃO TESTADO on-chain ainda (teste real gastaria USDC da carteira do usuário). A assinatura
     exata de sendTransaction/authorizationContext pode precisar de ajuste na 1ª execução real.
- ⚠️ SEGURANÇA: a PRIVY_AUTHORIZATION_KEY foi colada no chat durante a config. Ao final,
  criar uma nova key no Privy, trocar no .env e deletar a exposta. (Quorum atual: ejiaf2es4o4zycvc52iqmm9h)

### PEÇAS JÁ CRIADAS (prontas, faltam conectar)
- ✅ `server/signer-privy.mjs` — sendUsdcFromUserWallet (backend, via @privy-io/node).
- ✅ `src/hooks/useScheduledPaymentSigner.ts` — grantSigner() usa useSessionSigners.addSessionSigners.
  Nota: API da v3.29 é `useSessionSigners` → `addSessionSigners({address, signers:[{signerId}]})`.
- ✅ `.env`: adicionado VITE_PRIVY_KEY_QUORUM_ID (público, p/ frontend).
- ✅ SDK Node: método de envio = `privy.walletsService.ethereum.sendTransaction({address, caip2, transaction, authorizationContext})`.

### ✅✅✅ FUNCIONOU (05/jul) — pagamento sai da carteira do usuário via Privy!
- Teste real confirmado on-chain: tx 0x5a64e18eb0f7e3cd995bb5c02a3983ff18ffcecb521a739e1ceb3bf4051d60a9
  from=0xd4de...20A2 (carteira do usuário), status ok. NÃO usou a carteira do bot.
- Integrações feitas: scheduler.mjs (AUTOMATION_SIGNER=privy), agent.mjs (branch privy +
  needsSessionSigner), scheduledPayments.mjs (campo senderAddress), AgentChat.tsx (grantSigner),
  useScheduledPaymentSigner.ts (addSessionSigners), signer-privy.mjs (envio).
- AUTOMATION_SIGNER=privy está ativo no .env.

### BUGS RESOLVIDOS NO CAMINHO (úteis pro artigo)
1. `privy.walletsService.ethereum.sendTransaction is not a function` → o certo é
   `walletsService.ethereumService.sendTransaction(walletId, input)` (.ethereum é função, não objeto).
2. sendTransaction é keyed por WALLET_ID, não address → resolver via
   `privy.walletsService._client.wallets.getWalletByAddress({ address })` (SEM chain_type).
3. Input correto: `{ caip2:'eip155:5042002', params:{ transaction:{to,data,value,chain_id} },
   authorization_context:{ authorization_private_keys:[KEY] } }`.
4. 🔑 App Secret PRECISA do prefixo `privy_app_secret_` — sem ele dá 401 Invalid app secret.
5. addSessionSigners lança "Duplicate signer(s)" se já autorizado → tratar como sucesso, não erro.

### FALTA / MELHORAR (próximos passos)
- ✅ Fluxo completo pelo chat testado (agendar → scheduler executa no horário via Privy). FUNCIONA.
- ✅ Checagem de gas JÁ cobre o caminho privy — resolveExecutionAddress retorna a carteira do
  usuário (payment.senderAddress) e a checagem saldo>=valor+gas roda antes de todos os signers.
  (Correção de anotação: NÃO é pendência.)
- ✅ Envio de tokens além de USDC (EURC etc.) como transfer direto — corrigido (era swap antes).
  Confirmado on-chain: EURC via FiatTokenV2_2 transfer, sai de 0xd4de...20A2.
- ✅ SEGURANÇA RESOLVIDA: chave rotacionada. Novo quorum = aizicr4jj1j5wj9ylyigg620 (v3),
  nova PRIVY_AUTHORIZATION_KEY no .env (sufixo IpVidXW9). Testado e funcionando
  (tx 0x5ad5c4eaaf97065171f700e3b09c3287d0540d6931edd814bc7ca33f89cbec21).
  PENDENTE (manual, no Dashboard): deletar as keys antigas ejiaf2es... (exposta) e py0n712... (órfã).
- (opcional) Limpar notificações de "failed" antigas do scheduled-payments-db.json.
- (opcional) Agendamento só suporta USDC hoje (validação no scheduler). Se quiser agendar EURC etc.,
  precisaria generalizar o scheduler como fizemos no envio instantâneo.

### (histórico) FALTA CONECTAR — 3 pontos de integração — JÁ FEITO acima
1. Backend scheduler (`scheduler.mjs`): adicionar AUTOMATION_SIGNER='privy' que chama
   sendUsdcFromUserWallet, enviando da carteira Privy do usuário (payment.notifyAddress ou um novo
   campo payment.senderAddress). Manter viem/circle como fallback atrás da flag.
2. Backend `agent.mjs` (handler schedulePayment): gravar o endereço Privy do usuário como origem
   do pagamento + retornar flag `needsSessionSigner` (+ quorum id) pro frontend.
3. Frontend `AgentChat.tsx`: ao receber needsSessionSigner, chamar grantSigner(walletAddress) — popup.
4. Reaproveitar a checagem de gas (item 6) sobre a carteira do usuário.
5. Testar de ponta a ponta (1 agendamento pequeno) — conferir no ArcScan que saiu da carteira do usuário.
   ⚠️ 1º teste real vai validar a assinatura exata de sendTransaction/authorizationContext no signer-privy.mjs.

### PASSOS DE CÓDIGO (assistente faz — depois dos passos manuais)
- `src/config/privy.ts`: mudar `createOnLogin: 'users-without-wallets'` → `'all-users'`.
- Frontend: chamar `addSigners()` (hook `useSigners`) quando o usuário criar o 1º agendamento
  — popup único de autorização. Passar o key quorum id (+ policyId se houver).
- Backend: instalar/usar o Privy Node SDK; assinar requisições à API do Privy com a
  authorization key; no `scheduler.mjs`, quando o pagamento for da carteira do usuário,
  executar o `transfer` via Privy (em vez do signer-viem do bot).
- Precisa decidir: manter o signer-viem (bot) como fallback? Provavelmente sim, atrás de flag.
- `.env`: PRIVY_AUTHORIZATION_KEY, PRIVY_KEY_QUORUM_ID, (PRIVY_POLICY_ID).
- Guardar no registro do pagamento QUE carteira/assinante usar (bot viem vs Privy do usuário).

### Observações
- Ainda é preciso USDC pra gas — mas agora sai da própria carteira do usuário (que tem saldo),
  então a checagem de gas que implementamos (item 6) continua válida e útil.
- Session Signers é superior a prefund e approve+transferFrom para este caso porque os fundos
  ficam 100% na carteira do usuário e não precisa custodiar nada no bot.

## Ideia de post/artigo
- O usuário quer escrever um post sobre o bug. Ângulo técnico já mapeado:
  bug (insufficient asset) → causa raiz (indexer do Circle + decimais duplos do USDC na Arc)
  → correção (signer viem + saldo on-chain). Fontes: docs.arc.network (evm-differences,
  contract-addresses, gas-and-fees, integrate).
