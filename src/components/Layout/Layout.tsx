import { ReactNode } from 'react'
import { useChainId, useAccount } from 'wagmi'
import { ARC_TESTNET } from '@/config/chain'
import { Header } from './Header'
import { Footer } from './Footer'
import { NetworkBanner } from '@/components/NetworkBanner'
import { NetworkSwitcher } from '@/components/Web3/NetworkSwitcher'
import { WalletModal } from '@/components/Web3/WalletModal'
import { useWalletModal } from '@/contexts/WalletModalContext'

interface LayoutProps {
  children: ReactNode
}

function LayoutContent({ children }: LayoutProps) {
  const { isOpen, closeModal } = useWalletModal()
  const { isConnected } = useAccount()
  const chainId = useChainId()
  const isWrongNetwork = isConnected && chainId != null && chainId !== ARC_TESTNET.chainIdDec

  return (
    <div className="min-h-screen flex flex-col text-white relative" style={{ background: 'linear-gradient(135deg, #1a0a3c 0%, #3d1464 30%, #6b1d5a 60%, #9b2648 85%, #c23a4a 100%)', backgroundAttachment: 'fixed' }}>
      <Header />
      {isWrongNetwork && (
        <div className="sticky top-[65px] z-40 px-4 py-2 max-w-6xl mx-auto w-full">
          <NetworkBanner currentChainId={chainId} />
        </div>
      )}
      <main className="flex-1">{children}</main>
      <Footer />
      <NetworkSwitcher />
      <WalletModal isOpen={isOpen} onClose={closeModal} />
    </div>
  )
}

export function Layout({ children }: LayoutProps) {
  return <LayoutContent>{children}</LayoutContent>
}

