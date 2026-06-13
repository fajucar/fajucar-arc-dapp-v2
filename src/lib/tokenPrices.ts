/**
 * tokenPrices — preços em USD por símbolo de token.
 *
 * Constantes: USDC=1, FAJU=1.50, ARCX=1.50, USYC=1, QCAD=0.73
 * Dinâmicos (buscados a cada 60s com fallback):
 *   EURC  → frankfurter.app (ECB, sem chave)
 *   cirBTC → Binance ticker BTCUSDT
 */

import { useState, useEffect } from 'react'

export type TokenPrices = Record<string, number>

const DEFAULTS: TokenPrices = {
  USDC:   1,
  FAJU:   1.5,
  ARCX:   1.5,
  USYC:   1,
  QCAD:   0.73,
  EURC:   1.08,    // fallback
  cirBTC: 107000,  // fallback
}

const CACHE_TTL = 60_000

// Cache no nível do módulo — compartilhado entre todas as instâncias do hook.
const _cache: { prices: TokenPrices; ts: number } = {
  prices: { ...DEFAULTS },
  ts: 0,
}

async function _refreshPrices(): Promise<TokenPrices> {
  const prices: TokenPrices = { ...DEFAULTS }

  await Promise.allSettled([
    // EUR/USD — frankfurter.app (dados do BCE, CORS ok, sem API key)
    fetch('https://api.frankfurter.app/latest?from=EUR&to=USD')
      .then((r) => r.json())
      .then((data) => {
        const rate = data?.rates?.USD
        if (typeof rate === 'number' && rate > 0) prices.EURC = rate
      }),

    // BTC/USDT — Binance ticker público
    fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT')
      .then((r) => r.json())
      .then((data) => {
        const p = parseFloat(data?.price)
        if (!isNaN(p) && p > 0) prices.cirBTC = p
      }),
  ])

  return prices
}

/** Hook que retorna preços USD por símbolo. Atualiza automaticamente a cada 60s. */
export function useTokenPrices(): TokenPrices {
  const [prices, setPrices] = useState<TokenPrices>(_cache.prices)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      // Cache ainda válido → usa o que tem
      if (Date.now() - _cache.ts < CACHE_TTL) {
        if (!cancelled) setPrices({ ..._cache.prices })
        return
      }
      try {
        const fetched = await _refreshPrices()
        if (!cancelled) {
          _cache.prices = fetched
          _cache.ts = Date.now()
          setPrices({ ...fetched })
        }
      } catch {
        // Fallback: mantém os valores do cache (já inicializados com DEFAULTS)
        if (!cancelled) setPrices({ ..._cache.prices })
      }
    }

    load()
    const interval = setInterval(load, CACHE_TTL)
    return () => { cancelled = true; clearInterval(interval) }
  }, [])

  return prices
}

/** Converte uma quantidade de token para USD. Retorna 0 se o preço não for conhecido. */
export function toUSD(amount: number, symbol: string, prices: TokenPrices): number {
  return amount * (prices[symbol] ?? 0)
}
