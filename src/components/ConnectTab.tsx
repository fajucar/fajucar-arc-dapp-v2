import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink, Check, Zap, ShieldCheck } from 'lucide-react';
import { useArcWeb3 } from '../hooks/useArcWeb3';
import { useGM } from '../hooks/useGM';
import { ARC_TESTNET_CHAIN_ID } from '../constants';
import { CONSTANTS } from '@/config/constants';

// Helper to normalize and compare chainIds safely
const normalizeChainId = (chainId: number | null | undefined): number | null => {
  if (chainId === null || chainId === undefined) return null;
  return Number(chainId);
};

const ConnectTab: React.FC = () => {
  const { switchNetwork, wallet, connectWallet, isConnecting } = useArcWeb3();
  
  // Use unified GM hook - SINGLE SOURCE OF TRUTH
  const {
    sendGMOnchain,
    isLoading: gmLoading,
    error: gmError,
    txHash: gmTxHash,
    isConfirmed: gmConfirmed,
  } = useGM(wallet.address, wallet.chainId, connectWallet, switchNetwork);

  const isConnected = !!wallet.address;
  const normalizedChainId = normalizeChainId(wallet.chainId);
  const isCorrectNetwork = normalizedChainId === ARC_TESTNET_CHAIN_ID;

  // Step states
  const step1Complete = isConnected;
  const step2Complete = isConnected && isCorrectNetwork;

  // GM UI states (only for UI, not logic)
  const [showSharePopup, setShowSharePopup] = useState(false);
  const [burstId, setBurstId] = useState(0);
  const [showConnectWalletPopup, setShowConnectWalletPopup] = useState(false);
  // CRITICAL: Flag to prevent any auto-open of X
  const [userClickedShareButton, setUserClickedShareButton] = useState(false);

  // Debug: Log when popup state changes
  // CRITICAL: This useEffect does NOT open X - it only logs
  useEffect(() => {
    try {
      if (showSharePopup) {
        console.log('[GM] Share popup opened. State:', {
          gmTxHash,
          gmConfirmed,
          gmLoading,
          shouldShow: gmTxHash && gmConfirmed && !gmLoading,
          userClickedShareButton
        });
        // CRITICAL: NO auto-open of X here - user must click "Share on X" button
        // CRITICAL: Reset flag when modal opens to ensure fresh state
        setUserClickedShareButton(false);
      }
    } catch (error) {
      console.warn('[ConnectTab] Error in popup debug effect:', error);
    }
  }, [showSharePopup, gmTxHash, gmConfirmed, gmLoading]);

  // Optional: show a "GM welcome" once per session (only inside Connect tab)
  const [showWelcome, setShowWelcome] = useState(false);
  useEffect(() => {
    try {
      const seen = sessionStorage.getItem('arcminter_seen_gm_welcome');
      if (!seen) {
        setShowWelcome(true);
        sessionStorage.setItem('arcminter_seen_gm_welcome', '1');
      }
    } catch (error) {
      console.warn('[ConnectTab] Error accessing sessionStorage:', error);
      // Continue without welcome modal if sessionStorage fails
    }
  }, []);

  // CRITICAL: xShareText is ONLY used when user clicks "Share on X" button
  // It is NEVER created or used automatically
  // We create the URL ONLY inside the button click handler

  // UNIFIED GM HANDLER - Uses the shared hook
  // CRITICAL: This is the ONLY GM handler - works in ALL themes
  // NO DUPLICATE LOGIC - All GM logic is in useGM hook
  async function handleGM() {
    // CRITICAL: NO SOCIAL ACTION, NO REDIRECT, NO WINDOW.OPEN BEFORE ON-CHAIN CONFIRMATION
    try {
      // Reset UI state
      setShowSharePopup(false);
      setBurstId(0);
      
      // Check if wallet is available - show friendly popup if not
      // CRITICAL: Handle wallet conflicts gracefully
      try {
        if (!window.ethereum) {
          console.log('[GM] No wallet detected');
          setShowConnectWalletPopup(true);
          return;
        }
      } catch (err) {
        console.error('[GM] Error checking wallet:', err);
        setShowConnectWalletPopup(true);
        return;
      }

      // Check if wallet is connected - show friendly popup if not
      // CRITICAL: Wrap in try-catch to handle wallet conflicts
      try {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        if (accounts.length === 0) {
          console.log('[GM] Wallet not connected');
          setShowConnectWalletPopup(true);
          return;
        }
      } catch (err: any) {
        console.error('[GM] Error checking accounts (wallet conflict?):', err);
        // If wallet request fails, show connect popup instead of crashing
        setShowConnectWalletPopup(true);
        return;
      }

      // Use unified GM function - SINGLE SOURCE OF TRUTH
      // This function handles: wallet check, network check, transaction, confirmation
      console.log('[GM] ===== Starting unified GM flow =====');
      const result = await sendGMOnchain();
      
      // CRITICAL: Only proceed if we have a confirmed transaction
      if (!result || !result.txHash || !result.receipt) {
        console.error('[GM] ❌ Transaction not confirmed. Result:', result);
        // Error is already set by the hook
        return;
      }
      
      // ONLY AFTER CONFIRMATION - Celebrate + ask to share
      console.log('[GM] ✅✅✅ Transaction confirmed! Showing celebration...');
      
      // Trigger fullscreen emoji burst (via portal to document.body)
      setBurstId((x) => x + 1);
      
      // Small delay to ensure UI is ready
      await new Promise((r) => setTimeout(r, 500));
      
      // CRITICAL: Only show popup if we have confirmed transaction
      // Verify receipt status one more time
      const receiptStatus = result.receipt.status;
      const isSuccess = receiptStatus === '0x1' || receiptStatus === 1 || receiptStatus === '0x01';
      
      if (!isSuccess) {
        console.error('[GM] ❌ Receipt status indicates transaction failed:', receiptStatus);
        return;
      }
      
      // Wait a moment for hook state to update
      await new Promise((r) => setTimeout(r, 300));
      
      // Show popup ONLY if we have confirmed transaction
      // CRITICAL: Do NOT open X here - only show modal
      if (result.txHash && result.receipt && isSuccess) {
        console.log('[GM] ✅✅✅ Transaction confirmed. Showing share modal (NOT opening X)');
        setShowSharePopup(true);
        console.log('[GM] ✅✅✅ Share popup shown after successful confirmation');
        // CRITICAL: NO window.open here - user must click "Share on X" button
      } else {
        console.error('[GM] ❌ Cannot show popup - missing result data or unsuccessful');
      }
    } catch (err: any) {
      console.error('[GM] ❌ Error in handleGM:', err);
      // Error is already set by the hook
      setShowSharePopup(false); // Ensure popup stays closed on error
      setBurstId(0); // Reset burst
      setUserClickedShareButton(false); // Reset share button flag
      console.log('[GM] Error handled - popup closed, state reset');
      // CRITICAL: NO window.open, NO redirect, NO X/Twitter action on error
      // Just show error to user, nothing else
    }
  }

  // Safely render emoji burst via portal - FULLSCREEN
  const renderEmojiBurst = () => {
    try {
      if (burstId > 0 && typeof document !== 'undefined' && document.body) {
        return createPortal(
          <EmojiBurst key={burstId} />,
          document.body
        );
      }
    } catch (error) {
      console.warn('[ConnectTab] Error rendering emoji burst:', error);
    }
    return null;
  };

  // Debug: Log component render and verify GM button exists
  useEffect(() => {
    console.log('[ConnectTab] Component rendered. GM button should be visible.');
    // Verify button exists in DOM after render
    setTimeout(() => {
      const gmButton = document.querySelector('button[aria-label="Send GM on-chain"]');
      if (gmButton) {
        console.log('[ConnectTab] ✅ GM button found in DOM');
      } else {
        console.warn('[ConnectTab] ⚠️ GM button NOT found in DOM!');
      }
    }, 100);
  }, []);

  // CRITICAL: Intercept ANY attempts to open X/Twitter automatically
  // This includes window.open, location.href, location.replace, etc.
  useEffect(() => {
    // Store originals
    const originalWindowOpen = window.open;
    const originalLocationHref = Object.getOwnPropertyDescriptor(window, 'location')?.set;
    const originalLocationReplace = window.location.replace;
    const originalLocationAssign = window.location.assign;
    
    // Override window.open to log and block unauthorized X opens
    window.open = function(url: string | URL | undefined, target?: string, features?: string) {
      const urlString = typeof url === 'string' ? url : url?.toString() || '';
      
      if (urlString && (urlString.includes('twitter.com') || urlString.includes('x.com') || urlString.includes('intent/tweet'))) {
        // Check if this is from our authorized button click
        if (!userClickedShareButton) {
          console.error('[GM] 🚫🚫🚫 BLOCKED window.open: Attempt to open X/Twitter without user click!');
          console.error('[GM] URL:', urlString);
          console.error('[GM] Stack trace:', new Error().stack);
          console.error('[GM] userClickedShareButton:', userClickedShareButton);
          // DO NOT open X - return null to block
          return null;
        }
        console.log('[GM] ✅ Allowed: Opening X with user authorization');
      }
      // For non-X URLs or authorized X opens, use original function
      return originalWindowOpen.call(window, url, target, features);
    };

    // Override location.href to prevent redirects
    try {
      Object.defineProperty(window, 'location', {
        set: function(url: string) {
          if (url && (url.includes('twitter.com') || url.includes('x.com') || url.includes('intent/tweet'))) {
            if (!userClickedShareButton) {
              console.error('[GM] 🚫🚫🚫 BLOCKED location.href: Attempt to redirect to X/Twitter without user click!');
              console.error('[GM] URL:', url);
              console.error('[GM] Stack trace:', new Error().stack);
              return; // Block the redirect
            }
          }
          // Use original setter if exists
          if (originalLocationHref) {
            originalLocationHref.call(window, url);
          }
        },
        get: function() {
          return window.location;
        },
        configurable: true
      });
    } catch (e) {
      console.warn('[GM] Could not override location.href:', e);
    }

    // Override location.replace
    window.location.replace = function(url: string) {
      if (url && (url.includes('twitter.com') || url.includes('x.com') || url.includes('intent/tweet'))) {
        if (!userClickedShareButton) {
          console.error('[GM] 🚫🚫🚫 BLOCKED location.replace: Attempt to redirect to X/Twitter without user click!');
          console.error('[GM] URL:', url);
          console.error('[GM] Stack trace:', new Error().stack);
          return; // Block the redirect
        }
      }
      return originalLocationReplace.call(window.location, url);
    };

    // Override location.assign
    window.location.assign = function(url: string) {
      if (url && (url.includes('twitter.com') || url.includes('x.com') || url.includes('intent/tweet'))) {
        if (!userClickedShareButton) {
          console.error('[GM] 🚫🚫🚫 BLOCKED location.assign: Attempt to redirect to X/Twitter without user click!');
          console.error('[GM] URL:', url);
          console.error('[GM] Stack trace:', new Error().stack);
          return; // Block the redirect
        }
      }
      return originalLocationAssign.call(window.location, url);
    };

    // Cleanup: restore originals on unmount
    return () => {
      window.open = originalWindowOpen;
      window.location.replace = originalLocationReplace;
      window.location.assign = originalLocationAssign;
    };
  }, [userClickedShareButton]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-fade-in-up relative">
      {/* Emoji burst overlay - rendered via portal to body for fullscreen */}
      {renderEmojiBurst()}

      {/* CONNECT WALLET POPUP (friendly popup when clicking GM without wallet) */}
      {showConnectWalletPopup && (
        <div className="fixed inset-0 z-[65] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowConnectWalletPopup(false)} />
          <div className="relative w-full max-w-lg glass-panel p-6 rounded-3xl border border-cyan-500/30 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-extrabold text-white">
                  Connect Your Wallet 👛
                </h3>
                <p className="text-sm text-slate-300 mt-2 leading-relaxed">
                  To send an on-chain GM, you need to connect your wallet first. We support MetaMask, Rabby, and other EVM-compatible wallets.
                </p>
              </div>
              <button
                className="text-slate-400 hover:text-white transition"
                onClick={() => setShowConnectWalletPopup(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="mt-5 flex flex-col sm:flex-row gap-3">
              <button
                onClick={async () => {
                  setShowConnectWalletPopup(false);
                  await connectWallet();
                  // Wait a moment for wallet state to update
                  await new Promise((r) => setTimeout(r, 1000));
                  // After connecting, try GM again if wallet is now connected
                  const accounts = await window.ethereum?.request({ method: 'eth_accounts' });
                  if (accounts && accounts.length > 0) {
                    handleGM();
                  }
                }}
                disabled={isConnecting}
                className="w-full py-2.5 rounded-xl bg-amber-500 text-white font-semibold text-sm hover:bg-amber-400 transition-all flex justify-center items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isConnecting ? 'Connecting…' : 'Connect Wallet'}
              </button>
              <button
                onClick={() => setShowConnectWalletPopup(false)}
                className="w-full py-2.5 rounded-xl border border-slate-700 text-slate-300 font-semibold text-sm hover:bg-slate-800 transition-all"
              >
                Maybe Later
              </button>
            </div>
          </div>
        </div>
      )}

      {/* WELCOME MODAL (lightweight, session-based) */}
      {showWelcome && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowWelcome(false)} />
          <div className="relative w-full max-w-lg glass-panel p-6 rounded-3xl border border-cyan-500/30 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-extrabold text-white">
                  GM! Welcome 👋
                </h3>
                <p className="text-sm text-slate-300 mt-2 leading-relaxed">
                  Welcome to the ArcMinter Testnet interface. Ready to mint futuristic NFTs?
                </p>
              </div>
              <button
                className="text-slate-400 hover:text-white transition"
                onClick={() => setShowWelcome(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="mt-5 flex flex-col sm:flex-row gap-3">
              {/* CRITICAL: GM button - must be <button>, not <a>, with preventDefault */}
              <button
                type="button"
                onClick={async (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowWelcome(false);
                  await handleGM();
                }}
                className="w-full py-2.5 rounded-xl bg-amber-500 text-white font-semibold text-sm hover:bg-amber-400 transition-all flex justify-center items-center gap-2"
              >
                {gmLoading ? 'Sending GM on-chain…' : 'Send On-chain GM'}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowWelcome(false);
                }}
                className="w-full py-2.5 rounded-xl border border-slate-700 text-slate-300 font-semibold text-sm hover:bg-slate-800 transition-all"
              >
                Maybe Later
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LEFT: Info Panel */}
      <div className="lg:col-span-5 space-y-6">
        <div className="glass-panel p-8 rounded-3xl relative overflow-hidden">
          {/* Decorative Gradient */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-cyan-200/40 to-blue-300/40 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>

          <h2 className="text-3xl font-bold text-white mb-4 relative z-10">
            GiftCard NFTs <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-400">
              on Arc Testnet
            </span>
          </h2>

          <p className="text-slate-300 leading-relaxed mb-8 relative z-10">
            Welcome to the future of decentralized gifting. This dApp allows you to mint exclusive simulated GiftCards in a risk-free environment. Experience the speed and low costs of the Arc network.
          </p>

          <div className="bg-amber-900/30 border border-amber-500/30 rounded-2xl p-5 relative z-10">
            <div className="flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
              <div>
                <h4 className="text-amber-300 font-bold text-sm mb-1">Testnet Notice</h4>
                <p className="text-amber-200/80 text-xs leading-relaxed">
                  No real funds are involved. Each NFT costs <strong>0.5 USDC (Testnet)</strong>. Do not send real assets to these addresses.
                </p>
              </div>
            </div>
          </div>

          {/* GM Card (on-chain) - ALWAYS VISIBLE */}
          <div 
            id="gm-card-container"
            className="mt-6 rounded-2xl border border-cyan-500/20 bg-slate-800/40 backdrop-blur-sm p-5 relative z-10"
            style={{ minHeight: '120px' }}
          >
            <div className="flex flex-col gap-4">
              <div>
                <h4 className="font-extrabold text-white">On-chain GM</h4>
                <p className="text-xs text-slate-300 mt-1">
                  Send a small on-chain "GM" transaction on Arc Testnet. After confirmation, we'll ask if you want to share on X.
                </p>
                {gmTxHash && (
                  <p className="text-xs text-slate-400 mt-2 break-all">
                    Last GM tx: <span className="font-mono text-cyan-400">{gmTxHash}</span>
                  </p>
                )}
                {gmError && (
                  <p className="text-xs text-red-400 mt-2 font-medium">
                    {gmError}
                  </p>
                )}
              </div>

              {/* CRITICAL: GM button - must be <button>, not <a>, with preventDefault */}
              <button
                id="gm-button"
                type="button"
                onClick={async (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  console.log('[GM] ===== Button clicked! =====');
                  console.log('[GM] Current state:', {
                    gmLoading,
                    gmError,
                    gmTxHash,
                    gmConfirmed,
                    walletAddress: wallet.address,
                    walletChainId: wallet.chainId,
                    isConnected,
                    isCorrectNetwork
                  });
                  try {
                    await handleGM();
                    console.log('[GM] handleGM completed');
                  } catch (error) {
                    console.error('[GM] ❌ Error in button onClick:', error);
                  }
                }}
                disabled={gmLoading}
                className="w-full px-4 py-2.5 rounded-xl bg-amber-500 text-white font-semibold text-sm hover:bg-cyan-700 transition disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                aria-label="Send GM on-chain"
                style={{ 
                  minHeight: '40px',
                  display: 'flex',
                  visibility: 'visible',
                  opacity: gmLoading ? 0.6 : 1
                }}
              >
                {gmLoading ? (
                  <>
                    <span className="animate-spin">⏳</span> Sending…
                  </>
                ) : (
                  'GM'
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT: Setup Steps */}
      <div className="lg:col-span-7">
        <div className="glass-panel p-8 rounded-3xl h-full">
          <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
            <span className="w-2 h-6 bg-cyan-400 rounded-full"></span>
            Network Setup
          </h3>

          <div className="space-y-4">
            {/* Step 1: Wallet */}
            <StepItem
              num="1"
              title="Connect EVM Wallet"
              desc="Use MetaMask, Rabby, or any Web3 wallet."
              isComplete={step1Complete}
              action={
                !step1Complete && (
                  <button
                    onClick={connectWallet}
                    disabled={isConnecting}
                    className="mt-3 w-full py-2.5 rounded-xl bg-slate-900 text-white font-semibold text-sm hover:bg-slate-800 transition-all flex justify-center items-center gap-2"
                  >
                    {isConnecting ? 'Connecting…' : 'Connect Wallet'}
                  </button>
                )
              }
            />

            {/* Step 2: Network */}
            <StepItem
              num="2"
              title="Add Arc Testnet"
              desc={`Chain ID: ${ARC_TESTNET_CHAIN_ID}. Required for transactions.`}
              isComplete={step2Complete}
              disabled={!step1Complete}
              action={
                !step2Complete && step1Complete && (
                  <div className="mt-3 space-y-2">
                    <button
                      onClick={async () => {
                        console.log('[Network] User clicked Configure Network');
                        await switchNetwork();
                        // Give it time to update
                        setTimeout(() => {
                          window.location.reload();
                        }, 2000);
                      }}
                      className="w-full py-2.5 rounded-xl bg-cyan-50 text-cyan-700 font-semibold text-sm border border-cyan-200 hover:bg-cyan-100 transition-all flex justify-center items-center gap-2"
                    >
                      Configure Network <Zap className="w-4 h-4" />
                    </button>
                    {!isCorrectNetwork && wallet.address && (
                      <p className="text-xs text-amber-600 mt-1">
                        ⚠️ Currently on wrong network. Click above to switch.
                      </p>
                    )}
                  </div>
                )
              }
            />

            {/* Step 3: Faucet */}
            <StepItem
              num="3"
              title="Get Test Tokens"
              desc="You need test USDC and native gas to mint."
              isComplete={false}
              disabled={!step1Complete}
              action={
                <a
                  href={CONSTANTS.LINKS.faucet}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 block w-full text-center py-2.5 rounded-xl border border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50 transition-all flex justify-center items-center gap-2"
                >
                  Open Official Faucet <ExternalLink className="w-3 h-3" />
                </a>
              }
            />

            {/* Status Footer */}
            <div className="mt-6 pt-6 border-t border-slate-700 flex items-center justify-between text-sm">
              <span className="text-slate-400 font-medium">Status</span>
              <div className={`flex items-center gap-2 font-bold ${isCorrectNetwork ? 'text-emerald-400' : 'text-slate-500'}`}>
                <span className={`w-2.5 h-2.5 rounded-full ${isCorrectNetwork ? 'bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.6)]' : 'bg-slate-600'}`}></span>
                {isCorrectNetwork ? 'Ready to Mint' : 'Waiting for Setup'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* SHARE POPUP AFTER CONFIRMATION (ONLY SHOWS AFTER ON-CHAIN TX CONFIRMED) */}
      {/* CRITICAL: Only show if transaction is confirmed AND we have a txHash AND confirmed flag */}
      {/* Triple check to prevent premature popup */}
      {/* CRITICAL: This modal NEVER auto-opens X - user must explicitly click "Share on X" button */}
      {/* CRITICAL: NO auto-open behavior - modal is passive, only shows buttons */}
      {showSharePopup && gmTxHash && gmConfirmed && !gmLoading && (
        <div 
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4 overflow-auto"
          style={{ zIndex: 9999 }}
          onMouseDown={(e) => e.preventDefault()}
          onMouseUp={(e) => e.preventDefault()}
          onClick={(e) => {
            // Prevent any accidental clicks from opening X
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-sm" 
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setShowSharePopup(false);
            }} 
          />
          <div 
            className="relative w-full max-w-lg max-h-[90vh] overflow-auto glass-panel p-6 rounded-3xl border border-cyan-500/30 shadow-2xl my-auto"
            onClick={(e) => {
              // Prevent clicks on modal from bubbling
              e.stopPropagation();
            }}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-extrabold text-white">GM sent on-chain 🎉</h3>
                <p className="text-sm text-slate-300 mt-2 leading-relaxed">
                  Your transaction has been confirmed. Want to share on X and invite more people to Arc Testnet?
                </p>
              </div>
              <button
                className="text-slate-400 hover:text-white transition"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowSharePopup(false);
                }}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="mt-5 flex flex-col sm:flex-row gap-3">
              {/* CRITICAL: This is the ONLY place that opens X, and ONLY on explicit user click */}
              {/* CRITICAL: Added multiple event handlers to prevent any auto-trigger */}
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  // Mark that user is interacting with button
                  setUserClickedShareButton(true);
                }}
                onMouseUp={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  // CRITICAL: Only open X when user explicitly clicks this button
                  // This happens AFTER on-chain confirmation
                  // Double-check we have confirmed transaction before opening
                  if (!gmTxHash || !gmConfirmed) {
                    console.error('[GM] Cannot share - transaction not confirmed!', { gmTxHash, gmConfirmed });
                    return;
                  }
                  // CRITICAL: Triple check - user must have clicked the button
                  if (!userClickedShareButton) {
                    console.error('[GM] ❌ BLOCKED: X open attempted without user click!');
                    return;
                  }
                  console.log('[GM] ===== User explicitly clicked Share on X button =====');
                  
                  // CRITICAL: Create URL ONLY when user clicks - never before
                  const shareText = encodeURIComponent(
                    `GM from ArcMinter ☀️\nJust sent an on-chain GM on Arc Testnet.\n\n#ArcNetwork #ArcTestnet #Web3`
                  );
                  const shareUrl = `https://twitter.com/intent/tweet?text=${shareText}`;
                  
                  console.log('[GM] Opening X with URL:', shareUrl);
                  
                  // CRITICAL: Authorize X open via global interceptor
                  if ((window as any).__authorizeXOpen) {
                    (window as any).__authorizeXOpen();
                  }
                  
                  // CRITICAL: Only open X here, nowhere else - URL created on-demand
                  window.open(shareUrl, '_blank', 'noopener,noreferrer');
                  setShowSharePopup(false);
                  setUserClickedShareButton(false);
                }}
                className="w-full py-2.5 rounded-xl bg-amber-500 text-white font-semibold text-sm hover:bg-amber-400 transition-all flex justify-center items-center gap-2"
              >
                Share on X
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowSharePopup(false);
                }}
                className="w-full py-2.5 rounded-xl border border-slate-700 text-slate-300 font-semibold text-sm hover:bg-slate-800 transition-all"
              >
                Maybe Later
              </button>
            </div>

            {gmTxHash && (
              <div className="mt-4 pt-4 border-t border-slate-700">
                <p className="text-xs text-slate-400 mb-1">Transaction hash:</p>
                <p className="text-xs text-cyan-300 font-mono break-all">
                  {gmTxHash}
                </p>
                <a
                  href={`https://testnet.arcscan.app/tx/${gmTxHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-cyan-400 hover:text-cyan-300 mt-1 inline-block"
                >
                  View on Explorer →
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const StepItem: React.FC<{
  num: string;
  title: string;
  desc: string;
  isComplete: boolean;
  disabled?: boolean;
  action?: React.ReactNode;
}> = ({ num, title, desc, isComplete, disabled, action }) => (
  <div
    className={`relative p-4 rounded-2xl border transition-all duration-300 ${
      isComplete
        ? 'bg-emerald-900/30 border-emerald-500/30'
        : disabled
        ? 'opacity-50 border-transparent'
        : 'bg-slate-800/40 border-slate-700 shadow-sm'
    }`}
  >
    <div className="flex gap-4">
      <div
        className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 transition-colors ${
          isComplete ? 'bg-emerald-500 text-white' : 'bg-slate-700 text-slate-500'
        }`}
      >
        {isComplete ? <Check className="w-5 h-5" /> : num}
      </div>
      <div className="flex-1">
        <h4 className={`font-bold ${isComplete ? 'text-emerald-300' : 'text-white'}`}>{title}</h4>
        <p className="text-xs text-slate-400 mt-0.5">{desc}</p>
        {action}
      </div>
    </div>
  </div>
);

// Simple emoji burst (no external libs) - FULLSCREEN via portal
const EmojiBurst: React.FC = () => {
  // This component re-mounts via key={burstId} to replay animation.
  const emojis = ['🎉', '✨', '🥳', '🚀', '💙', '🌟'];
  // More particles for fullscreen coverage
  const particles = Array.from({ length: 40 }).map((_, i) => {
    const left = Math.random() * 100;
    const delay = Math.random() * 0.3;
    const duration = 1.2 + Math.random() * 0.8;
    const size = 20 + Math.random() * 24;
    const emoji = emojis[i % emojis.length];
    // Random horizontal spread for better coverage
    const horizontalOffset = (Math.random() - 0.5) * 20;
    return { left, delay, duration, size, emoji, horizontalOffset, id: i };
  });

  return (
    <div 
      className="pointer-events-none fixed inset-0 overflow-hidden"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 9999,
        pointerEvents: 'none',
      }}
    >
      <style>{`
        @keyframes arcminter-pop {
          0% { 
            transform: translateY(0px) translateX(0px) scale(0.5); 
            opacity: 0; 
          }
          10% { 
            opacity: 1; 
          }
          100% { 
            transform: translateY(-100vh) translateX(var(--h-offset, 0px)) scale(1.5); 
            opacity: 0; 
          }
        }
      `}</style>

      {particles.map((p) => (
        <div
          key={p.id}
          style={{
            position: 'absolute',
            left: `${p.left}%`,
            bottom: '0px',
            fontSize: `${p.size}px`,
            animation: `arcminter-pop ${p.duration}s ease-out ${p.delay}s 1 both`,
            filter: 'drop-shadow(0 8px 16px rgba(6, 182, 212, 0.4))',
            '--h-offset': `${p.horizontalOffset}px`,
            willChange: 'transform, opacity',
          } as React.CSSProperties & { '--h-offset': string }}
        >
          {p.emoji}
        </div>
      ))}
    </div>
  );
};

export default ConnectTab;



