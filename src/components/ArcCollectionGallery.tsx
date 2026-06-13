import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { useWalletClient, usePublicClient, useChainId } from 'wagmi';
import { useArcWallet } from '@/hooks/useArcWallet';
import { useArcWriteContract } from '@/hooks/useArcWriteContract';
import { getAddress } from 'viem';
import { useNavigate } from 'react-router-dom';
import { Interface } from 'ethers';
import { ARC_COLLECTION } from '../config/arcCollection';
import { ARC_TESTNET, FAJUCAR_COLLECTION_ADDRESS } from '../config/contracts';
import { CONSTANTS } from '../config/constants';
import FajucarCollectionAbi from '../abis/FajucarCollection.json';
import toast from 'react-hot-toast';
import { addOptimisticUserNft, saveRecentMint } from '@/lib/recentMint';

// FajucarCollection: mintById(modelId). modelId 1=Arc Explorer, 2=Arc Guardian, 3=Arc Builder.

function getModelIdFromTokenURI(uri: string): number | null {
  const u = uri.toLowerCase()
  if (u.includes('arc-explorer')) return 1
  if (u.includes('arc-guardian')) return 2
  if (u.includes('arc-builder')) return 3
  return null
}

const transferInterface = new Interface([
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
])

function isValidContractAddress(value: string | undefined): value is `0x${string}` {
  if (!value || typeof value !== 'string') return false;
  const s = value.trim();
  return s.startsWith('0x') && s.length === 42;
}

function extractTokenIdFromReceipt(
  receipt: { status: string; logs: { address: string; topics: `0x${string}`[]; data: `0x${string}` }[] },
  nftContractAddress: string,
  ownerAddress: string
): string | null {
  if (receipt.status !== 'success' || !receipt.logs?.length) return null;
  const nftLower = nftContractAddress.toLowerCase();
  const ownerLower = ownerAddress.toLowerCase();
  for (const log of receipt.logs) {
    if (log.address?.toLowerCase() !== nftLower) continue;
    try {
      const decoded = transferInterface.parseLog({
        data: log.data,
        topics: [...log.topics],
      });
      if (decoded?.name === 'Transfer') {
        const to = decoded.args?.to as string | undefined;
        if (to?.toLowerCase() === ownerLower) {
          const tokenId = decoded.args?.tokenId as bigint | undefined;
          if (tokenId !== undefined) return tokenId.toString();
        }
      }
    } catch {
      continue;
    }
  }
  return null;
}

type NFTCardProps = {
  item: typeof ARC_COLLECTION[0];
  index: number;
  onMint: (item: typeof ARC_COLLECTION[0]) => void;
  onOpenModal: (item: typeof ARC_COLLECTION[0]) => void;
  mintingId: string | null;
  hasCollection: boolean;
  contractError: boolean;
  isAlreadyOwned: boolean;
  walletNotReady?: boolean;
};

