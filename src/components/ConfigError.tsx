import { FAJUCAR_COLLECTION_ADDRESS } from '../config/contracts'

export function ConfigError() {
  if (FAJUCAR_COLLECTION_ADDRESS) return null

  return (
    <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6">
      <div className="flex">
        <div className="flex-shrink-0">
          <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        </div>
        <div className="ml-3">
          <h3 className="text-sm font-medium text-yellow-800">Collection contract address not configured</h3>
          <div className="mt-2 text-sm text-yellow-700">
            <p className="font-semibold mb-2">Set VITE_FAJUCAR_COLLECTION_ADDRESS in your .env file and restart the dev server.</p>
            <pre className="mt-2 bg-yellow-100 p-2 rounded text-xs overflow-x-auto">
{`VITE_FAJUCAR_COLLECTION_ADDRESS=0x1499947A89Ef05B023176D31191BDC5CCF3d0B7E`}
            </pre>
            <p className="mt-2">Restart Vite (Ctrl+C and <code className="bg-yellow-100 px-1 rounded">npm run dev</code>) after changing .env.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
