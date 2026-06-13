import { useState, useCallback } from 'react'
import { BridgeKit } from '@circle-fin/bridge-kit'
import { createViemAdapterFromProvider } from '@circle-fin/adapter-viem-v2'
import { ExternalLink, Loader2, AlertCircle, ArrowRightLeft } from 'lucide-react'
import toast from 'react-hot-toast'
import { CONSTANTS } from '@/config/constants'

// window.ethereum type is declared globally by Privy/Wagmi — no redeclaration needed

const SOURCE_CHAIN = 'Ethereum_Sepolia' as const
const DEST_CHAIN = 'Arc_Testnet' as const

interface BridgeUSDCtoArcProps {
  /** When true, omit outer card and title (e.g. inside accordion) */
  embedded?: boolean
}

export function BridgeUSDCtoArc({ embedded }: BridgeUSDCtoArcProps = {}) {
  const [amount, setAmount] = useState('')
  const [isBridging, setIsBridging] = useState(false)
  const [lastStep, setLastStep] = useState<string | null>(null)

  const handleBridge = useCallback(async () => {
    const value = amount.trim()
    if (!value) {
      toast.error('Enter amount to bridge')
      return
    }
    const num = parseFloat(value)
    if (isNaN(num) || num <= 0) {
      toast.error('Enter a valid amount')
      return
    }

    if (typeof window === 'undefined' || !window.ethereum) {
      toast.error('Connect a wallet (e.g. MetaMask) first')
      return
    }

    setIsBridging(true)
    setLastStep(null)

    try {
      const adapter = await createViemAdapterFromProvider({
        provider: window.ethereum,
      })

      const kit = new BridgeKit()

      kit.on('*', (event: { method?: string; values?: { txHash?: string } }) => {
        const step = event.method ?? 'processing'
        setLastStep(step)
        if (event.values?.txHash) {
          toast.success(`${step} – Tx submitted`)
        }
      })

      const result = await kit.bridge({
        from: { adapter, chain: SOURCE_CHAIN },
        to: { adapter, chain: DEST_CHAIN },
        amount: value,
      })

      if (result.state === 'success') {
        toast.success('USDC bridged to Arc!')
        setAmount('')
        setLastStep(null)
      } else if (result.state === 'error') {
        const errStep = result.steps.find((s) => s.state === 'error')
        toast.error(errStep?.errorMessage ?? 'Bridge failed')
      } else {
        toast('Bridge in progress. Check your wallet.', { icon: '⏳' })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(msg)
    } finally {
      setIsBridging(false)
      setLastStep(null)
    }
  }, [amount])

  const hasWallet = typeof window !== 'undefined' && !!window.ethereum

  const content = (
    <>
      {!embedded && (
        <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-200">
          <ArrowRightLeft className="h-4 w-4" />
          Bridge USDC Sepolia → Arc
        </h4>
      )}
      <p className="mb-3 text-xs text-slate-400">
        Step 1: Swap ETH → USDC on Sepolia (e.g.{' '}
        <a
          href={CONSTANTS.LINKS.uniswapSepolia}
          target="_blank"
          rel="noopener noreferrer"
          className="text-cyan-400 hover:underline"
        >
          Uniswap Sepolia
        </a>
        ). Step 2: Bridge USDC to Arc below.
      </p>

      <div className="mb-3 flex gap-2">
        <input
          type="text"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Amount (e.g. 10)"
          className="flex-1 rounded-lg border border-slate-600 bg-slate-800/50 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none"
          disabled={isBridging}
        />
        <button
          onClick={handleBridge}
          disabled={isBridging || !hasWallet}
          className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isBridging ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {lastStep ? lastStep : 'Bridging...'}
            </>
          ) : (
            'Bridge'
          )}
        </button>
      </div>

      {!hasWallet && (
        <p className="flex items-center gap-2 text-xs text-amber-400">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          Connect a wallet (MetaMask, etc.) to bridge.
        </p>
      )}

      <a
        href={CONSTANTS.LINKS.bridgeUsdcToArc}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-cyan-400"
      >
        Bridge docs
        <ExternalLink className="h-3 w-3" />
      </a>
    </>
  )

  if (embedded) {
    return content
  }

  return (
    <div className="rounded-xl border border-slate-700/40 bg-slate-800/20 p-4">
      {content}
    </div>
  )
}