function NFTCard({
  item,
  index,
  onMint,
  onOpenModal,
  mintingId,
  hasCollection,
  contractError,
  isAlreadyOwned,
  walletNotReady = false,
}: NFTCardProps) {
  const isMintingThisCard = mintingId === String(item.id);
  const isButtonDisabled =
    isAlreadyOwned ||
    walletNotReady ||
    !hasCollection ||
    contractError ||
    isMintingThisCard;

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut', delay: index * 0.08 }}
      className={`group relative rounded-2xl border bg-slate-900/50
        ${isMintingThisCard
          ? 'border-cyan-400/60 shadow-[0_0_28px_rgba(34,211,238,0.18)] ring-1 ring-cyan-400/30 z-20'
          : 'border-slate-700/50 hover:border-cyan-400/60 hover:shadow-[0_0_45px_rgba(34,211,238,0.35)] hover:z-20'
        }
        transition-all duration-300 ease-in-out hover:scale-[1.05]
      `}
    >
      {/* Gradient overlay on hover */}
      <div className={`absolute inset-0 rounded-2xl bg-gradient-to-t from-cyan-500/10 via-transparent to-transparent transition-opacity duration-300 pointer-events-none z-10 ${isMintingThisCard ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`} />

      <div
        className="aspect-square rounded-t-2xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 flex items-center justify-center overflow-hidden relative cursor-pointer"
        onClick={() => onOpenModal(item)}
      >
        <img
          src={item.image}
          alt={item.name}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            target.style.display = 'none';
            const parent = target.parentElement;
            if (parent) {
              parent.innerHTML = `<div class="w-full h-full flex items-center justify-center text-slate-500">Image not found</div>`;
            }
          }}
        />
      </div>

      <div className="p-4 relative rounded-b-2xl">
        <h3
          className="text-lg font-semibold mb-2 text-white cursor-pointer hover:text-cyan-300 transition-colors duration-150"
          onClick={() => onOpenModal(item)}
        >
          {item.name}
        </h3>
        <p className="text-sm text-slate-400 mb-4 line-clamp-2 group-hover:line-clamp-none transition-all duration-300">
          {item.description}
        </p>

        <motion.button
          onClick={() => !walletNotReady && onMint(item)}
          disabled={isButtonDisabled}
          whileHover={!isButtonDisabled ? { scale: 1.02 } : {}}
          whileTap={!isButtonDisabled ? { scale: 0.98 } : {}}
          className={`relative w-full px-4 py-3 rounded-xl font-semibold overflow-hidden transition-all duration-300 group/btn
            ${isAlreadyOwned
              ? 'bg-slate-700/60 text-slate-400 cursor-not-allowed opacity-50'
              : walletNotReady
              ? 'bg-slate-700/60 text-slate-500 cursor-not-allowed opacity-60'
              : isMintingThisCard
              ? 'bg-cyan-500/15 border border-cyan-400/40 text-cyan-100 cursor-wait opacity-90'
              : !hasCollection || contractError
                ? 'bg-slate-700/60 text-slate-500 cursor-not-allowed'
                : 'bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-cyan-400 hover:to-blue-400 hover:shadow-[0_0_20px_rgba(34,211,238,0.35)]'
            } ${isMintingThisCard ? 'animate-pulse' : ''}`}
        >
          {!isButtonDisabled && (
            <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover/btn:translate-x-full transition-transform duration-700 pointer-events-none" />
          )}
          {isAlreadyOwned ? (
            'Minted ✓'
          ) : walletNotReady ? (
            'Preparando carteira...'
          ) : isMintingThisCard ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Minting...
            </span>
          ) : (
            'Mint this NFT'
          )}
        </motion.button>
      </div>
    </motion.div>
  );
}

// ── NFT Detail Modal ─────────────────────────────────────────────────────────

type NFTDetailModalProps = {
  item: typeof ARC_COLLECTION[0];
  onClose: () => void;
  onMint: (item: typeof ARC_COLLECTION[0]) => void;
  mintingId: string | null;
  hasCollection: boolean;
  contractError: boolean;
  isAlreadyOwned: boolean;
  walletNotReady?: boolean;
};

