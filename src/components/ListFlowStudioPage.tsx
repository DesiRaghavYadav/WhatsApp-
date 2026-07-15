import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  List, 
  Plus, 
  Trash2, 
  Save, 
  Send, 
  ChevronRight, 
  Info, 
  Layers, 
  Settings, 
  MessageSquare, 
  FileText, 
  PlusCircle, 
  Zap, 
  CheckCircle, 
  AlertCircle,
  FileDown,
  Phone,
  Link2,
  Users,
  Lock
} from 'lucide-react';

interface ButtonItem {
  id: string;
  text: string;
}

interface TemplateButtonItem {
  type: 'url' | 'call' | 'quickReply';
  text: string;
  url?: string;
  phoneNumber?: string;
  id?: string;
}

interface WorkflowRule {
  id: string;
  name: string;
  triggerType: 'button' | 'text';
  triggerValue: string;
  responseType: 'text' | 'buttons' | 'template' | 'none';
  message: string;
  footer?: string;
  attachmentType?: 'none' | 'image' | 'video' | 'pdf' | 'doc';
  attachmentUrl?: string;
  inlineAttachment?: boolean;
  buttons?: ButtonItem[];
  templateButtons?: TemplateButtonItem[];
}

interface ListRow {
  id: string;
  title: string;
  description: string;
  responseType: 'text' | 'buttons' | 'template' | 'none';
  responseMessage: string;
  responseFooter?: string;
  responseButtons?: ButtonItem[];
  responseTemplateButtons?: TemplateButtonItem[];
  responseAttachmentType?: 'none' | 'image' | 'video' | 'pdf' | 'doc';
  responseAttachmentUrl?: string;
}

interface ListSection {
  id: string;
  title: string;
  rows: ListRow[];
}

interface ListMenu {
  id: string;
  name: string;
  message: string;
  footer: string;
  listButtonText: string;
  sections: ListSection[];
}

interface ListFlowStudioPageProps {
  fetchWithAuth: (url: string, options?: any) => Promise<Response>;
  connected: boolean;
  sessionsList: any[];
  selectedSessionIds: string[];
  savedGroups: any[];
  setFeedback: (fb: { type: 'success' | 'error'; text: string } | null) => void;
}

