import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { Lock, Sparkles } from 'lucide-react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { useWalletClient, useChainId } from 'wagmi'
import { createPublicClient, http, fallback, getAddress } from 'viem'
import { arcTestnet } from '@/config/chains'
import { useArcWallet } from '@/hooks/useArcWallet'
import { useArcWriteContract } from '@/hooks/useArcWriteContract'
import { ARC_COLLECTION } from '@/config/arcCollection'
import { ARC_TESTNET, FAJUCAR_COLLECTION_ADDRESS } from '@/config/contracts'
import FajucarCollectionAbi from '@/abis/FajucarCollection.json'
import { loadProfile } from '@/components/Agents/agentConstants'

const API_BASE = 'http://localhost:3002/api/explorer'

// Dedicated Arc Testnet client — same pattern as MyNFTsPage. Avoids usePublicClient()
// returning undefined when the connected wallet is on a different chain, which would
// prevent checkOwnership from reading on-chain NFT state after page reload.
const arcClient = createPublicClient({
  chain: arcTestnet,
  transport: fallback([
    http('https://rpc.testnet.arc.network'),
    http('https://rpc.blockdaemon.testnet.arc.network'),
    http('https://rpc.drpc.testnet.arc.network'),
    http('https://rpc.quicknode.testnet.arc.network'),
  ]),
})

type Phase = {
  modelId: number
  shortName: string
  item: typeof ARC_COLLECTION[0]
  rarity: { label: string; className: string }
  lockReason: string
}

