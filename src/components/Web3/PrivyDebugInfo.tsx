import { useEffect } from 'react'
import { usePrivy } from '@privy-io/react-auth'

/**
 * Debug component to help identify Privy authorization issues
 * Only shows in development mode
 */
export function PrivyDebugInfo() {
  if (import.meta.env.PROD) return null

  const { ready, authenticated, user } = usePrivy()

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return

    // Log current environment info
    const currentOrigin = window.location.origin
    const currentUrl = window.location.href

    console.group('🔍 [Privy Debug Info]')
    console.log('Current Origin:', currentOrigin)
    console.log('Current URL:', currentUrl)
    console.log('Privy Ready:', ready)
    console.log('Authenticated:', authenticated)
    console.log('User:', user)

    // Check if current origin is commonly used for development
    const devOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:3002',
      'http://localhost:3003',
      'http://127.0.0.1:3000',
    ]

    const isDev = devOrigins.includes(currentOrigin)

    if (isDev) {
      console.log('✅ Development origin detected')
      console.log('💡 Make sure this origin is added to Privy dashboard:')
      console.log('   → https://dashboard.privy.io')
      console.log(`   → Settings → Clients → Add origin: ${currentOrigin}`)
    } else {
      console.log('🌐 Production/Custom origin detected')
    }

    // Log any potential issues
    if (!ready) {
      console.warn('⚠️ Privy not ready yet...')
    }

    if (ready && !authenticated) {
      console.log('🔓 Privy ready but not authenticated')
    }

    console.groupEnd()

    // Log authorization errors from the global error handler
    const originalError = window.console.error
    window.console.error = function(...args) {
      const message = args.join(' ')

      if (message.includes('source has not been authorized') ||
          message.includes('not been authorized yet')) {
        console.group('🚨 [Privy Authorization Error Detected]')
        console.error('Authorization Error Details:', ...args)
        console.log('🔧 To fix this:')
        console.log('1. Go to https://dashboard.privy.io')
        console.log('2. Select FajuARC app (cmp0dlx5n026d0djsdyf4b3p3)')
        console.log('3. Go to Settings → Clients tab')
        console.log(`4. Add allowed origin: ${currentOrigin}`)
        console.log('5. Save and refresh this page')
        console.groupEnd()
      }

      originalError.apply(console, args)
    }

  }, [ready, authenticated, user])

  // Don't render anything in production
  if (process.env.NODE_ENV !== 'development') return null

  return (
    <div className="fixed bottom-4 right-4 bg-slate-900/95 border border-slate-700 rounded-lg p-3 text-xs font-mono text-slate-300 max-w-sm z-50">
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-2 h-2 rounded-full ${ready ? 'bg-green-500' : 'bg-yellow-500'}`} />
        <span className="font-semibold">Privy Status</span>
      </div>
      <div className="space-y-1 text-xs">
        <div>Ready: <span className={ready ? 'text-green-400' : 'text-yellow-400'}>{ready ? 'Yes' : 'No'}</span></div>
        <div>Auth: <span className={authenticated ? 'text-green-400' : 'text-slate-400'}>{authenticated ? 'Yes' : 'No'}</span></div>
        <div>Origin: <span className="text-cyan-400">{window.location.origin}</span></div>
      </div>
    </div>
  )
}