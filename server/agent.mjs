/**
 * FajuARC Agent Chat Route — POST /api/agent/chat
 *
 * Calls Google Gemini gemini-1.5-flash-latest with function calling enabled.
 * Returns:
 *   { type: 'intent', tool, params, label, assistantContent } — tool chosen, needs confirm
 *   { type: 'text',   message }                              — plain reply
 */

import { Router } from 'express'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { fetchTokenTransfers } from './arcscan.mjs'

const router = Router()

// ── Lazy Gemini client (initialised on first request) ─────────────────────────
let _genAI = null
function getClient(apiKey) {
  if (!_genAI) _genAI = new GoogleGenerativeAI(apiKey)
  return _genAI
}

// ── Tools (Gemini function declarations format) ───────────────────────────────
const TOOLS = [
  {
    name: 'getBalance',
    description: "Check the user's token balances on Arc Testnet.",
    parameters: {
      type: 'object',
      properties: {
        token: {
          type: 'string',
          enum: ['USDC', 'EURC', 'FAJU', 'ARCX', 'QCAD', 'cirBTC'],
          description: 'Token symbol to check. Omit for all balances.',
        },
      },
      required: [],
    },
  },
  {
    name: 'sendUSDC',
    description: "Send USDC from the user's embedded wallet to another address.",
    parameters: {
      type: 'object',
      properties: {
        to:     { type: 'string', description: 'Destination EVM address (0x...)' },
        amount: { type: 'string', description: 'Amount of USDC to send (e.g. "10.5")' },
      },
      required: ['to', 'amount'],
    },
  },
  {
    name: 'swap',
    description: 'Swap tokens on FajuARC DEX (V2 or V3). Uses existing pools on Arc Testnet.',
    parameters: {
      type: 'object',
      properties: {
        tokenIn:  { type: 'string', description: 'Input token symbol (e.g. "USDC")' },
        tokenOut: { type: 'string', description: 'Output token symbol (e.g. "EURC")' },
        amount:   { type: 'string', description: 'Amount of tokenIn to swap' },
      },
      required: ['tokenIn', 'tokenOut', 'amount'],
    },
  },
  {
    name: 'addLiquidity',
    description: 'Add liquidity to a V2 pool on FajuARC.',
    parameters: {
      type: 'object',
      properties: {
        tokenA:  { type: 'string', description: 'First token symbol' },
        tokenB:  { type: 'string', description: 'Second token symbol' },
        amountA: { type: 'string', description: 'Amount of tokenA to provide' },
        amountB: { type: 'string', description: 'Amount of tokenB to provide' },
      },
      required: ['tokenA', 'tokenB', 'amountA', 'amountB'],
    },
  },
  {
    name: 'mintNFT',
    description: 'Mint a FajuARCNFT from the FajucarCollection on Arc Testnet. Use modelId 1 for Arc Explorer, 2 for Arc Guardian, or 3 for Arc Builder.',
    parameters: {
      type: 'object',
      properties: {
        modelId: {
          type: 'string',
          description: 'Model ID to mint: "1" for Arc Explorer, "2" for Arc Guardian, "3" for Arc Builder',
        },
      },
      required: ['modelId'],
    },
  },
  {
    name: 'faucet',
    description: 'Claim FAJU or ARCX test tokens from the on-chain faucet on Arc Testnet.',
    parameters: {
      type: 'object',
      properties: {
        token: {
          type: 'string',
          enum: ['FAJU', 'ARCX'],
          description: 'Which test token to claim',
        },
      },
      required: ['token'],
    },
  },
  {
    name: 'getTransactionHistory',
    description: 'Busca as últimas transações on-chain da carteira do usuário na Arc Testnet (envios, recebimentos, swaps, mints)',
    parameters: {
      type: 'object',
      properties: {
        address: {
          type: 'string',
          description: 'Endereço da carteira (opcional, usa a carteira do usuário atual se não informado)',
        },
        limit: {
          type: 'number',
          description: 'Quantidade de transações a retornar (padrão 5)',
        },
      },
      required: [],
    },
  },
]

