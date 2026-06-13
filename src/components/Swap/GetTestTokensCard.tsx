import { useState } from 'react'
import { ExternalLink, Droplet, ChevronDown, ChevronUp } from 'lucide-react'
import { CONSTANTS } from '@/config/constants'
import { TestnetHelper } from './TestnetHelper'
import { FaucetPanel } from '@/components/Faucet'
import { BridgeUSDCtoArc } from '@/components/Bridge'

export function GetTestTokensCard() {
  const [bridgeOpen, setBridgeOpen] = useState(false)

  return (
    <div className="flex flex-col md:max-h-[calc(100vh-140px)] md:overflow-auto rounded-2xl border border-slate-700/50 bg-slate-900/40 p-4 space-y-4">
      <h3 className="text-sm font-semibold text-slate-200 tracking-tight shrink-0">
        Get test tokens
      </h3>

      <section className="shrink-0">
        <TestnetHelper embedded />
      </section>

      <section className="space-y-2 shrink-0">
        <h4 className="text-xs font-medium text-slate-400">Faucet FAJU & ARCX</h4>
        <FaucetPanel variant="compact" />
      </section>

      <section className="shrink-0 space-y-2">
        <a
          href={CONSTANTS.LINKS.faucet}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full rounded-lg border border-slate-600/50 bg-slate-800/30 px-3 py-2 text-xs text-slate-300 hover:text-slate-100 hover:border-cyan-500/40 hover:bg-slate-800/50 transition-colors"
        >
          <Droplet className="h-3.5 w-3.5 shrink-0" />
          Obter USDC / EURC
          <span className="text-slate-500">(Circle)</span>
          <ExternalLink className="h-3 w-3 shrink-0" />
        </a>
        <a
          href="https://faucet.circle.com"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full rounded-lg border border-orange-600/40 bg-orange-500/5 px-3 py-2 text-xs text-orange-300 hover:text-orange-200 hover:border-orange-500/60 hover:bg-orange-500/10 transition-colors"
        >
          <span className="shrink-0">🟠</span>
          Obter cirBTC
          <span className="text-slate-500">(Circle Faucet)</span>
          <ExternalLink className="h-3 w-3 shrink-0" />
        </a>
      </section>

      <section className="shrink-0">
        <div className="rounded-lg border border-slate-700/40 bg-slate-800/20 overflow-hidden">
          <button
            type="button"
            onClick={() => setBridgeOpen(!bridgeOpen)}
            className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm font-medium text-slate-200 hover:bg-slate-800/40 transition-colors"
          >
            {bridgeOpen ? 'Bridge USDC Sepolia → Arc' : 'Open bridge'}
            {bridgeOpen ? (
              <ChevronUp className="h-4 w-4 text-slate-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-slate-400" />
            )}
          </button>
          {bridgeOpen && (
            <div className="border-t border-slate-700/50 p-3">
              <BridgeUSDCtoArc embedded />
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
