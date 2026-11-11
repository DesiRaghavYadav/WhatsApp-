import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Search, 
  Download, 
  Trash2, 
  Edit, 
  Sparkles, 
  CheckCircle, 
  ArrowRight, 
  Clock, 
  Check, 
  Activity, 
  HelpCircle, 
  RefreshCw, 
  FileText, 
  Smartphone,
  Phone,
  UserCheck
} from 'lucide-react';

interface LeadContact {
  jid: string;
  phone: string;
  name: string;
  sessionName: string;
  lastActive: string;
  interactionsCount: number;
  lastMessage: string;
  status: 'Cold' | 'Engaged' | 'Converted';
  notes?: string;
}

interface LeadsHubPageProps {
  fetchWithAuth: (url: string, options?: any) => Promise<Response>;
  setFeedback: (fb: { type: 'success' | 'error'; text: string } | null) => void;
}

export default function LeadsHubPage({ fetchWithAuth, setFeedback }: LeadsHubPageProps) {
  const [leads, setLeads] = useState<LeadContact[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  
  // Notes and status editing state
  const [editingLeadJid, setEditingLeadJid] = useState<string | null>(null);
  const [editStatus, setEditStatus] = useState<'Cold' | 'Engaged' | 'Converted'>('Cold');
  const [editNotes, setEditNotes] = useState<string>('');
  const [isSavingLead, setIsSavingLead] = useState<boolean>(false);

  // Playground Sandbox State
  const [sandboxText, setSandboxText] = useState<string>(
    "Hi {{sender_name}}! Thanks for reaching out. We see you are contacting us from number {{sender_phone}} via our connection: {{session_name}}. Let us know how we can help you today!"
  );
  const [sandboxSenderName, setSandboxSenderName] = useState<string>("Alex");
  const [sandboxSenderPhone, setSandboxSenderPhone] = useState<string>("15550199");
  const [sandboxSessionName, setSandboxSessionName] = useState<string>("Sales Session");

  useEffect(() => {
    fetchLeads();
  }, []);

  const fetchLeads = async () => {
    setIsLoading(true);
    try {
      const res = await fetchWithAuth('/api/leads');
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setLeads(data.leads || []);
        }
      }
    } catch (err) {
      console.error("Failed to load leads:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateLead = async (jid: string) => {
    setIsSavingLead(true);
    try {
      const res = await fetchWithAuth('/api/leads/update', {
        method: 'POST',
        body: JSON.stringify({
          jid,
          status: editStatus,
          notes: editNotes
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setLeads(prev => prev.map(l => l.jid === jid ? { ...l, status: editStatus, notes: editNotes } : l));
          setFeedback({ type: 'success', text: `Lead "${data.lead?.name || 'Contact'}" updated successfully!` });
          setEditingLeadJid(null);
        } else {
          setFeedback({ type: 'error', text: data.error || 'Failed to update lead.' });
        }
      }
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Error updating lead.' });
    } finally {
      setIsSavingLead(false);
    }
  };

  const handleDeleteLead = async (jid: string, name: string) => {
    try {
      const res = await fetchWithAuth(`/api/leads/${jid}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setLeads(prev => prev.filter(l => l.jid !== jid));
          setFeedback({ type: 'success', text: `Lead "${name}" removed successfully!` });
        } else {
          setFeedback({ type: 'error', text: data.error || 'Failed to remove lead.' });
        }
      }
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Error removing lead.' });
    }
  };

  const startEditing = (lead: LeadContact) => {
    setEditingLeadJid(lead.jid);
    setEditStatus(lead.status);
    setEditNotes(lead.notes || '');
  };

  const exportToCSV = () => {
    if (leads.length === 0) {
      setFeedback({ type: 'error', text: 'No leads available to export.' });
      return;
    }

    const headers = ['Name', 'Phone', 'JID', 'WhatsApp Session', 'Last Message', 'Interactions Count', 'Status', 'Notes', 'Last Active'];
    const rows = filteredLeads.map(l => [
      l.name.replace(/"/g, '""'),
      l.phone,
      l.jid,
      l.sessionName.replace(/"/g, '""'),
      (l.lastMessage || '').replace(/"/g, '""'),
      l.interactionsCount,
      l.status,
      (l.notes || '').replace(/"/g, '""'),
      new Date(l.lastActive).toLocaleString()
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(e => e.map(val => `"${val}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `whatsapp_leads_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setFeedback({ type: 'success', text: `Exported ${filteredLeads.length} leads to CSV file successfully!` });
  };

  const getFilteredLeads = () => {
    return leads.filter(l => {
      const matchesSearch = 
        l.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        l.phone.includes(searchTerm) ||
        (l.lastMessage && l.lastMessage.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (l.notes && l.notes.toLowerCase().includes(searchTerm.toLowerCase()));
      
      const matchesStatus = statusFilter === 'All' || l.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  };

  const filteredLeads = getFilteredLeads();

  // Stats calculation
  const totalLeads = leads.length;
  const engagedLeads = leads.filter(l => l.status === 'Engaged').length;
  const convertedLeads = leads.filter(l => l.status === 'Converted').length;
  const coldLeads = leads.filter(l => l.status === 'Cold').length;
  const engagementRate = totalLeads ? Math.round(((engagedLeads + convertedLeads) / totalLeads) * 100) : 0;

  // Personalization Playback rendering
  const getPlaygroundParsedPreview = () => {
    if (!sandboxText) return '';
    return sandboxText
      .replace(/\{\{sender_name\}\}/g, sandboxSenderName || 'there')
      .replace(/\{\{sender_phone\}\}/g, sandboxSenderPhone || '15550199')
      .replace(/\{\{sender_jid\}\}/g, `${sandboxSenderPhone || '15550199'}@s.whatsapp.net`)
      .replace(/\{\{session_name\}\}/g, sandboxSessionName || 'WA Bridge');
  };

  return (
    <div className="space-y-8 animate-fadeIn text-slate-100">
      
      {/* Page Header banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/40 p-6 rounded-2xl border border-slate-800 backdrop-blur-sm relative overflow-hidden">
        <div className="absolute top-0 left-0 w-1.5 h-full bg-emerald-500" />
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-emerald-400" />
            <span>Interactive Lead Tracker & Sender personalization Hub</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Analyze incoming contact identities, update lead qualification status stages, and configure dynamic variable tags to generate highly contextual interactions.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchLeads}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-4 py-2 bg-slate-800/80 hover:bg-slate-800 text-slate-300 text-xs font-bold rounded-xl border border-slate-700 transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Sync Contacts</span>
          </button>
          <button
            onClick={exportToCSV}
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs font-bold rounded-xl border border-emerald-500/20 transition-all cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* KPI Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        
        {/* KPI 1: Captured Leads */}
        <div className="bg-slate-900/60 border border-slate-800 p-5 rounded-2xl relative overflow-hidden shadow-xl">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full filter blur-2xl pointer-events-none" />
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">Captured Contacts</span>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-white">{totalLeads}</span>
            <span className="text-xs font-semibold text-emerald-400 font-mono flex items-center gap-0.5">
              <Activity className="w-3 h-3 animate-pulse" /> Active
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">Registered from incoming chat triggers</p>
        </div>

        {/* KPI 2: Engaged Leads */}
        <div className="bg-slate-900/60 border border-slate-800 p-5 rounded-2xl relative overflow-hidden shadow-xl">
          <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full filter blur-2xl pointer-events-none" />
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">Engaged Leads</span>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-blue-400">{engagedLeads}</span>
            <span className="text-xs font-semibold text-blue-400 font-mono">
              ★ Multipass
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">contacts with 3+ interaction events</p>
        </div>

        {/* KPI 3: Converted Leads */}
        <div className="bg-slate-900/60 border border-slate-800 p-5 rounded-2xl relative overflow-hidden shadow-xl">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full filter blur-2xl pointer-events-none" />
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">Converted Clients</span>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-emerald-400">{convertedLeads}</span>
            <span className="text-xs font-semibold text-emerald-400 font-mono flex items-center gap-0.5">
              <Check className="w-3.5 h-3.5" /> Won
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">Manual confirmation or form success</p>
        </div>

        {/* KPI 4: Active Interaction Ratio */}
        <div className="bg-slate-900/60 border border-slate-800 p-5 rounded-2xl relative overflow-hidden shadow-xl">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full filter blur-2xl pointer-events-none" />
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">Engagement Rate</span>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-amber-400">{engagementRate}%</span>
            <span className="text-xs font-semibold text-amber-400 font-mono">
              Ratio
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">Engaged + Converted of overall total</p>
        </div>

      </div>

      {/* Main Workspace Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Leads Table Card (Left, takes 2 cols) */}
        <div className="lg:col-span-2 bg-slate-950 border border-slate-800/80 rounded-2xl shadow-xl overflow-hidden flex flex-col">
          
          {/* Table Header Filter controls */}
          <div className="p-5 border-b border-slate-800 bg-slate-900/50 flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-bold text-white">Leads Directory</h3>
              <span className="text-[10px] px-2 py-0.5 bg-slate-800 text-slate-400 rounded-full font-mono font-bold">
                {filteredLeads.length} shown
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {/* Search Bar */}
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search lead info..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 pl-9 pr-3 py-2 text-xs rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              {/* Status filter buttons */}
              <div className="flex bg-slate-950 border border-slate-800 rounded-xl p-1">
                {['All', 'Cold', 'Engaged', 'Converted'].map((st) => (
                  <button
                    key={st}
                    onClick={() => setStatusFilter(st)}
                    className={`px-2.5 py-1 text-[10px] font-bold rounded-lg transition-all cursor-pointer ${
                      statusFilter === st
                        ? 'bg-emerald-500 text-slate-950 shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Table View */}
          <div className="overflow-x-auto">
            {isLoading ? (
              <div className="p-16 flex flex-col items-center justify-center text-slate-400 gap-2">
                <RefreshCw className="w-8 h-8 animate-spin text-emerald-400" />
                <span className="text-xs">Synchronizing captured contact leads...</span>
              </div>
            ) : filteredLeads.length === 0 ? (
              <div className="p-16 text-center text-slate-400">
                <HelpCircle className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                <p className="text-sm font-bold text-white">No captured leads found</p>
                <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                  Leads are automatically registered whenever a recipient sends an incoming message or clicks a menu option. Ensure your WhatsApp sessions are active and ready!
                </p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 text-[10px] uppercase tracking-wider bg-slate-900/10">
                    <th className="py-3.5 px-4 font-semibold">Contact</th>
                    <th className="py-3.5 px-4 font-semibold">Origin Connection</th>
                    <th className="py-3.5 px-4 font-semibold">Last Msg Sent</th>
                    <th className="py-3.5 px-4 font-semibold text-center">Interactions</th>
                    <th className="py-3.5 px-4 font-semibold">Status Stage</th>
                    <th className="py-3.5 px-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredLeads.map((lead) => {
                    const isEditing = editingLeadJid === lead.jid;
                    return (
                      <tr key={lead.jid} className="hover:bg-slate-900/20 transition-all text-xs">
                        {/* Name and Phone */}
                        <td className="py-4 px-4">
                          <div className="flex items-start gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-slate-800/80 flex items-center justify-center border border-slate-700 text-slate-300 font-bold uppercase shrink-0">
                              {lead.name ? lead.name.charAt(0) : '?'}
                            </div>
                            <div className="min-w-0">
                              <p className="font-bold text-white truncate max-w-[150px]">{lead.name || 'WhatsApp Contact'}</p>
                              <p className="text-[10px] text-slate-400 font-mono mt-0.5">{lead.phone}</p>
                            </div>
                          </div>
                        </td>

                        {/* Origin WhatsApp connection */}
                        <td className="py-4 px-4 text-slate-300">
                          <span className="px-2 py-0.5 bg-slate-900 border border-slate-800 rounded text-[10px] font-mono">
                            {lead.sessionName || 'Primary'}
                          </span>
                        </td>

                        {/* Last trigger message */}
                        <td className="py-4 px-4 max-w-[180px]">
                          <div className="min-w-0">
                            <p className="text-slate-200 truncate font-mono text-[11px]">
                              {lead.lastMessage || <span className="italic text-slate-600">None logged</span>}
                            </p>
                            <p className="text-[9px] text-slate-500 flex items-center gap-1 mt-0.5">
                              <Clock className="w-2.5 h-2.5" />
                              {new Date(lead.lastActive).toLocaleString()}
                            </p>
                          </div>
                        </td>

                        {/* Interactions count */}
                        <td className="py-4 px-4 text-center font-bold text-slate-100 font-mono">
                          {lead.interactionsCount || 1}
                        </td>

                        {/* Status label (or edit state) */}
                        <td className="py-4 px-4">
                          {isEditing ? (
                            <select
                              value={editStatus}
                              onChange={(e) => setEditStatus(e.target.value as any)}
                              className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                            >
                              <option value="Cold">❄️ Cold</option>
                              <option value="Engaged">🔥 Engaged</option>
                              <option value="Converted">🏆 Converted</option>
                            </select>
                          ) : (
                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border font-mono uppercase ${
                              lead.status === 'Converted'
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                : lead.status === 'Engaged'
                                  ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                                  : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                            }`}>
                              <span>
                                {lead.status === 'Converted' ? '🏆' : lead.status === 'Engaged' ? '🔥' : '❄️'}
                              </span>
                              <span>{lead.status || 'Cold'}</span>
                            </span>
                          )}
                        </td>

                        {/* Custom actions */}
                        <td className="py-4 px-4 text-right">
                          {isEditing ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => handleUpdateLead(lead.jid)}
                                disabled={isSavingLead}
                                className="px-2 py-1 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold rounded text-[10px] disabled:opacity-50"
                              >
                                {isSavingLead ? 'Saving...' : 'Save'}
                              </button>
                              <button
                                onClick={() => setEditingLeadJid(null)}
                                className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px]"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => startEditing(lead)}
                                title="Edit Lead Details & Notes"
                                className="p-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-300 rounded-lg transition-all cursor-pointer"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteLead(lead.jid, lead.name)}
                                title="Delete Lead"
                                className="p-1.5 bg-slate-900 hover:bg-rose-950/40 border border-slate-800 hover:border-rose-900/40 text-slate-400 hover:text-rose-400 rounded-lg transition-all cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Inline Edit Notes panel when editing a lead */}
          {editingLeadJid && (
            <div className="p-5 border-t border-slate-800 bg-slate-900/30 animate-slideUp">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-white flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Update Notes for: <strong className="text-emerald-400">{leads.find(l => l.jid === editingLeadJid)?.name}</strong></span>
                </p>
                <span className="text-[10px] text-slate-400 font-mono">{editingLeadJid}</span>
              </div>
              <textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="Type interaction notes, customer requirements, pricing offers..."
                className="w-full h-16 bg-slate-950 border border-slate-800 rounded-xl p-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-none font-sans"
              />
            </div>
          )}
        </div>

        {/* Dynamic Personalization Playground (Right side, takes 1 col) */}
        <div className="space-y-6">
          
          {/* Playground Card */}
          <div className="bg-slate-950 border border-slate-800/80 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-bold text-white">Personalization Sandbox</h3>
            </div>
            
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Use standard variable tags in any list row, workflow response, button title, or template URL! The system will parse and substitute them automatically.
            </p>

            <div className="space-y-3 pt-1">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Response Body with Tags</label>
                <textarea
                  value={sandboxText}
                  onChange={(e) => setSandboxText(e.target.value)}
                  placeholder="Enter message template..."
                  className="w-full h-24 bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-none font-sans"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Mock Sender Name</label>
                  <input
                    type="text"
                    value={sandboxSenderName}
                    onChange={(e) => setSandboxSenderName(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 px-2 py-1.5 text-xs rounded-lg text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Mock Sender Phone</label>
                  <input
                    type="text"
                    value={sandboxSenderPhone}
                    onChange={(e) => setSandboxSenderPhone(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 px-2 py-1.5 text-xs rounded-lg text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Mock Active Session</label>
                <input
                  type="text"
                  value={sandboxSessionName}
                  onChange={(e) => setSandboxSessionName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 px-2.5 py-1.5 text-xs rounded-lg text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            </div>

            {/* Simulated Live Phone Preview Frame */}
            <div className="pt-3 border-t border-slate-900">
              <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
                Live Parsed Preview
              </span>
              
              <div className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-800 font-sans relative">
                {/* Micro sender tag bar */}
                <div className="flex items-center gap-1.5 text-[9px] text-slate-400 border-b border-slate-800 pb-1.5 mb-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <span className="font-bold text-slate-300">{sandboxSenderName || 'Alex'}</span>
                  <span>(online)</span>
                </div>
                {/* Chat bubble */}
                <div className="bg-[#128C7E]/10 border border-[#128C7E]/20 p-2.5 rounded-xl rounded-tl-none text-xs text-slate-200 leading-relaxed font-sans whitespace-pre-wrap">
                  {getPlaygroundParsedPreview() || <span className="italic text-slate-600">Type message body to preview...</span>}
                </div>
              </div>
            </div>
          </div>

          {/* Quick Guide card */}
          <div className="bg-slate-950 border border-slate-800/80 rounded-2xl p-5 shadow-xl space-y-3.5">
            <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
              <HelpCircle className="w-4 h-4 text-emerald-400" />
              <span>Personalization Cheat Sheet</span>
            </h4>
            
            <div className="space-y-2.5 text-[11px] text-slate-400">
              <div className="flex items-start gap-2">
                <span className="font-mono text-emerald-400 font-bold text-xs shrink-0">{`{{sender_name}}`}</span>
                <span>The push-name or nickname set on the sender's WhatsApp account (e.g. <strong className="text-white">John Doe</strong>). Fallback is 'there'.</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="font-mono text-emerald-400 font-bold text-xs shrink-0">{`{{sender_phone}}`}</span>
                <span>The sender's clean telephone number without country code or JID suffix (e.g. <strong className="text-white">15550199</strong>).</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="font-mono text-emerald-400 font-bold text-xs shrink-0">{`{{sender_jid}}`}</span>
                <span>The sender's full registered JID string identifier on WhatsApp (e.g. <strong className="text-white">phone@s.whatsapp.net</strong>).</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="font-mono text-emerald-400 font-bold text-xs shrink-0">{`{{session_name}}`}</span>
                <span>The active name of the connection receiving and replying to the message (e.g. <strong className="text-white">Support Bot</strong>).</span>
              </div>
            </div>

            <div className="bg-slate-900/50 p-3 rounded-xl border border-slate-800 text-[10px] text-slate-400 leading-relaxed">
              <strong className="text-emerald-400 block mb-0.5">💡 Marketing Pro Tip:</strong>
              Use URL templates like <code className="text-slate-300 font-mono">{"https://my-store.com/cart?phone={{sender_phone}}"}</code> as a template URL button. Clicking the button automatically loads their custom checkout!
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
