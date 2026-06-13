import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { ARC_TESTNET_CHAIN_ID, ARC_TESTNET_HEX_ID, CONTRACT_ADDRESSES } from '../constants';
import { GiftCardNFT } from '../types';
import { ARC_COLLECTION } from '../config/arcCollection';
import { pickProvider } from '../lib/provider';
import { ensureArcNetwork } from '../config/chain';

// Import ABIs
import FajuARC_ABI from '@/abis/FajuARC.json';

export function useArcWeb3() {
  const [wallet, setWallet] = useState<{ address: string | null; chainId: number | null }>({
    address: null,
    chainId: null,
  });
  const [isConnecting, setIsConnecting] = useState(false);

  // Use pickProvider to get the best available wallet
  const ethereum = pickProvider();
  
  // Debug: Log wallet availability
  useEffect(() => {
    console.log('[Web3] Wallet check:', {
      ethereumAvailable: !!ethereum,
      ethereumType: typeof ethereum,
      hasRequest: typeof ethereum?.request === 'function',
      hasOn: typeof ethereum?.on === 'function'
    });
  }, []);

  const updateWalletState = async () => {
    if (!ethereum) {
      setWallet({ address: null, chainId: null });
      return;
    }
    try {
      const provider = new ethers.BrowserProvider(ethereum);
      const accounts = await provider.listAccounts();
      const network = await provider.getNetwork();

      // Normalize chainId: handle BigInt, string hex, or number
      let chainId: number;
      if (typeof network.chainId === 'bigint') {
        chainId = Number(network.chainId);
      } else if (typeof network.chainId === 'string') {
        // Handle hex string like "0x4d0a02"
        chainId = parseInt(network.chainId, 16);
      } else {
        chainId = Number(network.chainId);
      }

      const newState = {
        address: accounts.length > 0 ? accounts[0].address : null,
        chainId: chainId,
      };

      // Only update if state actually changed (avoid unnecessary re-renders)
      setWallet(prev => {
        if (prev.address === newState.address && prev.chainId === newState.chainId) {
          return prev;
        }
        console.log('[Web3] Wallet state updated:', { 
          address: newState.address ? `${newState.address.slice(0, 6)}...${newState.address.slice(-4)}` : null,
          chainId: newState.chainId,
          expected: ARC_TESTNET_CHAIN_ID,
          isCorrect: newState.chainId === ARC_TESTNET_CHAIN_ID
        });
        return newState;
      });
    } catch (error) {
      console.error("[Web3] Error updating wallet state", error);
      // Don't reset state on error, keep previous state
    }
  };

  useEffect(() => {
    if (!ethereum) {
      setWallet({ address: null, chainId: null });
      return;
    }

    // Initial state update
    updateWalletState();

    // Set up event listeners
    const handleAccountsChanged = () => {
      console.log('[Web3] Accounts changed');
      updateWalletState();
    };

    const handleChainChanged = (..._args: unknown[]) => {
      // Chain changed event provides hex string, but we'll get it from provider
      // Small delay to ensure wallet has updated
      setTimeout(() => updateWalletState(), 100);
    };

    ethereum.on?.('accountsChanged', handleAccountsChanged);
    ethereum.on?.('chainChanged', handleChainChanged);

    // Periodic check (every 2 seconds) to catch any missed updates
    const intervalId = setInterval(() => {
      updateWalletState();
    }, 2000);

    return () => {
      if (ethereum) {
        ethereum.removeListener?.('accountsChanged', handleAccountsChanged);
        ethereum.removeListener?.('chainChanged', handleChainChanged);
      }
      clearInterval(intervalId);
    };
  }, [ethereum]); // Re-run if ethereum object changes

  const connectWallet = async () => {
    console.log('[Web3] ===== connectWallet called =====');
    console.log('[Web3] ethereum available:', !!ethereum);
    console.log('[Web3] Expected Chain ID:', ARC_TESTNET_CHAIN_ID, 'Hex:', ARC_TESTNET_HEX_ID);
    
    if (!ethereum) {
      console.error('[Web3] ❌ No wallet detected');
      alert("Please install MetaMask or Rabby!");
      return;
    }
    
    setIsConnecting(true);
    try {
      console.log('[Web3] Requesting accounts...');
      const accounts = await ethereum.request({ method: 'eth_requestAccounts' });
      console.log('[Web3] ✅ Accounts received:', accounts);
      
      // CRITICAL: Ensure Arc Testnet after connecting
      console.log('[Web3] Ensuring Arc Testnet...');
      await ensureArcNetwork(ethereum);
      
      // Update wallet state
      await updateWalletState();
      console.log('[Web3] ✅ Wallet state updated after connection');
    } catch (error: any) {
      console.error('[Web3] ❌ Error connecting wallet:', error);
      console.error('[Web3] Error code:', error?.code);
      console.error('[Web3] Error message:', error?.message);
      
      // Show user-friendly error
      if (error?.code === 4001) {
        alert('Connection rejected. Please approve the connection in your wallet.');
      } else if (error?.message?.includes('ethereum')) {
        alert('Wallet connection error. Please check if you have multiple wallet extensions enabled and disable all except one.');
      } else {
        alert(`Connection failed: ${error?.message || 'Unknown error'}`);
      }
    } finally {
      setIsConnecting(false);
      console.log('[Web3] connectWallet completed');
    }
  };

  const switchNetwork = async () => {
    if (!ethereum) return;
    try {
      // Use ensureArcNetwork which handles both switch and add
      await ensureArcNetwork(ethereum);
      // Update wallet state after switch
      await updateWalletState();
    } catch (error: any) {
      console.error('[Network] Switch error:', error);
      throw error;
    }
  };

  const disconnectWallet = () => {
    // Reset wallet state
    setWallet({
      address: null,
      chainId: null,
    });
    // Note: MetaMask doesn't have a disconnect method, but we can clear our local state
    // The wallet will remain connected in MetaMask, but our app will treat it as disconnected
  };

  // Fetch available NFTs from the collection
  const fetchAvailableNFTs = async (): Promise<GiftCardNFT[]> => {
    // Convert ARC_COLLECTION to GiftCardNFT format
    return ARC_COLLECTION.map(item => ({
      id: item.id,
      name: item.name,
      description: item.description,
      imageURI: item.image.startsWith('http') ? item.image : `${window.location.origin}${item.image}`,
      priceRaw: "0.5", // Fixed price
    }));
  };

  const mintNFT = async (id: number | string) => {
    if (!wallet.address) throw new Error("Wallet not connected");
    
    if (!ethereum) throw new Error("MetaMask not found");
    
    // Find the NFT in the collection
    const nftItem = ARC_COLLECTION.find(item => item.id === id);
    if (!nftItem) throw new Error("NFT not found in collection");

    try {
      const provider = new ethers.BrowserProvider(ethereum);
      const signer = await provider.getSigner();
      
      // Get the minter contract
      const minterContract = new ethers.Contract(
        CONTRACT_ADDRESSES.GIFT_CARD_MINTER,
        FajuARC_ABI,
        signer
      );

      // Mint the NFT using the tokenURI from the collection
      const tx = await minterContract.mintImageNFT(nftItem.tokenURI);
      
      // Wait for transaction confirmation
      const receipt = await tx.wait();
      
      // Extract tokenId from Transfer event (ERC-721 standard)
      const transferEvent = receipt.logs
        .map((log: any) => {
          try {
            return minterContract.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((event: any) => event?.name === "Transfer");
      
      const tokenId = transferEvent?.args?.tokenId?.toString();
      
      if (tokenId) {
        console.log('✅ NFT minted successfully! Token ID:', tokenId);
        console.log('📋 Transaction hash:', receipt.hash);
        console.log('🔗 View on explorer: https://testnet.arcscan.app/tx/' + receipt.hash);
      } else {
        console.warn('⚠️ TokenId not found in Transfer event');
      }

      return tx.hash;
    } catch (error: any) {
      console.error("Error minting NFT:", error);
      throw new Error(error.message || "Error minting NFT");
    }
  };

  return {
    wallet,
    isConnecting,
    connectWallet,
    disconnectWallet,
    switchNetwork,
    fetchAvailableNFTs,
    mintNFT
  };
}





