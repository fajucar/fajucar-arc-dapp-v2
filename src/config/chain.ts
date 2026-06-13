/**
 * Arc Testnet Network Configuration
 */

export const ARC_TESTNET = {
  chainIdHex: '0x4CEF52', // 5042002 in hex
  chainIdDec: 5042002,
  chainName: 'Arc Testnet',
  nativeCurrency: {
    name: 'USDC',
    symbol: 'USDC',
    decimals: 6, // Arc uses USDC as native gas token — 6 decimals (same as ERC-20 USDC, not 18)
  },
  rpcUrls: [
    'https://rpc.testnet.arc.network', // Primary
    'https://rpc.blockdaemon.testnet.arc.network', // Fallback 1
    'https://rpc.drpc.testnet.arc.network', // Fallback 2
    'https://rpc.quicknode.testnet.arc.network', // Fallback 3
  ],
  blockExplorerUrls: ['https://testnet.arcscan.app'],
};

/**
 * Normalize chainId to decimal number
 */
export function normalizeChainId(chainId: string | number | bigint | null | undefined): number | null {
  if (chainId === null || chainId === undefined) return null;
  if (typeof chainId === 'bigint') return Number(chainId);
  if (typeof chainId === 'string') {
    if (chainId.startsWith('0x')) {
      return parseInt(chainId, 16);
    }
    return parseInt(chainId, 10);
  }
  return Number(chainId);
}

/**
 * Ensure wallet is connected to Arc Testnet
 * Automatically switches or adds network if needed
 */
export async function ensureArcNetwork(provider: any): Promise<boolean> {
  if (!provider) {
    throw new Error('No wallet provider available');
  }

  try {
    // Get current chain ID
    const currentChainIdHex = await provider.request({ method: 'eth_chainId' });
    const currentChainId = normalizeChainId(currentChainIdHex);

    console.log('[Chain] Current chainId:', currentChainId, 'Expected:', ARC_TESTNET.chainIdDec);

    // Already on Arc Testnet
    if (currentChainId === ARC_TESTNET.chainIdDec) {
      console.log('[Chain] ✅ Already on Arc Testnet');
      return true;
    }

    // Try to switch first
    try {
      console.log('[Chain] Attempting to switch to Arc Testnet...');
      await provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: ARC_TESTNET.chainIdHex }],
      });
      
      // Wait a moment for switch to complete
      await new Promise((r) => setTimeout(r, 1000));
      
      // Verify switch
      const newChainIdHex = await provider.request({ method: 'eth_chainId' });
      const newChainId = normalizeChainId(newChainIdHex);
      
      if (newChainId === ARC_TESTNET.chainIdDec) {
        console.log('[Chain] ✅ Successfully switched to Arc Testnet');
        return true;
      }
    } catch (switchError: any) {
      // Error 4902: Chain not added
      if (switchError.code === 4902) {
        console.log('[Chain] Network not added, adding Arc Testnet...');
        
        // Try each RPC URL until one works
        for (const rpcUrl of ARC_TESTNET.rpcUrls) {
          try {
            await provider.request({
              method: 'wallet_addEthereumChain',
              params: [
                {
                  chainId: ARC_TESTNET.chainIdHex,
                  chainName: ARC_TESTNET.chainName,
                  nativeCurrency: ARC_TESTNET.nativeCurrency,
                  rpcUrls: [rpcUrl],
                  blockExplorerUrls: ARC_TESTNET.blockExplorerUrls,
                },
              ],
            });
            
            // Wait for add to complete
            await new Promise((r) => setTimeout(r, 1000));
            
            // Verify
            const newChainIdHex = await provider.request({ method: 'eth_chainId' });
            const newChainId = normalizeChainId(newChainIdHex);
            
            if (newChainId === ARC_TESTNET.chainIdDec) {
              console.log('[Chain] ✅ Successfully added and switched to Arc Testnet');
              return true;
            }
          } catch (addError: any) {
            console.warn('[Chain] Failed to add network with RPC:', rpcUrl, addError);
            // Try next RPC
            continue;
          }
        }
        
        throw new Error('Failed to add Arc Testnet network. Please add it manually in your wallet.');
      } else {
        throw switchError;
      }
    }

    return false;
  } catch (error: any) {
    console.error('[Chain] ❌ Error ensuring Arc network:', error);
    throw error;
  }
}