// ── Self-introduction instruction ─────────────────────────────────────────────
// Only introduce on the first message of the conversation, or if the user
// explicitly asks who the agent is — never repeat it on every reply.
function introInstruction(n, isFirstMessage) {
  return isFirstMessage
    ? `This is the first message of the conversation: introduce yourself by name and role (e.g. "Olá! Eu sou o ${n}, seu guia explorador na Arc Testnet") before answering.`
    : `This is NOT the first message of the conversation: do NOT introduce yourself or greet the user again. Only restate your name/role if the user explicitly asks who you are. Go straight to the point.`
}

// ── Language-detection / response-language instruction ───────────────────────
// Tells the model to mirror the language of the user's latest message in
// every reply (greetings, explanations, confirmations, everything).
function languageInstruction() {
  return `LANGUAGE: Detect the language of the user's most recent message (Portuguese or English) and respond ENTIRELY in that same language — including greetings, explanations, confirmations and any other text. If the user writes in English, reply in English; if in Portuguese, reply in Portuguese. If the language is unclear or mixed, default to Portuguese.`
}

// ── Lightweight PT/EN language detector for the user's latest message ────────
// Used to localize server-formatted strings (transaction history, time-ago,
// confirmation labels) that are built outside the model's own reply.
function detectLang(text) {
  const s = (text || '').toLowerCase()
  if (!s.trim()) return 'pt'

  // Portuguese-specific diacritics are a strong signal on their own.
  if (/[áàâãéêíóôõúüç]/.test(s)) return 'pt'

  const ptWords = /\b(voc[eê]|qual|quero|enviar|envia|saldo|carteira|meu|minha|est[aá]|n[ãa]o|por favor|obrigad[oa]|ol[aá]|onde|quanto|quanta|como|para|pra|transa[cç][oõ]es|hist[oó]rico|mostre|mostra|troca|trocar|comprar|vender|recebi|recebido)\b/

  const enWords = /\b(the|what|how|send|balance|wallet|please|thanks|thank you|hello|hi|where|much|many|my|transactions|history|show|get|swap|trade|buy|sell|receive|received|mint|need|want|can you)\b/

  const ptHits = (s.match(ptWords) || []).length
  const enHits = (s.match(enWords) || []).length

  return enHits > ptHits ? 'en' : 'pt'
}

