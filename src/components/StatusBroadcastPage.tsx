import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Sparkles, 
  Send, 
  Image as ImageIcon, 
  Video as VideoIcon, 
  Type, 
  Users, 
  Info, 
  Check, 
  AlertCircle, 
  RefreshCw, 
  UploadCloud, 
  Smile, 
  Palette, 
  MousePointer, 
  AtSign, 
  Smartphone,
  CheckCircle2,
  Trash2,
  Plus,
  Calendar,
  Clock,
  Code2,
  Play,
  Bookmark,
  Key
} from 'lucide-react';

interface StatusBroadcastPageProps {
  fetchWithAuth: (url: string, init?: RequestInit) => Promise<Response>;
  setFeedback: (fb: { type: 'success' | 'error'; text: string } | null) => void;
  sessionsList: Array<{
    id: string;
    name: string;
    status: string;
    user?: any;
  }>;
}

const BG_PRESETS = [
  { name: 'Teal Forest', hex: '#075E54' },
  { name: 'Royal Amethyst', hex: '#4A148C' },
  { name: 'Ocean Blue', hex: '#0D47A1' },
  { name: 'Sunset Amber', hex: '#E65100' },
  { name: 'Crimson Velvet', hex: '#B71C1C' },
  { name: 'Rose Petal', hex: '#880E4F' },
  { name: 'Midnight Onyx', hex: '#1E293B' },
  { name: 'Neon Lime', hex: '#4D7C0F' },
];

const FONTS = [
  { name: 'Sans-Serif (Standard)', value: 1, class: 'font-sans font-medium tracking-normal' },
  { name: 'Serif (Editorial)', value: 2, class: 'font-serif tracking-tight font-semibold italic' },
  { name: 'Casual (Handwriting)', value: 3, class: 'font-serif tracking-wide font-normal font-sans' },
  { name: 'Mono (Tech)', value: 5, class: 'font-mono uppercase tracking-widest font-bold' },
];

