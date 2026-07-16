import { useEffect, useState } from "react";
import { useAccount, usePublicClient } from "wagmi";
import toast from "react-hot-toast";

import { FAJUCAR_COLLECTION_ADDRESS } from "../../config/contracts";
import FajucarCollectionAbi from "../../abis/FajucarCollection.json";

const FALLBACK_TOKEN_URI =
  "ipfs://bafkreicisecsndv777lv3hfafh3kfgvxf25al2mf7rifrqbdbbjqvcrs6u";

const MAX_TOKEN_SCAN_DEFAULT = 200;
const SCAN_CONCURRENCY = 10;

type NFTItem = {
  tokenId: number;
  tokenUri: string;
};

function MintPage() {
  const { address } = useAccount();
  const publicClient = usePublicClient();

  const [loading, setLoading] = useState(false);
  const [nfts, setNfts] = useState<NFTItem[]>([]);
  const [maxScan] = useState(MAX_TOKEN_SCAN_DEFAULT);

  async function loadNFTs() {
    if (!address || !publicClient) return;
    if (!FAJUCAR_COLLECTION_ADDRESS) return;

    setLoading(true);
    setNfts([]);

    const contractAddress = FAJUCAR_COLLECTION_ADDRESS as `0x${string}`;
    try {
      // 1) balanceOf
      const balance = (await publicClient.readContract({
        address: contractAddress,
        abi: FajucarCollectionAbi,
        functionName: "balanceOf",
        args: [address],
      })) as bigint;

      if (balance === 0n) {
        setNfts([]);
        setLoading(false);
        return;
      }

      let tokenIds: number[] = [];

      // 2) Try ERC721Enumerable
      const hasEnumerable = FajucarCollectionAbi.some(
        (item: any) => item.name === "tokenOfOwnerByIndex"
      );

      if (hasEnumerable) {
        for (let i = 0n; i < balance; i++) {
          const tokenId = (await publicClient.readContract({
            address: contractAddress,
            abi: FajucarCollectionAbi,
            functionName: "tokenOfOwnerByIndex",
            args: [address, i],
          })) as bigint;

          tokenIds.push(Number(tokenId));
        }
      } else {
        // 3) Fallback ownerOf scan
        const found: number[] = [];
        let index = 1;

        const worker = async () => {
          while (index <= maxScan) {
            const current = index++;
            try {
              const owner = (await publicClient!.readContract({
                address: contractAddress,
                abi: FajucarCollectionAbi,
                functionName: "ownerOf",
                args: [BigInt(current)],
              })) as string;

              if (owner.toLowerCase() === address!.toLowerCase()) {
                found.push(current);
              }
            } catch {
              // token does not exist → ignore
            }
          }
        };

        await Promise.all(
          Array.from({ length: SCAN_CONCURRENCY }).map(worker)
        );

        tokenIds = found;
      }

      // 4) Resolve tokenURI
      const items: NFTItem[] = [];

      for (const tokenId of tokenIds) {
        let tokenUri = FALLBACK_TOKEN_URI;
        try {
          const uri = (await publicClient.readContract({
            address: contractAddress,
            abi: FajucarCollectionAbi,
            functionName: "tokenURI",
            args: [BigInt(tokenId)],
          })) as string;
          tokenUri = uri || FALLBACK_TOKEN_URI;
        } catch {
          tokenUri = FALLBACK_TOKEN_URI;
        }

        items.push({ tokenId, tokenUri });
      }

      setNfts(items);
    } catch (err) {
      console.error(err);
      toast.error("Error loading NFTs");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadNFTs();
  }, [address]);

  return (
    <div className="max-w-6xl mx-auto p-6 text-white">
      <h1 className="text-3xl font-bold mb-4">My NFTs</h1>

      <p className="text-white/60 mb-4">
        Owner: {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "-"}
      </p>

      <button
        onClick={loadNFTs}
        disabled={loading}
        className="mb-6 px-4 py-2 rounded-lg bg-cyan-500/30 hover:bg-amber-500/40 disabled:opacity-50"
      >
        {loading ? "Loading..." : "Refresh"}
      </button>

      {!loading && nfts.length === 0 && (
        <div className="mt-10 text-center text-white/70">
          <p className="text-lg font-semibold">No NFTs found</p>
          <p className="text-sm mt-2">
            NFTs are fetched directly from the contract, without relying on logs.
          </p>
        </div>
      )}

      {nfts.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
          {nfts.map((nft) => (
            <div
              key={nft.tokenId}
              className="rounded-xl border border-white/10 p-4 bg-white/5"
            >
              <img
                src={nft.tokenUri.replace("ipfs://", "https://ipfs.io/ipfs/")}
                alt={`NFT ${nft.tokenId}`}
                className="rounded-lg mb-3"
              />
              <p className="text-sm text-white/80">
                Token ID #{nft.tokenId}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
export default MintPage;
export { MintPage };