// ── System prompts per personality ────────────────────────────────────────────
// Each prompt is a function so agentName and conversation state are injected at request time.
const SYSTEM_PROMPTS = {
  explorer: (n, isFirstMessage) => `Your name is ${n}.
You are an Explorer agent for FajuARC — curious, adventurous, always looking for new opportunities on Arc Testnet.
You love discovering new tokens, pools, and NFTs. Your tone is enthusiastic and encouraging.
You help users explore the DApp and try new things. Keep responses concise (2-3 sentences max for text replies).
Arc Testnet chainId: 5042002. Native gas token: USDC. Available tokens: USDC, EURC, FAJU, ARCX, QCAD, cirBTC.
When the user asks you to perform an on-chain action, always use the appropriate tool rather than just describing it.
You can now look up the user's recent on-chain transaction history (sends, receives, swaps, mints) using the getTransactionHistory tool.
${introInstruction(n, isFirstMessage)}
${languageInstruction()}`,

  trader: (n, isFirstMessage) => `Your name is ${n}.
You are a Trader agent for FajuARC — dry, direct, data-focused. No fluff.
You give concise trading analysis and execute swaps efficiently. Prices, amounts, numbers — that's your language.
Keep text replies to 1-2 sentences. Be blunt but helpful.
Arc Testnet chainId: 5042002. Native gas token: USDC. Available tokens: USDC, EURC, FAJU, ARCX, QCAD, cirBTC.
When the user asks you to perform an on-chain action, always use the appropriate tool rather than just describing it.
You can now look up the user's recent on-chain transaction history (sends, receives, swaps, mints) using the getTransactionHistory tool.
${introInstruction(n, isFirstMessage)}
${languageInstruction()}`,

  builder: (n, isFirstMessage) => `Your name is ${n}.
You are a Builder agent for FajuARC — technical, detailed, loves contracts and protocol mechanics.
You explain what's happening under the hood. You mint NFTs, add liquidity, and interact with smart contracts precisely.
Be informative but concise. Include relevant contract/tx details when helpful.
Arc Testnet chainId: 5042002. Native gas token: USDC. NFT contract: 0x1499947A89Ef05B023176D31191BDC5CCF3d0B7E.
When the user asks you to perform an on-chain action, always use the appropriate tool rather than just describing it.
You can now look up the user's recent on-chain transaction history (sends, receives, swaps, mints) using the getTransactionHistory tool.
${introInstruction(n, isFirstMessage)}
${languageInstruction()}`,

  social: (n, isFirstMessage) => `Your name is ${n}.
You are a Social agent for FajuARC — informal, community-focused, loves connecting people via payments.
Your vibe is friendly and casual. You make DeFi feel easy and fun.
Use emojis occasionally. Keep it light. Help users send USDC and participate in the community.
Arc Testnet chainId: 5042002. Native gas token: USDC.
When the user asks you to perform an on-chain action, always use the appropriate tool rather than just describing it.
You can now look up the user's recent on-chain transaction history (sends, receives, swaps, mints) using the getTransactionHistory tool.
${introInstruction(n, isFirstMessage)}
${languageInstruction()}`,
}

