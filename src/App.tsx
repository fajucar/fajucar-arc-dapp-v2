import { Routes, Route } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { useTranslation } from 'react-i18next'
import { Layout } from '@/components/Layout'
import { Hero } from '@/components/Hero'
import { NetworkStats } from '@/components/Stats'
import { WhyArc } from '@/components/Comparison'
import { SwapPage } from '@/pages/SwapPage'
import { PoolsPage } from '@/pages/PoolsPage'
import { Agents } from '@/pages/Agents'
import { ManageV3PositionPage } from '@/modules/v3/pages/ManageV3PositionPage'
import { MyNFTsPage } from '@/pages/MyNFTsPage'
import { MyPoolsPage } from '@/pages/MyPoolsPage'
import { ArcDexTestPool } from '@/pages/ArcDexTestPool'
import { FaucetPage } from '@/pages/FaucetPage'
import { AuthCallback } from '@/pages/AuthCallback'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { ConfigErrorBanner } from '@/components/ConfigErrorBanner'

function HomePage() {
  const { t } = useTranslation()
  try {
    return (
      <>
        <Helmet>
          <title>FajuARC - DeFi on Arc Testnet</title>
          <meta 
            name="description" 
            content="FajuARC: Swap, mint NFTs, and manage liquidity on Arc Testnet. Premium DeFi experience with USDC and EURC." 
          />
          <meta property="og:title" content="FajuARC" />
          <meta property="og:description" content="Premium DeFi on Arc Testnet" />
          <meta property="og:type" content="website" />
          <meta name="twitter:card" content="summary_large_image" />
          <meta name="twitter:title" content="Arc Network" />
          <meta name="twitter:description" content="Purpose-built blockchain for stablecoin finance" />
        </Helmet>

        <ErrorBoundary>
          <Hero />
        </ErrorBoundary>

        <ErrorBoundary>
          <section className="py-8 px-4">
            <div className="max-w-6xl mx-auto mb-3 text-center">
              <h3 className="text-lg font-semibold tracking-tight mb-1">{t('home.statsTitle')}</h3>
              <p className="text-[10px] text-slate-400">
                {t('home.statsSubtitle')}
              </p>
            </div>
            <NetworkStats />
          </section>
        </ErrorBoundary>

        <ErrorBoundary>
          <WhyArc />
        </ErrorBoundary>
      </>
    )
  } catch (error) {
    // Fallback if HomePage itself breaks
    console.error('HomePage error:', error)
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-4">Error loading home page</h1>
          <p className="text-slate-400 mb-6">Please reload the page or try again later.</p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-white font-semibold transition-colors"
          >
            Reload page
          </button>
        </div>
      </div>
    )
  }
}

function App() {
  return (
    <ErrorBoundary>
      <ConfigErrorBanner />
      <Layout>
        <ErrorBoundary>
          <Routes>
            <Route
              path="/"
              element={
                <ErrorBoundary>
                  <HomePage />
                </ErrorBoundary>
              }
            />
            <Route
              path="/swap" 
              element={
                <ErrorBoundary>
                  <SwapPage />
                </ErrorBoundary>
              } 
            />
            <Route 
              path="/pools" 
              element={
                <ErrorBoundary>
                  <PoolsPage />
                </ErrorBoundary>
              } 
            />
            <Route
              path="/agents"
              element={
                <ErrorBoundary>
                  <Agents />
                </ErrorBoundary>
              }
            />
            <Route 
              path="/pools/v3/positions/:tokenId" 
              element={
                <ErrorBoundary>
                  <ManageV3PositionPage />
                </ErrorBoundary>
              } 
            />
            <Route 
              path="/my-nfts" 
              element={
                <ErrorBoundary>
                  <MyNFTsPage />
                </ErrorBoundary>
              } 
            />
            <Route 
              path="/my-pools" 
              element={
                <ErrorBoundary>
                  <MyPoolsPage />
                </ErrorBoundary>
              } 
            />
            <Route 
              path="/arc-dex" 
              element={
                <ErrorBoundary>
                  <ArcDexTestPool />
                </ErrorBoundary>
              } 
            />
            <Route
              path="/faucet"
              element={
                <ErrorBoundary>
                  <FaucetPage />
                </ErrorBoundary>
              }
            />
            <Route path="/auth/callback" element={<AuthCallback />} />
          </Routes>
        </ErrorBoundary>
      </Layout>
    </ErrorBoundary>
  )
}

export default App
