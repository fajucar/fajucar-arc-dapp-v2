import { useState, useEffect } from 'react'
import { usePublicClient } from 'wagmi'
import { useArcWriteContract } from '@/hooks/useArcWriteContract'
import { useArcWallet } from '@/hooks/useArcWallet'
import { Copy, Loader2, Check, ChevronDown, ChevronUp } from 'lucide-react'
import { parseUnits } from 'viem'
import toast from 'react-hot-toast'
import { ARC_TESTNET_TOKENS } from '@/config/tokens.arc-testnet'
import { ARCDEX } from '@/config/arcDex'

const TESTNET_TOKENS = ARC_TESTNET_TOKENS.map((t) => ({ symbol: t.symbol, address: t.address }))

const TEST_TOKEN_ABI = [
  { name: 'owner', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'address' }] },
  { name: 'mint', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [] },
] as const

const MINT_AMOUNT = parseUnits('10000', 18)

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      toast.success(`Copied ${label}`)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error('Copy failed')
    }
  }
  return (
    <button
      type="button"
      onClick={handleCopy}
      className="p-1 rounded hover:bg-slate-700/60 text-slate-400 hover:text-slate-200 transition-colors"
      title={`Copy ${label}`}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  )
}

interface TestnetHelperProps {
  embedded?: boolean
}

export function TestnetHelper({ embedded }: TestnetHelperProps = {}) {
  const { address, isConnected } = useArcWallet()
  const publicClient = usePublicClient()
  const { writeContractAsync, isPending } = useArcWriteContract()
  const isConfirming = false
  const [fajuOwner, setFajuOwner] = useState<string | null>(null)
  const [arcxOwner, setArcxOwner] = useState<string | null>(null)

  useEffect(() => {
    if (!publicClient || !address) {
      setFajuOwner(null)
      setArcxOwner(null)
      return
    }
    const check = async () => {
      try {
        const [f, a] = await Promise.all([
          publicClient.readContract({ address: ARCDEX.faju, abi: TEST_TOKEN_ABI, functionName: 'owner' }).catch(() => null),
          publicClient.readContract({ address: ARCDEX.arcx, abi: TEST_TOKEN_ABI, functionName: 'owner' }).catch(() => null),
        ])
        setFajuOwner(f ? String(f).toLowerCase() : null)
        setArcxOwner(a ? String(a).toLowerCase() : null)
      } catch {
        setFajuOwner(null)
        setArcxOwner(null)
      }
    }
    check()
  }, [publicClient, address])

  const canMintFaju = isConnected && address && fajuOwner === address.toLowerCase()
  const canMintArcx = isConnected && address && arcxOwner === address.toLowerCase()

  const handleMint = async (tokenSymbol: 'FAJU' | 'ARCX') => {
    if (!address) return
    const t = ARC_TESTNET_TOKENS.find((x) => x.symbol === tokenSymbol)
    const tokenAddr = t?.address ?? (tokenSymbol === 'FAJU' ? ARCDEX.faju : ARCDEX.arcx)
    const toastId = toast.loading(`Minting ${tokenSymbol}...`)
    try {
      const hash = await writeContractAsync({
        address: tokenAddr,
        abi: TEST_TOKEN_ABI,
        functionName: 'mint',
        args: [address, MINT_AMOUNT],
      })
      toast.dismiss(toastId)
      toast.loading('Confirming...', { id: 'mint-confirm' })
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash })
        toast.dismiss('mint-confirm')
        toast.success(`${tokenSymbol} minted`)
      }
    } catch (err: unknown) {
      toast.dismiss(toastId)
      toast.dismiss('mint-confirm')
      const msg = (err as { shortMessage?: string; message?: string })?.shortMessage || (err as { message?: string })?.message
      toast.error(msg || 'Mint failed')
    }
  }

  const [stablecoinsOpen, setStablecoinsOpen] = useState(false)

  const mainTokens = TESTNET_TOKENS.slice(0, 2) // FAJU, ARCX
  const stablecoinTokens = TESTNET_TOKENS.slice(2) // USDC, EURC

  const content = (
    <>
      {!embedded && <h3 className="text-sm font-semibold text-slate-300 mb-3">Token addresses</h3>}
      <div className="space-y-1.5 text-xs">
        {mainTokens.map(({ symbol, address: addr }) => (
          <div key={symbol} className="flex items-center gap-2 font-mono">
            <span className="text-slate-300 shrink-0 w-10">{symbol}:</span>
            <span className="min-w-0 truncate text-slate-400" title={addr}>{addr}</span>
            <CopyButton text={addr} label={symbol} />
          </div>
        ))}
        <div>
          <button
            type="button"
            onClick={() => setStablecoinsOpen(!stablecoinsOpen)}
            className="flex items-center gap-1.5 text-slate-500 hover:text-slate-300 text-xs py-0.5 transition-colors"
          >
            {stablecoinsOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            Show stablecoin addresses
          </button>
          {stablecoinsOpen && (
            <div className="mt-1.5 space-y-1.5 pl-0">
              {stablecoinTokens.map(({ symbol, address: addr }) => (
                <div key={symbol} className="flex items-center gap-2 font-mono">
                  <span className="text-slate-300 shrink-0 w-10">{symbol}:</span>
                  <span className="min-w-0 truncate text-slate-400" title={addr}>{addr}</span>
                  <CopyButton text={addr} label={symbol} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {(canMintFaju || canMintArcx) && (
        <div className="mt-3 pt-3 border-t border-slate-700/50 flex flex-wrap gap-2">
          {canMintFaju && (
            <button
              type="button"
              onClick={() => handleMint('FAJU')}
              disabled={isPending || isConfirming}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-cyan-500/20 text-cyan-300 hover:bg-amber-500/30 border border-cyan-500/40 disabled:opacity-50"
            >
              {(isPending || isConfirming) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Mint FAJU
            </button>
          )}
          {canMintArcx && (
            <button
              type="button"
              onClick={() => handleMint('ARCX')}
              disabled={isPending || isConfirming}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-cyan-500/20 text-cyan-300 hover:bg-amber-500/30 border border-cyan-500/40 disabled:opacity-50"
            >
              {(isPending || isConfirming) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Mint ARCX
            </button>
          )}
        </div>
      )}
    </>
  )

  if (embedded) {
    return <div className="space-y-3">{content}</div>
  }

  return (
    <div className="rounded-2xl border border-slate-700/40 bg-slate-800/20 p-4">
      {content}
    </div>
  )
}
