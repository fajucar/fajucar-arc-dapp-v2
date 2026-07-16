/**
 * ArcScan API client — shared by the explorer proxy routes (server/index.mjs)
 * and the agent's getTransactionHistory tool (server/agent.mjs).
 *
 * ArcScan is the correct public explorer for Arc Testnet (testnet.arcscan.app)
 */

export const ARCSCAN_API = 'https://testnet.arcscan.app/api/v2'

async function getJson(url) {
  const r = await fetch(url, { headers: { Accept: 'application/json' } })
  return r.json()
}

export function fetchAddressTransactions(address) {
  return getJson(`${ARCSCAN_API}/addresses/${address}/transactions`)
}

export function fetchTokenTransfers(address) {
  return getJson(`${ARCSCAN_API}/addresses/${address}/token-transfers`)
}

export function fetchAddressInfo(address) {
  return getJson(`${ARCSCAN_API}/addresses/${address}`)
}

// Dedicated counters endpoint — returns the REAL total transaction count for
// the address, unlike /transactions which is paginated at 50 items/page.
export function fetchAddressCounters(address) {
  return getJson(`${ARCSCAN_API}/addresses/${address}/counters`)
}
