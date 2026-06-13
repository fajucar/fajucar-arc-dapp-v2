import React from 'react';
import { GiftCardNFT } from '../types';

interface NFTCarouselProps {
  nfts: GiftCardNFT[];
  selectedId: number | string | null;
  onSelect: (nft: GiftCardNFT) => void;
}

const NFTCarousel: React.FC<NFTCarouselProps> = ({ nfts, selectedId, onSelect }) => {
  return (
    <div className="w-full relative mt-8">
      <h4 className="text-slate-400 text-xs uppercase tracking-wider font-bold mb-4 ml-1">
        Toque para Selecionar
      </h4>
      
      <div className="flex overflow-x-auto gap-4 pb-6 scrollbar-hide snap-x snap-mandatory px-1">
        {nfts.map((nft) => {
          const isSelected = selectedId === nft.id;
          return (
            <button
              key={nft.id}
              onClick={() => onSelect(nft)}
              className={`
                relative shrink-0 w-48 bg-white rounded-2xl overflow-hidden border transition-all duration-300 snap-center group shadow-sm
                ${isSelected 
                  ? 'border-cyan-400 ring-4 ring-cyan-500/10 scale-100 z-10 opacity-100' 
                  : 'border-slate-100 hover:border-slate-300 opacity-80 hover:opacity-100'}
              `}
            >
              <div className="aspect-[1.6/1] w-full relative bg-slate-100">
                <img 
                  src={nft.imageURI} 
                  alt={nft.name} 
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                />
              </div>

              <div className="p-4 text-left">
                <h5 className={`font-bold text-sm truncate ${isSelected ? 'text-cyan-700' : 'text-slate-700'}`}>
                  {nft.name}
                </h5>
                <p className="text-[10px] text-slate-400 mt-1 font-medium">0.5 USDC</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default NFTCarousel;





