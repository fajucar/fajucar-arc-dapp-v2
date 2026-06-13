// src/utils/ipfs.ts

type FetchJsonOptions = {
  timeoutMs?: number;
  retries?: number;
};

const DEFAULT_TIMEOUT = 12_000;
const DEFAULT_RETRIES = 1;

// Gateways (ordem importa)
const IPFS_GATEWAYS = [
  "https://gateway.pinata.cloud/ipfs/",
  "https://cloudflare-ipfs.com/ipfs/",
  "https://dweb.link/ipfs/",
  "https://ipfs.io/ipfs/",
] as const;

function normalizeToCidPath(input: string): string | null {
  if (!input) return null;

  // ipfs://<cid>/...
  if (input.startsWith("ipfs://")) {
    return input.replace("ipfs://", "");
  }

  // https://.../ipfs/<cid>/...
  const ipfsIndex = input.indexOf("/ipfs/");
  if (ipfsIndex !== -1) {
    return input.slice(ipfsIndex + "/ipfs/".length);
  }

  // raw cid-ish
  if (/^[a-zA-Z0-9]+$/.test(input) && input.length > 20) {
    return input;
  }

  return null;
}

export function ipfsCandidates(uri: string): string[] {
  if (!uri) return [];

  // Se já é http(s), tenta do jeito que está também
  const directHttp =
    uri.startsWith("http://") || uri.startsWith("https://") ? [uri] : [];

  const cidPath = normalizeToCidPath(uri);
  if (!cidPath) return directHttp;

  const gwUrls = IPFS_GATEWAYS.map((gw) => `${gw}${cidPath}`);

  // remove duplicados mantendo ordem
  return Array.from(new Set([...directHttp, ...gwUrls]));
}

function withTimeout<T>(p: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error(`Timeout after ${timeoutMs}ms`)),
      timeoutMs
    );
    p.then((v) => {
      clearTimeout(t);
      resolve(v);
    }).catch((e) => {
      clearTimeout(t);
      reject(e);
    });
  });
}

async function fetchTextSafe(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

async function fetchJsonOnce(url: string, timeoutMs: number): Promise<any> {
  const res = await withTimeout(fetch(url, { method: "GET" }), timeoutMs);

  if (!res.ok) {
    const text = await fetchTextSafe(res);
    throw new Error(
      `HTTP ${res.status} (${res.statusText}) - ${url}${
        text ? ` | ${text.slice(0, 160)}` : ""
      }`
    );
  }

  // Alguns gateways vêm com content-type torto; mesmo assim tenta json()
  return await res.json();
}

export async function fetchJsonFromIpfs(
  uri: string,
  opts: FetchJsonOptions = {}
) {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT;
  const retries = opts.retries ?? DEFAULT_RETRIES;

  const candidates = ipfsCandidates(uri);
  if (candidates.length === 0) {
    throw new Error(`Invalid IPFS uri: ${uri}`);
  }

  let lastErr: any = null;

  for (const url of candidates) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await fetchJsonOnce(url, timeoutMs);
      } catch (e: any) {
        lastErr = e;
        const msg = String(e?.message || e);

        // retry só se for rede/timeout/5xx
        const retryable =
          msg.includes("Timeout") ||
          msg.includes("Failed to fetch") ||
          msg.includes("NetworkError") ||
          msg.includes("HTTP 5");

        if (!retryable || attempt === retries) break;

        // delay pequeno antes de tentar de novo
        await new Promise((r) => setTimeout(r, 600));
      }
    }
  }

  const lastTried = candidates[candidates.length - 1];
  throw new Error(
    `Gateway error (HTTP/Network)\nLast tried: ${lastTried}\n${String(
      lastErr?.message || lastErr
    )}`
  );
}
