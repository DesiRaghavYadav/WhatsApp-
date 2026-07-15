import React, { useState, useEffect } from 'react';
import { 
  Share2, 
  RefreshCw, 
  Forward, 
  Trash2, 
  CheckCircle, 
  AlertCircle, 
  Clock, 
  Check, 
  X, 
  Copy,
  Users,
  Send,
  HelpCircle,
  MessageSquare
} from 'lucide-react';

interface CapturedShare {
  id: string;
  timestamp: string;
  from: string;
  sender: string;
  quotedSender: string;
  quotedMessageId: string;
  quotedMessage: any;
  displayText: string;
  status: 'pending' | 'forwarded';
  forwardedTo: string[];
}

interface SharesManagerPageProps {
  fetchWithAuth: (url: string, options?: any) => Promise<Response>;
  setFeedback: (fb: { type: 'success' | 'error'; text: string } | null) => void;
  sessionsList: any[];
}

export default function SharesManagerPage({ fetchWithAuth, setFeedback, sessionsList }: SharesManagerPageProps) {
  const [shares, setShares] = useState<CapturedShare[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [activeSessionId, setActiveSessionId] = useState<string>('primary');
  
  // Forward form state per-share ID
  const [targetJidsMap, setTargetJidsMap] = useState<Record<string, string>>({});
  const [isForwardingMap, setIsForwardingMap] = useState<Record<string, boolean>>({});
  const [forwardResultsMap, setForwardResultsMap] = useState<Record<string, any[]>>({});

  const fetchShares = async () => {
    setIsLoading(true);
    try {
      const res = await fetchWithAuth('/api/shares');
      if (res.ok) {
        const data = await res.json();
        setShares(data.shares || []);
      } else {
        setFeedback({ type: 'error', text: 'Failed to retrieve captured shares.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', text: 'Network error fetching shares: ' + err.message });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchShares();
  }, []);

  const handleDeleteShare = async (id: string) => {
    if (!confirm('Are you sure you want to delete this captured share?')) return;
    try {
      const res = await fetchWithAuth(`/api/shares/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setFeedback({ type: 'success', text: 'Captured share deleted.' });
        setShares(prev => prev.filter(s => s.id !== id));
      } else {
        setFeedback({ type: 'error', text: 'Failed to delete share.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', text: 'Error deleting share: ' + err.message });
    }
  };

  const handleForwardShare = async (shareId: string) => {
    const rawJids = targetJidsMap[shareId] || '';
    const cleanJids = rawJids
      .split(',')
      .map(j => j.trim())
      .filter(Boolean);

    if (cleanJids.length === 0) {
      alert('Please enter at least one valid Group ID or JID to forward to.');
      return;
    }

    setIsForwardingMap(prev => ({ ...prev, [shareId]: true }));
    setForwardResultsMap(prev => ({ ...prev, [shareId]: [] }));

    try {
      const res = await fetchWithAuth('/api/shares/forward', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shareId,
          targetJids: cleanJids,
          sessionId: activeSessionId
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setFeedback({ type: 'success', text: 'Forward dispatch complete!' });
        setForwardResultsMap(prev => ({ ...prev, [shareId]: data.results || [] }));
        
        // Refresh the lists to update the "forwardedTo" and status tags
        fetchShares();
      } else {
        setFeedback({ type: 'error', text: data.error || 'Failed to forward message.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', text: 'Forward error: ' + err.message });
    } finally {
      setIsForwardingMap(prev => ({ ...prev, [shareId]: false }));
    }
  };

  const handleInputChange = (shareId: string, val: string) => {
    setTargetJidsMap(prev => ({ ...prev, [shareId]: val }));
  };

  const connectedSessions = sessionsList.filter(s => s.status === 'connected');

  return (
    <div id="shares-manager-page" className="space-y-6">
      {/* Header Panel */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-900 border border-slate-800 p-6 rounded-2xl">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Share2 className="w-5 h-5 text-emerald-400" />
            <span>Captured Shares Studio</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Reply to any message with <span className="text-emerald-400 font-mono font-bold">.share</span> in WhatsApp. It will be captured here instantly, allowing you to forward it to multiple groups.
          </p>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          {/* Active Session Select */}
          <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800">
            <span className="text-[11px] text-slate-400 font-medium">Forward From:</span>
            <select
              value={activeSessionId}
              onChange={(e) => setActiveSessionId(e.target.value)}
              className="bg-transparent text-xs text-white font-semibold outline-none cursor-pointer border-none"
            >
              <option value="primary" className="bg-slate-900 text-white">Primary Account</option>
              {sessionsList.filter(s => s.id !== 'primary').map(s => (
                <option key={s.id} value={s.id} className="bg-slate-900 text-white">
                  {s.name} ({s.id})
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={fetchShares}
            disabled={isLoading}
            className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-semibold rounded-lg border border-slate-700/60 transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-emerald-400' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Guide Card */}
      <div className="bg-slate-900/60 border border-slate-800/80 p-5 rounded-2xl text-xs space-y-3">
        <h3 className="font-semibold text-slate-200 flex items-center gap-2">
          <HelpCircle className="w-4 h-4 text-emerald-400" />
          <span>How to capture and forward WhatsApp channel/group messages</span>
        </h3>
        <ol className="list-decimal list-inside space-y-2 text-slate-400 pl-1 leading-relaxed">
          <li>
            Open WhatsApp on your phone or PC, navigate to any chat (including channels, group chats, or personal chats).
          </li>
          <li>
            Identify the message you wish to clone/share. Long-press or right-click to <strong>Reply</strong> to that message.
          </li>
          <li>
            Type <code className="text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded font-mono font-bold">.share</code> as the reply text and send it.
          </li>
          <li>
            The system will capture the quoted message immediately. You can refresh this page to find it.
          </li>
          <li>
            Provide one or more target Group IDs (or recipient phone numbers) below and click <strong className="text-slate-200">Forward Message</strong>.
          </li>
        </ol>
      </div>

      {/* Main Shares Container */}
      {shares.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 bg-slate-900/40 border border-dashed border-slate-800 rounded-2xl text-center space-y-3">
          <Share2 className="w-8 h-8 text-slate-600 animate-pulse" />
          <p className="text-sm font-semibold text-slate-400">No captured shares found</p>
          <p className="text-xs text-slate-500 max-w-md">
            Go reply with <span className="font-mono text-emerald-400 font-bold">.share</span> to a message in WhatsApp to capture your first item!
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {shares.map((share) => {
            const isForwarding = isForwardingMap[share.id] || false;
            const results = forwardResultsMap[share.id] || [];

            return (
              <div 
                key={share.id} 
                className="bg-slate-900 border border-slate-800 rounded-2xl p-6 hover:border-slate-700/80 transition-all flex flex-col gap-5 shadow-lg"
              >
                {/* Meta Header */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-800 pb-4">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-mono font-bold bg-slate-950 border border-slate-800 px-2 py-0.5 rounded text-slate-300">
                        {share.id}
                      </span>
                      {share.status === 'forwarded' ? (
                        <span className="flex items-center gap-1 text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-semibold">
                          <Check className="w-2.5 h-2.5" />
                          <span>Forwarded</span>
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full font-semibold">
                          <Clock className="w-2.5 h-2.5 animate-pulse" />
                          <span>Pending</span>
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400 flex flex-wrap gap-x-3 gap-y-1">
                      <span>Source Chat: <strong className="text-slate-200">{share.from}</strong></span>
                      <span>•</span>
                      <span>Quoted Msg Sender: <strong className="text-slate-200">{share.quotedSender.split('@')[0]}</strong></span>
                      <span>•</span>
                      <span>Captured: <strong className="text-slate-300">{new Date(share.timestamp).toLocaleString()}</strong></span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteShare(share.id)}
                    className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 border border-transparent hover:border-rose-500/20 rounded-lg transition-all cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </button>
                </div>

                {/* Quoted Message Preview Box */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 relative overflow-hidden">
                  <div className="absolute right-3 top-3 text-[9px] text-slate-500 uppercase tracking-widest font-mono font-semibold">
                    Original Quoted Content
                  </div>
                  <div className="flex gap-3">
                    <div className="w-1 bg-emerald-500 rounded"></div>
                    <div className="space-y-1">
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">
                        {share.quotedSender.split('@')[0]}
                      </span>
                      <p className="text-sm text-slate-100 whitespace-pre-wrap font-sans leading-relaxed">
                        {share.displayText}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Forwarding Form */}
                <div className="space-y-3 bg-slate-950/40 border border-slate-800/60 p-4 rounded-xl">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                    <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                      <Forward className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Forward Destination JIDs</span>
                    </label>
                    <span className="text-[10px] text-slate-500">
                      Comma separated group IDs (e.g., 120363294321932452@g.us)
                    </span>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3">
                    <input
                      type="text"
                      value={targetJidsMap[share.id] || ''}
                      onChange={(e) => handleInputChange(share.id, e.target.value)}
                      placeholder="Paste target group JIDs or phone numbers..."
                      className="flex-1 bg-slate-950 text-white border border-slate-800 hover:border-slate-700 focus:border-emerald-500 rounded-xl px-4 py-2.5 text-xs outline-none transition-all"
                    />
                    <button
                      onClick={() => handleForwardShare(share.id)}
                      disabled={isForwarding}
                      className="flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 text-slate-950 disabled:text-slate-500 text-xs font-bold rounded-xl transition-all cursor-pointer disabled:cursor-not-allowed"
                    >
                      <Send className={`w-3.5 h-3.5 ${isForwarding ? 'animate-bounce' : ''}`} />
                      <span>{isForwarding ? 'Forwarding...' : 'Forward Message'}</span>
                    </button>
                  </div>

                  {/* Forwarding History if exists */}
                  {share.forwardedTo && share.forwardedTo.length > 0 && (
                    <div className="pt-2 border-t border-slate-800/80">
                      <span className="text-[10px] font-bold text-slate-400 block mb-1">
                        Successfully Forwarded To:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {share.forwardedTo.map((jid, i) => (
                          <span 
                            key={i} 
                            className="inline-flex items-center gap-1 text-[9px] bg-emerald-500/5 text-emerald-400 border border-emerald-500/15 px-2 py-0.5 rounded font-mono"
                          >
                            <Check className="w-2.5 h-2.5" />
                            <span>{jid}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Real-time Forwarding Results (Graceful handling of Out of Group) */}
                  {results.length > 0 && (
                    <div className="mt-3 p-3 bg-slate-950 border border-slate-800 rounded-lg space-y-2">
                      <div className="flex justify-between items-center pb-1.5 border-b border-slate-800">
                        <span className="text-[11px] font-bold text-white">Dispatch Status:</span>
                        <button
                          onClick={() => setForwardResultsMap(prev => ({ ...prev, [share.id]: [] }))}
                          className="text-[9px] text-slate-500 hover:text-slate-300 transition-colors"
                        >
                          Clear Results
                        </button>
                      </div>
                      <div className="space-y-1.5 max-h-32 overflow-y-auto">
                        {results.map((res, i) => (
                          <div key={i} className="flex justify-between items-start text-[11px] gap-2">
                            <span className="font-mono text-slate-300 break-all">{res.jid}</span>
                            {res.success ? (
                              <span className="flex items-center gap-1 text-emerald-400 font-bold shrink-0">
                                <CheckCircle className="w-3 h-3 text-emerald-400" />
                                <span>Sent</span>
                              </span>
                            ) : (
                              <span className="flex flex-col items-end shrink-0">
                                <span className="flex items-center gap-1 text-rose-400 font-bold">
                                  <AlertCircle className="w-3 h-3 text-rose-400" />
                                  <span>Failed</span>
                                </span>
                                <span className="text-[9px] text-slate-500 font-medium">
                                  {res.error || 'Connection/Membership issue'}
                                </span>
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
