/**
 * Arc Collection Configuration
 * 
 * This file defines the collection of Arc NFTs that users can mint.
 * Each NFT has:
 * - id: Unique identifier
 * - name: Display name
 * - description: Description of the NFT
 * - image: Path to the image file in public/arc-nfts/
 * - tokenURI: URL to the metadata JSON (ERC-721 standard)
 * 
 * TODO: Replace the tokenURI placeholders with actual hosted metadata URLs
 * The metadata JSON should follow ERC-721 standard:
 * {
 *   "name": "Arc Genesis #1",
 *   "description": "Primeiro NFT oficial da coleção Arc na testnet.",
 *   "image": "https://YOUR-HOSTED-URL/arc-nfts/arc1.png"
 * }
 */

export type ArcNFTItem = {
  id: number;
  name: string;
  description: string;
  image: string;    // Path to image in public/arc-nfts/
  tokenURI: string; // URL to metadata JSON (ERC-721 standard)
  traits?: Array<{ label: string; value: string }>;
};

// Helper function to get absolute URL for metadata
function getMetadataURL(filename: string): string {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/metadata/${filename}`
  }
  // Fallback for SSR - use localhost in dev, or update with production URL
  const isDev = import.meta.env.DEV
  if (isDev) {
    return `http://localhost:3000/metadata/${filename}`
  }
  // Production URL - UPDATE THIS with your actual deployment URL
  return `https://your-app-domain.com/metadata/${filename}`
}

// Helper function to get absolute URL for images in metadata JSON
// This is used when generating metadata dynamically
export function getImageURL(imagePath: string): string {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}${imagePath}`
  }
  const isDev = import.meta.env.DEV
  if (isDev) {
    return `http://localhost:3000${imagePath}`
  }
  // Production URL - UPDATE THIS with your actual deployment URL
  return `https://your-app-domain.com${imagePath}`
}

export const ARC_COLLECTION: ArcNFTItem[] = [
  {
    id: 1,
    name: "Arc Explorer",
    description: "A brave explorer venturing into the Arc Network. The Explorer represents the pioneers who venture into the future of deterministic finality, the first to cross the frontier of a network built for stablecoins.",
    image: "/assets/nfts/arc_explorer.png",
    tokenURI: getMetadataURL("arc-explorer.json"),
    traits: [
      { label: 'Type', value: 'Explorer' },
      { label: 'Rarity', value: 'Common' },
      { label: 'Network', value: 'Arc Testnet' },
    ],
  },
  {
    id: 2,
    name: "Arc Guardian",
    description: "A guardian protecting the Arc ecosystem. The Guardian represents the security and stability that the Arc Network offers, always vigilant, ensuring every transaction reaches its destination with integrity.",
    image: "/assets/nfts/arc_builder.png",
    tokenURI: getMetadataURL("arc-guardian.json"),
    traits: [
      { label: 'Type', value: 'Guardian' },
      { label: 'Rarity', value: 'Uncommon' },
      { label: 'Network', value: 'Arc Testnet' },
    ],
  },
  {
    id: 3,
    name: "Arc Builder",
    description: "A builder creating the future on the Arc Network. The Builder represents the developers building innovative dApps on Arc's stable infrastructure, each line of code a building block of the new financial system.",
    image: "/assets/nfts/arc_guardian.png",
    tokenURI: getMetadataURL("arc-builder.json"),
    traits: [
      { label: 'Type', value: 'Builder' },
      { label: 'Rarity', value: 'Rare' },
      { label: 'Network', value: 'Arc Testnet' },
    ],
  },
  {
    id: 4,
    name: "Arc Genesis #4",
    description: "Fourth NFT of the Arc collection. Represents community and collaboration on Arc Testnet.",
    image: "/arc-nfts/arc4.png",
    tokenURI: getMetadataURL("arc4.json")
  },
  {
    id: 5,
    name: "Arc Genesis #5",
    description: "Fifth and final NFT of the Arc Genesis collection. Marks the promising future of the Arc Network.",
    image: "/arc-nfts/arc5.png",
    tokenURI: getMetadataURL("arc5.json")
  }
];