export default function ListFlowStudioPage({
  fetchWithAuth,
  connected,
  sessionsList,
  selectedSessionIds,
  savedGroups,
  setFeedback
}: ListFlowStudioPageProps) {
  const [lists, setLists] = useState<ListMenu[]>([]);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'design' | 'workflows'>('design');

  // Loading state
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Active builder states
  const [listId, setListId] = useState<string>('');
  const [listName, setListName] = useState<string>('');
  const [listMessage, setListMessage] = useState<string>('');
  const [listFooter, setListFooter] = useState<string>('Sent via WhatsApp Bridge');
  const [listButtonText, setListButtonText] = useState<string>('View Options');
  const [sections, setSections] = useState<ListSection[]>([]);

  // Selected Option (Row) for workflow configuration
  const [selectedRowId, setSelectedRowId] = useState<{ sectionId: string; rowId: string } | null>(null);

  // Testing dispatch state
  const [testNumber, setTestNumber] = useState<string>('');
  const [testRecipientType, setTestRecipientType] = useState<'individual' | 'group'>('individual');
  const [testSessionIds, setTestSessionIds] = useState<string[]>(['primary']);
  const [isDispatching, setIsDispatching] = useState<boolean>(false);

  // Secret filter prefix settings
  const [secretPrefix, setSecretPrefix] = useState<string>('.');
  const [isSavingSettings, setIsSavingSettings] = useState<boolean>(false);

  // Fetch configured lists
  const fetchLists = async () => {
    try {
      setIsLoading(true);
      const res = await fetchWithAuth('/api/lists');
      const data = await res.json();
      if (data.success) {
        setLists(data.lists || []);
        if (data.lists && data.lists.length > 0 && !selectedListId) {
          selectList(data.lists[0]);
        }
      }
    } catch (err: any) {
      setFeedback({ type: 'error', text: `Failed to load list menus: ${err.message}` });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchSettings = async () => {
    try {
      const res = await fetchWithAuth('/api/settings');
      const data = await res.json();
      if (data.success && data.settings) {
        setSecretPrefix(data.settings.secretPrefix || '.');
      }
    } catch (err) {}
  };

  const handleSaveSettings = async (newPrefix: string) => {
    try {
      setIsSavingSettings(true);
      const res = await fetchWithAuth('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ secretPrefix: newPrefix })
      });
      const data = await res.json();
      if (data.success) {
        setSecretPrefix(data.settings.secretPrefix);
        setFeedback({ type: 'success', text: `Secret filter prefix updated to "${data.settings.secretPrefix}"` });
      } else {
        setFeedback({ type: 'error', text: data.error || 'Failed to update secret prefix.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', text: `Failed to save settings: ${err.message}` });
    } finally {
      setIsSavingSettings(false);
    }
  };

  useEffect(() => {
    fetchLists();
    fetchSettings();
  }, []);

  const selectList = (item: ListMenu) => {
    setSelectedListId(item.id);
    setListId(item.id);
    setListName(item.name || '');
    setListMessage(item.message || '');
    setListFooter(item.footer || '');
    setListButtonText(item.listButtonText || 'View Options');
    setSections(item.sections || []);
    setSelectedRowId(null);
  };

  const handleCreateNewList = () => {
    const newList: ListMenu = {
      id: `list-${Math.random().toString(36).substring(7)}`,
      name: 'New Custom Menu List',
      message: 'Hello! Please select one of our self-serve paths below to get started:',
      footer: 'Navi Interactive Desk',
      listButtonText: 'Select Option',
      sections: [
        {
          id: `sec-${Math.random().toString(36).substring(7)}`,
          title: 'Primary Departments',
          rows: [
            {
              id: `opt-${Math.random().toString(36).substring(7)}`,
              title: '💬 Talk to Sales',
              description: 'Inquire about our premium services & partnerships.',
              responseType: 'text',
              responseMessage: 'Thank you for your interest in our premium sales division! A team representative will text you shortly here.'
            }
          ]
        }
      ]
    };

    const updated = [...lists, newList];
    setLists(updated);
    selectList(newList);
    setFeedback({ type: 'success', text: 'Created a new custom List template. Begin configuring details.' });
  };

  const handleDeleteList = (id: string) => {
    const filtered = lists.filter(l => l.id !== id);
    setLists(filtered);
    if (selectedListId === id) {
      if (filtered.length > 0) {
        selectList(filtered[0]);
      } else {
        setSelectedListId(null);
        setListName('');
        setListMessage('');
        setListFooter('');
        setListButtonText('');
        setSections([]);
        setSelectedRowId(null);
      }
    }
    setFeedback({ type: 'success', text: 'Removed list template from layout.' });
  };

  // Section operations
  const addSection = () => {
    const newSec: ListSection = {
      id: `sec-${Math.random().toString(36).substring(7)}`,
      title: 'New Section Header',
      rows: []
    };
    setSections([...sections, newSec]);
  };

  const removeSection = (secId: string) => {
    setSections(sections.filter(s => s.id !== secId));
    if (selectedRowId && selectedRowId.sectionId === secId) {
      setSelectedRowId(null);
    }
  };

  const updateSectionTitle = (secId: string, title: string) => {
    setSections(sections.map(s => s.id === secId ? { ...s, title } : s));
  };

  // Row operations
  const addRow = (secId: string) => {
    const newRow: ListRow = {
      id: `opt-${Math.random().toString(36).substring(7)}`,
      title: 'New List Action',
      description: 'Describe the action details briefly here.',
      responseType: 'text',
      responseMessage: 'Thank you for selecting this option. This is your custom automated reply.'
    };

    setSections(sections.map(s => {
      if (s.id === secId) {
        return { ...s, rows: [...s.rows, newRow] };
      }
      return s;
    }));
  };

  const removeRow = (secId: string, rowId: string) => {
    setSections(sections.map(s => {
      if (s.id === secId) {
        return { ...s, rows: s.rows.filter(r => r.id !== rowId) };
      }
      return s;
    }));
    if (selectedRowId && selectedRowId.rowId === rowId) {
      setSelectedRowId(null);
    }
  };

  const updateRowField = (secId: string, rowId: string, field: keyof ListRow, val: any) => {
    setSections(sections.map(s => {
      if (s.id === secId) {
        return {
          ...s,
          rows: s.rows.map(r => r.id === rowId ? { ...r, [field]: val } : r)
        };
      }
      return s;
    }));
  };

  // Save changes & sync to Workflows
  const handleSaveAndSync = async () => {
    if (!selectedListId) return;

    const cleanListId = listId.trim();
    if (!cleanListId) {
      setFeedback({ type: 'error', text: 'List Trigger ID cannot be empty.' });
      return;
    }

    try {
      setIsSaving(true);

      // 1. Compile active list configuration
      const activeList: ListMenu = {
        id: cleanListId,
        name: listName || 'Untitled Menu List',
        message: listMessage,
        footer: listFooter,
        listButtonText: listButtonText || 'Select Option',
        sections
      };

      const updatedLists = lists.map(l => l.id === selectedListId ? activeList : l);
      
      // Save lists layout to backend
      const resLists = await fetchWithAuth('/api/lists', {
        method: 'POST',
        body: JSON.stringify({ lists: updatedLists })
      });
      const dataLists = await resLists.json();

      if (!dataLists.success) {
        throw new Error(dataLists.error || 'Failed to save menu layouts.');
      }

      setLists(updatedLists);
      setSelectedListId(cleanListId);

      // 2. Automatically generate & sync workflows for these option IDs!
      // Fetch current workflows to avoid wiping other non-list trigger items
      const resWf = await fetchWithAuth('/api/workflows');
      const dataWf = await resWf.json();
      let currentWfs: WorkflowRule[] = [];
      if (dataWf.success) {
        currentWfs = dataWf.workflows || [];
      }

      // Collect all Option IDs in this current list
      const optionIds = new Set<string>();
      const listRules: WorkflowRule[] = [];

      sections.forEach(sec => {
        sec.rows.forEach(row => {
          optionIds.add(row.id);
          
          // Generate active workflow rules for active rows
          if (row.responseType !== 'none') {
            listRules.push({
              id: `wf-list-sync-${row.id}`,
              name: `List Sync: "${row.title}" (ID: ${row.id})`,
              triggerType: 'button',
              triggerValue: row.id,
              responseType: row.responseType,
              message: row.responseMessage,
              footer: row.responseFooter || '',
              attachmentType: row.responseAttachmentType || 'none',
              attachmentUrl: row.responseAttachmentUrl || '',
              inlineAttachment: true,
              buttons: row.responseButtons || [],
              templateButtons: row.responseTemplateButtons || []
            });
          }
        });
      });

      // Filter out old sync rules that belong to this list menu but might have been deleted,
      // and preserve general manual workflows
      const preservedWfs = currentWfs.filter(w => {
        // Keeps workflows that are NOT list sync rules of our current rows,
        // and doesn't belong to any row we are active syncing
        const isListSync = w.id.startsWith('wf-list-sync-');
        if (isListSync) {
          const rowIdFromWf = w.id.replace('wf-list-sync-', '');
          // Keep if it's from ANOTHER list message but not from our active rows
          return !optionIds.has(rowIdFromWf);
        }
        return true;
      });

      // Combine preserved workflows with our freshly built sync rules
      const finalWfs = [...preservedWfs, ...listRules];

      // Save synced workflows to the server
      const resWfSave = await fetchWithAuth('/api/workflows', {
        method: 'POST',
        body: JSON.stringify({ workflows: finalWfs })
      });
      const dataWfSave = await resWfSave.json();

      if (!dataWfSave.success) {
        throw new Error(dataWfSave.error || 'Failed to sync automation triggers.');
      }

      setFeedback({ 
        type: 'success', 
        text: `Menu layout saved & ${listRules.length} workflow auto-responders synced successfully!` 
      });

    } catch (err: any) {
      setFeedback({ type: 'error', text: `Sync error: ${err.message}` });
    } finally {
      setIsSaving(false);
    }
  };

  // Test send interactive list message
  const handleTestDispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedListId) {
      setFeedback({ type: 'error', text: 'Create or select a List Menu to send first.' });
      return;
    }
    if (!testNumber) {
      setFeedback({ type: 'error', text: 'Provide a target WhatsApp number or Group JID.' });
      return;
    }

    try {
      setIsDispatching(true);
      
      const payload = {
        phoneNumber: testNumber,
        recipientType: testRecipientType,
        msgType: 'list',
        message: listMessage,
        footer: listFooter,
        listButtonText: listButtonText,
        listSections: sections,
        sessionIds: testSessionIds,
        splitByCommas: false,
        tagGroupMembers: false
      };

      const res = await fetchWithAuth('/api/send', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (data.success) {
        setFeedback({ 
          type: 'success', 
          text: `Interactive List Message enqueued successfully for JID: ${testNumber}.` 
        });
      } else {
        setFeedback({ type: 'error', text: data.error || 'Failed to dispatch test list message.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', text: `Dispatch error: ${err.message}` });
    } finally {
      setIsDispatching(false);
    }
  };

  // Safe row response list modifiers
  const handleAddResponseButton = (secId: string, rowId: string) => {
    const row = sections.find(s => s.id === secId)?.rows.find(r => r.id === rowId);
    if (!row) return;
    const btns = row.responseButtons || [];
    if (btns.length >= 3) return;
    const nextBtns = [...btns, { id: `act-${Math.random().toString(36).substring(7)}`, text: 'Action Button' }];
    updateRowField(secId, rowId, 'responseButtons', nextBtns);
  };

  const handleRemoveResponseButton = (secId: string, rowId: string, index: number) => {
    const row = sections.find(s => s.id === secId)?.rows.find(r => r.id === rowId);
    if (!row) return;
    const btns = [...(row.responseButtons || [])];
    btns.splice(index, 1);
    updateRowField(secId, rowId, 'responseButtons', btns);
  };

  const handleUpdateResponseButton = (secId: string, rowId: string, index: number, field: 'id' | 'text', val: string) => {
    const row = sections.find(s => s.id === secId)?.rows.find(r => r.id === rowId);
    if (!row) return;
    const btns = [...(row.responseButtons || [])];
    btns[index] = { ...btns[index], [field]: val };
    updateRowField(secId, rowId, 'responseButtons', btns);
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Page Header banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/40 p-6 rounded-2xl border border-slate-800 backdrop-blur-sm relative overflow-hidden">
        <div className="absolute top-0 left-0 w-1.5 h-full bg-emerald-500" />
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <List className="w-5 h-5 text-emerald-400" />
            <span>Interactive List Menu Studio</span>
          </h2>
          <p className="text-xs text-slate-400 leading-normal">
            Design multi-option menus (single-select lists) and visually craft dynamic response workflows. Configure options, capture selects, and trigger any reply!
          </p>
        </div>
        
        <button
          type="button"
          onClick={handleCreateNewList}
          className="flex items-center gap-1.5 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold rounded-xl shadow-lg transition-all cursor-pointer select-none active:scale-[0.98]"
        >
          <Plus className="w-4 h-4" />
          <span>New Interactive List</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* LEFT COLUMN: Menus Template directory */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 shadow-xl backdrop-blur-sm relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1.5 h-full bg-slate-700" />
            <h3 className="text-xs font-extrabold uppercase tracking-widest text-slate-300 mb-4 flex items-center gap-2">
              <Layers className="w-4 h-4 text-slate-400" />
              <span>Configure Menu Lists</span>
            </h3>

            {isLoading ? (
              <div className="py-8 text-center text-slate-500 text-xs">
                <span>Loading configurations...</span>
              </div>
            ) : lists.length === 0 ? (
              <div className="p-4 bg-slate-950/40 rounded-xl border border-slate-850/60 text-center text-slate-500 text-xs italic space-y-2">
                <p>No list menus created yet.</p>
                <button
                  type="button"
                  onClick={handleCreateNewList}
                  className="text-emerald-400 font-bold hover:underline"
                >
                  Create one now
                </button>
              </div>
            ) : (
              <div className="space-y-2.5">
                {lists.map(item => {
                  const isSelected = selectedListId === item.id;
                  const totalRows = item.sections.reduce((acc, curr) => acc + (curr.rows?.length || 0), 0);

                  return (
                    <div
                      key={item.id}
                      onClick={() => selectList(item)}
                      className={`p-3 rounded-xl border transition-all text-left relative cursor-pointer group ${
                        isSelected 
                          ? 'bg-slate-950 border-emerald-500/40 ring-1 ring-emerald-500/10' 
                          : 'bg-slate-950/40 border-slate-850/70 hover:bg-slate-950/70'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="truncate min-w-0">
                          <span className={`text-xs font-bold block truncate transition-colors ${isSelected ? 'text-emerald-400' : 'text-slate-200 group-hover:text-white'}`}>
                            {item.name || 'Untitled List'}
                          </span>
                          <span className="text-[9.5px] font-mono text-slate-500 block truncate mt-0.5">
                            ID: {item.id}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteList(item.id);
                          }}
                          className="text-slate-600 hover:text-rose-400 p-1 rounded transition-colors"
                          title="Delete Layout"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="mt-2.5 flex items-center justify-between text-[9px] text-slate-500 font-bold border-t border-slate-900/60 pt-2">
                        <span className="bg-slate-900 px-1.5 py-0.5 rounded border border-slate-850 text-slate-400 uppercase tracking-wider font-mono">
                          {item.sections.length} Sections
                        </span>
                        <span className="text-slate-400 font-medium">
                          {totalRows} Action Rows
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* SECRET PREFIX FILTER SETTINGS */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 shadow-xl backdrop-blur-sm relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1.5 h-full bg-amber-500" />
            <h3 className="text-xs font-extrabold uppercase tracking-widest text-slate-300 mb-2 flex items-center gap-2">
              <Lock className="w-4 h-4 text-amber-400" />
              <span>Secret Message filter</span>
            </h3>
            <p className="text-[10px] text-slate-400 mb-4 leading-normal">
              Filter incoming messages by secret prefix. Only commands/options starting with this prefix will be handled; all other messages are silently ignored.
            </p>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Active Secret Prefix</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={secretPrefix}
                    onChange={(e) => setSecretPrefix(e.target.value)}
                    className="flex-1 bg-slate-950 border border-slate-850 focus:border-amber-500 rounded-xl px-3 py-1.5 text-xs text-white font-mono outline-none text-center"
                    placeholder="e.g. ."
                    maxLength={10}
                  />
                  <button
                    type="button"
                    onClick={() => handleSaveSettings(secretPrefix)}
                    disabled={isSavingSettings}
                    className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 disabled:bg-slate-800 text-slate-950 text-xs font-bold rounded-xl shadow-lg shadow-amber-500/10 transition-all select-none cursor-pointer active:scale-[0.98]"
                  >
                    {isSavingSettings ? 'Saving...' : 'Set Prefix'}
                  </button>
                </div>
              </div>

              <div className="bg-amber-500/5 border border-amber-500/10 rounded-xl p-3 flex gap-2">
                <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-[9.5px] text-slate-400 leading-normal">
                  All interactive row triggers (e.g. <code className="font-mono bg-slate-950 px-1 py-0.5 rounded border border-slate-850">.opt_sales</code>) and list keywords (e.g. <code className="font-mono bg-slate-950 px-1 py-0.5 rounded border border-slate-850">.list</code>) must begin with this exact prefix.
                </p>
              </div>
            </div>
          </div>

          {/* QUICK TEST PANEL */}
          {selectedListId && (
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 shadow-xl backdrop-blur-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1.5 h-full bg-emerald-500" />
              <h3 className="text-xs font-extrabold uppercase tracking-widest text-slate-300 mb-3.5 flex items-center gap-2">
                <Send className="w-4 h-4 text-emerald-400" />
                <span>Test-Send Active Menu</span>
              </h3>
              
              <form onSubmit={handleTestDispatch} className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Target Recipient JID / Number</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 919876543210 or group-jid"
                    value={testNumber}
                    onChange={(e) => setTestNumber(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-850 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-700 outline-none transition-all"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setTestRecipientType('individual')}
                    className={`py-1 bg-slate-950 text-[10px] font-bold rounded-lg border transition-all ${
                      testRecipientType === 'individual' 
                        ? 'border-emerald-500/40 text-emerald-400 bg-slate-900' 
                        : 'border-slate-850 text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    Individual Chat
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTestRecipientType('group');
                      if (savedGroups.length > 0) {
                        setTestNumber(savedGroups[0].jid);
                      }
                    }}
                    className={`py-1 bg-slate-950 text-[10px] font-bold rounded-lg border transition-all ${
                      testRecipientType === 'group' 
                        ? 'border-emerald-500/40 text-emerald-400 bg-slate-900' 
                        : 'border-slate-850 text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    Group Room
                  </button>
                </div>

                {testRecipientType === 'group' && savedGroups.length > 0 && (
                  <div className="space-y-1">
                    <label className="text-[8px] font-bold text-slate-500 uppercase tracking-wide">Select Logged Group</label>
                    <select
                      value={testNumber}
                      onChange={(e) => setTestNumber(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-850 rounded-lg px-2 py-1 text-[11px] text-white outline-none cursor-pointer"
                    >
                      {savedGroups.map(g => (
                        <option key={g.jid} value={g.jid}>{g.name} ({g.jid.split('@')[0]})</option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="space-y-1 pt-1 border-t border-slate-900/60">
                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Select Sender Account(s)</label>
                  <div className="space-y-1 max-h-24 overflow-y-auto bg-slate-950/40 border border-slate-850/60 p-2 rounded-lg">
                    {sessionsList.filter(s => s.status === 'connected').map(s => (
                      <label key={s.id} className="flex items-center gap-2 text-[10px] text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={testSessionIds.includes(s.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setTestSessionIds([...testSessionIds, s.id]);
                            } else {
                              setTestSessionIds(testSessionIds.filter(id => id !== s.id));
                            }
                          }}
                          className="rounded text-emerald-500 bg-slate-950 border-slate-800"
                        />
                        <span>{s.name}</span>
                      </label>
                    ))}
                    {sessionsList.filter(s => s.status === 'connected').length === 0 && (
                      <span className="text-[9px] text-rose-400 italic block">No active connected accounts! Connect in Dispatch tab.</span>
                    )}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isDispatching || !connected}
                  className={`w-full py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all select-none cursor-pointer ${
                    !connected 
                      ? 'bg-slate-800 text-slate-500 border border-slate-750 cursor-not-allowed'
                      : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/10'
                  }`}
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{isDispatching ? 'Dispatching...' : 'Dispatch List Menu'}</span>
                </button>
              </form>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: Builder / Settings Studio */}
        <div className="lg:col-span-8">
          {selectedListId ? (
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-xl backdrop-blur-sm space-y-6 relative">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl">
                    <Settings className="w-4 h-4 animate-spin-slow" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">Configure Active List</h3>
                    <p className="text-[10px] text-slate-400">Design properties & map automation workflows dynamically</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleSaveAndSync}
                  disabled={isSaving}
                  className="flex items-center gap-1.5 px-4.5 py-1.8 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold rounded-xl shadow-lg shadow-emerald-500/15 transition-all cursor-pointer active:scale-[0.98]"
                >
                  <Save className="w-4 h-4" />
                  <span>{isSaving ? 'Saving & Syncing...' : 'Save & Sync Flow'}</span>
                </button>
              </div>

              {/* Designer / Workflows Tabs */}
              <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-850/80">
                <button
                  type="button"
                  onClick={() => setActiveTab('design')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    activeTab === 'design' 
                      ? 'bg-slate-900 text-emerald-400 border border-slate-800' 
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>1. List Outer Style</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('workflows')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    activeTab === 'workflows' 
                      ? 'bg-slate-900 text-emerald-400 border border-slate-800' 
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>2. Options & Auto-Responders</span>
                </button>
              </div>

              {/* TAB 1: DESIGN OUTER PROPERTIES */}
              {activeTab === 'design' && (
                <div className="space-y-4 animate-fadeIn">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide flex items-center gap-1.5">
                      <span>List Trigger ID / Text Command</span>
                      <span className="text-[9px] text-emerald-400 font-medium lowercase italic">
                        (must start with secret "{secretPrefix}", e.g. {secretPrefix}list)
                      </span>
                    </label>
                    <input
                      type="text"
                      value={listId}
                      onChange={(e) => setListId(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-850 focus:border-emerald-500 rounded-xl px-3.5 py-2 text-xs text-white outline-none font-mono"
                      placeholder={`e.g. ${secretPrefix}list`}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block">Menu Internal Title</label>
                      <input
                        type="text"
                        value={listName}
                        onChange={(e) => setListName(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-850 rounded-xl px-3.5 py-2 text-xs text-white outline-none"
                        placeholder="e.g. Helpdesk Department Selection"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block">Trigger Button Label</label>
                      <input
                        type="text"
                        value={listButtonText}
                        onChange={(e) => setListButtonText(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-850 rounded-xl px-3.5 py-2 text-xs text-white outline-none"
                        placeholder="e.g. View Departments (Max 20 chars)"
                        maxLength={20}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Body Message Content (Prompt)</label>
                    <textarea
                      value={listMessage}
                      onChange={(e) => setListMessage(e.target.value)}
                      rows={4}
                      className="w-full bg-slate-950 border border-slate-850 rounded-xl px-3.5 py-2 text-xs text-white outline-none font-sans resize-none"
                      placeholder="Type the instructions prompt to display above the option selection button..."
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Footer Text</label>
                    <input
                      type="text"
                      value={listFooter}
                      onChange={(e) => setListFooter(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-850 rounded-xl px-3.5 py-2 text-xs text-white outline-none"
                      placeholder="e.g. Navi Secure Messaging Desk"
                    />
                  </div>

                  {/* Aesthetic Advice Card */}
                  <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-xl p-4 flex gap-3">
                    <Info className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Interactive single-select messages appear on standard mobile WhatsApp clients as a clean text card. When tapped, the <strong>Trigger Button Label</strong> opens an immersive modal containing all sections and rows.
                    </p>
                  </div>
                </div>
              )}

              {/* TAB 2: OPTIONS AND Auto-Responders */}
              {activeTab === 'workflows' && (
                <div className="space-y-6 animate-fadeIn">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                      <Layers className="w-4 h-4 text-emerald-400" />
                      <span>Configure Sections & Rows ({sections.length} sections)</span>
                    </h4>

                    <button
                      type="button"
                      onClick={addSection}
                      className="flex items-center gap-1 py-1 px-2.5 bg-slate-950 hover:bg-slate-900 border border-slate-850 text-[10.5px] font-bold text-emerald-400 rounded-lg transition-colors cursor-pointer select-none"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Section</span>
                    </button>
                  </div>

                  {sections.length === 0 ? (
                    <div className="p-8 text-center bg-slate-950/40 rounded-2xl border border-slate-850/60 text-slate-500 text-xs italic">
                      No sections configured in this menu list. Click "Add Section" above to get started.
                    </div>
                  ) : (
                    <div className="space-y-5">
                      {sections.map((sec, sIndex) => (
                        <div key={sec.id} className="bg-slate-950 border border-slate-850/80 rounded-xl p-4.5 space-y-4">
                          {/* Section Header */}
                          <div className="flex items-center justify-between gap-3 border-b border-slate-900/80 pb-3">
                            <div className="flex items-center gap-2 flex-1 max-w-sm">
                              <span className="text-[10px] text-slate-500 shrink-0 font-mono font-bold">#{sIndex + 1}:</span>
                              <input
                                type="text"
                                value={sec.title}
                                onChange={(e) => updateSectionTitle(sec.id, e.target.value)}
                                className="bg-transparent border-b border-transparent hover:border-slate-800 focus:border-emerald-500/40 text-xs text-white font-bold px-1.5 py-0.5 outline-none flex-1 font-mono uppercase tracking-wider"
                                placeholder="Section Header Title"
                              />
                            </div>

                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => addRow(sec.id)}
                                className="flex items-center gap-1 px-2 py-0.8 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-[10px] font-bold rounded border border-emerald-500/15 cursor-pointer"
                              >
                                <Plus className="w-3 h-3" />
                                <span>Add Option (Row)</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => removeSection(sec.id)}
                                className="text-slate-600 hover:text-rose-400 p-1"
                                title="Delete Section"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Rows List */}
                          <div className="space-y-2.5">
                            {(sec.rows || []).map((row, rIndex) => {
                              const isRowWfOpen = selectedRowId?.sectionId === sec.id && selectedRowId?.rowId === row.id;

                              return (
                                <div 
                                  key={row.id} 
                                  className={`p-3.5 rounded-lg border transition-all ${
                                    isRowWfOpen 
                                      ? 'bg-slate-900/95 border-emerald-500/40 shadow-inner' 
                                      : 'bg-slate-950/40 border-slate-900/60 hover:bg-slate-900/30'
                                  }`}
                                >
                                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 flex-1">
                                      {/* Row Title */}
                                      <div className="space-y-1">
                                        <label className="text-[8.5px] font-bold text-slate-500 uppercase font-mono block">Option text</label>
                                        <input
                                          type="text"
                                          value={row.title}
                                          onChange={(e) => updateRowField(sec.id, row.id, 'title', e.target.value)}
                                          className="w-full bg-slate-950 border border-slate-850 hover:border-slate-800 rounded px-2.5 py-1 text-xs text-white outline-none"
                                          placeholder="Title (e.g. Sales)"
                                        />
                                      </div>

                                      {/* Row Subtitle */}
                                      <div className="space-y-1">
                                        <label className="text-[8.5px] font-bold text-slate-500 uppercase font-mono block">Description subtitle</label>
                                        <input
                                          type="text"
                                          value={row.description}
                                          onChange={(e) => updateRowField(sec.id, row.id, 'description', e.target.value)}
                                          className="w-full bg-slate-950 border border-slate-850 hover:border-slate-800 rounded px-2.5 py-1 text-xs text-slate-300 outline-none"
                                          placeholder="Sub-caption"
                                        />
                                      </div>

                                      {/* Option Trigger JID */}
                                      <div className="space-y-1">
                                        <label className="text-[8.5px] font-bold text-slate-500 uppercase font-mono block flex items-center gap-1">
                                          <span>Trigger Option ID</span>
                                          <span className="text-[7.5px] text-emerald-500">(Unique ID)</span>
                                        </label>
                                        <input
                                          type="text"
                                          value={row.id}
                                          onChange={(e) => updateRowField(sec.id, row.id, 'id', e.target.value)}
                                          className="w-full bg-slate-950 border border-slate-850 hover:border-slate-800 rounded px-2.5 py-1 text-xs text-slate-300 outline-none font-mono"
                                          placeholder="e.g. opt_sales"
                                        />
                                      </div>
                                    </div>

                                    {/* Action items */}
                                    <div className="flex items-center gap-2 self-end md:self-center">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (isRowWfOpen) {
                                            setSelectedRowId(null);
                                          } else {
                                            setSelectedRowId({ sectionId: sec.id, rowId: row.id });
                                          }
                                        }}
                                        className={`flex items-center gap-1 py-1 px-2 text-[9.5px] font-bold rounded transition-colors cursor-pointer select-none ${
                                          isRowWfOpen 
                                            ? 'bg-emerald-500 text-slate-950 font-bold' 
                                            : 'bg-slate-900 hover:bg-slate-800 text-slate-300'
                                        }`}
                                      >
                                        <Zap className="w-3 h-3 shrink-0" />
                                        <span>{isRowWfOpen ? 'Close Workflow' : 'Configure Reply Workflow'}</span>
                                      </button>
                                      
                                      <button
                                        type="button"
                                        onClick={() => removeRow(sec.id, row.id)}
                                        className="text-slate-600 hover:text-rose-400 p-1"
                                        title="Delete Option"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </div>

                                  {/* Auto-Response Workflow Editor Panel nested below */}
                                  <AnimatePresence>
                                    {isRowWfOpen && (
                                      <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        className="mt-4 pt-4 border-t border-slate-900 space-y-4 overflow-hidden"
                                      >
                                        <div className="bg-slate-950 p-4.5 rounded-lg border border-slate-850/60 space-y-4">
                                          <div className="flex items-center gap-2 mb-1">
                                            <Zap className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                                            <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
                                              Trigger Option Click Action Workflow: "{row.title}" (ID: {row.id})
                                            </span>
                                          </div>

                                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="space-y-1.5">
                                              <label className="text-[9.5px] font-bold text-slate-400 uppercase tracking-wide">Automated Response Message Type</label>
                                              <select
                                                value={row.responseType}
                                                onChange={(e) => updateRowField(sec.id, row.id, 'responseType', e.target.value)}
                                                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none cursor-pointer"
                                              >
                                                <option value="none">❌ Disabled (No automation)</option>
                                                <option value="text">💬 Standard Text (Simple text message)</option>
                                                <option value="buttons">🔘 Interactive Buttons (Quick reply)</option>
                                                <option value="template">🔗 CTA Templates (Call / URLs)</option>
                                              </select>
                                            </div>

                                            <div className="space-y-1.5">
                                              <label className="text-[9.5px] font-bold text-slate-400 uppercase tracking-wide">Attach File (Optional)</label>
                                              <select
                                                value={row.responseAttachmentType || 'none'}
                                                onChange={(e) => updateRowField(sec.id, row.id, 'responseAttachmentType', e.target.value)}
                                                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none cursor-pointer"
                                              >
                                                <option value="none">No Attachment</option>
                                                <option value="image">Image (PNG, JPEG, WEBP)</option>
                                                <option value="video">Video (MP4)</option>
                                                <option value="pdf">PDF Document</option>
                                                <option value="doc">MS Word / Excel / ZIP</option>
                                              </select>
                                            </div>
                                          </div>

                                          {row.responseType !== 'none' && (
                                            <div className="space-y-4">
                                              <div className="space-y-1.5">
                                                <label className="text-[9.5px] font-bold text-slate-400 uppercase tracking-wide">Workflow Reply Body Text</label>
                                                <textarea
                                                  value={row.responseMessage}
                                                  onChange={(e) => updateRowField(sec.id, row.id, 'responseMessage', e.target.value)}
                                                  rows={3}
                                                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none font-sans"
                                                  placeholder="Type the automated response message..."
                                                />
                                              </div>

                                              <div className="space-y-1.5">
                                                <label className="text-[9.5px] font-bold text-slate-400 uppercase tracking-wide">Reply Footer Text (Optional)</label>
                                                <input
                                                  type="text"
                                                  value={row.responseFooter || ''}
                                                  onChange={(e) => updateRowField(sec.id, row.id, 'responseFooter', e.target.value)}
                                                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none"
                                                  placeholder="e.g. Powered by Navi Automated Support"
                                                />
                                              </div>

                                              {row.responseAttachmentType && row.responseAttachmentType !== 'none' && (
                                                <div className="space-y-1.5">
                                                  <label className="text-[9.5px] font-bold text-slate-400 uppercase tracking-wide">File Attachment URL</label>
                                                  <input
                                                    type="url"
                                                    value={row.responseAttachmentUrl || ''}
                                                    onChange={(e) => updateRowField(sec.id, row.id, 'responseAttachmentUrl', e.target.value)}
                                                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none font-mono"
                                                    placeholder="https://example.com/brochure.pdf"
                                                  />
                                                </div>
                                              )}

                                              {/* Row Button Sub-designer */}
                                              {row.responseType === 'buttons' && (
                                                <div className="space-y-2 border-t border-slate-900 pt-3">
                                                  <div className="flex items-center justify-between">
                                                    <label className="text-[9.5px] font-bold text-slate-400 uppercase tracking-wide">Quick Reply Buttons (Max 3)</label>
                                                    {(row.responseButtons || []).length < 3 && (
                                                      <button
                                                        type="button"
                                                        onClick={() => handleAddResponseButton(sec.id, row.id)}
                                                        className="text-[9px] font-bold text-emerald-400 hover:underline flex items-center gap-0.5"
                                                      >
                                                        <Plus className="w-2.5 h-2.5" />
                                                        <span>Add Button</span>
                                                      </button>
                                                    )}
                                                  </div>
                                                  
                                                  <div className="space-y-2">
                                                    {(row.responseButtons || []).map((btn, bIdx) => (
                                                      <div key={bIdx} className="flex items-center gap-2 bg-slate-900/50 p-2 rounded border border-slate-900">
                                                        <input
                                                          type="text"
                                                          value={btn.text}
                                                          onChange={(e) => handleUpdateResponseButton(sec.id, row.id, bIdx, 'text', e.target.value)}
                                                          placeholder="Button Label"
                                                          className="flex-1 bg-slate-950 border border-slate-850 rounded px-2 py-0.5 text-xs text-white outline-none"
                                                        />
                                                        <input
                                                          type="text"
                                                          value={btn.id}
                                                          onChange={(e) => handleUpdateResponseButton(sec.id, row.id, bIdx, 'id', e.target.value)}
                                                          placeholder="Button ID (Trigger)"
                                                          className="flex-1 bg-slate-950 border border-slate-850 rounded px-2 py-0.5 text-xs text-slate-400 outline-none font-mono"
                                                        />
                                                        <button
                                                          type="button"
                                                          onClick={() => handleRemoveResponseButton(sec.id, row.id, bIdx)}
                                                          className="text-slate-500 hover:text-rose-400 p-0.5"
                                                        >
                                                          <Trash2 className="w-3.5 h-3.5" />
                                                        </button>
                                                      </div>
                                                    ))}
                                                    {(row.responseButtons || []).length === 0 && (
                                                      <span className="text-[9px] text-slate-500 italic block">No buttons added yet. Click "Add Button".</span>
                                                    )}
                                                  </div>
                                                </div>
                                              )}

                                              {/* Row Template Sub-designer */}
                                              {row.responseType === 'template' && (
                                                <div className="space-y-3 border-t border-slate-900 pt-3">
                                                  <label className="text-[9.5px] font-bold text-slate-400 uppercase tracking-wide block">Action Link Templates (Call / Web URLs)</label>
                                                  
                                                  {(() => {
                                                    const tmplBtns = row.responseTemplateButtons || [
                                                      { type: 'url', text: '🔗 View Catalog', url: 'https://ai.studio/build' },
                                                      { type: 'call', text: '📞 Call Agent', phoneNumber: '15555551212' }
                                                    ];
                                                    
                                                    return (
                                                      <div className="space-y-3">
                                                        <div className="flex items-center gap-2">
                                                          <span className="text-[10px] text-slate-500 shrink-0 font-bold w-10">URL:</span>
                                                          <input
                                                            type="text"
                                                            placeholder="URL Label"
                                                            value={tmplBtns[0]?.text || ''}
                                                            onChange={(e) => {
                                                              const nextTmpl = [...tmplBtns];
                                                              nextTmpl[0] = { ...nextTmpl[0], type: 'url', text: e.target.value };
                                                              updateRowField(sec.id, row.id, 'responseTemplateButtons', nextTmpl);
                                                            }}
                                                            className="flex-1 bg-slate-950 border border-slate-850 rounded px-2 py-1 text-xs text-white outline-none"
                                                          />
                                                          <input
                                                            type="url"
                                                            placeholder="Action URL"
                                                            value={tmplBtns[0]?.url || ''}
                                                            onChange={(e) => {
                                                              const nextTmpl = [...tmplBtns];
                                                              nextTmpl[0] = { ...nextTmpl[0], type: 'url', url: e.target.value };
                                                              updateRowField(sec.id, row.id, 'responseTemplateButtons', nextTmpl);
                                                            }}
                                                            className="flex-1 bg-slate-950 border border-slate-850 rounded px-2 py-1 text-xs text-white outline-none font-mono"
                                                          />
                                                        </div>

                                                        <div className="flex items-center gap-2">
                                                          <span className="text-[10px] text-slate-500 shrink-0 font-bold w-10">Call:</span>
                                                          <input
                                                            type="text"
                                                            placeholder="Call Label"
                                                            value={tmplBtns[1]?.text || ''}
                                                            onChange={(e) => {
                                                              const nextTmpl = [...tmplBtns];
                                                              if (!nextTmpl[1]) nextTmpl[1] = { type: 'call', text: '', phoneNumber: '' };
                                                              nextTmpl[1] = { ...nextTmpl[1], type: 'call', text: e.target.value };
                                                              updateRowField(sec.id, row.id, 'responseTemplateButtons', nextTmpl);
                                                            }}
                                                            className="flex-1 bg-slate-950 border border-slate-850 rounded px-2 py-1 text-xs text-white outline-none"
                                                          />
                                                          <input
                                                            type="text"
                                                            placeholder="Phone JID"
                                                            value={tmplBtns[1]?.phoneNumber || ''}
                                                            onChange={(e) => {
                                                              const nextTmpl = [...tmplBtns];
                                                              if (!nextTmpl[1]) nextTmpl[1] = { type: 'call', text: '', phoneNumber: '' };
                                                              nextTmpl[1] = { ...nextTmpl[1], type: 'call', phoneNumber: e.target.value };
                                                              updateRowField(sec.id, row.id, 'responseTemplateButtons', nextTmpl);
                                                            }}
                                                            className="flex-1 bg-slate-950 border border-slate-850 rounded px-2 py-1 text-xs text-white outline-none font-mono"
                                                          />
                                                        </div>
                                                      </div>
                                                    );
                                                  })()}
                                                </div>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      </motion.div>
                                    )}
                                  </AnimatePresence>
                                </div>
                              );
                            })}

                            {(sec.rows || []).length === 0 && (
                              <div className="p-4 text-center bg-slate-950/20 border border-slate-900 rounded-lg text-slate-600 text-[11px] italic">
                                No selection rows added inside this section. Click "Add Option" above.
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-12 text-center text-slate-500 space-y-4 shadow-xl">
              <div className="inline-flex bg-slate-950 p-5 rounded-full text-slate-700 border border-slate-850">
                <List className="w-10 h-10 animate-bounce" />
              </div>
              <div>
                <h4 className="text-white font-bold text-sm">No Active Menu Selected</h4>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  Choose an existing template from the left directory column or create a fresh custom Interactive List Menu to launch.
                </p>
              </div>
              <button
                type="button"
                onClick={handleCreateNewList}
                className="py-1.5 px-3 bg-emerald-500 hover:bg-emerald-600 text-slate-950 text-xs font-bold rounded-xl transition-all cursor-pointer"
              >
                Create Custom Menu List
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
