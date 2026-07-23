/**
 * Global, real-time transaction notifications via Server-Sent Events.
 *
 * Scheduled payments execute on the backend cron (server/scheduler.mjs) with
 * no button click for the frontend to react to — SSE is how this hook learns
 * about them (and their outcome) while the user might be on any screen.
 *
 * Mounted once at the app root (see Layout.tsx) so it keeps running across
 * route changes instead of reconnecting on every navigation.
 */

import { useEffect } from 'react'
import { useArcWallet } from './useArcWallet'
import { notifyPaymentPending, notifyTxExecuted, notifyPaymentFailed } from '@/lib/notify'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3002'

type NotificationPayload =
  | { type: 'payment-pending';  paymentId: string; recipient: string; amount: string; token: string }
  | { type: 'payment-executed'; paymentId: string; recipient: string; amount: string; token: string; txHash: string }
  | { type: 'payment-failed';   paymentId: string; recipient: string; amount: string; token: string; error: string }

export function useTransactionNotifications() {
  const { address } = useArcWallet()

  useEffect(() => {
    if (!address) return

    const source = new EventSource(`${API_BASE}/api/notifications/stream?address=${address}`)

    source.onmessage = (event) => {
      let payload: NotificationPayload
      try {
        payload = JSON.parse(event.data)
      } catch {
        return // heartbeat/comment lines never reach onmessage; malformed data just ignored
      }

      switch (payload.type) {
        case 'payment-pending':
          notifyPaymentPending(payload)
          break
        case 'payment-executed':
          notifyTxExecuted({
            title:     'Scheduled payment sent',
            amount:    payload.amount,
            token:     payload.token,
            recipient: payload.recipient,
            txHash:    payload.txHash,
          })
          break
        case 'payment-failed':
          notifyPaymentFailed(payload)
          break
      }
    }

    // EventSource auto-reconnects on error/drop — nothing to do here beyond
    // letting the browser retry; onerror firing doesn't mean the stream is
    // permanently dead.
    source.onerror = () => {}

    return () => source.close()
  }, [address])
}
