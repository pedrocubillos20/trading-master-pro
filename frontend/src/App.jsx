// =============================================
// TRADING MASTER PRO v8.0 - APP PRINCIPAL
// =============================================

import { useState, useEffect } from 'react';
import Dashboard from './Dashboard';

function App() {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Simular carga inicial
    const timer = setTimeout(() => setIsLoading(false), 1000);
    return () => clearTimeout(timer);
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-white mb-2">
              Trading<span className="text-green-500">Pro</span>
            </h1>
            <span className="px-3 py-1 bg-green-500/20 text-green-400 text-sm rounded-full">
              v8.0 - SMC INSTITUCIONAL
            </span>
          </div>
          <div className="w-16 h-16 border-4 border-zinc-700 border-t-green-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-zinc-400">Iniciando motor de análisis...</p>
        </div>
      </div>
    );
  }

  return <Dashboard />;
}

export default App;
