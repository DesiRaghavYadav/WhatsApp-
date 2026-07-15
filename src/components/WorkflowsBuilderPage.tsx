import React, { useState, useEffect } from 'react';
import { 
  Zap, 
  Layers, 
  Plus, 
  Trash2, 
  Phone, 
  ExternalLink, 
  MessageSquare, 
  Paperclip, 
  AlertCircle, 
  Check, 
  Sparkles, 
  ChevronRight, 
  Smartphone, 
  FileText, 
  Video, 
  ImageIcon, 
  Info, 
  Save,
  HelpCircle
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

interface WorkflowsBuilderPageProps {
  workflowsList: WorkflowRule[];
  setWorkflowsList: React.Dispatch<React.SetStateAction<WorkflowRule[]>>;
  selectedWorkflowId: string | null;
  setSelectedWorkflowId: (id: string | null) => void;
  saveWorkflows: (updated: WorkflowRule[]) => Promise<void>;
  isSaving: boolean;
  setFeedback: (fb: { type: 'success' | 'error'; text: string } | null) => void;
}

const PRESET_ATTACHMENTS = {
  image: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800',
  video: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
  pdf: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
  doc: 'https://calibre-ebook.com/downloads/demos/demo.docx'
};

export default function WorkflowsBuilderPage({
  workflowsList,
  setWorkflowsList,
  selectedWorkflowId,
  setSelectedWorkflowId,
  saveWorkflows,
  isSaving,
  setFeedback
}: WorkflowsBuilderPageProps) {
  
  const [searchQuery, setSearchQuery] = useState('');
  
  // Find current active workflow
  const activeWorkflow = workflowsList.find(w => w.id === selectedWorkflowId) || null;

  // Local rule editing states to prevent lagging on inputs
  const [localRule, setLocalRule] = useState<WorkflowRule | null>(null);

  useEffect(() => {
    if (activeWorkflow) {
      setLocalRule({ ...activeWorkflow });
    } else {
      setLocalRule(null);
    }
  }, [selectedWorkflowId, workflowsList]);

  const handleUpdateField = (field: keyof WorkflowRule, value: any) => {
    if (!localRule) return;
    const updated = { ...localRule, [field]: value };
    setLocalRule(updated);
    
    // Sync back to workflowsList in memory
    const nextList = workflowsList.map(w => w.id === localRule.id ? updated : w);
    setWorkflowsList(nextList);
  };

  const handleCreateNewWorkflow = () => {
    const newId = `wf-${Math.random().toString(36).substring(5)}`;
    const newRule: WorkflowRule = {
      id: newId,
      name: `Automation Rule #${workflowsList.length + 1}`,
      triggerType: 'button',
      triggerValue: 'new-button-id',
      responseType: 'text',
      message: 'Hello! This is an automatic response triggered by your interaction.',
      footer: 'Navi Autopilot',
      attachmentType: 'none',
      attachmentUrl: '',
      inlineAttachment: true,
      buttons: [
        { id: 'btn-opt1', text: 'Action 1' }
      ],
      templateButtons: []
    };
    
    const updated = [...workflowsList, newRule];
    setWorkflowsList(updated);
    setSelectedWorkflowId(newId);
    setFeedback({ type: 'success', text: `Created new workflow rule: ${newRule.name}. Don't forget to Save changes!` });
  };

  const handleDeleteWorkflow = (id: string, name: string) => {
    if (window.confirm(`Are you sure you want to delete the automation rule "${name}"?`)) {
      const updated = workflowsList.filter(w => w.id !== id);
      setWorkflowsList(updated);
      
      if (selectedWorkflowId === id) {
        setSelectedWorkflowId(updated.length > 0 ? updated[0].id : null);
      }
      setFeedback({ type: 'success', text: 'Workflow rule removed. Click "Save and Deploy" to apply changes on the server.' });
    }
  };

  const handleAddButton = () => {
    if (!localRule) return;
    const currentBtns = localRule.buttons || [];
    if (currentBtns.length >= 3) {
      alert('WhatsApp interactive messages allow a maximum of 3 custom buttons.');
      return;
    }
    const updatedBtns = [...currentBtns, { id: `action-${Math.random().toString(36).substring(5)}`, text: 'New Button' }];
    handleUpdateField('buttons', updatedBtns);
  };

  const handleRemoveButton = (index: number) => {
    if (!localRule) return;
    const currentBtns = [...(localRule.buttons || [])];
    currentBtns.splice(index, 1);
    handleUpdateField('buttons', currentBtns);
  };

  const handleUpdateButton = (index: number, field: 'id' | 'text', val: string) => {
    if (!localRule) return;
    const currentBtns = [...(localRule.buttons || [])];
    currentBtns[index] = { ...currentBtns[index], [field]: val };
    handleUpdateField('buttons', currentBtns);
  };

  const handleAddTemplateButton = () => {
    if (!localRule) return;
    const currentBtns = localRule.templateButtons || [];
    if (currentBtns.length >= 3) {
      alert('WhatsApp template messages allow a maximum of 3 action options.');
      return;
    }
    const updatedBtns = [...currentBtns, { type: 'quickReply' as const, text: 'Click Reply', id: `action-${Math.random().toString(36).substring(5)}` }];
    handleUpdateField('templateButtons', updatedBtns);
  };

  const handleRemoveTemplateButton = (index: number) => {
    if (!localRule) return;
    const currentBtns = [...(localRule.templateButtons || [])];
    currentBtns.splice(index, 1);
    handleUpdateField('templateButtons', currentBtns);
  };

  const handleUpdateTemplateButton = (index: number, field: keyof TemplateButtonItem, val: any) => {
    if (!localRule) return;
    const currentBtns = [...(localRule.templateButtons || [])];
    currentBtns[index] = { ...currentBtns[index], [field]: val };
    handleUpdateField('templateButtons', currentBtns);
  };

  // Filter workflows list based on search query
  const filteredWorkflows = workflowsList.filter(w => {
    const q = searchQuery.toLowerCase();
    return w.name.toLowerCase().includes(q) || 
           w.triggerValue.toLowerCase().includes(q) ||
           w.message.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-6" id="workflows-page-root">
      
      {/* Page Description and Deployment Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/40 border border-slate-800 p-6 rounded-2xl backdrop-blur-sm">
        <div className="space-y-1.5 max-w-xl">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Zap className="w-5 h-5 text-emerald-400" />
            <span>Interactive Chatbot & Flow Automation Builder</span>
          </h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            Create multi-message conversational pipelines. Define rule triggers on incoming text keywords or quick-reply button clicks to automatically send sophisticated templates, headers, and chained sub-menus.
          </p>
        </div>

        <button
          id="btn-deploy-workflows"
          onClick={() => saveWorkflows(workflowsList)}
          disabled={isSaving}
          className="flex items-center justify-center gap-2 px-5 py-3 bg-emerald-500 hover:bg-emerald-400 disabled:bg-emerald-850 disabled:text-slate-500 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-emerald-500/10 cursor-pointer hover:shadow-emerald-500/20 active:scale-[0.98] transition-all shrink-0"
        >
          <Save className={`w-4 h-4 ${isSaving ? 'animate-spin' : ''}`} />
          <span>{isSaving ? 'Deploying to Gateway...' : 'Save & Deploy Automations'}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* LEFT COLUMN: Search & Workflows Rules List */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 shadow-xl backdrop-blur-sm flex flex-col h-[650px]">
            
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                <Layers className="w-4.5 h-4.5 text-emerald-400" />
                <span>Automation Rules ({filteredWorkflows.length})</span>
              </h3>
              
              <button
                id="btn-create-workflow"
                onClick={handleCreateNewWorkflow}
                className="flex items-center gap-1 text-[11px] font-bold text-emerald-400 hover:text-emerald-350 bg-emerald-500/10 hover:bg-emerald-500/15 border border-emerald-500/20 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Rule</span>
              </button>
            </div>

            {/* Search Input */}
            <div className="mb-4">
              <input
                type="text"
                placeholder="Search rules, triggers, keywords..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950 border border-slate-850 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 outline-none focus:border-emerald-500 transition-all"
              />
            </div>

            {/* Rules List */}
            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 custom-scrollbar">
              {filteredWorkflows.length === 0 ? (
                <div className="text-center py-12 bg-slate-950/40 border border-slate-850/60 rounded-xl">
                  <AlertCircle className="w-8 h-8 text-slate-700 mx-auto mb-2" />
                  <p className="text-xs text-slate-500 font-medium">No workflow rules found.</p>
                  <p className="text-[10px] text-slate-600 mt-0.5">Try modifying your search or click "Add Rule".</p>
                </div>
              ) : (
                filteredWorkflows.map((rule) => {
                  const isActive = rule.id === selectedWorkflowId;
                  return (
                    <div
                      key={rule.id}
                      onClick={() => setSelectedWorkflowId(rule.id)}
                      className={`relative group p-4 border rounded-xl transition-all cursor-pointer ${
                        isActive
                          ? 'bg-slate-800/80 border-emerald-500/40 shadow-md shadow-emerald-500/5'
                          : 'bg-slate-950/40 hover:bg-slate-900/60 border-slate-850 hover:border-slate-800'
                      }`}
                    >
                      {isActive && (
                        <div className="absolute top-0 bottom-0 left-0 w-1 bg-emerald-500 rounded-l-xl" />
                      )}

                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="space-y-0.5">
                          <h4 className="text-xs font-bold text-white leading-normal truncate max-w-[180px]">
                            {rule.name}
                          </h4>
                          <span className="text-[10px] font-mono text-slate-500 block">ID: {rule.id}</span>
                        </div>
                        
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteWorkflow(rule.id, rule.name);
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded transition-all cursor-pointer"
                          title="Delete Rule"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Trigger Summary Badge */}
                      <div className="flex flex-wrap items-center gap-1.5 mt-2">
                        <span className={`inline-flex items-center gap-1 text-[9px] font-semibold px-2 py-0.5 rounded-md border ${
                          rule.triggerType === 'button'
                            ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                            : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                        }`}>
                          <Zap className="w-2.5 h-2.5 shrink-0" />
                          <span>{rule.triggerType === 'button' ? 'Btn Click' : 'Msg Keyword'}</span>
                        </span>

                        <span className="text-[10px] bg-slate-900 border border-slate-800 text-slate-300 font-mono px-1.5 py-0.5 rounded text-xs truncate max-w-[120px]" title={rule.triggerValue}>
                          {rule.triggerValue}
                        </span>
                      </div>

                      <div className="text-[10px] text-slate-400 line-clamp-1 mt-2.5 border-t border-slate-850/60 pt-2 flex items-center gap-1">
                        <ChevronRight className="w-3 h-3 text-slate-600" />
                        <span>Responds: <b>{rule.responseType.toUpperCase()}</b></span>
                        {rule.attachmentType && rule.attachmentType !== 'none' && (
                          <span className="text-emerald-400 font-bold ml-auto">+Media</span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Active Workflow Editor & Phone Simulator Grid */}
        <div className="lg:col-span-8 grid grid-cols-1 xl:grid-cols-12 gap-6">
          
          {/* Active Editor Panel */}
          <div className="xl:col-span-7 flex flex-col gap-4">
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-xl backdrop-blur-sm h-[650px] overflow-y-auto custom-scrollbar space-y-6">
              
              {!localRule ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6">
                  <div className="bg-slate-950 p-4 border border-slate-850 rounded-full mb-4 text-emerald-500">
                    <Zap className="w-10 h-10 animate-pulse" />
                  </div>
                  <h4 className="text-sm font-bold text-white mb-1.5">No Active Automation Selected</h4>
                  <p className="text-xs text-slate-500 max-w-xs leading-normal">
                    Select an existing workflow rule from the left panel, or click <b>Add Rule</b> to start designing interactive auto-responses.
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  
                  {/* Step 1: Rule Details & Header */}
                  <div className="flex items-center justify-between border-b border-slate-850 pb-4">
                    <div className="space-y-1">
                      <span className="text-[10px] text-emerald-400 font-mono tracking-wider uppercase font-bold">Workspace Configuration</span>
                      <h3 className="text-md font-bold text-white">Rule Parameters</h3>
                    </div>
                  </div>

                  {/* Rule Name */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-300">Rule Display Name</label>
                    <input
                      type="text"
                      value={localRule.name}
                      onChange={(e) => handleUpdateField('name', e.target.value)}
                      placeholder="e.g. Help Button Click Callback"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-600 outline-none focus:border-emerald-500"
                    />
                  </div>

                  {/* SECTION 1: Trigger Setup */}
                  <div className="bg-slate-950/60 border border-slate-850 p-4.5 rounded-xl space-y-4">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
                      <span className="bg-emerald-500 text-slate-950 rounded-full w-4.5 h-4.5 flex items-center justify-center text-[10px]">1</span>
                      <span>Execution Trigger</span>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => handleUpdateField('triggerType', 'button')}
                        className={`py-2 px-3 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                          localRule.triggerType === 'button'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                            : 'bg-slate-950 border-slate-850 text-slate-400 hover:text-white'
                        }`}
                      >
                        ⚡ Button Action ID
                      </button>
                      <button
                        onClick={() => handleUpdateField('triggerType', 'text')}
                        className={`py-2 px-3 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                          localRule.triggerType === 'text'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                            : 'bg-slate-950 border-slate-850 text-slate-400 hover:text-white'
                        }`}
                      >
                        💬 Text Keyword
                      </button>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-slate-300">
                          {localRule.triggerType === 'button' ? 'Trigger Action ID' : 'Trigger Keyword'}
                        </label>
                        <span className="text-[10px] text-slate-500 font-mono">Case-Insensitive</span>
                      </div>
                      
                      <input
                        type="text"
                        value={localRule.triggerValue}
                        onChange={(e) => handleUpdateField('triggerValue', e.target.value)}
                        placeholder={localRule.triggerType === 'button' ? 'e.g. faq-help or checkout-btn' : 'e.g. hello, billing, pricing'}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 outline-none font-mono focus:border-emerald-500"
                      />
                      
                      <p className="text-[10px] text-slate-500 leading-relaxed italic">
                        {localRule.triggerType === 'button' 
                          ? '💡 Match this with the ID configured in your templates or buttons to chain multiple messages together!'
                          : '💡 When a user types a message containing this word, the chatbot will trigger the response below.'}
                      </p>
                    </div>
                  </div>

                  {/* SECTION 2: Response Setup */}
                  <div className="bg-slate-950/60 border border-slate-850 p-4.5 rounded-xl space-y-4">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
                      <span className="bg-emerald-500 text-slate-950 rounded-full w-4.5 h-4.5 flex items-center justify-center text-[10px]">2</span>
                      <span>Automatic Response Block</span>
                    </div>

                    {/* Response type */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-300">Response Message Layout</label>
                      <select
                        value={localRule.responseType}
                        onChange={(e) => handleUpdateField('responseType', e.target.value as any)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none cursor-pointer focus:border-emerald-500"
                      >
                        <option value="text">Plain Text Message / Media Caption</option>
                        <option value="buttons">Quick-Reply Action Buttons</option>
                        <option value="template">Mixed Action Templates (Call/URL/Reply)</option>
                      </select>
                    </div>

                    {/* Message body */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-300">Message Body</label>
                      <textarea
                        rows={4}
                        value={localRule.message}
                        onChange={(e) => handleUpdateField('message', e.target.value)}
                        placeholder="Type your auto-responder message content here..."
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-600 outline-none focus:border-emerald-500 resize-none leading-relaxed"
                      />
                    </div>

                    {/* Footer text (only for interactive) */}
                    {localRule.responseType !== 'text' && (
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-300">Footer Text</label>
                        <input
                          type="text"
                          value={localRule.footer || ''}
                          onChange={(e) => handleUpdateField('footer', e.target.value)}
                          placeholder="Navi Autopilot"
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 outline-none focus:border-emerald-500"
                        />
                      </div>
                    )}

                    {/* SECTION 3: Rich Header Attachments */}
                    <div className="border-t border-slate-850 pt-4 space-y-3.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                          <Paperclip className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Include Media Header Attachment</span>
                        </label>
                        <select
                          value={localRule.attachmentType || 'none'}
                          onChange={(e) => {
                            const val = e.target.value as any;
                            handleUpdateField('attachmentType', val);
                            if (val !== 'none') {
                              handleUpdateField('attachmentUrl', PRESET_ATTACHMENTS[val as keyof typeof PRESET_ATTACHMENTS]);
                            } else {
                              handleUpdateField('attachmentUrl', '');
                            }
                          }}
                          className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-[11px] text-white outline-none cursor-pointer focus:border-emerald-500"
                        >
                          <option value="none">No Media Attachment</option>
                          <option value="image">🖼️ Header Image</option>
                          <option value="video">🎥 Header Video</option>
                          <option value="pdf">📄 Header PDF Document</option>
                          <option value="doc">📝 Header Word Document</option>
                        </select>
                      </div>

                      {localRule.attachmentType && localRule.attachmentType !== 'none' && (
                        <div className="space-y-3 p-3 bg-slate-950 rounded-xl border border-slate-850/60">
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] text-slate-400 font-semibold">Attachment Public URL</span>
                              <button
                                onClick={() => {
                                  const t = localRule.attachmentType;
                                  if (t && t !== 'none') {
                                    handleUpdateField('attachmentUrl', PRESET_ATTACHMENTS[t as keyof typeof PRESET_ATTACHMENTS]);
                                  }
                                }}
                                className="text-[9px] text-emerald-400 font-bold hover:underline cursor-pointer"
                              >
                                Reset to Preset
                              </button>
                            </div>
                            <input
                              type="text"
                              value={localRule.attachmentUrl || ''}
                              onChange={(e) => handleUpdateField('attachmentUrl', e.target.value)}
                              placeholder="https://example.com/file.jpg"
                              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-[11px] text-slate-300 font-mono outline-none focus:border-emerald-500"
                            />
                          </div>

                          {localRule.responseType !== 'text' && (
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] text-slate-400 font-semibold">Unified Inline Delivery Mode</span>
                              <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={localRule.inlineAttachment ?? true}
                                  onChange={(e) => handleUpdateField('inlineAttachment', e.target.checked)}
                                  className="sr-only peer"
                                />
                                <div className="w-8 h-4 bg-slate-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-slate-400 after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-emerald-500 peer-checked:after:bg-slate-950 peer-checked:after:border-slate-950" />
                              </label>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* SECTION 4: Interactive Custom Buttons / Templates */}
                  {localRule.responseType === 'buttons' && (
                    <div className="bg-slate-950/60 border border-slate-850 p-4.5 rounded-xl space-y-4">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-slate-200">Interactive Custom Buttons (Max 3)</label>
                        <button
                          onClick={handleAddButton}
                          disabled={(localRule.buttons || []).length >= 3}
                          className="text-[11px] font-bold text-emerald-400 hover:text-emerald-350 flex items-center gap-1 cursor-pointer disabled:opacity-30"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Add Button</span>
                        </button>
                      </div>

                      <div className="space-y-3">
                        {(localRule.buttons || []).length === 0 ? (
                          <p className="text-[10px] text-slate-500 italic">No buttons added. Click Add Button to build interactive replies.</p>
                        ) : (
                          (localRule.buttons || []).map((btn, index) => (
                            <div key={btn.id || index} className="flex gap-2 items-center bg-slate-950 p-2.5 rounded-lg border border-slate-850">
                              <span className="text-[10px] text-slate-500 font-mono">#{index + 1}</span>
                              <input
                                type="text"
                                placeholder="Button Text"
                                value={btn.text}
                                onChange={(e) => handleUpdateButton(index, 'text', e.target.value)}
                                className="bg-slate-900 border border-slate-800 rounded-md px-2 py-1 text-xs text-white w-1/2 focus:border-emerald-500 outline-none"
                              />
                              <input
                                type="text"
                                placeholder="Button ID (Trigger)"
                                value={btn.id}
                                onChange={(e) => handleUpdateButton(index, 'id', e.target.value)}
                                className="bg-slate-900 border border-slate-800 rounded-md px-2 py-1 text-xs text-emerald-400 font-mono w-1/2 focus:border-emerald-500 outline-none"
                              />
                              
                              <button
                                onClick={() => handleRemoveButton(index)}
                                className="p-1 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded cursor-pointer shrink-0"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                      <p className="text-[10px] text-slate-500 italic flex items-center gap-1">
                        <Info className="w-3 h-3 text-emerald-400 shrink-0" />
                        <span>💡 Chaining: The "Button ID (Trigger)" is the key that other workflows can listen for. Enter `wf-talk-agent` in a button ID, and create another rule with trigger `wf-talk-agent` to build complex trees!</span>
                      </p>
                    </div>
                  )}

                  {localRule.responseType === 'template' && (
                    <div className="bg-slate-950/60 border border-slate-850 p-4.5 rounded-xl space-y-4">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-slate-200">Mixed Action Templates (Max 3)</label>
                        <button
                          onClick={handleAddTemplateButton}
                          disabled={(localRule.templateButtons || []).length >= 3}
                          className="text-[11px] font-bold text-emerald-400 hover:text-emerald-350 flex items-center gap-1 cursor-pointer disabled:opacity-30"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Add Action</span>
                        </button>
                      </div>

                      <div className="space-y-3">
                        {(localRule.templateButtons || []).length === 0 ? (
                          <p className="text-[10px] text-slate-500 italic">No template actions added. Click Add Action to build links, calls, or replies.</p>
                        ) : (
                          (localRule.templateButtons || []).map((btn, index) => (
                            <div key={index} className="space-y-2 p-3 bg-slate-950 rounded-lg border border-slate-850">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[10px] text-slate-500 font-mono">Action #{index + 1}</span>
                                
                                <select
                                  value={btn.type}
                                  onChange={(e) => handleUpdateTemplateButton(index, 'type', e.target.value)}
                                  className="bg-slate-900 border border-slate-850 text-[10px] text-white px-2 py-0.5 rounded outline-none cursor-pointer focus:border-emerald-500"
                                >
                                  <option value="quickReply">💬 Quick Reply Button</option>
                                  <option value="url">🔗 Webpage URL Link</option>
                                  <option value="call">📞 Phone Call Dialer</option>
                                </select>

                                <button
                                  onClick={() => handleRemoveTemplateButton(index)}
                                  className="p-1 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded cursor-pointer shrink-0"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>

                              <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                  <span className="text-[9px] text-slate-400 font-semibold">Display Text</span>
                                  <input
                                    type="text"
                                    value={btn.text}
                                    onChange={(e) => handleUpdateTemplateButton(index, 'text', e.target.value)}
                                    placeholder="Click me!"
                                    className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-white outline-none focus:border-emerald-500"
                                  />
                                </div>

                                {btn.type === 'quickReply' && (
                                  <div className="space-y-1">
                                    <span className="text-[9px] text-emerald-400 font-semibold font-mono">Button ID (Trigger Key)</span>
                                    <input
                                      type="text"
                                      value={btn.id || ''}
                                      onChange={(e) => handleUpdateTemplateButton(index, 'id', e.target.value)}
                                      placeholder="e.g. reply-yes"
                                      className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-emerald-400 outline-none font-mono focus:border-emerald-500"
                                    />
                                  </div>
                                )}

                                {btn.type === 'url' && (
                                  <div className="space-y-1">
                                    <span className="text-[9px] text-slate-400 font-semibold">Target URL Address</span>
                                    <input
                                      type="text"
                                      value={btn.url || ''}
                                      onChange={(e) => handleUpdateTemplateButton(index, 'url', e.target.value)}
                                      placeholder="https://google.com"
                                      className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-slate-300 outline-none focus:border-emerald-500"
                                    />
                                  </div>
                                )}

                                {btn.type === 'call' && (
                                  <div className="space-y-1">
                                    <span className="text-[9px] text-slate-400 font-semibold">Phone Number</span>
                                    <input
                                      type="text"
                                      value={btn.phoneNumber || ''}
                                      onChange={(e) => handleUpdateTemplateButton(index, 'phoneNumber', e.target.value)}
                                      placeholder="+123456789"
                                      className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-slate-300 outline-none focus:border-emerald-500"
                                    />
                                  </div>
                                )}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}

                </div>
              )}

            </div>
          </div>

          {/* Phone Simulator Preview */}
          <div className="xl:col-span-5 flex flex-col gap-4">
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 shadow-xl backdrop-blur-sm h-[650px] flex flex-col">
              
              <div className="flex items-center gap-2 mb-4">
                <Smartphone className="w-5 h-5 text-emerald-400" />
                <h3 className="text-sm font-bold text-slate-200">Smartphone Live Preview</h3>
              </div>

              {/* Chat Canvas Box */}
              <div className="flex-1 bg-slate-950 border border-slate-850 rounded-xl overflow-hidden flex flex-col shadow-inner relative">
                
                {/* Chat Header */}
                <div className="bg-slate-900/80 border-b border-slate-850 px-3.5 py-2.5 flex items-center gap-2.5 shrink-0">
                  <div className="w-7 h-7 bg-emerald-500/15 border border-emerald-500/20 text-emerald-400 font-bold rounded-full flex items-center justify-center text-[10px]">
                    N
                  </div>
                  <div>
                    <h5 className="text-[11px] font-bold text-slate-200 leading-none">Navi Autopilot</h5>
                    <span className="text-[9px] text-emerald-400 font-medium">online</span>
                  </div>
                </div>

                {/* Chat Messages Scrolling */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4 flex flex-col justify-end bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px]">
                  
                  {/* Incoming user trigger simulator bubble */}
                  {localRule && (
                    <div className="max-w-[75%] bg-slate-800/90 text-slate-200 p-3 rounded-2xl rounded-tr-none text-xs self-end shadow-sm">
                      <p className="font-medium">
                        {localRule.triggerType === 'button' ? (
                          <span className="italic flex items-center gap-1 text-[10px] text-slate-300 font-semibold">
                            <Zap className="w-3 h-3 text-blue-400" />
                            [Clicked: {localRule.triggerValue}]
                          </span>
                        ) : (
                          <span>"{localRule.triggerValue}"</span>
                        )}
                      </p>
                      <span className="text-[8px] text-slate-400 block text-right mt-1.5 font-mono">10:42 AM</span>
                    </div>
                  )}

                  {/* Outgoing automated response bubble */}
                  {localRule ? (
                    <div className="max-w-[85%] self-start space-y-1 bg-slate-900 border border-slate-800 rounded-2xl rounded-tl-none overflow-hidden shadow-lg shadow-black/15">
                      
                      {/* Media Header Area */}
                      {localRule.attachmentType && localRule.attachmentType !== 'none' && (
                        <div className="bg-slate-950 p-2 border-b border-slate-850 flex items-center justify-center relative min-h-[100px]">
                          {localRule.attachmentType === 'image' && (
                            <img
                              src={localRule.attachmentUrl || PRESET_ATTACHMENTS.image}
                              alt="Header Preview"
                              className="w-full h-28 object-cover rounded-lg"
                              referrerPolicy="no-referrer"
                            />
                          )}
                          {localRule.attachmentType === 'video' && (
                            <div className="w-full h-28 bg-slate-900 rounded-lg flex flex-col items-center justify-center border border-slate-800 gap-1.5">
                              <Video className="w-6 h-6 text-emerald-400" />
                              <span className="text-[10px] text-slate-400">Auto-Responder Video Header</span>
                            </div>
                          )}
                          {localRule.attachmentType === 'pdf' && (
                            <div className="w-full bg-slate-900 p-3.5 rounded-lg border border-slate-800 flex items-center gap-3">
                              <div className="p-2.5 bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded-lg">
                                <FileText className="w-5 h-5" />
                              </div>
                              <div className="text-left space-y-0.5 truncate">
                                <h6 className="text-[11px] font-bold text-slate-200 leading-tight">document.pdf</h6>
                                <p className="text-[9px] text-slate-400">PDF Document • 1.2 MB</p>
                              </div>
                            </div>
                          )}
                          {localRule.attachmentType === 'doc' && (
                            <div className="w-full bg-slate-900 p-3.5 rounded-lg border border-slate-800 flex items-center gap-3">
                              <div className="p-2.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-lg">
                                <FileText className="w-5 h-5" />
                              </div>
                              <div className="text-left space-y-0.5 truncate">
                                <h6 className="text-[11px] font-bold text-slate-200 leading-tight">document.docx</h6>
                                <p className="text-[9px] text-slate-400">Word Document • 840 KB</p>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Main Message Text Body & Footer */}
                      <div className="p-3.5 space-y-1 bg-slate-900">
                        <p className="text-xs text-slate-200 leading-relaxed whitespace-pre-line select-text">
                          {localRule.message || 'No text content defined.'}
                        </p>
                        
                        {localRule.responseType !== 'text' && localRule.footer && (
                          <p className="text-[9.5px] text-slate-500 leading-none pt-1 select-text">
                            {localRule.footer}
                          </p>
                        )}
                        <span className="text-[8px] text-slate-400 block text-right mt-1.5 font-mono leading-none">10:42 AM</span>
                      </div>

                      {/* Render Quick Reply buttons */}
                      {localRule.responseType === 'buttons' && (localRule.buttons || []).length > 0 && (
                        <div className="border-t border-slate-850 divide-y divide-slate-850 bg-slate-900">
                          {(localRule.buttons || []).map((btn, idx) => (
                            <div
                              key={idx}
                              className="py-2.5 px-4 text-center text-xs font-bold text-emerald-400 bg-slate-900/50 cursor-pointer"
                            >
                              {btn.text || 'Action Button'}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Render Template actions */}
                      {localRule.responseType === 'template' && (localRule.templateButtons || []).length > 0 && (
                        <div className="border-t border-slate-850 divide-y divide-slate-850 bg-slate-900">
                          {(localRule.templateButtons || []).map((btn, idx) => (
                            <div
                              key={idx}
                              className="py-2.5 px-4 flex items-center justify-center gap-2 text-xs font-bold text-emerald-400 bg-slate-900/50 cursor-pointer"
                            >
                              {btn.type === 'url' && <ExternalLink className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
                              {btn.type === 'call' && <Phone className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
                              {btn.type === 'quickReply' && <MessageSquare className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
                              <span>{btn.text || 'Action Link'}</span>
                            </div>
                          ))}
                        </div>
                      )}

                    </div>
                  ) : (
                    <div className="text-center py-10">
                      <HelpCircle className="w-8 h-8 text-slate-700 mx-auto mb-2" />
                      <p className="text-[11px] text-slate-500">Awaiting automation setup preview</p>
                    </div>
                  )}

                </div>

                {/* Input Bar Dummy */}
                <div className="bg-slate-900/80 border-t border-slate-850 p-2 flex items-center gap-2 shrink-0">
                  <div className="flex-1 bg-slate-950 border border-slate-850 rounded-lg py-1.5 px-3 text-[10px] text-slate-500">
                    Type a trigger keyword to simulate...
                  </div>
                </div>

              </div>

              {/* Simulation Helper */}
              <div className="mt-4 p-4.5 bg-slate-950/40 border border-slate-850 rounded-xl space-y-2">
                <h5 className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                  <span>How Sequential Workflows Chain</span>
                </h5>
                <p className="text-[10px] text-slate-400 leading-normal">
                  You can design infinite conversational menus by linking a button's <b>Trigger ID Key</b> (e.g., <code>wf-pay-now</code>) as the <b>Trigger Value</b> of a secondary workflow rule. When the customer clicks that button on their phone, the next rule executes instantly!
                </p>
              </div>

            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
