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
    description: "Um explorador corajoso desbravando a Arc Network. O Explorer representa os pioneiros que se aventuram no futuro da finalidade determinística, os primeiros a cruzar a fronteira de uma rede construída para stablecoins.",
    image: "/assets/nfts/arc_explorer.png",
    tokenURI: getMetadataURL("arc-explorer.json"),
    traits: [
      { label: 'Tipo', value: 'Explorer' },
      { label: 'Raridade', value: 'Comum' },
      { label: 'Rede', value: 'Arc Testnet' },
    ],
  },
  {
    id: 2,
    name: "Arc Guardian",
    description: "Um guardião protegendo o ecossistema Arc. O Guardian representa a segurança e estabilidade que a Arc Network oferece, sempre vigilante, garantindo que cada transação chegue ao destino com integridade.",
    image: "/assets/nfts/arc_builder.png",
    tokenURI: getMetadataURL("arc-guardian.json"),
    traits: [
      { label: 'Tipo', value: 'Guardian' },
      { label: 'Raridade', value: 'Incomum' },
      { label: 'Rede', value: 'Arc Testnet' },
    ],
  },
  {
    id: 3,
    name: "Arc Builder",
    description: "Um construtor criando o futuro na Arc Network. O Builder representa os desenvolvedores que constroem dApps inovadores sobre a infraestrutura estável da Arc, cada linha de código uma pedra no alicerce do novo sistema financeiro.",
    image: "/assets/nfts/arc_guardian.png",
    tokenURI: getMetadataURL("arc-builder.json"),
    traits: [
      { label: 'Tipo', value: 'Builder' },
      { label: 'Raridade', value: 'Raro' },
      { label: 'Rede', value: 'Arc Testnet' },
    ],
  },
  {
    id: 4,
    name: "Arc Genesis #4",
    description: "Quarto NFT da coleção Arc. Representa a comunidade e colaboração na Arc Testnet.",
    image: "/arc-nfts/arc4.png",
    tokenURI: getMetadataURL("arc4.json")
  },
  {
    id: 5,
    name: "Arc Genesis #5",
    description: "Quinto e último NFT da coleção Arc Genesis. Marca o futuro promissor da Arc Network.",
    image: "/arc-nfts/arc5.png",
    tokenURI: getMetadataURL("arc5.json")
  }
];












