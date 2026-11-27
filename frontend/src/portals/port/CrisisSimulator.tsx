import { useState, useEffect, useCallback } from 'react';

import DashboardTab from './components/DashboardTab';
import SimulationTab from './components/SimulationTab';
import WhatIfTab from './components/WhatIfTab';
import HistoryTab from './components/HistoryTab';
import { getDashboardSummary, type DashboardSummary } from './services/crisisApi';

type Tab = 'dashboard' | 'simulate' | 'whatif' | 'history';

export default function CrisisSimulator() {
  const [activeTab, setActiveTab] = useState<Tab>('simulate');
  const [dashboardData, setDashboardData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getDashboardSummary();
      setDashboardData(data);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to connect to ChainMind backend';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  return (
    <div className="crisis-simulator min-h-screen bg-slate-900 flex flex-col">
      <nav className="crisis-tabs" aria-label="Simulation views">{(['simulate','whatif','history','dashboard'] as Tab[]).map(t=><button key={t} onClick={()=>setActiveTab(t)} aria-pressed={activeTab===t}>{({simulate:'Crisis simulation',whatif:'What-if comparison',history:'History',dashboard:'Network overview'})[t]}</button>)}<span>{error?'Connection failed':loading?'Connecting...':'Backend connected'}</span></nav>

      <div className="flex-1 px-4 md:px-6 py-6 max-w-screen-2xl mx-auto w-full">
        {error && (
          <div className="mb-4 bg-red-900/30 border border-red-700 rounded-lg p-4 text-red-300 text-sm">
            <strong>Backend connection error:</strong> {error}
            <button
              onClick={loadDashboard}
              className="ml-4 underline hover:text-red-200"
            >
              Retry
            </button>
          </div>
        )}

        {activeTab === 'dashboard' && (
          <DashboardTab data={dashboardData} loading={loading} onRefresh={loadDashboard} />
        )}
        {activeTab === 'simulate' && (
          <SimulationTab
            ports={dashboardData?.ports ?? []}
            onSimulationComplete={() => {
              // Refresh dashboard after simulation
              loadDashboard();
            }}
          />
        )}
        {activeTab === 'whatif' && (
          <WhatIfTab />
        )}
        {activeTab === 'history' && (
          <HistoryTab recentSimulations={dashboardData?.recent_simulations ?? []} />
        )}
      </div>

      <footer className="text-center text-slate-600 text-xs py-4 border-t border-slate-800">
        CoastWatch — Crisis Simulator · Synthetic network · Modeled estimates
      </footer>
    </div>
  );
}
