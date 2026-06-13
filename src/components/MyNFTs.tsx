
// imagens (seu caminho real)
import visionaryImg from "@/assets/NFTs/fajucar-1.png";
import guardianImg from "@/assets/NFTs/fajucar-2.png";
import builderImg from "@/assets/NFTs/fajucar-3.png";

// Safe access to env vars - never throws
function getEnvVar(key: string): string {
  try {
    const value = import.meta.env[key]
    return typeof value === 'string' ? value : ''
  } catch {
    return ''
  }
}

const NFTS = [
  {
    key: "visionary",
    name: "Fajucar!1 — The Visionary",
    image: visionaryImg,
    mintUrl: getEnvVar('VITE_FAJ_VISIONARY_MINT_URL'),
    description:
      "The Visionary sees before others do, finding patterns where there is noise. It represents the initial spark — the idea that gives meaning to what is yet to come.",
  },
  {
    key: "guardian",
    name: "Fajucar!2 — The Guardian",
    image: guardianImg,
    mintUrl: getEnvVar('VITE_FAJ_GUARDIAN_MINT_URL'),
    description:
      "The Guardian protects what has been created. It stands for security, integrity, and trust, ensuring the system remains stable and resilient even as everything around it changes.",
  },
  {
    key: "builder",
    name: "Fajucar!3 — The Builder",
    image: builderImg,
    mintUrl: getEnvVar('VITE_FAJ_BUILDER_MINT_URL'),
    description:
      "The Builder turns vision into reality. Focused on structure and execution, it represents steady progress, solid foundations, and the work required to build the future block by block.",
  },
];

export default function MyNFTs() {
  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ fontSize: 26, marginBottom: 16 }}>My NFTs</h2>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 20,
        }}
      >
        {NFTS.map((nft) => (
          <div
            key={nft.key}
            style={{
              border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: 16,
              padding: 16,
              background: "rgba(255,255,255,0.03)",
            }}
          >
            <img
              src={nft.image}
              alt={nft.name}
              style={{ width: "100%", borderRadius: 12, marginBottom: 12 }}
            />

            <h3 style={{ fontSize: 18, marginBottom: 8 }}>{nft.name}</h3>

            {/* DESCRIÇÃO EMBAIXO — como você pediu */}
            <p style={{ opacity: 0.9, lineHeight: 1.5 }}>
              {nft.description}
            </p>

            <a
              href={nft.mintUrl}
              target="_blank"
              rel="noreferrer"
              style={{
                display: "inline-block",
                marginTop: 12,
                padding: "10px 14px",
                borderRadius: 12,
                background: "rgba(0,200,120,0.2)",
                border: "1px solid rgba(0,200,120,0.4)",
                textDecoration: "none",
              }}
            >
              Mint
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
