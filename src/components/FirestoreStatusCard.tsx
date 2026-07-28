import React, { useEffect, useState } from 'react';
import { Database, AlertTriangle, CheckCircle2, XCircle, CloudOff, RefreshCw, Info, Server } from 'lucide-react';

export interface FirestoreStatus {
  success?: boolean;
  status: 'connected' | 'quota_exceeded' | 'failed' | 'not_configured';
  connected: boolean;
  isQuotaExceeded: boolean;
  databaseId: string | null;
  message: string;
  details?: string;
  timestamp?: string;
}

interface FirestoreStatusCardProps {
  variant?: 'compact' | 'full' | 'signin';
  title?: string;
  showDetailsToggle?: boolean;
}

export const FirestoreStatusCard: React.FC<FirestoreStatusCardProps> = ({
  variant = 'full',
  title = 'Firestore Connection Status',
  showDetailsToggle = true
}) => {
  const [statusData, setStatusData] = useState<FirestoreStatus | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [showDetails, setShowDetails] = useState<boolean>(false);
  const [lastRefreshed, setLastRefreshed] = useState<string>('');

  const fetchStatus = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/public/firestore-status');
      if (res.ok) {
        const data = await res.json();
        setStatusData(data);
      } else {
        setStatusData({
          status: 'failed',
          connected: false,
          isQuotaExceeded: false,
          databaseId: null,
          message: 'Unable to reach backend status endpoint.',
          details: `HTTP ${res.status} ${res.statusText}`
        });
      }
    } catch (err: any) {
      setStatusData({
        status: 'failed',
        connected: false,
        isQuotaExceeded: false,
        databaseId: null,
        message: 'Network error checking Firestore status.',
        details: err?.message || String(err)
      });
    } finally {
      setIsLoading(false);
      setLastRefreshed(new Date().toLocaleTimeString());
    }
  };

  useEffect(() => {
    fetchStatus();
    // Poll every 15 seconds to keep connection status current
    const timer = setInterval(fetchStatus, 15000);
    return () => clearInterval(timer);
  }, []);

  if (isLoading && !statusData) {
    return (
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 text-xs text-slate-400 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400" />
          <span>Checking Firestore connection status...</span>
        </div>
      </div>
    );
  }

  const currentStatus = statusData?.status || 'not_configured';

  // Badge configuration based on status
  let badgeStyle = 'bg-slate-800 text-slate-300 border-slate-700';
  let badgeIcon = <CloudOff className="w-3.5 h-3.5 text-slate-400" />;
  let badgeText = 'Local Disk Storage';
  let bannerBg = 'bg-slate-900/40 border-slate-800';

  if (currentStatus === 'connected') {
    badgeStyle = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25';
    badgeIcon = <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />;
    badgeText = 'Connected & Active';
    bannerBg = 'bg-emerald-950/20 border-emerald-500/20';
  } else if (currentStatus === 'quota_exceeded') {
    badgeStyle = 'bg-amber-500/15 text-amber-400 border-amber-500/30';
    badgeIcon = <AlertTriangle className="w-3.5 h-3.5 text-amber-400 animate-pulse" />;
    badgeText = 'Quota Exceeded (Cloud Sync Paused)';
    bannerBg = 'bg-amber-950/20 border-amber-500/25';
  } else if (currentStatus === 'failed') {
    badgeStyle = 'bg-rose-500/15 text-rose-400 border-rose-500/30';
    badgeIcon = <XCircle className="w-3.5 h-3.5 text-rose-400" />;
    badgeText = 'Connection Failed (Disk Fallback)';
    bannerBg = 'bg-rose-950/20 border-rose-500/25';
  }

  if (variant === 'signin') {
    return (
      <div className={`mt-6 pt-5 border-t border-slate-800 text-left rounded-xl p-4 border ${bannerBg} transition-all`}>
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <Database className={`w-4 h-4 ${currentStatus === 'connected' ? 'text-emerald-400' : currentStatus === 'quota_exceeded' ? 'text-amber-400' : 'text-rose-400'}`} />
            <span className="text-xs font-bold text-white tracking-tight">Firestore Status</span>
          </div>
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${badgeStyle}`}>
            {badgeIcon}
            <span>{badgeText}</span>
          </span>
        </div>

        <p className="text-[11px] text-slate-300 leading-relaxed mt-1">
          {statusData?.message}
        </p>

        {statusData?.details && (
          <p className="text-[10px] font-mono text-slate-400 mt-1.5 bg-slate-950/60 p-2 rounded-lg border border-slate-850">
            {statusData.details}
          </p>
        )}

        <div className="mt-2.5 flex items-center justify-between text-[10px] text-slate-500">
          <span>Database ID: {statusData?.databaseId || 'ai-studio-whatsappwebdashb'}</span>
          <button
            type="button"
            onClick={fetchStatus}
            disabled={isLoading}
            className="flex items-center gap-1 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Check Status</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border p-4 transition-all ${bannerBg}`}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-xl border ${
            currentStatus === 'connected'
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
              : currentStatus === 'quota_exceeded'
              ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
              : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
          }`}>
            <Database className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h4 className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-1.5">
                {title}
              </h4>
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${badgeStyle}`}>
                {badgeIcon}
                <span>{badgeText}</span>
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-0.5">
              {statusData?.message}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {showDetailsToggle && statusData?.details && (
            <button
              type="button"
              onClick={() => setShowDetails(!showDetails)}
              className="px-2.5 py-1 text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
            >
              <Info className="w-3 h-3 text-slate-400" />
              <span>{showDetails ? 'Hide Info' : 'Details'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={fetchStatus}
            disabled={isLoading}
            className="px-2.5 py-1 text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
            title="Refresh connection status"
          >
            <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Re-check</span>
          </button>
        </div>
      </div>

      {/* Expanded Details Panel */}
      {showDetails && statusData?.details && (
        <div className="mt-3 pt-3 border-t border-slate-800 text-xs space-y-1.5 animate-fadeIn">
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-850 font-mono text-[11px] text-slate-300 space-y-1">
            <div className="flex items-center justify-between text-slate-400">
              <span>Database Instance:</span>
              <span className="text-emerald-400">{statusData.databaseId || 'ai-studio-whatsappwebdashb-cb574fc4-676c-416d-8f1c-358bd5587f73'}</span>
            </div>
            <div className="flex items-center justify-between text-slate-400">
              <span>Cloud Syncing Status:</span>
              <span className={statusData.connected ? 'text-emerald-400' : 'text-amber-400'}>
                {statusData.connected ? 'Active (Realtime Firestore)' : 'Disk Fallback Operating Normally'}
              </span>
            </div>
            <div className="flex items-center justify-between text-slate-400">
              <span>Last Checked:</span>
              <span className="text-slate-300">{lastRefreshed || 'Just now'}</span>
            </div>
            <div className="pt-1.5 border-t border-slate-800/80 text-[10px] text-slate-400 leading-normal font-sans">
              <strong>Technical Note:</strong> {statusData.details}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