function NFTDetailModal({
  item,
  onClose,
  onMint,
  mintingId,
  hasCollection,
  contractError,
  isAlreadyOwned,
  walletNotReady = false,
}: NFTDetailModalProps) {
  const isMinting = mintingId === String(item.id);
  const isDisabled = isAlreadyOwned || walletNotReady || !hasCollection || contractError || isMinting;

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const rarityValue = item.traits?.find(t => t.label === 'Raridade')?.value.toLowerCase();
  const modalBorder =
    rarityValue === 'raro' ? 'border-amber-500/40' :
    rarityValue === 'incomum' ? 'border-purple-500/40' :
    'border-cyan-500/30';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 12 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className={`relative w-full max-w-lg rounded-2xl border ${modalBorder} bg-slate-900 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          aria-label="Fechar"
          className="absolute top-3 right-3 z-10 rounded-full p-1.5 bg-slate-800/80 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Image */}
        <div className="w-full aspect-square bg-gradient-to-br from-cyan-500/20 to-blue-500/20 shrink-0 overflow-hidden">
          <img
            src={item.image}
            alt={item.name}
            className="w-full h-full object-cover"
            onError={(e) => {
              const t = e.target as HTMLImageElement;
              t.style.display = 'none';
            }}
          />
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto p-5 space-y-4">
          <h2 className="text-xl font-bold text-white pr-6">{item.name}</h2>

          <p className="text-sm text-slate-300 leading-relaxed">{item.description}</p>

          {item.traits && item.traits.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Atributos</p>
              <div className="flex flex-wrap gap-2">
                {item.traits.map(({ label, value }) => {
                  const isRarity = label === 'Raridade';
                  const chipClass = isRarity
                    ? value.toLowerCase() === 'raro'
                      ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                      : value.toLowerCase() === 'incomum'
                      ? 'border-purple-500/30 bg-purple-500/10 text-purple-300'
                      : 'border-cyan-500/20 bg-cyan-500/5 text-cyan-300'
                    : 'border-slate-600/50 bg-slate-800/50 text-slate-300';
                  return (
                    <div key={label} className={`rounded-lg border px-3 py-1.5 ${chipClass}`}>
                      <p className="text-[9px] font-semibold uppercase tracking-widest text-slate-500 leading-none mb-0.5">{label}</p>
                      <p className="text-xs font-semibold leading-none">{value}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <motion.button
              whileHover={!isDisabled ? { scale: 1.02 } : {}}
              whileTap={!isDisabled ? { scale: 0.98 } : {}}
              onClick={() => { onMint(item); onClose(); }}
              disabled={isDisabled}
              className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-all duration-300
                ${isAlreadyOwned
                  ? 'bg-slate-700/60 text-slate-400 cursor-not-allowed opacity-50'
                  : walletNotReady
                  ? 'bg-slate-700/60 text-slate-500 cursor-not-allowed opacity-60'
                  : isMinting
                  ? 'bg-cyan-500/15 border border-cyan-400/40 text-cyan-100 cursor-wait animate-pulse'
                  : !hasCollection || contractError
                  ? 'bg-slate-700/60 text-slate-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:from-cyan-400 hover:to-blue-500 shadow-lg shadow-cyan-500/20'
                }`}
            >
              {isAlreadyOwned ? 'Já mintado ✓' : walletNotReady ? 'Preparando carteira...' : isMinting ? 'Mintando...' : 'Mintar este NFT'}
            </motion.button>
            <button
              onClick={onClose}
              className="px-5 py-3 rounded-xl border border-slate-700 bg-slate-800/60 text-sm font-medium text-slate-300 hover:bg-slate-700 hover:text-white hover:border-slate-600 transition-colors"
            >
              Fechar
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export function ArcCollectionGallery() {
  const navigate = useNavigate();
  const { address, signingAddress, isConnected, authMethod, pendingGoogleWallet } = useArcWallet();
  const { writeContractAsync } = useArcWriteContract();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const chainId = useChainId();
  const [modalItem, setModalItem] = useState<typeof ARC_COLLECTION[0] | null>(null);
  const [mintingId, setMintingId] = useState<string | null>(null);
  const [lastTxHash, setLastTxHash] = useState<string | null>(null);
  const [lastContract, setLastContract] = useState<string | null>(null);
  const [lastType, setLastType] = useState<string | null>(null);
  const [lastMintTokenId, setLastMintTokenId] = useState<string | null>(null);
  const [lastMintError, setLastMintError] = useState<string | null>(null);
  const [lastTxStatus, setLastTxStatus] = useState<'idle' | 'pending' | 'success' | 'failed'>('idle');

  const contractAddress = FAJUCAR_COLLECTION_ADDRESS;
  const hasCollection = Boolean(
    contractAddress && contractAddress.trim() &&
    contractAddress.startsWith('0x') && contractAddress.trim().length === 42
  );
  const contractError = hasCollection
    ? null
    : 'Collection contract not configured in production.';

  const [ownedModelIds, setOwnedModelIds] = useState<Set<number>>(new Set())

  useEffect(() => {
    if (!address || !publicClient || !isValidContractAddress(contractAddress)) return
    const contract = contractAddress as `0x${string}`
    let cancelled = false

    const checkOwnership = async () => {
      try {
        const balance = await publicClient.readContract({
          address: contract,
          abi: FajucarCollectionAbi as never,
          functionName: 'balanceOf',
          args: [address],
        }) as bigint

        if (cancelled || balance === 0n) return

        const modelIds = new Set<number>()
        for (let i = 0n; i < balance; i++) {
          if (cancelled) return
          try {
            const tokenId = await publicClient.readContract({
              address: contract,
              abi: FajucarCollectionAbi as never,
              functionName: 'tokenOfOwnerByIndex',
              args: [address, i],
            }) as bigint
            let uri = ''
            try {
              uri = await publicClient.readContract({
                address: contract,
                abi: FajucarCollectionAbi as never,
                functionName: 'tokenURI',
                args: [tokenId],
              }) as string
            } catch { /* skip */ }
            const modelId = getModelIdFromTokenURI(uri)
            if (modelId !== null) modelIds.add(modelId)
          } catch { /* skip */ }
        }

        if (!cancelled) setOwnedModelIds(modelIds)
      } catch { /* ignore */ }
    }

    checkOwnership()
    return () => { cancelled = true }
  }, [address, publicClient, contractAddress])

  const walletNotReady = pendingGoogleWallet

  const handleMint = async (item: typeof ARC_COLLECTION[0]) => {
    if (walletNotReady) {
      toast.error('Carteira em criação. Aguarde alguns segundos e tente novamente.');
      return;
    }

    if (mintingId !== null) {
      toast.error('A mint is already in progress. Please wait for it to finish.');
      return;
    }

    if (!address || !isConnected) {
      toast.error('Please connect your wallet first');
      return;
    }

    if (authMethod === 'wallet' && chainId !== ARC_TESTNET.chainId) {
      toast.error(`Please switch to ${ARC_TESTNET.chainName} (Chain ID: ${ARC_TESTNET.chainId})`);
      return;
    }

    if (!publicClient) {
      toast.error('Wallet not ready.');
      return;
    }

    if (authMethod === 'wallet' && !walletClient) {
      toast.error('Wallet not ready.');
      return;
    }

    if (!hasCollection || !isValidContractAddress(contractAddress)) {
      setLastTxStatus('failed');
      setLastMintError(contractError ?? 'Invalid contract address.');
      toast.error(contractError ?? 'Invalid contract address.');
      return;
    }

    const nftContractAddress = getAddress(contractAddress);

    const modelId = item.id;
    if (modelId !== 1 && modelId !== 2 && modelId !== 3) {
      toast.error('Invalid model. Use Arc Explorer (1), Guardian (2), or Builder (3).');
      return;
    }

    setMintingId(String(item.id));
    setLastMintError(null);
    setLastTxStatus('pending');
    setLastMintTokenId(null);
    setLastTxHash(null);

    try {
      toast.loading(`Minting ${item.name}...`, { id: 'minting' });

      try {
        await publicClient.simulateContract({
          address: nftContractAddress,
          abi: FajucarCollectionAbi as never,
          functionName: 'mintById',
          args: [BigInt(modelId)],
          account: (authMethod === 'social' ? signingAddress : address) ?? address,
        });
      } catch (simError: unknown) {
        setLastTxStatus('failed');
        let msg = 'Transaction would revert.';
        if (simError && typeof simError === 'object') {
          const e = simError as { shortMessage?: string; message?: string };
          msg = (e.shortMessage ?? e.message ?? msg) as string;
        } else if (simError instanceof Error) msg = simError.message;
        setLastMintError(msg);
        toast.error(msg, { id: 'minting', duration: 6000 });
        setMintingId(null);
        return;
      }

      const hash =
        authMethod === 'social'
          ? await writeContractAsync({
              address: nftContractAddress,
              abi: FajucarCollectionAbi as never,
              functionName: 'mintById',
              args: [BigInt(modelId)],
            })
          : await walletClient!.writeContract({
              address: nftContractAddress,
              abi: FajucarCollectionAbi as never,
              functionName: 'mintById',
              args: [BigInt(modelId)],
            });

      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      if (receipt.status !== 'success') {
        setLastTxHash(hash);
        setLastTxStatus('failed');
        const errMsg = 'Transaction reverted on-chain (e.g. MODEL_DISABLED or URI_NOT_SET).';
        setLastMintError(errMsg);
        toast.error(errMsg, { id: 'minting', duration: 5000 });
        setMintingId(null);
        return;
      }

      const tokenId = extractTokenIdFromReceipt(
        receipt as { status: string; logs: { address: string; topics: `0x${string}`[]; data: `0x${string}` }[] },
        nftContractAddress,
        address
      );

      setLastTxHash(hash);
      setLastContract(nftContractAddress);
      setLastType(item.name);
      setLastMintTokenId(tokenId);
      setLastTxStatus('success');
      setOwnedModelIds(prev => new Set([...prev, item.id]));
      addOptimisticUserNft({
        id: tokenId || `optimistic-${hash}`,
        contractAddress: nftContractAddress,
        ownerAddress: address,
        txHash: hash,
        name: item.name,
        image: item.image,
        tokenId,
        timestamp: Date.now(),
      });
      saveRecentMint({
        contractAddress: nftContractAddress,
        nftName: item.name,
        ownerAddress: address,
        txHash: hash,
        tokenId,
        timestamp: Date.now(),
      });
      toast.success(tokenId ? `Minted ${item.name}! Token #${tokenId}` : `Minted ${item.name}!`, { id: 'minting' });
    } catch (error: unknown) {
      setLastTxStatus('failed');
      let message = 'Failed to mint NFT';
      if (typeof error === 'object' && error !== null && 'shortMessage' in error) {
        message = String((error as { shortMessage: string }).shortMessage);
      } else if (error instanceof Error && error.message) {
        message = error.message;
      }
      if (message.toLowerCase().includes('rejected') || message.toLowerCase().includes('denied')) {
        message = 'Transaction rejected by user.';
      }
      setLastMintError(message);
      toast.error(message, { id: 'minting', duration: 5000 });
    } finally {
      setMintingId(null);
    }
  };

  if (!isConnected) {
    return (
      <div className="rounded-2xl border border-slate-700/50 bg-slate-900/50 backdrop-blur-xl p-6">
        <h2 className="text-2xl font-bold mb-4 text-white">Mint Your Arc NFTs</h2>
        <p className="text-slate-400 text-center">Please connect your wallet to mint NFTs</p>
      </div>
    );
  }

  if (authMethod === 'wallet' && chainId !== ARC_TESTNET.chainId) {
    return (
      <div className="rounded-2xl border border-slate-700/50 bg-slate-900/50 backdrop-blur-xl p-6">
        <h2 className="text-2xl font-bold mb-4 text-white">Mint Your Arc NFTs</h2>
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
          <p className="text-amber-200 text-sm">
            Please switch to <strong>{ARC_TESTNET.chainName}</strong> (Chain ID: {ARC_TESTNET.chainId}) to mint NFTs.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-700/40 bg-slate-900/40 backdrop-blur-xl p-6 shadow-[0_0_30px_rgba(34,211,238,0.05)]">
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-2 text-white">Mint Your Arc NFTs</h2>
        <p className="text-slate-400">
          Choose one of Arc&apos;s official artworks and mint your NFT on Arc Testnet.
        </p>
        {authMethod === 'social' && (
          <p className="text-xs text-cyan-400/90 mt-2">
            Login Google — saldos na carteira Circle; mint assinado pela carteira Privy quando disponível.
          </p>
        )}
      </div>

      {walletNotReady && (
        <div className="mb-6 rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-4">
          <p className="text-cyan-200 text-sm">
            Criando sua carteira embedded… Isso leva alguns segundos após o login Google.
          </p>
        </div>
      )}

      {contractError && (
        <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
          <p className="text-amber-200 text-sm font-medium mb-1">Collection contract not configured</p>
          <p className="text-amber-200/90 text-sm">{contractError}</p>
          <p className="text-slate-400 text-xs mt-2">
            Set VITE_FAJUCAR_COLLECTION_ADDRESS in your deployment environment (e.g. Vercel) to enable minting.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {ARC_COLLECTION.slice(0, 3).map((item, index) => (
          <NFTCard
            key={item.id}
            item={item}
            index={index}
            onMint={handleMint}
            onOpenModal={setModalItem}
            mintingId={mintingId}
            hasCollection={hasCollection}
            contractError={!!contractError}
            isAlreadyOwned={ownedModelIds.has(item.id)}
            walletNotReady={walletNotReady}
          />
        ))}
      </div>

      {lastTxHash && lastTxStatus === 'success' && (
        <div className="mt-6 rounded-xl border border-cyan-500/30 bg-slate-800/50 p-4">
          <p className="text-slate-300 text-sm mb-2">
            Minted NFT: <span className="font-mono text-cyan-300">{lastType ?? 'NFT'}</span>
          </p>
          <p className="text-slate-300 text-sm mb-2">
            Tx hash: <span className="font-mono text-cyan-300">{lastTxHash.slice(0, 6)}...{lastTxHash.slice(-4)}</span>
          </p>
          {lastMintTokenId && (
            <p className="text-slate-300 text-sm mb-2">
              Token ID: <span className="font-mono text-cyan-300">#{lastMintTokenId}</span>
            </p>
          )}
          <p className="text-slate-400 text-sm mb-4">
            Finalizing on-chain confirmation...
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(`/my-nfts${lastMintTokenId ? `?highlight=${lastMintTokenId}` : ''}`)}
              className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-400"
            >
              View My NFTs
            </button>
            <a
              href={`${CONSTANTS.LINKS.explorer}/tx/${lastTxHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm font-medium text-cyan-400 hover:text-cyan-300 transition-colors"
            >
              View on Explorer
            </a>
          </div>
          {lastContract && (
            <p className="text-slate-500 text-xs mt-2">
              NFT Contract: {lastContract.slice(0, 6)}...{lastContract.slice(-4)}
            </p>
          )}
        </div>
      )}

      {lastTxStatus === 'failed' && lastMintError && (
        <div className="mt-6 rounded-xl border border-red-500/30 bg-slate-800/50 p-4">
          <p className="text-slate-300 text-sm font-medium mb-1">Last mint result: failed</p>
          <p className="text-slate-300 text-sm break-words">{lastMintError}</p>
          {lastTxHash && (
            <a
              href={`${CONSTANTS.LINKS.explorer}/tx/${lastTxHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm font-medium text-cyan-400 hover:text-cyan-300 mt-2"
            >
              View failed tx on Explorer
            </a>
          )}
        </div>
      )}

      {ARC_COLLECTION.slice(0, 3).some(item => item.tokenURI.includes('YOUR-HOSTED-URL') || item.tokenURI.includes('TODO')) && (
        <div className="mt-6 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
          <p className="text-amber-200 text-sm">
            ⚠️ <strong>Note:</strong> Some tokenURIs are not configured. Please update{' '}
            <code className="bg-slate-800 px-1 rounded text-slate-300">frontend/src/config/arcCollection.ts</code> with actual metadata URLs.
          </p>
        </div>
      )}

      <AnimatePresence>
        {modalItem && (
          <NFTDetailModal
            item={modalItem}
            onClose={() => setModalItem(null)}
            onMint={handleMint}
            mintingId={mintingId}
            hasCollection={hasCollection}
            contractError={!!contractError}
            isAlreadyOwned={ownedModelIds.has(modalItem.id)}
            walletNotReady={walletNotReady}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
