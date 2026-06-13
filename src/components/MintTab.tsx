import React, { useEffect, useState } from 'react';
import { useArcWeb3 } from '../hooks/useArcWeb3';
import { GiftCardNFT } from '../types';
import { Loader2, AlertTriangle, CheckCircle2, CreditCard, Sparkles } from 'lucide-react';
import NFTCarousel from './NFTCarousel';
import { ARC_TESTNET_CHAIN_ID } from '../constants';

interface MintTabProps {
  onRequestConnect: () => void;
}

const MintTab: React.FC<MintTabProps> = ({ onRequestConnect }) => {
  const { fetchAvailableNFTs, mintNFT, wallet, switchNetwork } = useArcWeb3();
  
  const [nfts, setNfts] = useState<GiftCardNFT[]>([]);
  const [selectedNft, setSelectedNft] = useState<GiftCardNFT | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isMinting, setIsMinting] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setIsLoadingData(true);
      try {
        const data = await fetchAvailableNFTs();
        setNfts(data);
        if (data.length > 0) setSelectedNft(data[0]);
      } catch (err) {
        console.error(err);
        setError("Failed to load NFT options from contract.");
      } finally {
        setIsLoadingData(false);
      }
    };
    load();
  }, []);

  const handleMint = async () => {
    if (!selectedNft) return;
    setError(null);
    setTxHash(null);

    if (!wallet.address) {
      onRequestConnect();
      return;
    }

    if (wallet.chainId !== ARC_TESTNET_CHAIN_ID) {
      setError("Wrong network. Please switch to Arc Testnet.");
      return;
    }

    setIsMinting(true);
    try {
      const hash = await mintNFT(selectedNft.id);
      setTxHash(hash);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Error minting NFT.");
    } finally {
      setIsMinting(false);
    }
  };

  if (isLoadingData) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-slate-400">
        <Loader2 className="w-10 h-10 animate-spin mb-4 text-cyan-500" />
        <p className="font-medium text-slate-500">Syncing with Arc Testnet...</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in-up max-w-5xl mx-auto">
      
      {/* Header Section */}
      <div className="text-center mb-12">
        <h2 className="text-4xl font-bold text-slate-900 mb-3 tracking-tight">Mint Your GiftCard</h2>
        <p className="text-slate-500 text-lg">
          Select a design and mint instantly on Arc Testnet.
        </p>
      </div>

      {/* Error / Success Notifications */}
      {error && (
        <div className="mb-8 bg-red-50 border border-red-100 p-4 rounded-2xl flex items-center gap-4 text-red-600 shadow-sm">
          <AlertTriangle className="w-6 h-6 shrink-0" />
          <div className="flex-1 text-sm font-medium">{error}</div>
          {error.includes('network') || error.includes('Network') && (
            <button onClick={switchNetwork} className="px-4 py-2 bg-white text-red-600 border border-red-200 rounded-lg text-xs font-bold hover:bg-red-50 transition-colors">
              Switch Network
            </button>
          )}
        </div>
      )}

      {txHash && (
        <div className="mb-8 bg-emerald-50 border border-emerald-100 p-6 rounded-3xl flex flex-col md:flex-row items-center gap-6 text-center md:text-left shadow-sm">
          <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600">
             <CheckCircle2 className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-lg text-emerald-900">Mint successful!</h3>
            <p className="text-emerald-700 text-sm mt-1 mb-2">Your NFT has been generated on the blockchain.</p>
            <div className="bg-white/50 px-3 py-1.5 rounded-lg text-xs font-mono text-emerald-600/80 break-all select-all border border-emerald-100/50">
              {txHash}
            </div>
          </div>
          <a 
            href={`https://testnet.arcscan.app/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-lg text-sm transition-all shadow-lg hover:shadow-emerald-500/20"
          >
            View on Explorer
          </a>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
        
        {/* LEFT: NFT Card Preview (The "Product") */}
        <div className="lg:col-span-7 order-2 lg:order-1 w-full perspective-1000">
          {selectedNft ? (
            <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-[2.5rem] p-2 shadow-2xl transform transition-transform duration-500 hover:rotate-y-1">
              
              {/* Inner Card Container */}
              <div className="bg-slate-900 rounded-[2rem] overflow-hidden relative border border-slate-700">
                 
                 {/* Shiny Overlay */}
                 <div className="absolute inset-0 bg-gradient-to-tr from-white/5 to-transparent pointer-events-none z-20"></div>

                 {/* Image Area */}
                 <div className="relative aspect-[1.6/1] w-full bg-black overflow-hidden flex items-center justify-center">
                    <img 
                      src={selectedNft.imageURI} 
                      alt={selectedNft.name} 
                      className="w-full h-full object-cover opacity-90 hover:scale-105 transition-transform duration-700"
                    />
                    
                    {/* Chip Icon */}
                    <div className="absolute top-8 left-8 z-30 w-12 h-9 rounded bg-gradient-to-br from-yellow-200 to-yellow-500 opacity-80 border border-yellow-600/50 shadow-sm"></div>
                    
                    {/* Brand Watermark */}
                    <div className="absolute top-8 right-8 z-30">
                      <span className="text-white/30 font-bold tracking-widest text-xl italic">ARC</span>
                    </div>

                    <div className="absolute bottom-8 left-8 z-30 text-white drop-shadow-md">
                      <p className="text-xs uppercase tracking-widest opacity-70 mb-1">Card Holder</p>
                      <p className="font-mono text-lg tracking-wider">{wallet.address ? `${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}` : '0x...TEST'}</p>
                    </div>
                 </div>

                 {/* Action Area */}
                 <div className="bg-white p-8">
                   <div className="flex justify-between items-start mb-6">
                     <div>
                       <h3 className="text-2xl font-bold text-slate-800">{selectedNft.name}</h3>
                       <p className="text-slate-500 text-sm mt-1">{selectedNft.description}</p>
                     </div>
                     <div className="text-right">
                       <span className="block text-xs font-bold text-slate-400 uppercase tracking-wider">Price</span>
                       <span className="block text-xl font-bold text-cyan-600">0.5 USDC</span>
                     </div>
                   </div>

                   <button
                     onClick={!wallet.address ? onRequestConnect : handleMint}
                     disabled={isMinting}
                     className={`
                       w-full py-4 rounded-xl font-bold text-lg transition-all shadow-lg flex items-center justify-center gap-3
                       ${isMinting 
                         ? 'bg-slate-100 text-slate-400 cursor-not-allowed' 
                         : !wallet.address 
                            ? 'bg-slate-900 text-white hover:bg-slate-800'
                            : 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:shadow-amber-500/30 hover:-translate-y-0.5'}
                     `}
                   >
                     {isMinting ? (
                       <>
                         <Loader2 className="w-5 h-5 animate-spin" /> Processing...
                       </>
                     ) : !wallet.address ? (
                        "Connect Wallet to Mint"
                     ) : (
                       <>
                         <Sparkles className="w-5 h-5" /> Mint NFT
                       </>
                     )}
                   </button>
                 </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* RIGHT: Selector List */}
        <div className="lg:col-span-5 order-1 lg:order-2 w-full">
           <div className="glass-panel p-6 rounded-3xl">
              <h4 className="text-slate-800 font-bold mb-6 flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-cyan-500" />
                Available Collection
              </h4>
              
              <div className="flex flex-col gap-3">
                {nfts.map(nft => (
                  <button 
                    key={nft.id}
                    onClick={() => setSelectedNft(nft)}
                    className={`
                      flex items-center gap-4 p-3 rounded-2xl transition-all duration-200 text-left border
                      ${selectedNft?.id === nft.id 
                        ? 'bg-gradient-to-r from-cyan-50 to-blue-50 border-cyan-200 shadow-sm scale-[1.02]' 
                        : 'bg-transparent border-transparent hover:bg-slate-50 hover:border-slate-100'}
                    `}
                  >
                     <div className="w-16 h-10 rounded-lg overflow-hidden shrink-0 shadow-sm relative bg-slate-200">
                        <img src={nft.imageURI} className="w-full h-full object-cover" alt="" />
                     </div>
                     <div className="flex-1 min-w-0">
                        <div className={`font-bold text-sm truncate ${selectedNft?.id === nft.id ? 'text-cyan-900' : 'text-slate-700'}`}>
                          {nft.name}
                        </div>
                        <div className="text-xs text-slate-400 font-medium">0.5 USDC</div>
                     </div>
                     {selectedNft?.id === nft.id && (
                       <div className="w-2 h-2 rounded-full bg-cyan-500 mr-2 shadow-[0_0_8px_rgba(6,182,212,0.6)]"></div>
                     )}
                  </button>
                ))}
              </div>
           </div>
        </div>
      </div>
      
      {/* Mobile Horizontal Carousel */}
      <div className="lg:hidden mt-8">
         <NFTCarousel nfts={nfts} selectedId={selectedNft?.id || null} onSelect={setSelectedNft} />
      </div>
    </div>
  );
};

export default MintTab;





