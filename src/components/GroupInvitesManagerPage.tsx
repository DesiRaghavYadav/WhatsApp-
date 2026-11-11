import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Link2, 
  RefreshCw, 
  Plus, 
  ExternalLink, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  XCircle, 
  Trash2, 
  Search, 
  Sliders, 
  Send, 
  Copy, 
  Check, 
  UserPlus, 
  ShieldAlert, 
  HelpCircle,
  MessageSquare,
  ArrowRight,
  Info
} from 'lucide-react';

export type GroupJoinStatus = 
  | 'joined' 
  | 'not_joined' 
  | 'requested' 
  | 'members_too_low' 
  | 'removed' 
  | 'invalid';

export interface CapturedGroupInvite {
  id?: string;
  url: string;
  code: string;
  groupJid?: string;
  senderJid: string;
  senderName: string;
  chatJid?: string;
  chatName?: string;
  isOutgoing?: boolean;
  messageText: string;
  groupName: string;
  groupDescription?: string;
  groupSize?: number;
  creatorJid?: string;
  savedAt: string;
  sessionId: string;
  status: GroupJoinStatus;
  statusDetails?: string;
  joinedAt?: string;
  requestedAt?: string;
  removedAt?: string;
  lastCheckedAt?: string;
  retryCount?: number;
  nextRetryAt?: string;
  joinApprovalMode?: boolean;
}

interface GroupInvitesManagerPageProps {
  token: string | null;
  username: string | null;
  addToast?: (msg: string, type: 'success' | 'error' | 'info') => void;
  sessions?: any[];
}