// ── Relative time helper (e.g. "há 2 horas" / "2 hours ago") ─────────────────
function timeAgo(timestamp, lang = 'pt') {
  const diffMs = Date.now() - new Date(timestamp).getTime()
  const mins   = Math.floor(diffMs / 60000)

  if (lang === 'en') {
    if (mins < 1)   return 'just now'
    if (mins < 60)  return `${mins} minute${mins === 1 ? '' : 's'} ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
    const days = Math.floor(hours / 24)
    return `${days} day${days === 1 ? '' : 's'} ago`
  }

  if (mins < 1)   return 'agora mesmo'
  if (mins < 60)  return `há ${mins} minuto${mins === 1 ? '' : 's'}`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `há ${hours} hora${hours === 1 ? '' : 's'}`
  const days = Math.floor(hours / 24)
  return `há ${days} dia${days === 1 ? '' : 's'}`
}

// ── Format ArcScan token-transfers into a chat-friendly transaction list ──────
function formatTransactionHistory(items, address, limit, lang = 'pt') {
  const addr = address.toLowerCase()

  // Detect swaps: same tx hash has both an outgoing and incoming leg for the user
  const byTx = new Map()
  for (const it of items) {
    const arr = byTx.get(it.transaction_hash) ?? []
    arr.push(it)
    byTx.set(it.transaction_hash, arr)
  }

  const formatted = items.slice(0, limit).map(it => {
    const from   = (it.from?.hash ?? '').toLowerCase()
    const to     = (it.to?.hash ?? '').toLowerCase()
    const symbol = it.token?.symbol ?? '???'
    const isNft  = it.token_type === 'ERC-721' || it.token_type === 'ERC-1155'
    const decimals = Number(it.token?.decimals ?? 0)
    const rawValue  = it.total?.value ?? '0'
    const amount = isNft ? '1' : (Number(rawValue) / 10 ** decimals).toString()

    const legs = byTx.get(it.transaction_hash) ?? []
    const hasOut = legs.some(l => (l.from?.hash ?? '').toLowerCase() === addr)
    const hasIn  = legs.some(l => (l.to?.hash ?? '').toLowerCase() === addr)

    let type
    if (from === '0x0000000000000000000000000000000000000000') {
      type = 'mint'
    } else if (hasOut && hasIn) {
      type = 'swap'
    } else if (to === addr) {
      type = 'receive'
    } else if (from === addr) {
      type = 'send'
    } else {
      type = 'other'
    }

    return {
      type,
      token:  symbol,
      amount,
      hash:   it.transaction_hash,
      hashShort: `${it.transaction_hash.slice(0, 6)}...${it.transaction_hash.slice(-4)}`,
      time:   timeAgo(it.timestamp, lang),
    }
  })

  const labelsByLang = {
    pt: { send: 'Enviou', receive: 'Recebeu', swap: 'Trocou', mint: 'Mintou', other: 'Movimentou' },
    en: { send: 'Sent',   receive: 'Received', swap: 'Swapped', mint: 'Minted', other: 'Moved' },
  }
  const labels = labelsByLang[lang] ?? labelsByLang.pt
  const noTxMessage = lang === 'en'
    ? 'No transactions found for this wallet.'
    : 'Nenhuma transação encontrada para essa carteira.'

  const summary = formatted.length === 0
    ? noTxMessage
    : formatted
        .map(t => `${labels[t.type] ?? labels.other} ${t.amount} ${t.token} (${t.hashShort}, ${t.time})`)
        .join('\n')

  return { items: formatted, summary }
}

// ── Human-readable labels for each tool call ─────────────────────────────────
function makeLabel(tool, params, lang = 'pt') {
  const names = { '1': 'Arc Explorer', '2': 'Arc Guardian', '3': 'Arc Builder' }

  if (lang === 'en') {
    switch (tool) {
      case 'getBalance':
        return params.token ? `View ${params.token} balance` : 'View all balances'
      case 'sendUSDC':
        return `Send ${params.amount} USDC to ${params.to.slice(0, 6)}...${params.to.slice(-4)}`
      case 'swap':
        return `Swap ${params.amount} ${params.tokenIn} for ${params.tokenOut}`
      case 'addLiquidity':
        return `Add liquidity: ${params.amountA} ${params.tokenA} + ${params.amountB} ${params.tokenB}`
      case 'mintNFT':
        return `Mint NFT: ${names[params.modelId] ?? `Model ${params.modelId}`}`
      case 'faucet':
        return `Claim tokens from faucet (${params.token})`
      default:
        return tool
    }
  }

  switch (tool) {
    case 'getBalance':
      return params.token ? `Ver saldo de ${params.token}` : 'Ver todos os saldos'
    case 'sendUSDC':
      return `Enviar ${params.amount} USDC para ${params.to.slice(0, 6)}...${params.to.slice(-4)}`
    case 'swap':
      return `Trocar ${params.amount} ${params.tokenIn} por ${params.tokenOut}`
    case 'addLiquidity':
      return `Adicionar liquidez: ${params.amountA} ${params.tokenA} + ${params.amountB} ${params.tokenB}`
    case 'mintNFT':
      return `Mintar NFT: ${names[params.modelId] ?? `Model ${params.modelId}`}`
    case 'faucet':
      return `Receber tokens do faucet (${params.token})`
    default:
      return tool
  }
}

// ── Convert frontend message history to Gemini format ────────────────────────
function toGeminiHistory(messages) {
  const history = []
  for (const msg of messages) {
    if (msg.role === 'user') {
      const text = typeof msg.content === 'string' ? msg.content : ''
      if (text) history.push({ role: 'user', parts: [{ text }] })
    } else if (msg.role === 'assistant') {
      const parts = []
      if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === 'text')     parts.push({ text: block.text })
          if (block.type === 'tool_use') parts.push({ functionCall: { name: block.name, args: block.input } })
        }
      } else if (typeof msg.content === 'string') {
        parts.push({ text: msg.content })
      }
      if (parts.length) history.push({ role: 'model', parts })
    } else if (msg.role === 'user' && Array.isArray(msg.content)) {
      // tool_result blocks
      const parts = msg.content
        .filter(b => b.type === 'tool_result')
        .map(b => ({ functionResponse: { name: b.tool_use_id, response: { result: b.content } } }))
      if (parts.length) history.push({ role: 'user', parts })
    }
  }
  return history
}

// ── Route ─────────────────────────────────────────────────────────────────────
router.post('/chat', async (req, res) => {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim()
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY não configurada no .env' })
  }

  const { messages = [], personality = 'explorer', walletAddress, withdrawalAddress, agentName } = req.body

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: '"messages" array é obrigatório' })
  }

  const name           = (agentName || 'Agente FajuARC').trim()
  const isFirstMessage = messages.length === 1
  const promptFn       = SYSTEM_PROMPTS[personality] ?? SYSTEM_PROMPTS.explorer
  const basePrompt     = promptFn(name, isFirstMessage)
  const walletHint     = walletAddress ? `\nUser wallet: ${walletAddress}` : ''
  const withdrawalHint = withdrawalAddress
    ? `\nUser's withdrawal wallet: ${withdrawalAddress} — when the user mentions "carteira de saque", "minha carteira de saque", "saque" or "withdrawal wallet" as a destination, resolve it automatically to this address: ${withdrawalAddress}.`
    : ''
  const systemPrompt = basePrompt + walletHint + withdrawalHint
  const genAI = getClient(apiKey)

  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      systemInstruction: systemPrompt,
      tools: [{ functionDeclarations: TOOLS }],
    })

    // All messages except the last go into history; last is the new user turn
    const history = toGeminiHistory(messages.slice(0, -1))
    const lastMsg = messages[messages.length - 1]
    const userText = typeof lastMsg.content === 'string' ? lastMsg.content : ''
    const lang = detectLang(userText)

    const chat = model.startChat({ history })
    const result = await chat.sendMessage(userText)
    const response = result.response

    // ── Function call selected ────────────────────────────────────────────────
    const candidate = response.candidates?.[0]
    const parts = candidate?.content?.parts ?? []
    const fnCall = parts.find(p => p.functionCall)

    if (fnCall) {
      const { name, args } = fnCall.functionCall

      // ── Read-only tool: resolve server-side, no user confirmation needed ────
      if (name === 'getTransactionHistory') {
        const address = (args.address || walletAddress || '').trim()
        const limit    = args.limit || 5

        if (!address) {
          const message = lang === 'en'
            ? "I couldn't find your wallet address. Connect your wallet and try again."
            : 'Não encontrei o endereço da sua carteira. Conecte sua carteira e tente novamente.'
          return res.json({ type: 'text', message })
        }

        let summary
        let items
        try {
          const data = await fetchTokenTransfers(address)
          const formatted = formatTransactionHistory(data?.items ?? [], address, limit, lang)
          summary = formatted.summary
          items   = formatted.items
        } catch (err) {
          summary = lang === 'en'
            ? `Error fetching history: ${err.message}`
            : `Erro ao buscar histórico: ${err.message}`
          items   = []
        }

        const followup = await chat.sendMessage([
          { functionResponse: { name, response: { result: summary } } },
        ])
        const message = followup.response.text?.() ?? summary

        return res.json({ type: 'tx-history', message, items, lang })
      }

      const toolUseId = `gemini-fn-${Date.now()}`
      return res.json({
        type:             'intent',
        tool:             name,
        params:           args,
        toolUseId,
        label:            makeLabel(name, args, lang),
        assistantContent: [{ type: 'tool_use', id: toolUseId, name, input: args }],
      })
    }

    // ── Plain text reply ──────────────────────────────────────────────────────
    const text = response.text?.() ?? parts.find(p => p.text)?.text ?? ''
    return res.json({ type: 'text', message: text })

  } catch (err) {
    console.error('[Agent] Gemini error:', err.message)
    return res.status(500).json({ error: err.message ?? 'Erro ao chamar Gemini' })
  }
})

export default router