function getPhases(t: (key: string) => string): Phase[] {
  return [
    {
      modelId: 1,
      shortName: 'Explorer',
      item: { ...ARC_COLLECTION[0], description: t('agentAchievements.descriptions.explorer') },
      rarity: { label: t('agentAchievements.rarity.common'), className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' },
      lockReason: t('agentAchievements.lockReasons.connectWallet'),
    },
    {
      modelId: 2,
      shortName: 'Guardian',
      item: { ...ARC_COLLECTION[1], description: t('agentAchievements.descriptions.guardian') },
      rarity: { label: t('agentAchievements.rarity.uncommon'), className: 'border-blue-500/30 bg-blue-500/10 text-blue-300' },
      lockReason: t('agentAchievements.lockReasons.configureAgent'),
    },
    {
      modelId: 3,
      shortName: 'Builder',
      item: { ...ARC_COLLECTION[2], description: t('agentAchievements.descriptions.builder') },
      rarity: { label: t('agentAchievements.rarity.rare'), className: 'border-purple-500/30 bg-purple-500/10 text-purple-300' },
      lockReason: t('agentAchievements.lockReasons.makeTransaction'),
    },
  ]
}

function isValidContractAddress(value: string | undefined): value is `0x${string}` {
  if (!value) return false
  const s = value.trim()
  return s.startsWith('0x') && s.length === 42
}

// ArcScan API response types (blockscout-compatible)
type ArcScanAddress = { hash: string }
type ArcScanToken  = { address_hash: string }
type ArcScanTotal  = { token_id?: string }
type ArcScanTransfer = {
  from:             ArcScanAddress
  token:            ArcScanToken
  total:            ArcScanTotal
  transaction_hash: string
}

const ARCSCAN_API     = 'https://testnet.arcscan.app/api/v2'
const MINTBYID_SEL    = '0x3c51c82b' // keccak256("mintById(uint256)")[:4]
const ZERO_ADDRESS    = '0x0000000000000000000000000000000000000000'

export function AgentAchievements() {
  const { t } = useTranslation()
  const { address, signingAddress, isConnected, authMethod, pendingGoogleWallet, ready } = useArcWallet()
  const { writeContractAsync } = useArcWriteContract()
  const { data: walletClient } = useWalletClient()
  const chainId = useChainId()

  const PHASES = getPhases(t)

  const contractAddress = FAJUCAR_COLLECTION_ADDRESS
  const hasCollection = isValidContractAddress(contractAddress)

  // Diagnostic: log every render so we can confirm address + ready state in the console
  console.log('[Achievements] render —', { address, ready, contractAddress: contractAddress || '(empty)' })

  const [ownedModelIds, setOwnedModelIds] = useState<Set<number>>(new Set())
  const [mintingId, setMintingId] = useState<number | null>(null)
  const [hasAgentConfig, setHasAgentConfig] = useState(false)
  const [txCount, setTxCount] = useState<number | null>(null)
  const [hoveredId, setHoveredId] = useState<number | null>(null)

  // Phase 2: agent config saved in localStorage
  useEffect(() => {
    if (!address) { setHasAgentConfig(false); return }
    setHasAgentConfig(loadProfile(address) !== null)
  }, [address])

  // Phase 3: at least 1 transaction on Arc Testnet
  useEffect(() => {
    if (!address) { setTxCount(null); return }
    let cancelled = false
    fetch(`${API_BASE}/address/${address}`)
      .then(r => r.ok ? r.json() : { items: [] })
      .then(data => { if (!cancelled) setTxCount((data.items ?? []).length) })
      .catch(() => { if (!cancelled) setTxCount(0) })
    return () => { cancelled = true }
  }, [address])

  // Check which models are already minted.
  // FajucarCollection's tokenOfOwnerByIndex is broken (enumerable out of sync with balanceOf)
  // and all tokens share the same IPFS tokenURI, so we cannot distinguish model on-chain.
  // Instead we query ArcScan token-transfer history, decode modelId from each mint tx's
  // raw_input (mintById selector 0x3c51c82b), then verify current ownership via ownerOf.
  useEffect(() => {
    if (!ready || !address || !isValidContractAddress(contractAddress)) return
    const contract = contractAddress
    let cancelled = false

    const checkOwnership = async () => {
      try {
        console.log('[Achievements] checkOwnership — address:', address, 'contract:', contract)

        // ── Step 1: get all ERC-721 transfers for this address ───────────
        const transfersRes = await fetch(
          `${ARCSCAN_API}/addresses/${address}/token-transfers?type=ERC-721`,
          { signal: AbortSignal.timeout(10000) }
        )
        if (!transfersRes.ok) {
          console.warn('[Achievements] ArcScan token-transfers failed:', transfersRes.status)
          return
        }
        const { items = [] } = await transfersRes.json() as { items?: ArcScanTransfer[] }

        // Filter: minted (from=0x0) from this specific contract
        const mints = items.filter(item =>
          item.from?.hash?.toLowerCase()          === ZERO_ADDRESS &&
          item.token?.address_hash?.toLowerCase() === contract.toLowerCase() &&
          !!item.transaction_hash &&
          !!item.total?.token_id
        )
        console.log('[Achievements] mints found:', mints.length)

        if (cancelled) return
        if (mints.length === 0) { setOwnedModelIds(new Set()); return }

        // ── Step 2: decode modelId from each mint tx's raw_input ─────────
        // Stop early once all 3 model types have a candidate token.
        const modelToToken = new Map<number, bigint>()
        for (const mint of mints) {
          if (cancelled || modelToToken.size === 3) break
          const txHash  = mint.transaction_hash
          const tokenId = BigInt(mint.total.token_id!)
          try {
            const txRes = await fetch(`${ARCSCAN_API}/transactions/${txHash}`, { signal: AbortSignal.timeout(8000) })
            if (!txRes.ok) continue
            const tx = await txRes.json() as { raw_input?: string }
            const raw = tx?.raw_input ?? ''
            if (!raw.startsWith(MINTBYID_SEL)) continue
            const modelId = parseInt(raw.slice(-64), 16)
            console.log(`[Achievements] tx ${txHash.slice(0, 10)}… tokenId ${tokenId} → modelId ${modelId}`)
            if (modelId >= 1 && modelId <= 3 && !modelToToken.has(modelId)) {
              modelToToken.set(modelId, tokenId)
            }
          } catch (err) {
            console.warn('[Achievements] tx fetch error:', err)
          }
        }
        console.log('[Achievements] modelToToken:', [...modelToToken.entries()].map(([m, t]) => `${m}→${t}`))

        // ── Step 3: confirm current ownership via ownerOf ─────────────────
        const modelIds = new Set<number>()
        for (const [modelId, tokenId] of modelToToken) {
          if (cancelled) return
          try {
            const owner = await arcClient.readContract({
              address: contract,
              abi: FajucarCollectionAbi as never,
              functionName: 'ownerOf',
              args: [tokenId],
            }) as string
            if (owner.toLowerCase() === address.toLowerCase()) {
              modelIds.add(modelId)
            } else {
              console.log(`[Achievements] tokenId ${tokenId} (model ${modelId}) no longer owned`)
            }
          } catch (err) {
            console.warn(`[Achievements] ownerOf(${tokenId}) error:`, err)
          }
        }

        console.log('[Achievements] final owned modelIds:', [...modelIds])
        if (!cancelled) setOwnedModelIds(modelIds)
      } catch (err) {
        console.error('[Achievements] checkOwnership error:', err)
      }
    }

    checkOwnership()
    return () => { cancelled = true }
  }, [ready, address, contractAddress])

  const phaseUnlocked = [
    isConnected,
    hasAgentConfig,
    (txCount ?? 0) > 0,
  ]
  const unlockedCount = phaseUnlocked.filter(Boolean).length

  // Toast when a phase transitions from locked → unlocked
  const prevUnlockedRef = useRef<boolean[] | null>(null)
  useEffect(() => {
    const prev = prevUnlockedRef.current
    if (prev) {
      phaseUnlocked.forEach((unlocked, i) => {
        if (unlocked && !prev[i]) {
          toast.success(`🎉 You unlocked the Arc ${PHASES[i].shortName}!`)
        }
      })
    }
    prevUnlockedRef.current = phaseUnlocked
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, hasAgentConfig, txCount])

  const handleMint = async (phase: Phase) => {
    if (pendingGoogleWallet) {
      toast.error('Carteira em criação. Aguarde alguns segundos e tente novamente.')
      return
    }
    if (mintingId !== null) return
    if (!address || !isConnected) {
      toast.error('Conecte sua carteira primeiro')
      return
    }
    if (authMethod === 'wallet' && chainId !== ARC_TESTNET.chainId) {
      toast.error(`Mude para ${ARC_TESTNET.chainName} (Chain ID: ${ARC_TESTNET.chainId})`)
      return
    }
    if (!hasCollection) {
      toast.error('Coleção não configurada.')
      return
    }
    if (authMethod === 'wallet' && !walletClient) {
      toast.error('Carteira não pronta.')
      return
    }

    const nftContractAddress = getAddress(contractAddress)
    setMintingId(phase.modelId)
    try {
      toast.loading(`Minting ${phase.item.name}...`, { id: 'achievement-mint' })

      await arcClient.simulateContract({
        address: nftContractAddress,
        abi: FajucarCollectionAbi as never,
        functionName: 'mintById',
        args: [BigInt(phase.modelId)],
        account: (authMethod === 'social' ? signingAddress : address) ?? address,
      })

      const hash = await writeContractAsync({
        address: nftContractAddress,
        abi: FajucarCollectionAbi as never,
        functionName: 'mintById',
        args: [BigInt(phase.modelId)],
      })

      if (authMethod === 'wallet') {
        await arcClient.waitForTransactionReceipt({ hash })
      }

      setOwnedModelIds(prev => new Set([...prev, phase.modelId]))
      const explorerUrl = `${arcTestnet.blockExplorers.default.url}/tx/${hash}`
      toast.success(
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span>Minted {phase.item.name}!</span>
          <a
            href={explorerUrl}
            target="_blank"
            rel="noreferrer"
            style={{ fontSize: 12, color: '#22d3ee', textDecoration: 'underline' }}
            onClick={e => e.stopPropagation()}
          >
            View on Explorer →
          </a>
        </div>,
        { id: 'achievement-mint', duration: 8000 }
      )
    } catch (err: unknown) {
      let message = 'Failed to mint NFT'
      if (typeof err === 'object' && err !== null && 'shortMessage' in err) {
        message = String((err as { shortMessage: string }).shortMessage)
      } else if (err instanceof Error && err.message) {
        message = err.message
      }
      if (message.toLowerCase().includes('rejected') || message.toLowerCase().includes('denied')) {
        message = 'Transaction rejected by user.'
      }
      toast.error(message, { id: 'achievement-mint', duration: 5000 })
    } finally {
      setMintingId(null)
    }
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between mb-1.5 shrink-0">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
          {t('agentAchievements.title')}
        </p>
        <p className="text-xs font-semibold text-cyan-300">
          {t('agentAchievements.unlocked', { count: unlockedCount, total: PHASES.length })}
        </p>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 w-full rounded-full bg-slate-800/80 overflow-hidden mb-3 shrink-0">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-orange-400"
          initial={{ width: 0 }}
          animate={{ width: `${(unlockedCount / PHASES.length) * 100}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>

      <div className="grid grid-cols-3 gap-3 flex-1 min-h-0 overflow-visible">
        {PHASES.map((phase, i) => {
          const unlocked = phaseUnlocked[i]
          const minted = ownedModelIds.has(phase.modelId)
          const isMintingThis = mintingId === phase.modelId
          const locked = !unlocked

          const isHovered = hoveredId === phase.modelId

          return (
            <motion.div
              key={phase.modelId}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              whileHover={{ scale: 1.12, y: -8 }}
              transition={{ duration: 0.3, ease: 'easeOut', delay: i * 0.08 }}
              onMouseEnter={() => setHoveredId(phase.modelId)}
              onMouseLeave={() => setHoveredId(null)}
              style={{
                position: 'relative',
                zIndex: isHovered ? 20 : 1,
                boxShadow: isHovered ? '0 0 40px rgba(0,200,255,0.6)' : undefined,
              }}
              className={`group h-full rounded-2xl border flex flex-col
                ${locked
                  ? 'border-slate-700/40 bg-slate-900/40'
                  : minted
                    ? 'border-emerald-500/30 bg-slate-900/60'
                    : 'border-cyan-400/50 bg-slate-900/60 shadow-[0_0_24px_rgba(34,211,238,0.25)]'
                }
                ${isHovered ? '!border-cyan-300/80' : ''}
              `}
            >
              {/* Art — fills most of the card */}
              <div className="relative flex-1 min-h-0 w-full rounded-t-2xl bg-gradient-to-br from-cyan-500/10 to-blue-500/10 overflow-hidden">
                <img
                  src={phase.item.image}
                  alt={phase.item.name}
                  className={`absolute inset-0 w-full h-full object-cover object-center transition-all duration-300 ${locked ? 'grayscale opacity-40' : ''}`}
                />
                {/* Subtle bottom gradient for legibility */}
                <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/50 to-transparent pointer-events-none" />
                {locked && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                    <div className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center">
                      <Lock className="h-5 w-5 text-slate-300" />
                    </div>
                  </div>
                )}
                {minted && (
                  <span className="absolute top-2 right-2 inline-flex items-center rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-300 backdrop-blur-sm">
                    ✓ Minted
                  </span>
                )}
                {/* Description overlay — revealed on hover */}
                <div className="absolute inset-x-0 bottom-0 max-h-full overflow-y-auto bg-black/80 backdrop-blur-sm px-2.5 py-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 ease-in-out pointer-events-none">
                  <p className="text-[10px] leading-snug text-slate-200">
                    {phase.item.description}
                  </p>
                </div>
              </div>

              {/* Body */}
              <div className="p-2.5 flex flex-col gap-1.5 shrink-0">
                <div className="flex items-center justify-between gap-1.5">
                  <p className={`text-sm font-bold truncate ${locked ? 'text-slate-500' : 'text-white'}`}>
                    {phase.shortName}
                  </p>
                  <span className={`shrink-0 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-tight ${locked ? 'border-slate-700/50 bg-slate-800/40 text-slate-500' : phase.rarity.className}`}>
                    {phase.rarity.label}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => handleMint(phase)}
                  disabled={locked || minted || isMintingThis}
                  title={locked ? phase.lockReason : undefined}
                  className={`w-full rounded-lg px-2 py-1.5 text-[10px] font-semibold transition-all leading-tight
                    ${minted
                      ? 'bg-slate-800/60 text-emerald-300/70 cursor-not-allowed'
                      : locked
                        ? 'bg-slate-800/60 text-slate-500 cursor-not-allowed line-clamp-2'
                        : isMintingThis
                          ? 'bg-orange-500/20 border border-orange-400/40 text-orange-200 cursor-wait animate-pulse'
                          : 'bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:shadow-[0_0_14px_rgba(251,146,60,0.45)]'
                    }
                  `}
                >
                  {minted
                    ? `${t('agentAchievements.minted')} ✓`
                    : locked
                      ? phase.lockReason
                      : isMintingThis
                        ? t('agentAchievements.minting')
                        : (
                          <span className="flex items-center justify-center gap-1">
                            <Sparkles className="h-3 w-3" /> {t('agentAchievements.mint')}
                          </span>
                        )}
                </button>
              </div>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}