export default function GroupInvitesManagerPage({
  token,
  username,
  addToast,
  sessions = []
}: GroupInvitesManagerPageProps) {
  const [invites, setInvites] = useState<CapturedGroupInvite[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | GroupJoinStatus>('all');
  
  // Settings State
  const [autoJoinEnabled, setAutoJoinEnabled] = useState<boolean>(false);
  const [minMembers, setMinMembers] = useState<number>(400);
  const [retryInterval, setRetryInterval] = useState<number>(15);
  const [isSavingSettings, setIsSavingSettings] = useState<boolean>(false);
  const [settingsLoaded, setSettingsLoaded] = useState<boolean>(false);

  // Verification State
  const [isVerifyingAll, setIsVerifyingAll] = useState<boolean>(false);
  const [verifySummary, setVerifySummary] = useState<{
    total: number;
    joinedCount: number;
    removedCount: number;
    requestedCount: number;
    lowMembersCount: number;
    message: string;
  } | null>(null);

  // Manual Add Modal State
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [manualLinkInput, setManualLinkInput] = useState<string>('');
  const [isAddingLink, setIsAddingLink] = useState<boolean>(false);

  // Request Admin Modal State
  const [adminModalInvite, setAdminModalInvite] = useState<CapturedGroupInvite | null>(null);
  const [adminCustomMessage, setAdminCustomMessage] = useState<string>('');
  const [isSendingAdminMsg, setIsSendingAdminMsg] = useState<boolean>(false);
  const [copiedText, setCopiedText] = useState<boolean>(false);

  // Single Join Loading State
  const [joiningCode, setJoiningCode] = useState<string | null>(null);

  const notify = (msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    if (addToast) {
      addToast(msg, type);
    }
  };

  // Fetch settings & invites on mount
  useEffect(() => {
    fetchInvites();
    fetchSettings();
  }, [token]);

  const fetchInvites = async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      const res = await fetch('/api/captured-group-invites', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.invites)) {
        setInvites(data.invites);
      }
    } catch (err: any) {
      console.error('Failed to load group invites:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchSettings = async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/settings', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success && data.settings) {
        setAutoJoinEnabled(!!data.settings.autoJoinGroupsEnabled);
        setMinMembers(data.settings.autoJoinMinMembers || 400);
        setRetryInterval(data.settings.autoRetryIntervalMinutes || 15);
        setSettingsLoaded(true);
      }
    } catch (err: any) {
      console.error('Failed to load settings:', err);
    }
  };

  const handleSaveSettings = async () => {
    if (!token) return;
    setIsSavingSettings(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          autoJoinGroupsEnabled: autoJoinEnabled,
          autoJoinMinMembers: Number(minMembers),
          autoRetryIntervalMinutes: Number(retryInterval)
        })
      });
      const data = await res.json();
      if (data.success) {
        notify('Auto-Join settings saved successfully!', 'success');
      } else {
        notify(data.error || 'Failed to save settings', 'error');
      }
    } catch (err: any) {
      notify(`Error saving settings: ${err.message}`, 'error');
    } finally {
      setIsSavingSettings(false);
    }
  };

  // Verify All Groups Status (detect joined, removed, approved)
  const handleVerifyAllGroups = async () => {
    if (!token) return;
    setIsVerifyingAll(true);
    setVerifySummary(null);
    try {
      const res = await fetch('/api/captured-group-invites/verify-all', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({})
      });
      const data = await res.json();
      if (data.success) {
        setVerifySummary({
          total: data.total,
          joinedCount: data.joinedCount,
          removedCount: data.removedCount,
          requestedCount: data.requestedCount,
          lowMembersCount: data.lowMembersCount,
          message: data.message
        });
        notify(data.message, data.removedCount > 0 ? 'info' : 'success');
        fetchInvites();
      } else {
        notify(data.error || 'Failed to verify groups', 'error');
      }
    } catch (err: any) {
      notify(`Verification error: ${err.message}`, 'error');
    } finally {
      setIsVerifyingAll(false);
    }
  };

  // Manual Add Link
  const handleAddManualLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !manualLinkInput.trim()) return;
    setIsAddingLink(true);
    try {
      const res = await fetch('/api/captured-group-invites/add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ urlOrCode: manualLinkInput.trim() })
      });
      const data = await res.json();
      if (data.success) {
        notify(data.message || 'Group link saved successfully!', 'success');
        setManualLinkInput('');
        setShowAddModal(false);
        fetchInvites();
      } else {
        notify(data.error || 'Failed to save group link', 'error');
      }
    } catch (err: any) {
      notify(`Error adding group link: ${err.message}`, 'error');
    } finally {
      setIsAddingLink(false);
    }
  };

  // Try Join / Request to Join a group
  const handleJoinGroup = async (code: string) => {
    if (!token) return;
    setJoiningCode(code);
    try {
      const res = await fetch(`/api/captured-group-invites/join/${code}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({})
      });
      const data = await res.json();
      if (data.success) {
        notify(data.message, 'success');
        fetchInvites();
      } else {
        notify(data.error || 'Failed to join group', 'error');
      }
    } catch (err: any) {
      notify(`Join error: ${err.message}`, 'error');
    } finally {
      setJoiningCode(null);
    }
  };

  // Delete a saved group link
  const handleDeleteInvite = async (code: string) => {
    const effectiveToken = token || localStorage.getItem('wa_auth_token');
    if (!effectiveToken) return;
    
    // Instant optimistic update so the item disappears immediately
    setInvites(prev => prev.filter(i => i.code !== code && i.id !== code));
    try {
      const res = await fetch(`/api/captured-group-invites/${encodeURIComponent(code)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${effectiveToken}` }
      });
      const data = await res.json();
      if (data.success) {
        notify('Group link deleted successfully', 'success');
      } else {
        notify(data.error || 'Failed to delete group link', 'error');
        fetchInvites();
      }
    } catch (err: any) {
      notify(`Error deleting: ${err.message}`, 'error');
      fetchInvites();
    }
  };

  // Clear all saved group links
  const handleClearAllInvites = async () => {
    const effectiveToken = token || localStorage.getItem('wa_auth_token');
    if (!effectiveToken || invites.length === 0) return;
    
    setInvites([]);
    try {
      const res = await fetch('/api/captured-group-invites', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${effectiveToken}` }
      });
      const data = await res.json();
      if (data.success) {
        notify('All captured WhatsApp group links cleared.', 'success');
      } else {
        notify(data.error || 'Failed to clear group links.', 'error');
        fetchInvites();
      }
    } catch (err: any) {
      notify(`Error clearing group links: ${err.message}`, 'error');
      fetchInvites();
    }
  };

  // Open Admin Request Modal
  const openAdminModal = (invite: CapturedGroupInvite) => {
    setAdminModalInvite(invite);
    const defaultMsg = `Hello! I noticed I was removed from *${invite.groupName || 'the group'}*. Could you please re-add me or approve my request to rejoin? Here is the link: ${invite.url}. Thank you!`;
    setAdminCustomMessage(defaultMsg);
    setCopiedText(false);
  };

  // Send Direct Message to Admin via connected bot
  const handleSendAdminMessage = async () => {
    if (!token || !adminModalInvite) return;
    setIsSendingAdminMsg(true);
    try {
      const res = await fetch(`/api/captured-group-invites/request-admin/${adminModalInvite.code}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          customMessage: adminCustomMessage,
          sendDirectMessage: true
        })
      });
      const data = await res.json();
      if (data.success) {
        notify(data.message, 'success');
        setAdminModalInvite(null);
      } else {
        notify(data.error || 'Failed to send admin message', 'error');
      }
    } catch (err: any) {
      notify(`Admin message error: ${err.message}`, 'error');
    } finally {
      setIsSendingAdminMsg(false);
    }
  };

  // Filtered invites
  const filteredInvites = invites.filter(i => {
    const matchesSearch = 
      (i.groupName && i.groupName.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (i.code && i.code.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (i.senderName && i.senderName.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (i.chatName && i.chatName.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (i.messageText && i.messageText.toLowerCase().includes(searchQuery.toLowerCase()));
    
    if (!matchesSearch) return false;
    if (statusFilter === 'all') return true;
    return i.status === statusFilter;
  });

  // Calculate statistics
  const totalCount = invites.length;
  const joinedCount = invites.filter(i => i.status === 'joined').length;
  const requestedCount = invites.filter(i => i.status === 'requested').length;
  const lowMembersCount = invites.filter(i => i.status === 'members_too_low').length;
  const removedCount = invites.filter(i => i.status === 'removed').length;
  const notJoinedCount = invites.filter(i => i.status === 'not_joined').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-1.5 h-full bg-emerald-500" />
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 rounded-xl">
              <Users className="w-5 h-5" />
            </span>
            <h2 className="text-lg font-bold text-white tracking-wide">
              WhatsApp Group Links & Auto-Join Engine
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
            Automatically intercepts, extracts, and stores WhatsApp Group links received or sent in groups and chats. 
            Auto-joins high-volume groups (≥ 400 members), retries smaller groups, and verifies membership status at once.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
          <button
            type="button"
            onClick={handleVerifyAllGroups}
            disabled={isVerifyingAll}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-emerald-600/20 transition-all cursor-pointer disabled:opacity-50"
            title="Check all saved groups against current WhatsApp socket to detect if removed or active"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isVerifyingAll ? 'animate-spin' : ''}`} />
            <span>{isVerifyingAll ? 'Checking All Groups...' : 'Check All Groups Status'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-3.5 py-2.5 bg-slate-800 hover:bg-slate-750 text-white font-bold text-xs rounded-xl border border-slate-700 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4 text-emerald-400" />
            <span>+ Add Group Link</span>
          </button>

          {invites.length > 0 && (
            <button
              type="button"
              onClick={handleClearAllInvites}
              className="flex items-center gap-1.5 px-3 py-2.5 bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 hover:text-rose-300 font-bold text-xs rounded-xl border border-rose-500/30 transition-all cursor-pointer"
              title="Clear all saved group link records"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear All ({invites.length})</span>
            </button>
          )}
        </div>
      </div>

      {/* Verification Summary Banner */}
      {verifySummary && (
        <div className={`p-4 rounded-xl border text-xs flex items-start justify-between gap-3 ${
          verifySummary.removedCount > 0 
            ? 'bg-amber-950/40 border-amber-500/30 text-amber-200' 
            : 'bg-emerald-950/40 border-emerald-500/30 text-emerald-200'
        }`}>
          <div className="flex items-start gap-2.5">
            {verifySummary.removedCount > 0 ? (
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            )}
            <div>
              <span className="font-bold block">{verifySummary.message}</span>
              <span className="text-[11px] opacity-80 mt-0.5 block">
                Active Joined: {verifySummary.joinedCount} | Removed: {verifySummary.removedCount} | Pending Approval: {verifySummary.requestedCount} | Low Members: {verifySummary.lowMembersCount}
              </span>
            </div>
          </div>
          <button
            onClick={() => setVerifySummary(null)}
            className="text-slate-400 hover:text-white p-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* Alert Banner: Removed Groups Detected */}
      {removedCount > 0 && (
        <div className="bg-rose-950/40 border border-rose-500/30 rounded-2xl p-4 text-xs shadow-lg relative overflow-hidden">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <span className="p-2 bg-rose-500/20 text-rose-400 rounded-xl shrink-0 mt-0.5">
                <ShieldAlert className="w-5 h-5" />
              </span>
              <div>
                <h4 className="font-bold text-rose-300 text-sm">
                  Action Required: You were removed from {removedCount} group{removedCount > 1 ? 's' : ''}!
                </h4>
                <p className="text-slate-300 mt-1 leading-relaxed text-[11px]">
                  WhatsApp verification detected you are no longer in these saved groups (e.g. removed by admin). 
                  Use the <strong>"Request Admin Manually"</strong> button on the group card to message the admin with a polite re-add request, or retry joining.
                </p>
              </div>
            </div>

            <button
              onClick={() => setStatusFilter('removed')}
              className="px-3 py-1.5 bg-rose-600/30 hover:bg-rose-600/50 text-rose-200 font-bold rounded-lg border border-rose-500/40 shrink-0 transition-colors"
            >
              Filter Removed Groups ({removedCount})
            </button>
          </div>
        </div>
      )}

      {/* Stats Cards Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <button
          onClick={() => setStatusFilter('all')}
          className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
            statusFilter === 'all' 
              ? 'bg-slate-800 border-emerald-500 shadow-md shadow-emerald-500/10' 
              : 'bg-slate-900/40 border-slate-800 hover:bg-slate-850'
          }`}
        >
          <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Total Captured</span>
          <span className="text-2xl font-bold text-white font-mono mt-1 block">{totalCount}</span>
        </button>

        <button
          onClick={() => setStatusFilter('joined')}
          className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
            statusFilter === 'joined' 
              ? 'bg-emerald-950/40 border-emerald-500 shadow-md shadow-emerald-500/10' 
              : 'bg-slate-900/40 border-slate-800 hover:bg-slate-850'
          }`}
        >
          <span className="text-[10px] uppercase font-bold text-emerald-400 flex items-center gap-1 tracking-wider">
            <CheckCircle2 className="w-3 h-3" />
            <span>Active Joined</span>
          </span>
          <span className="text-2xl font-bold text-emerald-300 font-mono mt-1 block">{joinedCount}</span>
        </button>

        <button
          onClick={() => setStatusFilter('requested')}
          className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
            statusFilter === 'requested' 
              ? 'bg-sky-950/40 border-sky-500 shadow-md shadow-sky-500/10' 
              : 'bg-slate-900/40 border-slate-800 hover:bg-slate-850'
          }`}
        >
          <span className="text-[10px] uppercase font-bold text-sky-400 flex items-center gap-1 tracking-wider">
            <Clock className="w-3 h-3" />
            <span>Pending Approval</span>
          </span>
          <span className="text-2xl font-bold text-sky-300 font-mono mt-1 block">{requestedCount}</span>
        </button>

        <button
          onClick={() => setStatusFilter('members_too_low')}
          className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
            statusFilter === 'members_too_low' 
              ? 'bg-amber-950/40 border-amber-500 shadow-md shadow-amber-500/10' 
              : 'bg-slate-900/40 border-slate-800 hover:bg-slate-850'
          }`}
        >
          <span className="text-[10px] uppercase font-bold text-amber-400 flex items-center gap-1 tracking-wider">
            <Users className="w-3 h-3" />
            <span>Low Members</span>
          </span>
          <span className="text-2xl font-bold text-amber-300 font-mono mt-1 block">{lowMembersCount}</span>
        </button>

        <button
          onClick={() => setStatusFilter('removed')}
          className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
            statusFilter === 'removed' 
              ? 'bg-rose-950/40 border-rose-500 shadow-md shadow-rose-500/10' 
              : 'bg-slate-900/40 border-slate-800 hover:bg-slate-850'
          }`}
        >
          <span className="text-[10px] uppercase font-bold text-rose-400 flex items-center gap-1 tracking-wider">
            <XCircle className="w-3 h-3" />
            <span>Removed</span>
          </span>
          <span className="text-2xl font-bold text-rose-300 font-mono mt-1 block">{removedCount}</span>
        </button>

        <button
          onClick={() => setStatusFilter('not_joined')}
          className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
            statusFilter === 'not_joined' 
              ? 'bg-slate-800 border-slate-600' 
              : 'bg-slate-900/40 border-slate-800 hover:bg-slate-850'
          }`}
        >
          <span className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1 tracking-wider">
            <HelpCircle className="w-3 h-3" />
            <span>Not Joined</span>
          </span>
          <span className="text-2xl font-bold text-slate-300 font-mono mt-1 block">{notJoinedCount}</span>
        </button>
      </div>

      {/* Auto-Join Automation Control Panel */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2 uppercase tracking-wider">
              <Sliders className="w-4 h-4 text-emerald-400" />
              <span>Automated Group Joining & Member Rules</span>
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Configure automatic background joining for newly discovered WhatsApp group links.
            </p>
          </div>

          <button
            onClick={handleSaveSettings}
            disabled={isSavingSettings}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs rounded-xl shadow transition-all cursor-pointer self-start md:self-center disabled:opacity-50"
          >
            {isSavingSettings ? 'Saving...' : 'Save Rule Configuration'}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-5">
          {/* Toggle 1: Auto Join Enabled */}
          <div className="bg-slate-950 border border-slate-850 rounded-xl p-4 flex items-start justify-between gap-3">
            <div>
              <span className="text-xs font-bold text-white block">Auto-Join Engine</span>
              <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                Automatically attempt to join or submit join request when group link is captured.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-0.5">
              <input
                type="checkbox"
                checked={autoJoinEnabled}
                onChange={(e) => setAutoJoinEnabled(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
            </label>
          </div>

          {/* Setting 2: Minimum Member Threshold */}
          <div className="bg-slate-950 border border-slate-850 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white block">Minimum Member Count</span>
              <span className="text-[10px] font-mono text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded">
                Default: 400
              </span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Groups with fewer members are marked as "Low Members" and scheduled for periodic re-checking.
            </p>
            <div className="flex items-center gap-2 pt-1">
              <input
                type="number"
                min={1}
                max={2000}
                value={minMembers}
                onChange={(e) => setMinMembers(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
              />
              <span className="text-xs text-slate-400 shrink-0">Members</span>
            </div>
          </div>

          {/* Setting 3: Auto-Retry Interval */}
          <div className="bg-slate-950 border border-slate-850 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white block">Retry Check Interval</span>
              <span className="text-[10px] font-mono text-amber-400 font-bold bg-amber-500/10 px-2 py-0.5 rounded">
                Background Runner
              </span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Frequency to re-query invite links for member growth before auto-joining.
            </p>
            <div className="flex items-center gap-2 pt-1">
              <select
                value={retryInterval}
                onChange={(e) => setRetryInterval(parseInt(e.target.value))}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
              >
                <option value={5}>Every 5 Minutes</option>
                <option value={15}>Every 15 Minutes (Recommended)</option>
                <option value={30}>Every 30 Minutes</option>
                <option value={60}>Every 1 Hour</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Group Link Records List */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-xl relative">
        {/* Controls Bar: Search & Filter */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search by group name, code, sender, chat..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
            />
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider shrink-0">Filter:</span>
            {(['all', 'joined', 'requested', 'members_too_low', 'removed', 'not_joined'] as const).map(st => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1 text-xs rounded-lg font-semibold capitalize transition-all cursor-pointer shrink-0 ${
                  statusFilter === st
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-850'
                }`}
              >
                {st.replace(/_/g, ' ')}
              </button>
            ))}
          </div>
        </div>

        {/* Group Cards */}
        {isLoading ? (
          <div className="text-center py-16 text-slate-400 text-xs flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
            <span>Loading captured WhatsApp group links...</span>
          </div>
        ) : filteredInvites.length === 0 ? (
          <div className="text-center py-16 bg-slate-950/40 border border-slate-850 rounded-xl p-6">
            <Link2 className="w-10 h-10 text-slate-700 mx-auto mb-3" />
            <h4 className="text-slate-300 font-bold text-sm">No Group Links Found</h4>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto leading-relaxed">
              {searchQuery || statusFilter !== 'all'
                ? 'No group links match your current search and filter criteria.'
                : 'Whenever someone sends or receives a WhatsApp group invite link in any group or chat, it will be automatically captured, resolved, and shown here!'}
            </p>
            <button
              onClick={() => setShowAddModal(true)}
              className="mt-4 px-4 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 text-xs font-bold rounded-xl transition-all cursor-pointer inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Paste Group Link Manually</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredInvites.slice().reverse().map((invite) => {
              const isJoined = invite.status === 'joined';
              const isRemoved = invite.status === 'removed';
              const isRequested = invite.status === 'requested';
              const isLowMembers = invite.status === 'members_too_low';
              const isQualifying = (invite.groupSize || 0) >= minMembers;

              return (
                <div
                  key={invite.code}
                  className={`border rounded-2xl p-5 text-left relative overflow-hidden transition-all flex flex-col justify-between ${
                    isRemoved
                      ? 'bg-rose-950/20 border-rose-500/30 hover:border-rose-500/50'
                      : isJoined
                      ? 'bg-slate-950/90 border-emerald-500/30 hover:border-emerald-500/60'
                      : isRequested
                      ? 'bg-sky-950/20 border-sky-500/30 hover:border-sky-500/50'
                      : isLowMembers
                      ? 'bg-amber-950/20 border-amber-500/30 hover:border-amber-500/50'
                      : 'bg-slate-950 border-slate-850 hover:border-slate-750'
                  }`}
                >
                  {/* Left Edge Accent */}
                  <div className={`absolute top-0 left-0 w-1.5 h-full ${
                    isRemoved ? 'bg-rose-500' :
                    isJoined ? 'bg-emerald-500' :
                    isRequested ? 'bg-sky-500' :
                    isLowMembers ? 'bg-amber-500' :
                    'bg-slate-700'
                  }`} />

                  <div>
                    {/* Top Header: Title & Badges */}
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-bold text-white truncate" title={invite.groupName}>
                          {invite.groupName || 'WhatsApp Group'}
                        </h4>
                        {invite.groupDescription && (
                          <p className="text-[11px] text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                            {invite.groupDescription}
                          </p>
                        )}
                      </div>

                      {/* Status Badge */}
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {isJoined && (
                          <span className="px-2.5 py-1 bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 text-[10px] font-bold rounded-full flex items-center gap-1 font-mono">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>JOINED</span>
                          </span>
                        )}
                        {isRemoved && (
                          <span className="px-2.5 py-1 bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[10px] font-bold rounded-full flex items-center gap-1 font-mono animate-pulse">
                            <XCircle className="w-3 h-3" />
                            <span>REMOVED</span>
                          </span>
                        )}
                        {isRequested && (
                          <span className="px-2.5 py-1 bg-sky-500/15 text-sky-300 border border-sky-500/25 text-[10px] font-bold rounded-full flex items-center gap-1 font-mono">
                            <Clock className="w-3 h-3" />
                            <span>APPROVAL PENDING</span>
                          </span>
                        )}
                        {isLowMembers && (
                          <span className="px-2.5 py-1 bg-amber-500/15 text-amber-300 border border-amber-500/25 text-[10px] font-bold rounded-full flex items-center gap-1 font-mono">
                            <Users className="w-3 h-3" />
                            <span>MEMBERS &lt; {minMembers}</span>
                          </span>
                        )}
                        {invite.status === 'not_joined' && (
                          <span className="px-2.5 py-1 bg-slate-800 text-slate-300 border border-slate-700 text-[10px] font-bold rounded-full font-mono">
                            NOT JOINED
                          </span>
                        )}

                        {/* Member Count Pill */}
                        <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
                          isQualifying 
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                            : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                        }`}>
                          {invite.groupSize !== undefined ? `${invite.groupSize} Members` : 'Size pending'}
                        </span>
                      </div>
                    </div>

                    {/* Status Details / Reason */}
                    {invite.statusDetails && (
                      <div className={`mt-2 p-2 rounded-lg border text-[11px] leading-relaxed ${
                        isRemoved 
                          ? 'bg-rose-950/40 border-rose-500/20 text-rose-300' 
                          : isLowMembers 
                          ? 'bg-amber-950/40 border-amber-500/20 text-amber-300'
                          : 'bg-slate-900/60 border-slate-800/80 text-slate-300'
                      }`}>
                        <div className="flex items-center gap-1.5 font-semibold">
                          <Info className="w-3.5 h-3.5 shrink-0 opacity-80" />
                          <span>{invite.statusDetails}</span>
                        </div>
                        {invite.nextRetryAt && isLowMembers && (
                          <span className="text-[10px] opacity-75 mt-0.5 block">
                            Auto-retry check scheduled: {new Date(invite.nextRetryAt).toLocaleTimeString()}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Meta Details Grid */}
                    <div className="grid grid-cols-2 gap-3 pt-3 pb-2 text-[10px] text-slate-400 font-mono border-t border-slate-850/60 mt-3">
                      <div>
                        <span className="text-slate-500 block">Source Chat</span>
                        <span className="text-slate-300 truncate block font-sans">
                          {invite.chatName || (invite.chatJid ? (invite.chatJid.endsWith('@g.us') ? 'WhatsApp Group' : 'Direct Message') : 'Chat')}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Sender</span>
                        <span className="text-slate-300 truncate block font-sans">
                          {invite.senderName || 'Sender'} {invite.isOutgoing ? '(You Sent)' : ''}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Admin / Creator</span>
                        <span className="text-slate-300 truncate block" title={invite.creatorJid || 'N/A'}>
                          {invite.creatorJid ? `+${invite.creatorJid.split('@')[0].split(':')[0]}` : 'Admin unknown'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Captured At</span>
                        <span className="text-slate-300 truncate block">
                          {new Date(invite.savedAt).toLocaleDateString()} {new Date(invite.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>

                    {/* Message Snippet */}
                    {invite.messageText && (
                      <div className="mt-2 p-2 bg-slate-900/40 rounded-lg border border-slate-850/60 text-[10px] text-slate-400 font-sans italic truncate">
                        "{invite.messageText}"
                      </div>
                    )}
                  </div>

                  {/* Action Buttons Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-850 mt-3">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {/* Action 1: Join / Re-Join */}
                      {!isJoined && (
                        <button
                          type="button"
                          onClick={() => handleJoinGroup(invite.code)}
                          disabled={joiningCode === invite.code}
                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-slate-950 text-[11px] font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1 disabled:opacity-50"
                        >
                          <UserPlus className="w-3 h-3" />
                          <span>{joiningCode === invite.code ? 'Joining...' : (isRequested ? 'Resend Request' : 'Join Group')}</span>
                        </button>
                      )}

                      {/* Action 2: Request Admin Manually */}
                      {(isRemoved || isRequested) && (
                        <button
                          type="button"
                          onClick={() => openAdminModal(invite)}
                          className="px-2.5 py-1 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 text-[11px] font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                        >
                          <MessageSquare className="w-3 h-3" />
                          <span>Request Admin Manually</span>
                        </button>
                      )}

                      {/* Copy Link */}
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(invite.url);
                          notify('Group link copied to clipboard!', 'info');
                        }}
                        className="px-2 py-1 bg-slate-900 hover:bg-slate-850 text-slate-300 border border-slate-800 text-[11px] font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                        title="Copy invite URL"
                      >
                        <Copy className="w-3 h-3" />
                        <span>Copy</span>
                      </button>

                      {/* Open Link */}
                      <a
                        href={invite.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="px-2 py-1 bg-slate-900 hover:bg-slate-850 text-slate-300 border border-slate-800 text-[11px] font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>

                    {/* Delete */}
                    <button
                      type="button"
                      onClick={() => handleDeleteInvite(invite.code)}
                      className="text-slate-500 hover:text-rose-400 p-1.5 transition-colors cursor-pointer"
                      title="Delete record"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Manual Add Link Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl relative">
            <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-2">
              <Link2 className="w-4 h-4 text-emerald-400" />
              <span>Add WhatsApp Group Link Manually</span>
            </h3>
            <p className="text-xs text-slate-400 mb-4 leading-relaxed">
              Paste any WhatsApp group invite link (<code className="text-emerald-400">chat.whatsapp.com/...</code>) to save it, resolve its member count, and trigger auto-join.
            </p>

            <form onSubmit={handleAddManualLink} className="space-y-4">
              <div>
                <label className="text-[11px] font-bold text-slate-300 block mb-1">
                  WhatsApp Group Invite Link or Code
                </label>
                <input
                  type="text"
                  placeholder="https://chat.whatsapp.com/..."
                  value={manualLinkInput}
                  onChange={(e) => setManualLinkInput(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-slate-300 font-semibold text-xs rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAddingLink || !manualLinkInput.trim()}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs rounded-xl shadow transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isAddingLink ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving & Resolving...</span>
                    </>
                  ) : (
                    <span>Save & Auto-Evaluate</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Request Admin Manually Modal */}
      {adminModalInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-lg w-full shadow-2xl relative">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-rose-400" />
                  <span>Request Admin Manually to Re-Add You</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Group: <strong className="text-white">{adminModalInvite.groupName}</strong>
                </p>
              </div>
              <button
                onClick={() => setAdminModalInvite(null)}
                className="text-slate-400 hover:text-white p-1"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-850 text-xs space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-400">Admin Contact:</span>
                  <span className="font-mono text-emerald-400 font-bold">
                    {adminModalInvite.creatorJid 
                      ? `+${adminModalInvite.creatorJid.split('@')[0].split(':')[0]}` 
                      : 'Admin JID Not Detected on Invite'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-400">Group Link:</span>
                  <span className="font-mono text-slate-300 truncate max-w-[240px]">
                    {adminModalInvite.url}
                  </span>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-300 block mb-1">
                  Message to Group Admin:
                </label>
                <textarea
                  rows={4}
                  value={adminCustomMessage}
                  onChange={(e) => setAdminCustomMessage(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white leading-relaxed focus:outline-none focus:border-emerald-500 font-sans"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(adminCustomMessage);
                      setCopiedText(true);
                      setTimeout(() => setCopiedText(false), 2000);
                      notify('Request message copied to clipboard!', 'info');
                    }}
                    className="px-3 py-2 bg-slate-800 hover:bg-slate-750 text-slate-200 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    {copiedText ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedText ? 'Copied!' : 'Copy Message'}</span>
                  </button>

                  {adminModalInvite.creatorJid && (
                    <a
                      href={`https://wa.me/${adminModalInvite.creatorJid.split('@')[0].split(':')[0]}?text=${encodeURIComponent(adminCustomMessage)}`}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="px-3 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Open Admin Chat</span>
                    </a>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {adminModalInvite.creatorJid && (
                    <button
                      type="button"
                      onClick={handleSendAdminMessage}
                      disabled={isSendingAdminMsg}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs rounded-xl shadow transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>{isSendingAdminMsg ? 'Sending...' : 'Send via Bot'}</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
