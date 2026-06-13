import { useEffect } from 'react';

export function EnvDebug() {
  const envVars = {
    VITE_FAJUCAR_COLLECTION_ADDRESS: import.meta.env.VITE_FAJUCAR_COLLECTION_ADDRESS,
    VITE_ENABLE_FAJUCAR_NFTS: import.meta.env.VITE_ENABLE_FAJUCAR_NFTS,
    VITE_NETWORK_NAME: import.meta.env.VITE_NETWORK_NAME,
  };

  useEffect(() => {
    if (import.meta.env.PROD) return;
    console.group('🔍 EnvDebug: Environment Variables');
    console.log('=====================================');
    
    Object.entries(envVars).forEach(([key, value]) => {
      const status = value ? '✅ DEFINED' : '❌ UNDEFINED';
      const displayValue = value || 'undefined';
      
      console.log(`${key}:`, displayValue, `(${status})`);
    });
    
    console.log('=====================================');
    console.groupEnd();
  }, [envVars.VITE_FAJUCAR_COLLECTION_ADDRESS, envVars.VITE_ENABLE_FAJUCAR_NFTS, envVars.VITE_NETWORK_NAME]);

  if (import.meta.env.PROD) return null;

  // Helper to check if value is defined
  const isDefined = (value: string | undefined): boolean => {
    return value !== undefined && value !== null && value !== '';
  };

  // Helper to get status color
  const getStatusColor = (value: string | undefined): string => {
    return isDefined(value) ? 'text-green-400' : 'text-red-400';
  };

  // Helper to get status text
  const getStatusText = (value: string | undefined): string => {
    return isDefined(value) ? 'DEFINED' : 'UNDEFINED';
  };

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4 mb-4 text-xs font-mono">
      <h3 className="font-bold mb-3 text-white">🔍 Debug: Environment Variables</h3>
      
      <div className="space-y-2">
        {/* Fajucar Collection Address */}
        <div className="space-y-1.5">
          <h4 className="font-semibold text-slate-300 mb-1">Fajucar Collection:</h4>
          
          <div className="pl-2">
            <div className="flex items-center gap-2">
              <span className="text-slate-400">VITE_FAJUCAR_COLLECTION_ADDRESS:</span>
              <span className={getStatusColor(envVars.VITE_FAJUCAR_COLLECTION_ADDRESS)}>
                {envVars.VITE_FAJUCAR_COLLECTION_ADDRESS || 'UNDEFINED'}
              </span>
              <span className={`text-xs ${getStatusColor(envVars.VITE_FAJUCAR_COLLECTION_ADDRESS)}`}>
                ({getStatusText(envVars.VITE_FAJUCAR_COLLECTION_ADDRESS)})
              </span>
            </div>
          </div>
        </div>

        {/* Configuration Flags */}
        <div className="mt-3 pt-3 border-t border-slate-700/50 space-y-1.5">
          <h4 className="font-semibold text-slate-300 mb-1">Configuration:</h4>
          
          <div className="pl-2">
            <div className="flex items-center gap-2">
              <span className="text-slate-400">VITE_ENABLE_FAJUCAR_NFTS:</span>
              <span className={getStatusColor(envVars.VITE_ENABLE_FAJUCAR_NFTS)}>
                {envVars.VITE_ENABLE_FAJUCAR_NFTS || 'UNDEFINED'}
              </span>
              <span className={`text-xs ${getStatusColor(envVars.VITE_ENABLE_FAJUCAR_NFTS)}`}>
                ({getStatusText(envVars.VITE_ENABLE_FAJUCAR_NFTS)})
              </span>
            </div>
          </div>
          
          <div className="pl-2">
            <div className="flex items-center gap-2">
              <span className="text-slate-400">VITE_NETWORK_NAME:</span>
              <span className={getStatusColor(envVars.VITE_NETWORK_NAME)}>
                {envVars.VITE_NETWORK_NAME || 'UNDEFINED'}
              </span>
              <span className={`text-xs ${getStatusColor(envVars.VITE_NETWORK_NAME)}`}>
                ({getStatusText(envVars.VITE_NETWORK_NAME)})
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Warning if any required variables are undefined */}
      {Object.values(envVars).some(value => !isDefined(value)) && (
        <div className="mt-4 pt-3 border-t border-amber-500/30 bg-amber-900/20 p-3 rounded">
          <p className="text-amber-400 font-semibold text-sm mb-2">⚠️ Some variables are undefined!</p>
          <div className="text-amber-300 text-xs space-y-1">
            <p>Check your <code className="bg-amber-900/50 px-1 rounded">.env</code> file and ensure all required variables are set.</p>
            <p className="mt-2 italic">
              💡 Vite only loads environment variables when the server is STARTED. 
              If you modified the .env file while the server was running, restart the dev server.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

