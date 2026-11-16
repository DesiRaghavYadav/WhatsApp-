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
  Key,
  BookUser,
  Search,
  Upload
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
  const [textBgMode, setTextBgMode] = useState<'color' | 'image'>('color');
  const [textBgImageSource, setTextBgImageSource] = useState<'upload' | 'url'>('upload');
  const [textBgImageData, setTextBgImageData] = useState<string>('');
  const [textBgImageName, setTextBgImageName] = useState<string>('');
  const [textBgImageUrl, setTextBgImageUrl] = useState<string>('');
  const [textBgOverlayOpacity, setTextBgOverlayOpacity] = useState<number>(0.4);
  const [textBgTextColor, setTextBgTextColor] = useState<'#FFFFFF' | '#0F172A'>('#FFFFFF');
  const [isLoadingBgUrl, setIsLoadingBgUrl] = useState(false);
  
  // Media source state
  const [mediaSource, setMediaSource] = useState<'upload' | 'url'>('upload');
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaData, setMediaData] = useState<string>(''); // base64
  const [mediaName, setMediaName] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // Targeting Distributions (statusJidList)
  const [targetType, setTargetType] = useState<'phone_contacts' | 'all_leads' | 'group_members' | 'custom'>('phone_contacts');
  const [phoneContacts, setPhoneContacts] = useState<Array<{
    jid: string;
    phone?: string;
    lid?: string;
    name?: string;
    notify?: string;
    isSavedContact?: boolean;
    source?: string;
  }>>([]);
  const [savedPhoneContactsCount, setSavedPhoneContactsCount] = useState(0);
  const [isLoadingPhoneContacts, setIsLoadingPhoneContacts] = useState(false);
  const [isSyncingPhoneContacts, setIsSyncingPhoneContacts] = useState(false);
  const [isImportingVcf, setIsImportingVcf] = useState(false);
  const [phoneContactSearch, setPhoneContactSearch] = useState('');
  const [excludedPhoneContactJids, setExcludedPhoneContactJids] = useState<string[]>([]);
  const [includeLeadsWithPhoneContacts, setIncludeLeadsWithPhoneContacts] = useState(false);
  const [savedContactsOnlyFilter, setSavedContactsOnlyFilter] = useState(false);
  const [defaultCountryCode, setDefaultCountryCode] = useState('');
  const [showVcfHelper, setShowVcfHelper] = useState(false);
  const [previewImgError, setPreviewImgError] = useState(false);

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
  const [tagGroupsInStatus, setTagGroupsInStatus] = useState(true);
  const [tagGroupMembers, setTagGroupMembers] = useState(false);

  // Publishing / Sending state
  const [isPublishing, setIsPublishing] = useState(false);
  const [results, setResults] = useState<any[] | null>(null);

  // Delayed & Batched status schedules
  const [sendMode, setSendMode] = useState<'instant' | 'delayed'>('instant');
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

  const handleBgImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setFeedback({ type: 'error', text: 'Please select a valid image file (PNG, JPG, WEBP) for the text background.' });
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      if (typeof event.target?.result === 'string') {
        setTextBgImageData(event.target.result);
        setTextBgImageName(file.name);
        setTextBgMode('image');
        setTextBgImageSource('upload');
      }
    };
    reader.readAsDataURL(file);
  };

  const resolveTextBgDataUrl = async (): Promise<string> => {
    if (textBgImageSource === 'upload') {
      if (!textBgImageData) {
        throw new Error('Please upload a background image first.');
      }
      return textBgImageData;
    }
    const cleanUrl = textBgImageUrl.trim();
    if (!cleanUrl) {
      throw new Error('Please enter a background image URL first.');
    }
    if (textBgImageData && textBgImageName === cleanUrl) {
      return textBgImageData;
    }
    setIsLoadingBgUrl(true);
    try {
      const res = await fetchWithAuth('/api/status/fetch-bg-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: cleanUrl })
      });
      const data = await res.json();
      if (!res.ok || !data.success || !data.dataUrl) {
        throw new Error(data.error || 'Failed to load background image URL.');
      }
      setTextBgImageData(data.dataUrl);
      setTextBgImageName(cleanUrl);
      return data.dataUrl;
    } finally {
      setIsLoadingBgUrl(false);
    }
  };

  const composeTextStatusWithBgImage = async (): Promise<string> => {
    const bgDataUrl = await resolveTextBgDataUrl();
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const imageEl = new Image();
      imageEl.onload = () => resolve(imageEl);
      imageEl.onerror = () => reject(new Error('Could not decode the selected background image.'));
      imageEl.src = bgDataUrl;
    });

    const W = 1080;
    const H = 1920;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas rendering is unavailable in this browser.');
    }

    // Cover-crop background image onto 1080x1920 frame
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, W, H);
    const scale = Math.max(W / img.width, H / img.height);
    const drawW = img.width * scale;
    const drawH = img.height * scale;
    const drawX = (W - drawW) / 2;
    const drawY = (H - drawH) / 2;
    ctx.drawImage(img, drawX, drawY, drawW, drawH);

    // Optional dim/scrim overlay for text legibility
    if (textBgOverlayOpacity > 0) {
      ctx.fillStyle = `rgba(0, 0, 0, ${textBgOverlayOpacity})`;
      ctx.fillRect(0, 0, W, H);
    }

    // Typography matching selectedFont
    const rawText = selectedFont === 5 ? textContent.toUpperCase() : textContent;
    const getFontSpec = (px: number) => {
      if (selectedFont === 2) return `italic 600 ${px}px Georgia, "Times New Roman", serif`;
      if (selectedFont === 3) return `500 ${px}px "Comic Sans MS", "Trebuchet MS", system-ui, sans-serif`;
      if (selectedFont === 5) return `700 ${px}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      return `600 ${px}px "Plus Jakarta Sans", system-ui, -apple-system, sans-serif`;
    };

    const maxWidth = W - 150;
    const maxHeight = H - 360;

    const wrapLines = (fontSize: number): string[] => {
      ctx.font = getFontSpec(fontSize);
      const out: string[] = [];
      const paragraphs = rawText.split('\n');
      for (const para of paragraphs) {
        if (para === '') {
          out.push('');
          continue;
        }
        const words = para.split(/\s+/);
        let current = '';
        for (const word of words) {
          const candidate = current ? `${current} ${word}` : word;
          if (ctx.measureText(candidate).width <= maxWidth) {
            current = candidate;
          } else {
            if (current) out.push(current);
            // Break extra-long single token if wider than maxWidth
            if (ctx.measureText(word).width > maxWidth) {
              let chunk = '';
              for (const ch of word) {
                if (ctx.measureText(chunk + ch).width <= maxWidth) {
                  chunk += ch;
                } else {
                  if (chunk) out.push(chunk);
                  chunk = ch;
                }
              }
              current = chunk;
            } else {
              current = word;
            }
          }
        }
        if (current) out.push(current);
      }
      return out;
    };

    let chosenSize = 60;
    let lines = wrapLines(chosenSize);
    while (chosenSize > 28 && lines.length * (chosenSize * 1.38) > maxHeight) {
      chosenSize -= 4;
      lines = wrapLines(chosenSize);
    }

    const lineHeight = chosenSize * 1.38;
    const totalHeight = lines.length * lineHeight;
    let y = (H - totalHeight) / 2 + lineHeight * 0.72;

    ctx.font = getFontSpec(chosenSize);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = textBgTextColor;
    ctx.shadowColor = textBgTextColor === '#FFFFFF' ? 'rgba(0, 0, 0, 0.72)' : 'rgba(255, 255, 255, 0.5)';
    ctx.shadowBlur = 16;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 3;

    for (const line of lines) {
      ctx.fillText(line, W / 2, y, maxWidth);
      y += lineHeight;
    }

    return canvas.toDataURL('image/jpeg', 0.92);
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
    if (statusType === 'text' && textBgMode === 'image') {
      if (textBgImageSource === 'upload' && !textBgImageData) {
        setFeedback({ type: 'error', text: 'Please upload a background image for your text status or switch back to Classic Colors.' });
        return;
      }
      if (textBgImageSource === 'url' && !textBgImageUrl.trim()) {
        setFeedback({ type: 'error', text: 'Please enter a background image URL or switch back to Classic Colors.' });
        return;
      }
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
      .map(n => n.trim())
      .filter(Boolean)
      .map(entry => {
        if (entry.endsWith('@g.us') || entry.endsWith('@s.whatsapp.net') || entry.endsWith('@lid')) {
          return entry;
        }
        const digits = entry.replace(/\D/g, '');
        return digits ? `${digits}@s.whatsapp.net` : '';
      })
      .filter(Boolean);

    const finalMentions = (targetType === 'group_members' && tagGroupMembers)
      ? Array.from(new Set([...customMentions, ...groupMembersList]))
      : customMentions;

    setIsSavingCode(true);
    try {
      const usingBgImage = statusType === 'text' && textBgMode === 'image';
      const renderedBgCardData = usingBgImage ? await composeTextStatusWithBgImage() : undefined;

      const response = await fetchWithAuth('/api/saved-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: cleanCode,
          isStatus: true,
          recipientType: 'status',
          statusType: usingBgImage ? 'image' : statusType,
          message: usingBgImage ? '' : textContent,
          backgroundColor: statusType === 'text' && !usingBgImage ? selectedBgHex : undefined,
          font: statusType === 'text' && !usingBgImage ? selectedFont : undefined,
          attachmentType: usingBgImage ? 'image' : (statusType === 'text' ? 'none' : statusType),
          attachmentUrl: !usingBgImage && mediaSource === 'url' ? mediaUrl : undefined,
          attachmentData: usingBgImage ? renderedBgCardData : (mediaSource === 'upload' ? mediaData : undefined),
          attachmentName: usingBgImage ? 'text-bg-status.jpg' : (mediaSource === 'upload' ? mediaName : 'status-attachment'),
          sessionIds: selectedSessionIds,
          statusJidList: getCompiledJids(),
          groupIds: targetType === 'group_members' ? selectedGroupIds : [],
          tagGroups: targetType === 'group_members' ? tagGroupsInStatus : false,
          tagGroupMembers: targetType === 'group_members' ? tagGroupMembers : false,
          audienceMode: targetType,
          includeLeads: targetType === 'phone_contacts' ? includeLeadsWithPhoneContacts : (targetType === 'group_members' ? !excludeContacts : false),
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

  const fetchPhoneContacts = async () => {
    setIsLoadingPhoneContacts(true);
    try {
      const res = await fetchWithAuth('/api/contacts');
      const data = await res.json();
      if (data.success && Array.isArray(data.contacts)) {
        setPhoneContacts(data.contacts);
        setSavedPhoneContactsCount(typeof data.savedCount === 'number' ? data.savedCount : data.contacts.filter((c: any) => c.isSavedContact).length);
      }
    } catch (err) {
      console.error('Error fetching phone contacts:', err);
    } finally {
      setIsLoadingPhoneContacts(false);
    }
  };

  const handleSyncPhoneContacts = async () => {
    setIsSyncingPhoneContacts(true);
    try {
      const res = await fetchWithAuth('/api/contacts/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: true })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (Array.isArray(data.contacts)) {
          setPhoneContacts(data.contacts);
          setSavedPhoneContactsCount(typeof data.savedCount === 'number' ? data.savedCount : data.contacts.filter((c: any) => c.isSavedContact).length);
        }
        setFeedback({ type: 'success', text: data.message || 'Phone contacts synced successfully!' });
      } else {
        setFeedback({ type: 'error', text: data.error || 'Failed to sync phone contacts.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Network error syncing phone contacts.' });
    } finally {
      setIsSyncingPhoneContacts(false);
    }
  };

  const handleVcfFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setIsImportingVcf(true);
    try {
      const text = await file.text();
      const res = await fetchWithAuth('/api/contacts/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vcfContent: text,
          defaultCountryCode: defaultCountryCode.replace(/\D/g, '')
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (Array.isArray(data.contacts)) {
          setPhoneContacts(data.contacts);
          setSavedPhoneContactsCount(typeof data.savedCount === 'number' ? data.savedCount : data.contacts.filter((c: any) => c.isSavedContact).length);
        }
        setShowVcfHelper(false);
        setFeedback({ type: 'success', text: data.message || 'Contacts imported from .VCF successfully!' });
      } else {
        setFeedback({ type: 'error', text: data.error || 'Failed to parse .VCF contacts file.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Error reading .VCF file.' });
    } finally {
      setIsImportingVcf(false);
    }
  };

  const togglePhoneContactExclusion = (jid: string) => {
    setExcludedPhoneContactJids(prev =>
      prev.includes(jid) ? prev.filter(item => item !== jid) : [...prev, jid]
    );
  };

  // Fetch initial helper data (phone contacts, leads, groups & saved codes)
  useEffect(() => {
    fetchSavedCodes();
    fetchPhoneContacts();

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
          if (typeof p === 'string' && p.trim()) {
            uniqueParticipants.add(p.trim());
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
  const getActivePhoneContactJids = () => {
    const base = savedContactsOnlyFilter
      ? phoneContacts.filter(c => c.isSavedContact)
      : phoneContacts;
    const active = base
      .filter(c => c.jid && !excludedPhoneContactJids.includes(c.jid))
      .map(c => c.jid);
    if (includeLeadsWithPhoneContacts) {
      const leadJids = leadsList.map(l => l.jid).filter(Boolean);
      return Array.from(new Set([...active, ...leadJids]));
    }
    return active;
  };

  const getCompiledJids = () => {
    if (targetType === 'phone_contacts') {
      return getActivePhoneContactJids();
    }
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
      if (textBgMode === 'image') {
        if (textBgImageSource === 'upload' && !textBgImageData) {
          setFeedback({ type: 'error', text: 'Please upload a background image for your text status or switch back to Classic Colors.' });
          return;
        }
        if (textBgImageSource === 'url' && !textBgImageUrl.trim()) {
          setFeedback({ type: 'error', text: 'Please enter a background image URL or switch back to Classic Colors.' });
          return;
        }
      }
    }

    if (targetType === 'phone_contacts' && targetJids.length === 0) {
      setFeedback({ type: 'error', text: 'No phone contacts selected yet. Click "Sync from Phone" or import a .VCF file first so your saved contacts can view the status.' });
      return;
    }

    if (targetType === 'group_members' && selectedGroupIds.length === 0) {
      setFeedback({ type: 'error', text: 'Please select at least one WhatsApp group to publish and tag.' });
      return;
    }

    if (targetType === 'custom' && targetJids.length === 0) {
      setFeedback({ type: 'error', text: 'Please enter at least one valid phone number with country code.' });
      return;
    }

    setIsPublishing(true);
    setFeedback(null);

    const usingBgImage = statusType === 'text' && textBgMode === 'image';
    let renderedBgCardData: string | undefined;
    if (usingBgImage) {
      try {
        renderedBgCardData = await composeTextStatusWithBgImage();
      } catch (renderErr: any) {
        setFeedback({ type: 'error', text: renderErr?.message || 'Failed to render text with background image.' });
        setIsPublishing(false);
        return;
      }
    }

    const customMentions = mentionsInput
      .split(',')
      .map(n => n.trim())
      .filter(Boolean)
      .map(entry => {
        if (entry.endsWith('@g.us') || entry.endsWith('@s.whatsapp.net') || entry.endsWith('@lid')) {
          return entry;
        }
        const digits = entry.replace(/\D/g, '');
        return digits ? `${digits}@s.whatsapp.net` : '';
      })
      .filter(Boolean);

    const effectiveStatusType = usingBgImage ? 'image' : statusType;
    const effectiveText = usingBgImage ? '' : textContent;
    const effectiveAttachmentType = usingBgImage ? 'image' : (statusType === 'text' ? 'none' : statusType);
    const effectiveAttachmentUrl = !usingBgImage && mediaSource === 'url' ? mediaUrl : undefined;
    const effectiveAttachmentData = usingBgImage ? renderedBgCardData : (mediaSource === 'upload' ? mediaData : undefined);
    const effectiveAttachmentName = usingBgImage ? 'text-bg-status.jpg' : (mediaSource === 'upload' ? mediaName : 'status-attachment');

    const shouldUseSchedule = (targetType === 'group_members' && sendMode === 'delayed') || (startTime && startTime.trim() !== '');
    if (shouldUseSchedule) {
      const schedulePayload = {
        sessionIds: selectedSessionIds,
        statusType: effectiveStatusType,
        text: effectiveText,
        backgroundColor: statusType === 'text' && !usingBgImage ? selectedBgHex : undefined,
        font: statusType === 'text' && !usingBgImage ? selectedFont : undefined,
        attachmentType: effectiveAttachmentType,
        attachmentUrl: effectiveAttachmentUrl,
        attachmentData: effectiveAttachmentData,
        attachmentName: effectiveAttachmentName,
        groupMembers: targetJids,
        groupIds: targetType === 'group_members' ? selectedGroupIds : [],
        tagGroups: targetType === 'group_members' ? tagGroupsInStatus : false,
        tagGroupMembers: targetType === 'group_members' ? tagGroupMembers : false,
        mentions: customMentions,
        batchMode: targetType === 'group_members' && batchMode === 'groups' ? 'groups' : 'members',
        delayMinutes,
        secondDelayMinutes: selectedGroupIds.length > 5 ? secondDelayMinutes : undefined,
        batchSize,
        startTime: startTime || undefined,
        statusJidList: targetJids,
        audienceMode: targetType,
        includeLeads: targetType === 'phone_contacts' ? includeLeadsWithPhoneContacts : (targetType === 'group_members' ? !excludeContacts : false)
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

    const finalMentions = (targetType === 'group_members' && tagGroupMembers)
      ? Array.from(new Set([...customMentions, ...groupMembersList]))
      : customMentions;

    const payload = {
      sessionIds: selectedSessionIds,
      statusType: effectiveStatusType,
      text: effectiveText,
      backgroundColor: statusType === 'text' && !usingBgImage ? selectedBgHex : undefined,
      font: statusType === 'text' && !usingBgImage ? selectedFont : undefined,
      attachmentType: effectiveAttachmentType,
      attachmentUrl: effectiveAttachmentUrl,
      attachmentData: effectiveAttachmentData,
      attachmentName: effectiveAttachmentName,
      statusJidList: targetJids,
      groupIds: targetType === 'group_members' ? selectedGroupIds : [],
      tagGroups: targetType === 'group_members' ? tagGroupsInStatus : false,
      audienceMode: targetType,
      includeLeads: targetType === 'phone_contacts' ? includeLeadsWithPhoneContacts : (targetType === 'group_members' ? !excludeContacts : false),
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
                          onChange={(e) => {
                            setMediaUrl(e.target.value);
                            setPreviewImgError(false);
                          }}
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
                  {/* Background Mode Header & Toggle */}
                  <div className="flex flex-wrap items-center justify-between gap-2 text-left">
                    <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                      <Palette className="w-3.5 h-3.5 text-emerald-400" />
                      <span>WhatsApp Classic Colors &amp; Background</span>
                    </span>
                    <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800 gap-1">
                      <button
                        type="button"
                        onClick={() => setTextBgMode('color')}
                        className={`px-2.5 py-1 text-[10px] font-bold rounded-md cursor-pointer transition-colors ${
                          textBgMode === 'color'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Classic Colors
                      </button>
                      <button
                        type="button"
                        onClick={() => setTextBgMode('image')}
                        className={`px-2.5 py-1 text-[10px] font-bold rounded-md cursor-pointer transition-colors ${
                          textBgMode === 'image'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Background Image
                      </button>
                    </div>
                  </div>

                  {textBgMode === 'color' ? (
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
                  ) : (
                    <div className="space-y-3 bg-slate-950/60 border border-slate-800 rounded-xl p-3.5 text-left">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex bg-slate-900 p-1 rounded-lg border border-slate-800 gap-1">
                          <button
                            type="button"
                            onClick={() => setTextBgImageSource('upload')}
                            className={`px-2.5 py-1 text-[10px] font-bold rounded cursor-pointer transition-colors ${
                              textBgImageSource === 'upload' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-300'
                            }`}
                          >
                            Upload Image
                          </button>
                          <button
                            type="button"
                            onClick={() => setTextBgImageSource('url')}
                            className={`px-2.5 py-1 text-[10px] font-bold rounded cursor-pointer transition-colors ${
                              textBgImageSource === 'url' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-300'
                            }`}
                          >
                            Image URL
                          </button>
                        </div>

                        {(textBgImageData || textBgImageUrl) && (
                          <button
                            type="button"
                            onClick={() => {
                              setTextBgImageData('');
                              setTextBgImageName('');
                              setTextBgImageUrl('');
                            }}
                            className="text-[10px] text-rose-400 hover:text-rose-300 font-bold inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Clear Image</span>
                          </button>
                        )}
                      </div>

                      {textBgImageSource === 'upload' ? (
                        <label className="flex items-center justify-between gap-3 border border-dashed border-slate-700 hover:border-emerald-500/50 rounded-xl px-3.5 py-3 bg-slate-950/50 cursor-pointer transition-colors">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <ImageIcon className={`w-4 h-4 shrink-0 ${textBgImageData ? 'text-emerald-400' : 'text-slate-500'}`} />
                            <div className="min-w-0">
                              <span className="text-xs font-semibold text-white block truncate">
                                {textBgImageData ? (textBgImageName || 'Custom background loaded') : 'Choose a background photo (PNG / JPG / WEBP)'}
                              </span>
                              <span className="text-[10px] text-slate-500 block">
                                Automatically framed to 1080×1920 with your text centered on top.
                              </span>
                            </div>
                          </div>
                          <span className="px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold shrink-0 whitespace-nowrap">
                            {textBgImageData ? 'Replace' : 'Browse'}
                          </span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleBgImageUpload}
                            className="hidden"
                          />
                        </label>
                      ) : (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            placeholder="https://example.com/background.jpg"
                            value={textBgImageUrl}
                            onChange={(e) => {
                              setTextBgImageUrl(e.target.value);
                              if (textBgImageName && textBgImageName !== e.target.value.trim()) {
                                setTextBgImageData('');
                              }
                            }}
                            className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-600 outline-none focus:border-emerald-500 font-mono"
                          />
                          <button
                            type="button"
                            disabled={!textBgImageUrl.trim() || isLoadingBgUrl}
                            onClick={async () => {
                              try {
                                await resolveTextBgDataUrl();
                              } catch (err: any) {
                                setFeedback({ type: 'error', text: err?.message || 'Unable to load image URL.' });
                              }
                            }}
                            className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white text-[10px] font-bold cursor-pointer whitespace-nowrap shrink-0"
                          >
                            {isLoadingBgUrl ? 'Loading...' : 'Preview URL'}
                          </button>
                        </div>
                      )}

                      {/* Dim overlay & text contrast controls */}
                      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-semibold text-slate-400">Backdrop Dim:</span>
                          <div className="flex items-center gap-1">
                            {[
                              { label: '0%', val: 0 },
                              { label: '25%', val: 0.25 },
                              { label: '40%', val: 0.4 },
                              { label: '65%', val: 0.65 }
                            ].map((opt) => (
                              <button
                                key={opt.val}
                                type="button"
                                onClick={() => setTextBgOverlayOpacity(opt.val)}
                                className={`px-2 py-1 rounded text-[10px] font-mono font-bold cursor-pointer border transition-colors ${
                                  textBgOverlayOpacity === opt.val
                                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                                }`}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-semibold text-slate-400">Text:</span>
                          <button
                            type="button"
                            onClick={() => setTextBgTextColor('#FFFFFF')}
                            className={`px-2 py-1 rounded text-[10px] font-bold cursor-pointer border ${
                              textBgTextColor === '#FFFFFF'
                                ? 'bg-white text-slate-950 border-white'
                                : 'bg-slate-900 border-slate-800 text-slate-400'
                            }`}
                          >
                            White
                          </button>
                          <button
                            type="button"
                            onClick={() => setTextBgTextColor('#0F172A')}
                            className={`px-2 py-1 rounded text-[10px] font-bold cursor-pointer border ${
                              textBgTextColor === '#0F172A'
                                ? 'bg-slate-200 text-slate-950 border-slate-200'
                                : 'bg-slate-900 border-slate-800 text-slate-400'
                            }`}
                          >
                            Dark
                          </button>
                        </div>
                      </div>

                      <p className="text-[10px] text-slate-500 leading-relaxed">
                        WhatsApp only allows solid colors on plain text stories, so custom background images are rendered into a high-resolution 1080×1920 Status image with your styled text centered on top.
                      </p>
                    </div>
                  )}

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

            <div className="grid grid-cols-2 sm:grid-cols-4 bg-slate-950 p-1 rounded-xl border border-slate-850/60 gap-1 mb-5">
              <button
                type="button"
                onClick={() => setTargetType('phone_contacts')}
                className={`py-2 px-2 text-[10px] font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                  targetType === 'phone_contacts'
                    ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                    : 'text-slate-500 hover:text-slate-300 border border-transparent'
                }`}
              >
                <BookUser className="w-3.5 h-3.5 shrink-0" />
                <span className="tabular-nums">Phone Contacts ({phoneContacts.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setTargetType('all_leads')}
                className={`py-2 px-2 text-[10px] font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                  targetType === 'all_leads'
                    ? 'bg-slate-850 text-white'
                    : 'text-slate-500 hover:text-slate-350'
                }`}
              >
                <Users className="w-3.5 h-3.5 shrink-0" />
                <span className="tabular-nums">All Leads ({leadsCount})</span>
              </button>
              <button
                type="button"
                onClick={() => setTargetType('group_members')}
                className={`py-2 px-2 text-[10px] font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                  targetType === 'group_members'
                    ? 'bg-slate-850 text-white'
                    : 'text-slate-500 hover:text-slate-350'
                }`}
              >
                <Users className="w-3.5 h-3.5 shrink-0" />
                <span>Group JIDs</span>
              </button>
              <button
                type="button"
                onClick={() => setTargetType('custom')}
                className={`py-2 px-2 text-[10px] font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                  targetType === 'custom'
                    ? 'bg-slate-850 text-white'
                    : 'text-slate-500 hover:text-slate-350'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5 shrink-0" />
                <span>Manual Numbers</span>
              </button>
            </div>

            {targetType === 'phone_contacts' && (() => {
              const basePool = savedContactsOnlyFilter
                ? phoneContacts.filter(c => c.isSavedContact)
                : phoneContacts;
              const term = phoneContactSearch.trim().toLowerCase();
              const filteredContacts = term
                ? basePool.filter(c =>
                    (c.name || '').toLowerCase().includes(term) ||
                    (c.notify || '').toLowerCase().includes(term) ||
                    (c.phone || c.jid || '').toLowerCase().includes(term)
                  )
                : basePool;
              const selectedCount = getActivePhoneContactJids().length;

              return (
                <div className="space-y-4 text-left">
                  {/* Action bar: Sync from Phone & Import .VCF */}
                  <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-950/60 border border-slate-800 rounded-xl p-3.5">
                    <div className="space-y-0.5">
                      <span className="text-xs font-bold text-white block">
                        Synced Phone &amp; WhatsApp Contacts
                      </span>
                      <div className="flex items-center gap-2 text-[11px] text-slate-400 tabular-nums">
                        <span>{savedPhoneContactsCount} saved in phonebook</span>
                        <span aria-hidden="true">·</span>
                        <span>{phoneContacts.length} total synced</span>
                        <span aria-hidden="true">·</span>
                        <span className="text-emerald-400 font-semibold">{selectedCount} will see status</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={handleSyncPhoneContacts}
                        disabled={isSyncingPhoneContacts}
                        className="py-2 px-3 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold rounded-lg text-[11px] transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isSyncingPhoneContacts ? 'animate-spin' : ''}`} />
                        <span>{isSyncingPhoneContacts ? 'Syncing...' : 'Sync from Phone'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setShowVcfHelper(!showVcfHelper)}
                        className="py-2 px-3 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 font-bold rounded-lg text-[11px] transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>Import .VCF</span>
                      </button>
                    </div>
                  </div>

                  {/* Optional .VCF import panel */}
                  {showVcfHelper && (
                    <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-0.5">
                          <span className="text-xs font-bold text-white block">Import Contacts from Phone (.VCF / vCard)</span>
                          <p className="text-[11px] text-slate-400">
                            Export a .vcf file from Google Contacts, Android Contacts, or iPhone and upload it here to merge all saved phone numbers.
                          </p>
                        </div>
                        <label className="py-2 px-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg text-[11px] transition-colors cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap shrink-0">
                          <Upload className="w-3.5 h-3.5" />
                          <span>{isImportingVcf ? 'Importing...' : 'Choose .VCF File'}</span>
                          <input
                            type="file"
                            accept=".vcf,.vcard,text/vcard,text/x-vcard"
                            onChange={handleVcfFileImport}
                            disabled={isImportingVcf}
                            className="hidden"
                          />
                        </label>
                      </div>
                      <div className="flex items-center gap-2 pt-1">
                        <label className="text-[11px] text-slate-400 whitespace-nowrap">Default Country Code (for 10-digit local numbers):</label>
                        <input
                          type="text"
                          placeholder="e.g. 91 or 1"
                          value={defaultCountryCode}
                          onChange={(e) => setDefaultCountryCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
                          className="w-24 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white font-mono outline-none focus:border-emerald-500"
                        />
                      </div>
                    </div>
                  )}

                  {/* Search & Filter Controls */}
                  {phoneContacts.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex flex-col sm:flex-row gap-2">
                        <div className="relative flex-1">
                          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            placeholder="Search saved contacts by name or phone number..."
                            value={phoneContactSearch}
                            onChange={(e) => setPhoneContactSearch(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-2 text-xs text-white placeholder-slate-600 outline-none focus:border-emerald-500 font-sans"
                          />
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => setSavedContactsOnlyFilter(!savedContactsOnlyFilter)}
                            className={`px-3 py-2 rounded-xl text-[10px] font-bold border transition-colors cursor-pointer whitespace-nowrap ${
                              savedContactsOnlyFilter
                                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                            }`}
                          >
                            {savedContactsOnlyFilter ? 'Saved Only' : 'All Synced'}
                          </button>
                          {excludedPhoneContactJids.length > 0 ? (
                            <button
                              type="button"
                              onClick={() => setExcludedPhoneContactJids([])}
                              className="px-3 py-2 rounded-xl text-[10px] font-bold bg-slate-950 border border-slate-800 text-emerald-400 hover:text-emerald-300 cursor-pointer whitespace-nowrap"
                            >
                              Select All
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setExcludedPhoneContactJids(basePool.map(c => c.jid))}
                              className="px-3 py-2 rounded-xl text-[10px] font-bold bg-slate-950 border border-slate-800 text-slate-400 hover:text-white cursor-pointer whitespace-nowrap"
                            >
                              Uncheck All
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="max-h-52 overflow-y-auto border border-slate-800 rounded-xl bg-slate-950/40 divide-y divide-slate-900">
                        {filteredContacts.length === 0 ? (
                          <p className="text-[11px] text-slate-500 text-center py-6">
                            No contacts match your current search/filter.
                          </p>
                        ) : (
                          filteredContacts.slice(0, 250).map((c) => {
                            const isIncluded = !excludedPhoneContactJids.includes(c.jid);
                            const displayName = c.name || c.notify || (c.phone ? `+${c.phone}` : c.jid);
                            return (
                              <div
                                key={c.jid}
                                onClick={() => togglePhoneContactExclusion(c.jid)}
                                className={`flex items-center justify-between px-3 py-2 cursor-pointer transition-colors ${
                                  isIncluded ? 'hover:bg-slate-900/60' : 'opacity-50 hover:bg-slate-900/30'
                                }`}
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <input
                                    type="checkbox"
                                    checked={isIncluded}
                                    onChange={() => {}}
                                    className="w-3.5 h-3.5 accent-emerald-500 rounded border-slate-700 cursor-pointer shrink-0"
                                  />
                                  <div className="min-w-0">
                                    <span className="text-xs font-semibold text-white block truncate">{displayName}</span>
                                    <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-mono tabular-nums">
                                      <span>{c.phone ? `+${c.phone}` : c.jid}</span>
                                      <span aria-hidden="true">·</span>
                                      <span>{c.source === 'vcf_import' ? 'VCF' : c.isSavedContact ? 'Phonebook' : 'WhatsApp'}</span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })
                        )}
                        {filteredContacts.length > 250 && (
                          <div className="px-3 py-2 text-[10px] text-slate-500 text-center font-mono">
                            Showing first 250 of {filteredContacts.length} matching contacts (all selected contacts will receive the status).
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Empty state */}
                  {!isLoadingPhoneContacts && phoneContacts.length === 0 && (
                    <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-5 text-center space-y-2.5">
                      <p className="text-xs font-bold text-white">No phone contacts synced yet</p>
                      <p className="text-[11px] text-slate-400 max-w-md mx-auto leading-relaxed">
                        Click <span className="text-emerald-400 font-semibold">Sync from Phone</span> to fetch contacts saved in your linked WhatsApp phone, or upload a <span className="text-white font-semibold">.VCF</span> contact export from your phone.
                      </p>
                    </div>
                  )}

                  {/* Optional Leads Hub Merge Toggle */}
                  <div className="flex items-center justify-between p-3.5 rounded-xl border border-slate-800/80 bg-slate-950/60 gap-4">
                    <div className="space-y-0.5 pr-2">
                      <span className="text-xs font-bold text-white block">Also include Leads Hub contacts ({leadsCount})</span>
                      <p className="text-[10px] text-slate-400">
                        Combine your synced phonebook contacts with leads captured in Leads Hub.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIncludeLeadsWithPhoneContacts(!includeLeadsWithPhoneContacts)}
                      className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out outline-none ${
                        includeLeadsWithPhoneContacts ? 'bg-emerald-500' : 'bg-slate-700'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          includeLeadsWithPhoneContacts ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Info banner */}
                  <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-3.5 text-xs leading-relaxed text-emerald-400/90 flex gap-3">
                    <Info className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
                    <div>
                      <span className="font-bold block text-white text-xs mb-0.5">Visible to Saved Phone Contacts</span>
                      WhatsApp Status broadcasts require the recipient visibility list (`statusJidList`). All <span className="text-white font-bold tabular-nums">{selectedCount}</span> selected phone contact(s) plus your own WhatsApp account will be included so they can view your Status update.
                    </div>
                  </div>
                </div>
              );
            })()}

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

                    {/* TAG/NOTIFY SELECTED GROUPS IN STATUS TOGGLE */}
                    <div className="flex items-center justify-between p-3.5 rounded-xl border border-emerald-500/25 bg-emerald-500/5 text-left gap-4">
                      <div className="space-y-0.5 pr-2">
                        <span className="text-xs font-bold text-white block flex items-center gap-1.5">
                          <AtSign className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Notify Selected Groups in Chat (Group Status Mention)</span>
                        </span>
                        <p className="text-[10px] text-slate-300 leading-relaxed">
                          Posts WhatsApp's native group mention notification in each selected group chat and adds all {groupMembersList.length} group members to the Status visibility list so they can view it in Status.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setTagGroupsInStatus(!tagGroupsInStatus)}
                        className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out outline-none ${
                          tagGroupsInStatus ? 'bg-emerald-500' : 'bg-slate-700'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                            tagGroupsInStatus ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    {/* TAG/MENTION INDIVIDUAL MEMBERS TOGGLE */}
                    <div className="flex items-center justify-between p-3.5 rounded-xl border border-slate-800/80 bg-slate-950/60 text-left gap-4">
                      <div className="space-y-0.5 pr-2">
                        <span className="text-xs font-bold text-white block flex items-center gap-1.5">
                          <AtSign className="w-3.5 h-3.5 text-slate-400" />
                          <span>Also Silent-Tag Individual Members (Optional)</span>
                        </span>
                        <p className="text-[10px] text-slate-400">
                          Sends individual 1-on-1 silent status mention alerts to members in addition to (or instead of) the group notification.
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
                        Targeting all <span className="text-white font-bold">{groupMembersList.length} unique members</span> (live members &amp; LIDs refreshed automatically on send). 
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
                            <span className="font-bold block text-white text-xs mb-0.5">WhatsApp Mention Limit Info</span>
                            WhatsApp allows up to 5 group/user mentions per status update. If you select more than 5 groups in Instant mode, updates are automatically split into safe batches of 5 — or switch to <strong>Background Batched Queue</strong> for timed spacing between batches.
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
                <label className="text-[10px] font-semibold text-slate-400">Custom Numbers or Group JIDs to Tag (comma-separated)</label>
                <input
                  type="text"
                  placeholder="e.g. 919999999999, 120363012345678901@g.us"
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
                    style={{ backgroundColor: textBgMode === 'image' ? '#0f172a' : selectedBgHex }}
                  >
                    {textBgMode === 'image' && (textBgImageData || (textBgImageSource === 'url' && textBgImageUrl.trim())) && (
                      <>
                        <img
                          src={textBgImageData || textBgImageUrl.trim()}
                          alt="Text Status Background"
                          referrerPolicy="no-referrer"
                          className="absolute inset-0 w-full h-full object-cover"
                        />
                        {textBgOverlayOpacity > 0 && (
                          <div
                            className="absolute inset-0 pointer-events-none"
                            style={{ backgroundColor: `rgba(0, 0, 0, ${textBgOverlayOpacity})` }}
                          />
                        )}
                      </>
                    )}
                    <p
                      className={`relative z-10 text-base leading-relaxed break-words font-medium select-none max-w-full overflow-hidden text-ellipsis whitespace-pre-wrap ${getFontClass(selectedFont)}`}
                      style={{
                        color: textBgMode === 'image' ? textBgTextColor : '#FFFFFF',
                        textShadow: textBgMode === 'image'
                          ? (textBgTextColor === '#FFFFFF' ? '0 2px 10px rgba(0,0,0,0.7)' : '0 1px 6px rgba(255,255,255,0.55)')
                          : undefined
                      }}
                    >
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
                          !previewImgError ? (
                            <img 
                              src={mediaUrl} 
                              alt="Status Preview Link" 
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover"
                              onError={() => setPreviewImgError(true)}
                            />
                          ) : (
                            <div className="flex flex-col items-center justify-center p-6 text-slate-400 bg-slate-900/90 w-full h-full">
                              <ImageIcon className="w-10 h-10 mb-2 opacity-60" />
                              <span className="text-[10px] font-semibold leading-normal">
                                Preview unavailable for external image URL
                              </span>
                            </div>
                          )
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