export default function StatusBroadcastPage({
  fetchWithAuth,
  setFeedback,
  sessionsList
}: StatusBroadcastPageProps) {
  // Account Selections
  const [selectedSessionIds, setSelectedSessionIds] = useState<string[]>(['primary']);
  
  // Status Content Settings
  const [statusType, setStatusType] = useState<'text' | 'image' | 'video'>('text');
  const [textContent, setTextContent] = useState('');
  const [selectedBgHex, setSelectedBgHex] = useState('#075E54');
  const [selectedFont, setSelectedFont] = useState(1);
  
  // Media source state
  const [mediaSource, setMediaSource] = useState<'upload' | 'url'>('upload');
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaData, setMediaData] = useState<string>(''); // base64
  const [mediaName, setMediaName] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // Targeting Distributions (statusJidList)
  const [targetType, setTargetType] = useState<'all_leads' | 'group_members' | 'custom'>('all_leads');
  const [savedGroups, setSavedGroups] = useState<any[]>([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [excludeContacts, setExcludeContacts] = useState(true);
  const [groupSearchQuery, setGroupSearchQuery] = useState('');
  const [groupMembersList, setGroupMembersList] = useState<string[]>([]);
  const [customNumbersInput, setCustomNumbersInput] = useState('');
  const [leadsCount, setLeadsCount] = useState(0);
  const [leadsList, setLeadsList] = useState<any[]>([]);

  // Silent Mentions / Tagging
  const [mentionsInput, setMentionsInput] = useState('');
  const [tagGroupMembers, setTagGroupMembers] = useState(false);

  // Publishing / Sending state
  const [isPublishing, setIsPublishing] = useState(false);
  const [results, setResults] = useState<any[] | null>(null);

  // Delayed & Batched status schedules
  const [sendMode, setSendMode] = useState<'instant' | 'delayed'>('delayed');
  const [delayMinutes, setDelayMinutes] = useState<number>(5);
  const [secondDelayMinutes, setSecondDelayMinutes] = useState<number>(10);
  const [batchSize, setBatchSize] = useState<number>(5);
  const [batchMode, setBatchMode] = useState<'members' | 'groups'>('groups');
  const [startTime, setStartTime] = useState<string>('');
  const [activeSchedules, setActiveSchedules] = useState<any[]>([]);
  const [isLoadingSchedules, setIsLoadingSchedules] = useState<boolean>(false);

  const fetchSchedules = () => {
    setIsLoadingSchedules(true);
    fetchWithAuth('/api/status/schedules')
      .then(res => res.json())
      .then(data => {
        if (data.success && Array.isArray(data.schedules)) {
          setActiveSchedules(data.schedules);
        }
      })
      .catch(err => console.error('Error fetching status schedules:', err))
      .finally(() => setIsLoadingSchedules(false));
  };

  const handleToggleSchedule = async (id: string) => {
    try {
      const response = await fetchWithAuth(`/api/status/schedules/${id}/toggle`, {
        method: 'POST'
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setFeedback({ type: 'success', text: `Schedule toggled successfully!` });
        fetchSchedules();
      } else {
        setFeedback({ type: 'error', text: data.error || 'Failed to toggle schedule.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message });
    }
  };

  const handleDeleteSchedule = async (id: string) => {
    try {
      const response = await fetchWithAuth(`/api/status/schedules/${id}`, {
        method: 'DELETE'
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setFeedback({ type: 'success', text: 'Schedule deleted successfully!' });
        fetchSchedules();
      } else {
        setFeedback({ type: 'error', text: data.error || 'Failed to delete schedule.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message });
    }
  };

  // Saved Status Codes State
  const [saveCodeInput, setSaveCodeInput] = useState<string>('');
  const [savedCodesList, setSavedCodesList] = useState<any[]>([]);
  const [isSavingCode, setIsSavingCode] = useState<boolean>(false);
  const [isLoadingCodes, setIsLoadingCodes] = useState<boolean>(false);

  const fetchSavedCodes = () => {
    setIsLoadingCodes(true);
    fetchWithAuth('/api/saved-codes')
      .then(res => res.json())
      .then(data => {
        if (data.success && Array.isArray(data.savedCodes)) {
          setSavedCodesList(data.savedCodes);
        }
      })
      .catch(err => console.error('Error fetching saved codes:', err))
      .finally(() => setIsLoadingCodes(false));
  };

  const handleSaveStatusCode = async () => {
    const cleanCode = saveCodeInput.replace(/\D/g, '').trim();
    if (cleanCode.length !== 4) {
      setFeedback({ type: 'error', text: 'Please enter a valid 4-digit numeric code (e.g., 1234).' });
      return;
    }

    if (statusType === 'text' && !textContent.trim()) {
      setFeedback({ type: 'error', text: 'Please write text content before saving status as a code.' });
      return;
    }
    if (statusType !== 'text') {
      if (mediaSource === 'upload' && !mediaData) {
        setFeedback({ type: 'error', text: 'Please upload media before saving status as a code.' });
        return;
      }
      if (mediaSource === 'url' && !mediaUrl) {
        setFeedback({ type: 'error', text: 'Please enter a media URL before saving status as a code.' });
        return;
      }
    }

    const customMentions = mentionsInput
      .split(',')
      .map(n => n.trim().replace(/\D/g, ''))
      .filter(Boolean)
      .map(num => `${num}@s.whatsapp.net`);

    const finalMentions = (targetType === 'group_members' && tagGroupMembers)
      ? Array.from(new Set([...customMentions, ...groupMembersList]))
      : customMentions;

    setIsSavingCode(true);
    try {
      const response = await fetchWithAuth('/api/saved-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: cleanCode,
          isStatus: true,
          recipientType: 'status',
          statusType,
          message: textContent,
          backgroundColor: statusType === 'text' ? selectedBgHex : undefined,
          font: statusType === 'text' ? selectedFont : undefined,
          attachmentType: statusType === 'text' ? 'none' : statusType,
          attachmentUrl: mediaSource === 'url' ? mediaUrl : undefined,
          attachmentData: mediaSource === 'upload' ? mediaData : undefined,
          attachmentName: mediaSource === 'upload' ? mediaName : 'status-attachment',
          sessionIds: selectedSessionIds,
          statusJidList: getCompiledJids(),
          mentions: finalMentions
        })
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setFeedback({ type: 'success', text: `Status post permanently saved with code .${cleanCode}! Type .${cleanCode} in WhatsApp anytime to trigger.` });
        setSaveCodeInput('');
        fetchSavedCodes();
      } else {
        setFeedback({ type: 'error', text: data.error || 'Failed to save status code.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Error saving status code.' });
    } finally {
      setIsSavingCode(false);
    }
  };

  const handleRunCode = async (idOrCode: string) => {
    try {
      const response = await fetchWithAuth(`/api/saved-codes/trigger/${idOrCode}`, {
        method: 'POST'
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setFeedback({ type: 'success', text: `Code .${idOrCode} status update broadcasted successfully!` });
      } else {
        setFeedback({ type: 'error', text: data.error || `Failed to trigger code .${idOrCode}.` });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message });
    }
  };

  const handleDeleteSavedCode = async (id: string) => {
    try {
      const response = await fetchWithAuth(`/api/saved-codes/${id}`, {
        method: 'DELETE'
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setFeedback({ type: 'success', text: 'Saved code removed successfully.' });
        fetchSavedCodes();
      } else {
        setFeedback({ type: 'error', text: data.error || 'Failed to delete saved code.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message });
    }
  };

  // Fetch initial helper data (leads, groups & saved codes)
  useEffect(() => {
    fetchSavedCodes();

    // Fetch Leads count
    fetchWithAuth('/api/leads')
      .then(res => res.json())
      .then(data => {
        if (data.success && Array.isArray(data.leads)) {
          setLeadsList(data.leads);
          setLeadsCount(data.leads.length);
        }
      })
      .catch(err => console.error('Error fetching leads:', err));

    // Fetch Saved Groups
    fetchWithAuth('/api/groups')
      .then(res => res.json())
      .then(data => {
        if (data.success && Array.isArray(data.groups)) {
          setSavedGroups(data.groups);
        }
      })
      .catch(err => console.error('Error fetching groups:', err));

    // Fetch schedules initially and poll every 15 seconds
    fetchSchedules();
    const schedInterval = setInterval(fetchSchedules, 15000);
    return () => clearInterval(schedInterval);
  }, []);

  // Update group members list when selected group list changes
  useEffect(() => {
    if (selectedGroupIds.length === 0) {
      setGroupMembersList([]);
      return;
    }
    const uniqueParticipants = new Set<string>();
    selectedGroupIds.forEach(gid => {
      const match = savedGroups.find(g => g.jid === gid);
      if (match && Array.isArray(match.participants)) {
        match.participants.forEach((p: string) => {
          if (typeof p === 'string' && !p.endsWith('@lid')) {
            uniqueParticipants.add(p);
          }
        });
      }
    });
    setGroupMembersList(Array.from(uniqueParticipants));
  }, [selectedGroupIds, savedGroups]);

  // Handle uploader dragging
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await processSelectedFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      await processSelectedFile(e.target.files[0]);
    }
  };

  const processSelectedFile = async (file: File) => {
    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');

    if (statusType === 'image' && !isImage) {
      setFeedback({ type: 'error', text: 'Please upload an image file (PNG/JPG/WEBP).' });
      return;
    }
    if (statusType === 'video' && !isVideo) {
      setFeedback({ type: 'error', text: 'Please upload a video file (MP4/MOV).' });
      return;
    }

    setIsUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          const base64 = event.target.result as string;
          setMediaData(base64);
          setMediaName(file.name);
          setFeedback({ type: 'success', text: `Successfully parsed media file: ${file.name}` });
        }
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      setFeedback({ type: 'error', text: 'Failed to read media file: ' + err.message });
    } finally {
      setIsUploading(false);
    }
  };

  const clearSelectedMedia = () => {
    setMediaData('');
    setMediaName('');
    setMediaUrl('');
  };

  const toggleSessionSelection = (id: string) => {
    if (selectedSessionIds.includes(id)) {
      if (selectedSessionIds.length > 1) {
        setSelectedSessionIds(selectedSessionIds.filter(sid => sid !== id));
      } else {
        setFeedback({ type: 'error', text: 'Please keep at least one active account selected.' });
      }
    } else {
      setSelectedSessionIds([...selectedSessionIds, id]);
    }
  };

  const toggleGroupSelection = (jid: string) => {
    if (selectedGroupIds.includes(jid)) {
      setSelectedGroupIds(selectedGroupIds.filter(id => id !== jid));
    } else {
      setSelectedGroupIds([...selectedGroupIds, jid]);
    }
  };

  // Compile distribution list contacts JIDs
  const getCompiledJids = () => {
    if (targetType === 'all_leads') {
      return leadsList.map(l => l.jid).filter(Boolean);
    }
    if (targetType === 'group_members') {
      if (excludeContacts) {
        return groupMembersList;
      } else {
        const leadJids = leadsList.map(l => l.jid).filter(Boolean);
        return Array.from(new Set([...groupMembersList, ...leadJids]));
      }
    }
    if (targetType === 'custom') {
      return customNumbersInput
        .split(',')
        .map(n => n.trim().replace(/\D/g, ''))
        .filter(Boolean)
        .map(num => `${num}@s.whatsapp.net`);
    }
    return [];
  };

  const handlePublishStatus = async () => {
    setResults(null);
    const targetJids = getCompiledJids();

    if (statusType !== 'text') {
      if (mediaSource === 'upload' && !mediaData) {
        setFeedback({ type: 'error', text: 'Please upload a media file or provide a media URL first.' });
        return;
      }
      if (mediaSource === 'url' && !mediaUrl) {
        setFeedback({ type: 'error', text: 'Please enter a valid HTTP media URL.' });
        return;
      }
    } else {
      if (!textContent.trim()) {
        setFeedback({ type: 'error', text: 'Please write some text content to post your text status.' });
        return;
      }
    }

    setIsPublishing(true);
    setFeedback(null);

    if (sendMode === 'delayed' || (startTime && startTime.trim() !== '')) {
      const schedulePayload = {
        sessionIds: selectedSessionIds,
        statusType,
        text: textContent,
        backgroundColor: statusType === 'text' ? selectedBgHex : undefined,
        font: statusType === 'text' ? selectedFont : undefined,
        attachmentType: statusType === 'text' ? 'none' : statusType,
        attachmentUrl: mediaSource === 'url' ? mediaUrl : undefined,
        attachmentData: mediaSource === 'upload' ? mediaData : undefined,
        attachmentName: mediaSource === 'upload' ? mediaName : 'status-attachment',
        groupMembers: targetJids,
        groupIds: targetType === 'group_members' ? selectedGroupIds : [],
        batchMode: targetType === 'group_members' && batchMode === 'groups' ? 'groups' : 'members',
        delayMinutes,
        secondDelayMinutes: selectedGroupIds.length > 5 ? secondDelayMinutes : undefined,
        batchSize,
        startTime: startTime || undefined,
        statusJidList: targetJids
      };

      try {
        const response = await fetchWithAuth('/api/status/schedule', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(schedulePayload)
        });

        const data = await response.json();
        if (response.ok && data.success) {
          const scheduleTimeStr = startTime ? new Date(startTime).toLocaleString() : 'in a few seconds';
          setFeedback({ type: 'success', text: `Status scheduled successfully! Planned launch time: ${scheduleTimeStr}` });
          fetchSchedules();
          setStartTime('');
          if (statusType === 'text') {
            setTextContent('');
          } else {
            clearSelectedMedia();
            setTextContent('');
          }
        } else {
          setFeedback({ type: 'error', text: data.error || 'Failed to initialize background status schedule.' });
        }
      } catch (err: any) {
        setFeedback({ type: 'error', text: err.message || 'Network exception starting status scheduler.' });
      } finally {
        setIsPublishing(false);
      }
      return;
    }

    const customMentions = mentionsInput
      .split(',')
      .map(n => n.trim().replace(/\D/g, ''))
      .filter(Boolean)
      .map(num => `${num}@s.whatsapp.net`);

    const finalMentions = (targetType === 'group_members' && tagGroupMembers)
      ? Array.from(new Set([...customMentions, ...groupMembersList]))
      : customMentions;

    const payload = {
      sessionIds: selectedSessionIds,
      statusType,
      text: textContent,
      backgroundColor: statusType === 'text' ? selectedBgHex : undefined,
      font: statusType === 'text' ? selectedFont : undefined,
      attachmentType: statusType === 'text' ? 'none' : statusType,
      attachmentUrl: mediaSource === 'url' ? mediaUrl : undefined,
      attachmentData: mediaSource === 'upload' ? mediaData : undefined,
      attachmentName: mediaSource === 'upload' ? mediaName : 'status-attachment',
      statusJidList: targetJids,
      mentions: finalMentions
    };

    try {
      const response = await fetchWithAuth('/api/status/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      if (response.ok && data.success) {
        setFeedback({ type: 'success', text: data.message || 'WhatsApp Status published successfully!' });
        setResults(data.results);
        // Clear forms on success
        if (statusType === 'text') {
          setTextContent('');
        } else {
          clearSelectedMedia();
          setTextContent('');
        }
      } else {
        setFeedback({ type: 'error', text: data.error || 'Failed to publish status update.' });
        if (data.results) {
          setResults(data.results);
        }
      }
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Network exception publishing status.' });
    } finally {
      setIsPublishing(false);
    }
  };

  const getFontClass = (id: number) => {
    return FONTS.find(f => f.value === id)?.class || 'font-sans';
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* HEADER BANNER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/40 p-6 rounded-2xl border border-slate-800 backdrop-blur-sm relative overflow-hidden">
        <div className="absolute top-0 left-0 w-1.5 h-full bg-emerald-500" />
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-emerald-400" />
            <span>WhatsApp Status Broadcast Studio</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Design, style, and broadcast high-impact WhatsApp Stories & disappearing Status Updates to your customers natively.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* ====== LEFT PANEL: COMPOSER & TARGETS ====== */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* STEP 1: CHOOSE WHATSAPP ACCOUNT INSTANCES */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-12 bg-emerald-500" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider block mb-1">
              Step 1: Select Active WhatsApp Accounts
            </h3>
            <p className="text-[11px] text-slate-400 mb-4">
              Select which connected phone instances should publish this status update.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {sessionsList.map((s) => {
                const isSelected = selectedSessionIds.includes(s.id);
                const isConnected = s.status === 'connected';

                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => isConnected && toggleSessionSelection(s.id)}
                    disabled={!isConnected}
                    className={`flex items-center justify-between p-3.5 rounded-xl border text-left transition-all ${
                      isSelected && isConnected
                        ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400'
                        : isConnected
                          ? 'bg-slate-950/60 border-slate-850 hover:border-slate-750 text-slate-300'
                          : 'bg-slate-950/20 border-slate-900 text-slate-600 cursor-not-allowed'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`} />
                      <div className="truncate">
                        <span className="text-xs font-bold block text-white truncate">{s.name}</span>
                        <span className="text-[10px] text-slate-400 font-mono">Session ID: {s.id}</span>
                      </div>
                    </div>
                    {isSelected && isConnected && (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* STEP 2: CHOOSE STATUS TYPE & DESIGN */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-12 bg-emerald-500" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider block mb-1">
              Step 2: Compose Status Update
            </h3>
            <p className="text-[11px] text-slate-400 mb-4">
              Choose status story format: Text (with presets), Photo image or Video clip.
            </p>

            {/* Content Type Selector tabs */}
            <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-850/60 gap-1 mb-6">
              <button
                type="button"
                onClick={() => {
                  setStatusType('text');
                  clearSelectedMedia();
                }}
                className={`flex-1 py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  statusType === 'text'
                    ? 'bg-emerald-500 text-slate-950 shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Type className="w-3.5 h-3.5" />
                <span>📝 Text Status</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setStatusType('image');
                  clearSelectedMedia();
                }}
                className={`flex-1 py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  statusType === 'image'
                    ? 'bg-emerald-500 text-slate-950 shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <ImageIcon className="w-3.5 h-3.5" />
                <span>🖼️ Photo Status</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setStatusType('video');
                  clearSelectedMedia();
                }}
                className={`flex-1 py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  statusType === 'video'
                    ? 'bg-emerald-500 text-slate-950 shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <VideoIcon className="w-3.5 h-3.5" />
                <span>🎥 Video Status</span>
              </button>
            </div>

            {/* COMPOSER FORM SWITCH */}
            <div className="space-y-4">
              
              {/* Image & Video Uploader details */}
              {statusType !== 'text' && (
                <div className="space-y-4">
                  <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-850/60 gap-1 w-fit">
                    <button
                      type="button"
                      onClick={() => setMediaSource('upload')}
                      className={`px-3 py-1 text-[10px] font-bold rounded-md cursor-pointer transition-all ${
                        mediaSource === 'upload' ? 'bg-slate-800 text-white' : 'text-slate-500'
                      }`}
                    >
                      File Upload
                    </button>
                    <button
                      type="button"
                      onClick={() => setMediaSource('url')}
                      className={`px-3 py-1 text-[10px] font-bold rounded-md cursor-pointer transition-all ${
                        mediaSource === 'url' ? 'bg-slate-800 text-white' : 'text-slate-500'
                      }`}
                    >
                      External URL
                    </button>
                  </div>

                  {mediaSource === 'upload' ? (
                    <div
                      onDragEnter={handleDrag}
                      onDragOver={handleDrag}
                      onDragLeave={handleDrag}
                      onDrop={handleDrop}
                      className={`border-2 border-dashed rounded-xl p-6 text-center transition-all relative group cursor-pointer ${
                        dragActive 
                          ? 'border-emerald-500 bg-emerald-500/5' 
                          : mediaName
                            ? 'border-emerald-500/40 bg-emerald-500/10'
                            : 'border-slate-800 hover:border-slate-700 bg-slate-950/40'
                      }`}
                    >
                      <input
                        type="file"
                        accept={statusType === 'image' ? "image/*" : "video/*"}
                        onChange={handleFileInput}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                      />
                      <UploadCloud className={`w-8 h-8 mx-auto mb-2.5 transition-transform group-hover:scale-110 ${mediaName ? 'text-emerald-400' : 'text-slate-500'}`} />
                      
                      {mediaName ? (
                        <div className="space-y-1">
                          <p className="text-xs font-bold text-emerald-400 font-mono truncate max-w-md mx-auto">{mediaName}</p>
                          <p className="text-[10px] text-slate-400">File loaded successfully. Click or drag another file to replace.</p>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              clearSelectedMedia();
                            }}
                            className="mt-2 text-[10px] text-rose-400 hover:text-rose-300 font-bold inline-flex items-center gap-1 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Remove Media</span>
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <p className="text-xs font-semibold text-slate-300">
                            Drag and drop your {statusType === 'image' ? 'photo' : 'video'} here
                          </p>
                          <p className="text-[10px] text-slate-500">
                            Or browse files on your computer. Supports {statusType === 'image' ? 'PNG, JPG, WEBP' : 'MP4 up to 30 seconds'}.
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-1.5 text-left">
                      <label className="text-xs font-semibold text-slate-300">External Media URL</label>
                      <div className="relative">
                        <input
                          type="text"
                          placeholder={statusType === 'image' ? "https://example.com/status-image.png" : "https://example.com/status-video.mp4"}
                          value={mediaUrl}
                          onChange={(e) => setMediaUrl(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-600 outline-none focus:border-emerald-500 transition-colors font-mono"
                        />
                      </div>
                      <p className="text-[10px] text-slate-500">
                        Ensure the URL points directly to an open media file asset that the backend server can download.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Text / Caption box */}
              <div className="space-y-1.5 text-left">
                <label className="text-xs font-semibold text-slate-300">
                  {statusType === 'text' ? 'Status Text Content' : 'Caption Text'}
                </label>
                <textarea
                  rows={statusType === 'text' ? 5 : 3}
                  maxLength={statusType === 'text' ? 700 : 140}
                  placeholder={statusType === 'text' ? "Type your status message update here..." : "Add an optional caption story (max 140 characters)..."}
                  value={textContent}
                  onChange={(e) => setTextContent(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-xs text-white placeholder-slate-600 outline-none focus:border-emerald-500 transition-colors resize-none leading-relaxed font-sans"
                />
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>Formatting: Type URLs to trigger interactive link cards.</span>
                  <span className="font-mono">{textContent.length} / {statusType === 'text' ? 700 : 140}</span>
                </div>
              </div>

              {/* Text styling presets (Only if Text status) */}
              {statusType === 'text' && (
                <div className="space-y-4 pt-4 border-t border-slate-850">
                  
                  {/* Presets Grid */}
                  <div className="space-y-2 text-left">
                    <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                      <Palette className="w-3.5 h-3.5 text-emerald-400" />
                      <span>WhatsApp Classic Colors</span>
                    </span>
                    <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                      {BG_PRESETS.map((p) => (
                        <button
                          key={p.hex}
                          type="button"
                          onClick={() => setSelectedBgHex(p.hex)}
                          className={`h-8 rounded-lg border flex items-center justify-center transition-all relative cursor-pointer ${
                            selectedBgHex === p.hex
                              ? 'border-white scale-105 shadow-md shadow-black/40'
                              : 'border-transparent hover:border-slate-550'
                          }`}
                          style={{ backgroundColor: p.hex }}
                          title={p.name}
                        >
                          {selectedBgHex === p.hex && (
                            <Check className="w-3.5 h-3.5 text-white filter drop-shadow" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Font dropdown selection */}
                  <div className="space-y-1.5 text-left">
                    <label className="text-xs font-semibold text-slate-300">WhatsApp Typeface Family</label>
                    <select
                      value={selectedFont}
                      onChange={(e) => setSelectedFont(parseInt(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white outline-none focus:border-emerald-500 transition-colors cursor-pointer"
                    >
                      {FONTS.map((f) => (
                        <option key={f.value} value={f.value}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

            </div>
          </div>

          {/* STEP 3: WHATSAPP RECIPIENT TARGETS SETUP */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-12 bg-emerald-500" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider block mb-1">
              Step 3: Define Distribution Targeting
            </h3>
            <p className="text-[11px] text-slate-400 mb-4">
              Natively restrict who is authorized to view this status, or tag custom groups of leads.
            </p>

            <div className="grid grid-cols-3 bg-slate-950 p-1 rounded-xl border border-slate-850/60 gap-1 mb-5">
              <button
                type="button"
                onClick={() => setTargetType('all_leads')}
                className={`py-1.5 text-[10px] font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  targetType === 'all_leads'
                    ? 'bg-slate-850 text-white'
                    : 'text-slate-500 hover:text-slate-350'
                }`}
              >
                <Users className="w-3 h-3" />
                <span>All Leads ({leadsCount})</span>
              </button>
              <button
                type="button"
                onClick={() => setTargetType('group_members')}
                className={`py-1.5 text-[10px] font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  targetType === 'group_members'
                    ? 'bg-slate-850 text-white'
                    : 'text-slate-500 hover:text-slate-350'
                }`}
              >
                <Users className="w-3 h-3" />
                <span>Group JIDs</span>
              </button>
              <button
                type="button"
                onClick={() => setTargetType('custom')}
                className={`py-1.5 text-[10px] font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  targetType === 'custom'
                    ? 'bg-slate-850 text-white'
                    : 'text-slate-500 hover:text-slate-350'
                }`}
              >
                <Smartphone className="w-3 h-3" />
                <span>Manual Numbers</span>
              </button>
            </div>

            {targetType === 'all_leads' && (
              <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4 text-left text-xs leading-relaxed text-emerald-400/90 flex gap-3">
                <Info className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
                <div>
                  <span className="font-bold block text-white text-xs mb-0.5">Broadcasting to Leads Hub Contacts</span>
                  Your status update will be pushed to the story index of all **{leadsCount} lead contacts** saved in your dashboard contacts list.
                </div>
              </div>
            )}

            {targetType === 'group_members' && (
              <div className="space-y-4 text-left">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-300">Select Target Groups ({selectedGroupIds.length} Selected)</label>
                    {selectedGroupIds.length > 0 && (
                      <button 
                        type="button" 
                        onClick={() => setSelectedGroupIds([])}
                        className="text-[10px] text-emerald-400 hover:text-emerald-300 font-bold transition-all"
                      >
                        Clear All
                      </button>
                    )}
                  </div>
                  
                  <input
                    type="text"
                    placeholder="Search saved groups by name or JID..."
                    value={groupSearchQuery}
                    onChange={(e) => setGroupSearchQuery(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-600 outline-none focus:border-emerald-500 mb-2 font-sans"
                  />

                  <div className="max-h-48 overflow-y-auto border border-slate-800 rounded-xl bg-slate-950/40 p-2 space-y-1">
                    {savedGroups.filter(g => {
                      const term = groupSearchQuery.toLowerCase();
                      const name = (g.subject || g.jid || '').toLowerCase();
                      return name.includes(term);
                    }).length === 0 ? (
                      <p className="text-[11px] text-slate-500 text-center py-4">No matching groups found.</p>
                    ) : (
                      savedGroups.filter(g => {
                        const term = groupSearchQuery.toLowerCase();
                        const name = (g.subject || g.jid || '').toLowerCase();
                        return name.includes(term);
                      }).map((g) => {
                        const isChecked = selectedGroupIds.includes(g.jid);
                        return (
                          <div 
                            key={g.jid} 
                            onClick={() => toggleGroupSelection(g.jid)}
                            className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${
                              isChecked 
                                ? 'bg-emerald-500/10 hover:bg-emerald-500/15 text-emerald-400' 
                                : 'hover:bg-slate-850/50 text-slate-300'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <input 
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {}} // Handled by div click
                                className="w-3.5 h-3.5 accent-emerald-500 rounded border-slate-700 cursor-pointer shrink-0"
                              />
                              <div className="truncate text-left min-w-0">
                                <span className="text-xs font-semibold block truncate text-white">{g.subject || 'Unnamed Group'}</span>
                                <span className="text-[9px] text-slate-500 block font-mono truncate">{g.jid}</span>
                              </div>
                            </div>
                            <span className="text-[10px] font-bold px-2 py-0.5 bg-slate-950 border border-slate-850 rounded text-slate-400 font-mono shrink-0">
                              {g.participants?.length || 0} members
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {selectedGroupIds.length > 0 && (
                  <div className="space-y-3">
                    {/* EXCLUDE CONTACTS TOGGLE */}
                    <div className="flex items-center justify-between p-3.5 rounded-xl border border-slate-800/80 bg-slate-950/60 text-left gap-4">
                      <div className="space-y-0.5 pr-2">
                        <span className="text-xs font-bold text-white block">🔒 Exclude General Contacts</span>
                        <p className="text-[10px] text-slate-400">
                          Only members of selected groups will see this status. General contacts from your Leads list are excluded.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setExcludeContacts(!excludeContacts)}
                        className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out outline-none ${
                          excludeContacts ? 'bg-emerald-500' : 'bg-slate-700'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                            excludeContacts ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    {/* TAG/MENTION MEMBERS TOGGLE */}
                    <div className="flex items-center justify-between p-3.5 rounded-xl border border-slate-800/80 bg-slate-950/60 text-left gap-4">
                      <div className="space-y-0.5 pr-2">
                        <span className="text-xs font-bold text-white block flex items-center gap-1.5">
                          <AtSign className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Silent Tag Group Members</span>
                        </span>
                        <p className="text-[10px] text-slate-400">
                          Mention all {groupMembersList.length} members directly in the status. They will receive a silent tag notification on their phones.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setTagGroupMembers(!tagGroupMembers)}
                        className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out outline-none ${
                          tagGroupMembers ? 'bg-emerald-500' : 'bg-slate-700'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                            tagGroupMembers ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    {/* SEGMENT INFO BLOCK */}
                    <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4 text-xs leading-relaxed text-emerald-400/90 flex gap-3">
                      <Info className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
                      <div>
                        <span className="font-bold block text-white text-xs mb-0.5">Segmented Distribution Profile</span>
                        You have selected <span className="text-white font-bold">{selectedGroupIds.length} groups</span>. 
                        Targeting all <span className="text-white font-bold">{groupMembersList.length} unique members</span>. 
                        {excludeContacts ? (
                          <span> Contacts from your main Leads Hub list <span className="text-white font-bold">will not</span> receive this update.</span>
                        ) : (
                          <span> Your standard leads list contacts <span className="text-white font-bold">will also</span> receive this update alongside the group members.</span>
                        )}
                      </div>
                    </div>

                    {/* SENDING MODE / DELAYED CONFIGURATION */}
                    <div className="pt-4 border-t border-slate-800 space-y-4">
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-300 block">Choose Sending Mode</label>
                        <div className="grid grid-cols-2 bg-slate-950 p-1 rounded-xl border border-slate-850 gap-1">
                          <button
                            type="button"
                            onClick={() => setSendMode('instant')}
                            className={`py-2 text-[10.5px] font-bold rounded-lg transition-all cursor-pointer ${
                              sendMode === 'instant'
                                ? 'bg-slate-850 text-white'
                                : 'text-slate-500 hover:text-slate-300'
                            }`}
                          >
                            ⚡ Instant Broadcast
                          </button>
                          <button
                            type="button"
                            onClick={() => setSendMode('delayed')}
                            className={`py-2 text-[10.5px] font-bold rounded-lg transition-all cursor-pointer ${
                              sendMode === 'delayed'
                                ? 'bg-slate-850 text-emerald-400 font-extrabold'
                                : 'text-slate-500 hover:text-slate-300'
                            }`}
                          >
                            ⏰ Background Batched Queue
                          </button>
                        </div>
                      </div>

                      {sendMode === 'instant' ? (
                        <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3 text-[11px] leading-relaxed text-amber-400/90 flex gap-2.5">
                          <AlertCircle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                          <div>
                            <span className="font-bold block text-white text-xs mb-0.5">WhatsApp Mention Limit Alert</span>
                            If you tag all group participants at once, WhatsApp restricts the tag count to 5 members per status. To tag large lists (e.g., 600 - 1000 members), switch to the **Background Batched Queue** to automatically loop status stories with delayed batches.
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-4 p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 text-left">
                          <div className="space-y-0.5">
                            <span className="text-xs font-bold text-white block">⚙️ Background Batched Queue Settings</span>
                            <p className="text-[10px] text-slate-400">
                              Choose how your status updates should be grouped and delayed to respect WhatsApp's system limits on autopilot.
                            </p>
                          </div>

                          {/* Batch Mode Selector */}
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-semibold text-slate-300">Queue Processing Mode</label>
                            <div className="grid grid-cols-2 bg-slate-950 p-1 rounded-lg border border-slate-850 gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setBatchMode('groups');
                                  setBatchSize(5); // default to 5 groups
                                }}
                                className={`py-1.5 text-[10px] font-bold rounded transition-all cursor-pointer ${
                                  batchMode === 'groups'
                                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                    : 'text-slate-500 hover:text-slate-300 border border-transparent'
                                }`}
                              >
                                👥 Batch by Groups
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setBatchMode('members');
                                  setBatchSize(5); // default to 5 members
                                }}
                                className={`py-1.5 text-[10px] font-bold rounded transition-all cursor-pointer ${
                                  batchMode === 'members'
                                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                    : 'text-slate-500 hover:text-slate-300 border border-transparent'
                                }`}
                              >
                                👤 Batch by Members
                              </button>
                            </div>
                          </div>

                          <div className="space-y-4">
                            {/* Delay Between Batches (1-60 min slider) */}
                            <div className="space-y-2 bg-slate-950/40 p-3 rounded-lg border border-slate-800/40">
                              <div className="flex justify-between items-center">
                                <label className="text-[10px] font-semibold text-slate-300">
                                  Gap Between Status Updates
                                </label>
                                <span className="text-[11px] font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                                  {delayMinutes} min
                                </span>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-[10px] text-slate-500 font-mono">1m</span>
                                <input
                                  type="range"
                                  min="1"
                                  max="60"
                                  step="1"
                                  value={delayMinutes}
                                  onChange={(e) => setDelayMinutes(Number(e.target.value))}
                                  className="w-full accent-emerald-500 h-1.5 bg-slate-950 rounded-lg appearance-none cursor-pointer border border-slate-800"
                                />
                                <span className="text-[10px] text-slate-500 font-mono">60m</span>
                              </div>
                            </div>

                            {/* Second Status Delay Time - Visible only if selectedGroupIds > 5 */}
                            {selectedGroupIds.length > 5 && (
                              <div className="space-y-2 bg-emerald-500/5 p-3 rounded-lg border border-emerald-500/15 animate-fadeIn">
                                <div className="flex justify-between items-center">
                                  <label className="text-[10px] font-semibold text-emerald-400 flex items-center gap-1.5">
                                    <span>⏳ Second & Subsequent Status Delay Time</span>
                                    <span className="bg-emerald-500/10 text-[9px] text-emerald-300 px-1.5 py-0.5 rounded">High protection</span>
                                  </label>
                                  <span className="text-[11px] font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                                    {secondDelayMinutes} min
                                  </span>
                                </div>
                                <p className="text-[9px] text-slate-400 leading-normal">
                                  Since you selected {selectedGroupIds.length} groups (&gt; 5), we strongly recommend configuring a custom delay for subsequent status posts to prevent account flagging.
                                </p>
                                <div className="flex items-center gap-3 mt-1">
                                  <span className="text-[10px] text-slate-500 font-mono">1m</span>
                                  <input
                                    type="range"
                                    min="1"
                                    max="60"
                                    step="1"
                                    value={secondDelayMinutes}
                                    onChange={(e) => setSecondDelayMinutes(Number(e.target.value))}
                                    className="w-full accent-emerald-500 h-1.5 bg-slate-950 rounded-lg appearance-none cursor-pointer border border-slate-800"
                                  />
                                  <span className="text-[10px] text-slate-500 font-mono">60m</span>
                                </div>
                              </div>
                            )}

                            {/* Batch Size Selector */}
                            <div className="space-y-1.5 bg-slate-950/40 p-3 rounded-lg border border-slate-800/40">
                              <label className="text-[10px] font-semibold text-slate-300">
                                {batchMode === 'groups' ? 'Groups Per Status' : 'Members Per Status'}
                              </label>
                              <select
                                value={batchSize}
                                onChange={(e) => setBatchSize(Number(e.target.value))}
                                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-emerald-500 cursor-pointer font-sans"
                              >
                                {batchMode === 'groups' ? (
                                  [1, 2, 3, 4, 5, 8, 10, 15].map(g => (
                                    <option key={g} value={g}>{g} group{g > 1 ? 's' : ''}</option>
                                  ))
                                ) : (
                                  [1, 2, 3, 5, 10, 15, 20].map(s => (
                                    <option key={s} value={s}>{s} members (Rec: 5)</option>
                                  ))
                                )}
                              </select>
                            </div>
                          </div>

                          {/* Future Start Time Picker */}
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-semibold text-slate-300 flex items-center gap-1">
                              <span>Future Start Time (Optional)</span>
                              <span className="text-[9px] text-slate-500 font-normal">(Leave blank for instant run)</span>
                            </label>
                            <input
                              type="datetime-local"
                              value={startTime}
                              onChange={(e) => setStartTime(e.target.value)}
                              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-emerald-500 cursor-pointer font-sans"
                            />
                          </div>

                          <div className="text-[10.5px] leading-normal text-emerald-400/80 bg-slate-950/50 p-2.5 rounded-lg border border-emerald-500/10 font-mono">
                            {batchMode === 'groups' ? (
                              <span>
                                👥 **Group Math**: **{selectedGroupIds.length}** groups will be split into **{Math.ceil(selectedGroupIds.length / batchSize)}** status updates (one update posted sequentially every **{delayMinutes}** min). All **{groupMembersList.length}** group members will be set in the visibility list of those statuses!
                              </span>
                            ) : (
                              <span>
                                📊 **Member Math**: **{groupMembersList.length}** total unique members will be divided into **{Math.ceil(groupMembersList.length / batchSize)}** status updates posted sequentially every **{delayMinutes}** min. Estimated duration: **{Math.round((Math.ceil(groupMembersList.length / batchSize) * delayMinutes) / 60 * 10) / 10} hours**.
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {targetType === 'custom' && (
              <div className="space-y-3 text-left">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">Custom Target Numbers (comma-separated)</label>
                  <textarea
                    rows={2}
                    placeholder="e.g. 919999999999, 14155552671"
                    value={customNumbersInput}
                    onChange={(e) => setCustomNumbersInput(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white placeholder-slate-600 outline-none focus:border-emerald-500 transition-colors resize-none font-mono"
                  />
                </div>
                <p className="text-[10px] text-slate-500">
                  Provide international country codes without brackets, space character or <code className="text-emerald-400 font-mono font-bold">+</code> prefix.
                </p>
              </div>
            )}

            {/* Step 4: Silent Mentions / Tagging */}
            <div className="pt-4 border-t border-slate-850 mt-6 space-y-4 text-left">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-white flex items-center gap-1.5">
                  <AtSign className="w-4 h-4 text-emerald-400" />
                  <span>Silent Mentions / Tagging Notifications</span>
                </label>
                <span className="text-[9px] px-2 py-0.5 bg-slate-950 border border-slate-850 rounded text-slate-400 font-mono">
                  Beta
                </span>
              </div>
              
              <p className="text-[11px] text-slate-400">
                Mention/tag custom leads or group members directly in the story. They will receive a silent message notification informing them of the tag.
              </p>

              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold text-slate-400">Custom Numbers to Tag (comma-separated)</label>
                <input
                  type="text"
                  placeholder="e.g. 919999999999, 12025550143"
                  value={mentionsInput}
                  onChange={(e) => setMentionsInput(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-650 outline-none focus:border-emerald-500 transition-colors font-mono"
                />
              </div>
            </div>

          </div>

          {/* PUBLISH ACTION PANEL */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <button
              onClick={handlePublishStatus}
              disabled={isPublishing || selectedSessionIds.length === 0}
              className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold py-3.5 px-6 rounded-xl text-xs transition-all cursor-pointer flex items-center justify-center gap-2.5 shadow-xl shadow-emerald-500/15 disabled:opacity-50"
            >
              {isPublishing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
                  <span>Broadcasting Status Update...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 text-slate-950 shrink-0" />
                  <span>Publish Story & WhatsApp Status Now</span>
                </>
              )}
            </button>

            {/* Results table if any */}
            {results && (
              <div className="pt-4 border-t border-slate-800 space-y-2 text-left">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Broadcast Results Log</h4>
                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                  {results.map((r, i) => (
                    <div key={i} className="flex items-center justify-between text-xs py-1.5 border-b border-slate-850/40">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] text-slate-400">Session ID: {r.sessionId}</span>
                      </div>
                      <div>
                        {r.success ? (
                          <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/15 flex items-center gap-1">
                            <Check className="w-3 h-3" /> Successfully Published
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/15 flex items-center gap-1" title={r.error}>
                            <AlertCircle className="w-3 h-3" /> Failed: {r.error || 'Server error'}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* SAVE STATUS AS 4-DIGIT CODE PANEL */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4 text-left">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-xs font-extrabold text-white uppercase tracking-wider block flex items-center gap-1.5">
                  <Code2 className="w-4 h-4 text-emerald-400" />
                  <span>Save Status as Permanent 4-Digit Code</span>
                </span>
                <p className="text-[10px] text-slate-400">
                  Save current status composition (text, background color, media, target list & silent mentions) as a 4-digit code. Type <code className="text-emerald-400 font-mono">.1234</code> in WhatsApp anytime to publish!
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 font-mono text-xs font-bold">.</span>
                <input
                  type="text"
                  maxLength={4}
                  placeholder="1234"
                  value={saveCodeInput}
                  onChange={(e) => setSaveCodeInput(e.target.value.replace(/\D/g, ''))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-7 pr-3 py-2.5 text-xs text-white placeholder-slate-650 outline-none focus:border-emerald-500 font-mono font-bold tracking-widest"
                />
              </div>
              <button
                onClick={handleSaveStatusCode}
                disabled={isSavingCode || !saveCodeInput || saveCodeInput.length !== 4}
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2.5 px-4 rounded-xl text-xs transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50 shrink-0"
              >
                {isSavingCode ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Bookmark className="w-3.5 h-3.5" />
                )}
                <span>Save Code .{saveCodeInput || 'XXXX'}</span>
              </button>
            </div>

            {/* List of Saved Status Codes */}
            {savedCodesList.length > 0 && (
              <div className="pt-3 border-t border-slate-850 space-y-2">
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-400">
                  <span>Saved Status & Trigger Codes ({savedCodesList.length})</span>
                  <button
                    onClick={fetchSavedCodes}
                    className="text-[10px] text-emerald-400 hover:underline cursor-pointer flex items-center gap-1"
                  >
                    <RefreshCw className={`w-3 h-3 ${isLoadingCodes ? 'animate-spin' : ''}`} /> Refresh
                  </button>
                </div>

                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {savedCodesList.map((sc) => {
                    const isStatusCode = sc.isStatus || sc.recipientType === 'status';
                    return (
                      <div key={sc.id} className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 flex items-center justify-between gap-3">
                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="bg-emerald-500/20 text-emerald-300 font-mono font-black text-xs px-2 py-0.5 rounded border border-emerald-500/30">
                              .{sc.code}
                            </span>
                            {isStatusCode && (
                              <span className="text-[9px] bg-purple-500/10 text-purple-300 border border-purple-500/20 px-1.5 py-0.5 rounded font-bold uppercase">
                                Status Story
                              </span>
                            )}
                            <span className="text-[10px] text-slate-400 font-mono">
                              Type .{sc.code} in WhatsApp
                            </span>
                          </div>
                          <p className="text-xs text-slate-300 truncate">
                            {sc.message ? sc.message : (sc.attachmentName ? `Attachment: ${sc.attachmentName}` : 'Status broadcast update')}
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => handleRunCode(sc.code)}
                            className="bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1"
                          >
                            <Play className="w-3 h-3 fill-current" />
                            <span>Run</span>
                          </button>
                          <button
                            onClick={() => handleDeleteSavedCode(sc.id)}
                            className="p-1 text-slate-500 hover:text-rose-400 transition-colors cursor-pointer"
                            title="Delete Saved Code"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* BACKGROUND QUEUES MONITORING BOARD */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4 text-left">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-xs font-extrabold text-white uppercase tracking-wider block flex items-center gap-1.5">
                  <RefreshCw className={`w-4 h-4 text-emerald-400 ${isLoadingSchedules ? 'animate-spin' : ''}`} />
                  <span>Background Status Queues</span>
                </span>
                <p className="text-[10px] text-slate-400">
                  Track, pause, or cancel active delayed batched queues.
                </p>
              </div>
              <button
                type="button"
                onClick={fetchSchedules}
                className="p-1.5 rounded-lg border border-slate-850 bg-slate-950 hover:bg-slate-900 text-slate-400 hover:text-white transition-colors cursor-pointer text-[10px] font-bold"
              >
                Refresh
              </button>
            </div>

            {activeSchedules.length === 0 ? (
              <div className="bg-slate-950/40 border border-slate-850 rounded-xl p-6 text-center text-slate-500 text-[11px] leading-relaxed">
                <span>No active status schedules found. Select group members, switch sending mode to **Background Batched Queue**, and publish to schedule automated background broadcasts.</span>
              </div>
            ) : (
              <div className="space-y-3.5 max-h-[350px] overflow-y-auto pr-1">
                {activeSchedules.map((sched) => {
                  const isGroupMode = sched.batchMode === 'groups';
                  const total = isGroupMode ? (sched.totalGroupsCount || 0) : (sched.totalMembersCount || 0);
                  const completed = isGroupMode ? (sched.completedGroups?.length || 0) : (sched.completedMembers?.length || 0);
                  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
                  const batchTotal = Math.ceil(total / sched.batchSize);
                  const batchCompleted = Math.ceil(completed / sched.batchSize);

                  return (
                    <div key={sched.id} className="bg-slate-950/60 rounded-xl p-4 border border-slate-850/80 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-0.5 min-w-0 flex-1">
                          <span className="text-xs font-bold text-white block truncate">
                            {sched.statusType === 'text' ? `📝 "${sched.text?.substring(0, 30)}..."` : `🖼️ Media Status Story`}
                          </span>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[9px] text-slate-400 font-mono">
                            <span>ID: {sched.id}</span>
                            <span>•</span>
                            <span>Delay: {sched.delayMinutes}m</span>
                            <span>•</span>
                            <span>Batch: {sched.batchSize} {isGroupMode ? 'groups' : 'members'}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded uppercase font-mono ${
                            sched.status === 'active'
                              ? 'bg-emerald-500/10 border border-emerald-500/25 text-emerald-400'
                              : sched.status === 'paused'
                                ? 'bg-amber-500/10 border border-amber-500/25 text-amber-400'
                                : 'bg-slate-800 border border-slate-700 text-slate-400'
                          }`}>
                            {sched.status}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleToggleSchedule(sched.id)}
                            className="p-1 rounded bg-slate-900 border border-slate-800 hover:bg-slate-850 text-slate-300 transition-colors cursor-pointer text-[10px] font-mono"
                            title={sched.status === 'active' ? 'Pause Schedule' : 'Resume Schedule'}
                          >
                            {sched.status === 'active' ? '⏸️' : '▶️'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteSchedule(sched.id)}
                            className="p-1 rounded bg-slate-900 border border-slate-800 hover:bg-rose-950/40 hover:border-rose-900/60 text-rose-400 transition-colors cursor-pointer text-[10px] font-mono"
                            title="Cancel Schedule"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-[9.5px] font-mono text-slate-400">
                          <span>Progress: **{percent}%**</span>
                          <span>{completed} / {total} {isGroupMode ? 'groups' : 'members'} ({batchCompleted} / {batchTotal} batches)</span>
                        </div>
                        <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden border border-slate-850">
                          <div
                            className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-1.5 border-t border-slate-850/40 text-[9px] font-mono text-slate-400">
                        <div>
                          <span>Last Broadcast:</span>
                          <span className="text-white block truncate">{sched.lastRunAt ? new Date(sched.lastRunAt).toLocaleTimeString() : 'Never'}</span>
                        </div>
                        <div>
                          <span>Next Batch Due:</span>
                          <span className="text-emerald-400 font-bold block truncate">
                            {sched.status === 'active' && sched.nextRunAt ? new Date(sched.nextRunAt).toLocaleTimeString() : 'Paused/Ended'}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>

        {/* ====== RIGHT PANEL: IMMERSIVE WHATSAPP PHONE PREVIEW ====== */}
        <div className="lg:col-span-5 flex flex-col items-center">
          <div className="sticky top-24 w-full max-w-[340px]">
            
            <div className="text-center mb-3">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block flex items-center justify-center gap-1.5">
                <Smartphone className="w-4 h-4 text-emerald-400" />
                <span>NATIVE STORY PLAYER PREVIEW</span>
              </span>
            </div>

            {/* Smartphone Case Frame Mockup */}
            <div className="relative mx-auto w-[290px] h-[550px] bg-slate-950 border-[10px] border-slate-800 rounded-[45px] shadow-2xl overflow-hidden flex flex-col justify-between p-3.5 ring-4 ring-slate-900/45">
              
              {/* Dynamic status indicators bar */}
              <div className="absolute top-2 left-1/2 -translate-x-1/2 w-28 h-4.5 bg-slate-800 rounded-b-xl z-30 flex items-center justify-center">
                <div className="w-10 h-1 bg-black rounded-full mb-1" />
              </div>

              {/* Top notch detail */}
              <div className="absolute top-1.5 left-4 right-4 z-20 flex justify-between px-3 text-[9px] font-bold text-white font-mono opacity-80 select-none">
                <span>9:41 AM</span>
                <div className="flex gap-1.5">
                  <span>LTE</span>
                  <div className="w-4 h-2.5 bg-white/40 border border-white/60 rounded p-0.5"><div className="h-full w-3 bg-white" /></div>
                </div>
              </div>

              {/* Status Header Bar details */}
              <div className="absolute top-7 left-3.5 right-3.5 z-20 space-y-1">
                {/* Stories indicators bar */}
                <div className="flex gap-1">
                  <div className="h-[2px] flex-1 bg-white/90 rounded-full" />
                  <div className="h-[2px] flex-1 bg-white/30 rounded-full" />
                </div>
                
                {/* Profile card and avatar */}
                <div className="flex items-center justify-between py-1 px-1 text-white">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 bg-emerald-500 rounded-full flex items-center justify-center text-slate-950 font-bold text-xs shadow">
                      {sessionsList.find(s => selectedSessionIds.includes(s.id))?.name?.[0]?.toUpperCase() || 'W'}
                    </div>
                    <div>
                      <span className="text-[10px] font-bold block leading-none">
                        {sessionsList.find(s => selectedSessionIds.includes(s.id))?.name || 'Primary Account'}
                      </span>
                      <span className="text-[8px] text-white/60 leading-none">Just now</span>
                    </div>
                  </div>
                  <Smile className="w-4 h-4 opacity-80" />
                </div>
              </div>

              {/* ====== ACTIVE STORY CONTENT PREVIEW CANVASES ====== */}
              <div className="flex-1 rounded-[30px] overflow-hidden relative flex flex-col justify-center items-center p-4 shadow-inner">
                {statusType === 'text' ? (
                  <div 
                    className="absolute inset-0 flex flex-col justify-center items-center text-center p-6 transition-all duration-300"
                    style={{ backgroundColor: selectedBgHex }}
                  >
                    <p className={`text-white text-base leading-relaxed break-words font-medium select-none max-w-full overflow-hidden text-ellipsis ${getFontClass(selectedFont)}`}>
                      {textContent || 'Write something in the composer to preview your text status update!'}
                    </p>
                  </div>
                ) : (
                  <div className="absolute inset-0 bg-black flex flex-col justify-between items-center text-center transition-all duration-300">
                    {/* Media render container */}
                    <div className="flex-1 flex items-center justify-center w-full relative">
                      {mediaSource === 'upload' && mediaData ? (
                        statusType === 'image' ? (
                          <img 
                            src={mediaData} 
                            alt="Status Preview" 
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full relative flex flex-col justify-center items-center bg-slate-900">
                            <VideoIcon className="w-12 h-12 text-slate-400 animate-pulse" />
                            <span className="text-[10px] font-mono font-bold text-slate-400 mt-2">{mediaName || 'Loaded Video.mp4'}</span>
                          </div>
                        )
                      ) : mediaSource === 'url' && mediaUrl ? (
                        statusType === 'image' ? (
                          <img 
                            src={mediaUrl} 
                            alt="Status Preview Link" 
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              // Fallback on broken URL
                              e.currentTarget.src = 'https://images.unsplash.com/photo-1579202673506-ca3ce28943ef?q=80&w=290';
                            }}
                          />
                        ) : (
                          <div className="w-full h-full relative flex flex-col justify-center items-center bg-slate-900">
                            <VideoIcon className="w-12 h-12 text-slate-400" />
                            <span className="text-[10px] font-mono font-bold text-slate-400 mt-2 truncate max-w-[200px]">{mediaUrl}</span>
                          </div>
                        )
                      ) : (
                        <div className="flex flex-col items-center justify-center p-6 text-slate-500">
                          <ImageIcon className="w-10 h-10 mb-2 opacity-50" />
                          <span className="text-[10px] font-semibold leading-normal">
                            No {statusType === 'image' ? 'photo' : 'video'} uploaded or URL supplied
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Gradient bottom shadow overlay for caption readability */}
                    <div className="absolute bottom-0 left-0 right-0 h-28 bg-gradient-to-t from-black/80 to-transparent pointer-events-none" />

                    {/* Captions display at the bottom of media stories */}
                    <div className="absolute bottom-6 left-3 right-3 text-white text-xs z-10 leading-normal bg-black/45 backdrop-blur-sm p-2 rounded-xl border border-white/5 select-none text-left truncate">
                      <p className="font-sans line-clamp-3">
                        {textContent || 'No story caption text added.'}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Status footer with Swipe up indicator */}
              <div className="absolute bottom-4 left-0 right-0 z-20 flex flex-col items-center justify-center text-white text-[9px] font-semibold opacity-70 animate-bounce select-none">
                <ChevronDown className="w-3.5 h-3.5 rotate-180" />
                <span>Swipe Up to Reply</span>
              </div>

            </div>

            <p className="text-[10px] text-slate-500 mt-4 leading-normal">
              Note: This preview provides an approximate replica of WhatsApp's Android/iOS Status screen layout. Actual display rendering depends on client devices.
            </p>

          </div>
        </div>

      </div>

    </div>
  );
}

// Chevron helper icon since it might not have been imported
function ChevronDown(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
