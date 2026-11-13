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
  Send,
  HelpCircle,
  MessageSquare,
  Radio,
  Video,
  Image as ImageIcon,
  FileText,
  Music,
  Edit2,
  Tag,
  Search,
  Plus,
  Link as LinkIcon,
  Layers,
  Upload,
  Eye,
  EyeOff
} from 'lucide-react';

interface ChannelInfo {
  newsletterJid: string;
  newsletterName: string;
  serverMessageId?: number;
  channelLink?: string;
}

interface ShareMediaItem {
  id: string;
  mediaType: 'image' | 'video' | 'document' | 'audio';
  mimeType?: string;
  fileName?: string;
  caption?: string;
  localFile?: string;
  url?: string;
  quotedMessage?: any;
  addedAt: string;
}

interface CapturedShare {
  id: string;
  timestamp: string;
  from: string;
  sender: string;
  quotedSender: string;
  quotedMessageId: string;
  quotedMessage: any;
  displayText: string;
  mediaType?: 'text' | 'image' | 'video' | 'audio' | 'document' | 'sticker' | 'other';
  caption?: string;
  extraMedia?: ShareMediaItem[];
  cardLayout?: 'album' | 'carousel';
  channelInfo?: ChannelInfo;
  channelLink?: string;
  appendChannelLink?: boolean;
  showForwardedTag?: boolean;
  status: 'pending' | 'forwarded';
  forwardedTo: string[];
}

interface DiscoveredChannel {
  id: string;
  name: string;
  subscribers: number;
  role?: string;
  invite?: string;
}

interface DraftComposerMedia {
  id: string;
  mediaType: 'image' | 'video' | 'document' | 'audio';
  fileName: string;
  mimeType: string;
  dataUrl?: string;
  url?: string;
  caption?: string;
}

interface SharesManagerPageProps {
  fetchWithAuth: (url: string, options?: any) => Promise<Response>;
  setFeedback: (fb: { type: 'success' | 'error'; text: string } | null) => void;
  sessionsList: any[];
  authToken?: string | null;
}

// Safely extract a data-URL thumbnail from a WhatsApp protobuf quotedMessage object
function extractQuotedThumbnailDataUrl(quotedMsg: any): string | null {
  if (!quotedMsg || typeof quotedMsg !== 'object') return null;
  const unwrapped =
    quotedMsg.viewOnceMessage?.message ||
    quotedMsg.viewOnceMessageV2?.message ||
    quotedMsg.ephemeralMessage?.message ||
    quotedMsg.documentWithCaptionMessage?.message ||
    quotedMsg;

  const rawThumb =
    unwrapped?.imageMessage?.jpegThumbnail ||
    unwrapped?.videoMessage?.jpegThumbnail ||
    unwrapped?.documentMessage?.jpegThumbnail;

  if (!rawThumb) return null;
  if (typeof rawThumb === 'string') {
    return rawThumb.startsWith('data:') ? rawThumb : `data:image/jpeg;base64,${rawThumb}`;
  }
  if (rawThumb?.type === 'Buffer' && Array.isArray(rawThumb.data)) {
    try {
      const bytes = new Uint8Array(rawThumb.data);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      return `data:image/jpeg;base64,${btoa(binary)}`;
    } catch {
      return null;
    }
  }
  if (typeof rawThumb === 'object' && !Array.isArray(rawThumb)) {
    const keys = Object.keys(rawThumb).map(Number).filter(n => !isNaN(n)).sort((a, b) => a - b);
    if (keys.length > 0) {
      try {
        let binary = '';
        for (const k of keys) binary += String.fromCharCode(rawThumb[k]);
        return `data:image/jpeg;base64,${btoa(binary)}`;
      } catch {
        return null;
      }
    }
  }
  return null;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

function inferMediaTypeFromMimeOrName(mime?: string, name?: string): 'image' | 'video' | 'document' | 'audio' {
  const m = (mime || '').toLowerCase();
  const n = (name || '').toLowerCase();
  if (m.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)(\?|$)/.test(n)) return 'image';
  if (m.startsWith('video/') || /\.(mp4|mov|webm|mkv|avi)(\?|$)/.test(n)) return 'video';
  if (m.startsWith('audio/') || /\.(mp3|ogg|wav|m4a|opus)(\?|$)/.test(n)) return 'audio';
  return 'document';
}

export default function SharesManagerPage({ fetchWithAuth, setFeedback, sessionsList, authToken }: SharesManagerPageProps) {
  const [shares, setShares] = useState<CapturedShare[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [activeSessionId, setActiveSessionId] = useState<string>('primary');
  
  // Default Channel & Forwarded Tag settings from User Settings
  const [defaultChannelLink, setDefaultChannelLink] = useState<string>('');
  const [defaultChannelName, setDefaultChannelName] = useState<string>('');
  const [defaultShowForwardedTag, setDefaultShowForwardedTag] = useState<boolean>(true);
  
  // Forward form state per-share ID
  const [targetJidsMap, setTargetJidsMap] = useState<Record<string, string>>({});
  const [useChannelTagMap, setUseChannelTagMap] = useState<Record<string, boolean>>({});
  const [showForwardedTagMap, setShowForwardedTagMap] = useState<Record<string, boolean>>({});
  const [cardLayoutMap, setCardLayoutMap] = useState<Record<string, 'album' | 'carousel'>>({});
  const [channelLinkMap, setChannelLinkMap] = useState<Record<string, string>>({});
  const [appendChannelLinkMap, setAppendChannelLinkMap] = useState<Record<string, boolean>>({});
  const [isForwardingMap, setIsForwardingMap] = useState<Record<string, boolean>>({});
  const [forwardResultsMap, setForwardResultsMap] = useState<Record<string, any[]>>({});

  // Per-share media upload / URL / caption edit UI state
  const [uploadingMediaMap, setUploadingMediaMap] = useState<Record<string, boolean>>({});
  const [showUrlAddMap, setShowUrlAddMap] = useState<Record<string, boolean>>({});
  const [urlInputMap, setUrlInputMap] = useState<Record<string, string>>({});
  const [editingCaptionId, setEditingCaptionId] = useState<string | null>(null);
  const [captionDraft, setCaptionDraft] = useState<string>('');

  // Create New Multi-Media Channel Card Modal
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [createCaption, setCreateCaption] = useState<string>('');
  const [createMediaList, setCreateMediaList] = useState<DraftComposerMedia[]>([]);
  const [createUrlInput, setCreateUrlInput] = useState<string>('');
  const [createChannelLink, setCreateChannelLink] = useState<string>('');
  const [createChannelName, setCreateChannelName] = useState<string>('');
  const [createCardLayout, setCreateCardLayout] = useState<'album' | 'carousel'>('album');
  const [createShowForwardedTag, setCreateShowForwardedTag] = useState<boolean>(true);
  const [isCreatingCard, setIsCreatingCard] = useState<boolean>(false);

  // Channel Tag Management Modal State
  const [editingShareForChannel, setEditingShareForChannel] = useState<CapturedShare | null>(null);
  const [channelInputName, setChannelInputName] = useState<string>('');
  const [channelInputJid, setChannelInputJid] = useState<string>('');
  const [channelInputLink, setChannelInputLink] = useState<string>('');
  const [channelInputMsgId, setChannelInputMsgId] = useState<string>('');
  const [isSavingChannelTag, setIsSavingChannelTag] = useState<boolean>(false);
  const [isInspectingChannel, setIsInspectingChannel] = useState<boolean>(false);
  
  // WhatsApp Participating Channels State
  const [userChannels, setUserChannels] = useState<DiscoveredChannel[]>([]);
  const [isLoadingChannels, setIsLoadingChannels] = useState<boolean>(false);

  const fetchDefaultSettings = async (): Promise<boolean> => {
    try {
      const res = await fetchWithAuth('/api/settings');
      if (res.ok) {
        const data = await res.json();
        if (data.settings) {
          setDefaultChannelLink(data.settings.defaultChannelInviteLink || '');
          setDefaultChannelName(data.settings.defaultChannelName || '');
          const defFwd = data.settings.showForwardedTagOnShare !== undefined ? !!data.settings.showForwardedTagOnShare : true;
          setDefaultShowForwardedTag(defFwd);
          setCreateShowForwardedTag(defFwd);
          setCreateChannelLink(data.settings.defaultChannelInviteLink || '');
          setCreateChannelName(data.settings.defaultChannelName || '');
          return defFwd;
        }
      }
    } catch (e) {}
    return true;
  };

  const fetchShares = async (fallbackShowForwarded?: boolean) => {
    setIsLoading(true);
    try {
      const res = await fetchWithAuth('/api/shares');
      if (res.ok) {
        const data = await res.json();
        const loadedShares: CapturedShare[] = data.shares || [];
        setShares(loadedShares);
        const defFwd = fallbackShowForwarded !== undefined ? fallbackShowForwarded : defaultShowForwardedTag;

        setUseChannelTagMap(prev => {
          const updated = { ...prev };
          for (const s of loadedShares) {
            if (updated[s.id] === undefined) updated[s.id] = true;
          }
          return updated;
        });

        setAppendChannelLinkMap(prev => {
          const updated = { ...prev };
          for (const s of loadedShares) {
            if (updated[s.id] === undefined) updated[s.id] = !!s.appendChannelLink;
          }
          return updated;
        });

        setShowForwardedTagMap(prev => {
          const updated = { ...prev };
          for (const s of loadedShares) {
            if (updated[s.id] === undefined) {
              updated[s.id] = s.showForwardedTag !== undefined ? s.showForwardedTag : defFwd;
            }
          }
          return updated;
        });

        setCardLayoutMap(prev => {
          const updated = { ...prev };
          for (const s of loadedShares) {
            if (updated[s.id] === undefined) {
              updated[s.id] = s.cardLayout || 'album';
            }
          }
          return updated;
        });
      } else {
        setFeedback({ type: 'error', text: 'Failed to retrieve captured shares.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', text: 'Network error fetching shares: ' + err.message });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchUserChannels = async () => {
    setIsLoadingChannels(true);
    try {
      const res = await fetchWithAuth(`/api/channels?sessionId=${activeSessionId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.channels) {
          setUserChannels(data.channels);
          if (data.channels.length > 0) {
            setFeedback({ type: 'success', text: `Loaded ${data.channels.length} WhatsApp channel(s) from connected session.` });
          } else {
            setFeedback({ type: 'error', text: 'No followed WhatsApp channels found on this account.' });
          }
        }
      }
    } catch (err: any) {
      console.warn('Error fetching channels:', err);
    } finally {
      setIsLoadingChannels(false);
    }
  };

  useEffect(() => {
    (async () => {
      const defFwd = await fetchDefaultSettings();
      await fetchShares(defFwd);
    })();
  }, []);

  const getMediaSrcUrl = (item: ShareMediaItem): string | null => {
    if (item.localFile) {
      const tok = authToken || localStorage.getItem('wa_auth_token') || '';
      return `/api/shares/media/${encodeURIComponent(item.localFile)}${tok ? `?token=${encodeURIComponent(tok)}` : ''}`;
    }
    if (item.url) return item.url;
    if (item.quotedMessage) return extractQuotedThumbnailDataUrl(item.quotedMessage);
    return null;
  };

  const handleDeleteShare = async (id: string) => {
    setShares(prev => prev.filter(s => s.id !== id));
    try {
      const res = await fetchWithAuth(`/api/shares/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (res.ok) {
        setFeedback({ type: 'success', text: 'Captured share deleted successfully.' });
      } else {
        const data = await res.json().catch(() => ({}));
        setFeedback({ type: 'error', text: data.error || 'Failed to delete share from database.' });
        fetchShares();
      }
    } catch (err: any) {
      setFeedback({ type: 'error', text: 'Error deleting share: ' + err.message });
      fetchShares();
    }
  };

  const handleClearAllShares = async () => {
    if (shares.length === 0) return;
    setShares([]);
    try {
      const res = await fetchWithAuth('/api/shares', { method: 'DELETE' });
      if (res.ok) {
        setFeedback({ type: 'success', text: 'All captured shares cleared successfully.' });
      } else {
        setFeedback({ type: 'error', text: 'Failed to clear captured shares database.' });
        fetchShares();
      }
    } catch (err: any) {
      setFeedback({ type: 'error', text: 'Error clearing shares: ' + err.message });
      fetchShares();
    }
  };

  const handleUpdateShareOption = async (
    shareId: string,
    updates: { showForwardedTag?: boolean; cardLayout?: 'album' | 'carousel'; caption?: string }
  ) => {
    try {
      const res = await fetchWithAuth(`/api/shares/${encodeURIComponent(shareId)}/options`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      const data = await res.json();
      if (res.ok && data.success && data.share) {
        setShares(prev => prev.map(s => (s.id === shareId ? data.share : s)));
      }
    } catch (e) {
      console.warn('Error updating share options:', e);
    }
  };

  const handleAddFilesToShare = async (shareId: string, fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setUploadingMediaMap(prev => ({ ...prev, [shareId]: true }));
    try {
      const mediaItems = [];
      for (let i = 0; i < fileList.length; i++) {
        const f = fileList[i];
        const dataUrl = await readFileAsDataUrl(f);
        mediaItems.push({
          dataUrl,
          fileName: f.name,
          mimeType: f.type || 'application/octet-stream',
          mediaType: inferMediaTypeFromMimeOrName(f.type, f.name)
        });
      }
      const res = await fetchWithAuth(`/api/shares/${encodeURIComponent(shareId)}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mediaItems })
      });
      const data = await res.json();
      if (res.ok && data.success && data.share) {
        setShares(prev => prev.map(s => (s.id === shareId ? data.share : s)));
        setFeedback({ type: 'success', text: `Added ${mediaItems.length} media file(s) into channel card!` });
      } else {
        setFeedback({ type: 'error', text: data.error || 'Failed to add media files.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', text: 'Media upload error: ' + err.message });
    } finally {
      setUploadingMediaMap(prev => ({ ...prev, [shareId]: false }));
    }
  };

  const handleAddUrlToShare = async (shareId: string) => {
    const rawUrl = (urlInputMap[shareId] || '').trim();
    if (!rawUrl) {
      setFeedback({ type: 'error', text: 'Please enter a valid media URL.' });
      return;
    }
    setUploadingMediaMap(prev => ({ ...prev, [shareId]: true }));
    try {
      const mType = inferMediaTypeFromMimeOrName('', rawUrl);
      const res = await fetchWithAuth(`/api/shares/${encodeURIComponent(shareId)}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mediaItems: [{ url: rawUrl, mediaType: mType }] })
      });
      const data = await res.json();
      if (res.ok && data.success && data.share) {
        setShares(prev => prev.map(s => (s.id === shareId ? data.share : s)));
        setUrlInputMap(prev => ({ ...prev, [shareId]: '' }));
        setShowUrlAddMap(prev => ({ ...prev, [shareId]: false }));
        setFeedback({ type: 'success', text: 'Added media URL into channel card!' });
      } else {
        setFeedback({ type: 'error', text: data.error || 'Failed to add media URL.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', text: 'Error adding media URL: ' + err.message });
    } finally {
      setUploadingMediaMap(prev => ({ ...prev, [shareId]: false }));
    }
  };

  const handleRemoveExtraMedia = async (shareId: string, mediaId: string) => {
    try {
      const res = await fetchWithAuth(
        `/api/shares/${encodeURIComponent(shareId)}/media/${encodeURIComponent(mediaId)}`,
        { method: 'DELETE' }
      );
      const data = await res.json();
      if (res.ok && data.success && data.share) {
        setShares(prev => prev.map(s => (s.id === shareId ? data.share : s)));
        setFeedback({ type: 'success', text: 'Removed media item from card.' });
      } else {
        setFeedback({ type: 'error', text: data.error || 'Failed to remove media item.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', text: 'Error removing media item: ' + err.message });
    }
  };

  const handleCreateFilesSelect = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    try {
      const added: DraftComposerMedia[] = [];
      for (let i = 0; i < fileList.length; i++) {
        const f = fileList[i];
        const dataUrl = await readFileAsDataUrl(f);
        added.push({
          id: `draft_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 6)}`,
          mediaType: inferMediaTypeFromMimeOrName(f.type, f.name),
          fileName: f.name,
          mimeType: f.type || 'application/octet-stream',
          dataUrl
        });
      }
      setCreateMediaList(prev => [...prev, ...added]);
    } catch (err: any) {
      setFeedback({ type: 'error', text: 'Error reading selected files: ' + err.message });
    }
  };

  const handleAddCreateUrl = () => {
    const clean = createUrlInput.trim();
    if (!clean) return;
    setCreateMediaList(prev => [
      ...prev,
      {
        id: `draft_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        mediaType: inferMediaTypeFromMimeOrName('', clean),
        fileName: clean.split('/').pop()?.split('?')[0] || 'media-url',
        mimeType: '',
        url: clean
      }
    ]);
    setCreateUrlInput('');
  };

  const handleCreateMultiMediaCard = async () => {
    if (createMediaList.length === 0 && !createCaption.trim()) {
      setFeedback({ type: 'error', text: 'Add at least one photo/video/document or enter a caption.' });
      return;
    }
    setIsCreatingCard(true);
    try {
      const res = await fetchWithAuth('/api/shares/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caption: createCaption.trim(),
          mediaItems: createMediaList.map(m => ({
            mediaType: m.mediaType,
            fileName: m.fileName,
            mimeType: m.mimeType,
            dataUrl: m.dataUrl,
            url: m.url
          })),
          channelLink: createChannelLink.trim() || undefined,
          channelName: createChannelName.trim() || undefined,
          cardLayout: createCardLayout,
          showForwardedTag: createShowForwardedTag,
          sessionId: activeSessionId
        })
      });
      const data = await res.json();
      if (res.ok && data.success && data.share) {
        setShares(prev => [...prev, data.share]);
        setShowForwardedTagMap(prev => ({ ...prev, [data.share.id]: createShowForwardedTag }));
        setCardLayoutMap(prev => ({ ...prev, [data.share.id]: createCardLayout }));
        setUseChannelTagMap(prev => ({ ...prev, [data.share.id]: true }));
        setShowCreateModal(false);
        setCreateCaption('');
        setCreateMediaList([]);
        setFeedback({ type: 'success', text: `Created multi-media channel card (${createMediaList.length} media item(s))!` });
      } else {
        setFeedback({ type: 'error', text: data.error || 'Failed to create channel card.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', text: 'Create card error: ' + err.message });
    } finally {
      setIsCreatingCard(false);
    }
  };

  const handleOpenChannelModal = (share: CapturedShare) => {
    setEditingShareForChannel(share);
    setChannelInputName(share.channelInfo?.newsletterName || '');
    setChannelInputJid(share.channelInfo?.newsletterJid || '');
    setChannelInputLink(share.channelLink || share.channelInfo?.channelLink || '');
    setChannelInputMsgId(share.channelInfo?.serverMessageId ? String(share.channelInfo.serverMessageId) : '');
    if (userChannels.length === 0) {
      fetchUserChannels();
    }
  };

  const handleInspectChannelLink = async () => {
    const candidate = channelInputLink.trim() || channelInputJid.trim() || channelInputName.trim();
    if (!candidate) {
      setFeedback({ type: 'error', text: 'Please enter a WhatsApp Channel link, JID, or Name to inspect.' });
      return;
    }
    setIsInspectingChannel(true);
    try {
      const res = await fetchWithAuth('/api/channels/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelInput: candidate,
          sessionId: activeSessionId
        })
      });
      const data = await res.json();
      if (res.ok && data.channel) {
        if (data.channel.name) setChannelInputName(data.channel.name);
        if (data.channel.id) setChannelInputJid(data.channel.id);
        if (data.channel.channelLink || data.channel.invite) {
          setChannelInputLink(
            data.channel.channelLink ||
            (data.channel.invite.startsWith('http') ? data.channel.invite : `https://whatsapp.com/channel/${data.channel.invite}`)
          );
        }
        if (data.channel.serverMessageId) {
          setChannelInputMsgId(String(data.channel.serverMessageId));
        }
        setFeedback({ 
          type: 'success', 
          text: `Resolved Channel: "${data.channel.name}" (${data.channel.id})${data.channel.serverMessageId ? ` [Message #${data.channel.serverMessageId}]` : ''}` 
        });
      } else {
        setFeedback({ type: 'error', text: data.error || 'Could not resolve channel metadata.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', text: 'Inspect error: ' + err.message });
    } finally {
      setIsInspectingChannel(false);
    }
  };

  const handleSaveChannelTag = async (clear = false) => {
    if (!editingShareForChannel) return;
    setIsSavingChannelTag(true);
    try {
      const parsedMsgId = channelInputMsgId ? parseInt(channelInputMsgId, 10) : undefined;
      const res = await fetchWithAuth(`/api/shares/${encodeURIComponent(editingShareForChannel.id)}/channel`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clear,
          newsletterName: channelInputName.trim(),
          newsletterJid: channelInputJid.trim(),
          channelLink: channelInputLink.trim(),
          serverMessageId: isNaN(parsedMsgId!) ? 1 : parsedMsgId,
          sessionId: activeSessionId
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setFeedback({ 
          type: 'success', 
          text: clear ? 'Channel Tag & Link removed from share.' : `Updated Channel Tag & Link for "${channelInputName || 'Share'}"!` 
        });
        setEditingShareForChannel(null);
        fetchShares();
      } else {
        setFeedback({ type: 'error', text: data.error || 'Failed to update channel tag.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', text: 'Error saving channel tag: ' + err.message });
    } finally {
      setIsSavingChannelTag(false);
    }
  };

  const handleSelectDiscoveredChannel = (c: DiscoveredChannel) => {
    setChannelInputName(c.name);
    setChannelInputJid(c.id);
    if (c.invite) {
      setChannelInputLink(c.invite.startsWith('http') ? c.invite : `https://whatsapp.com/channel/${c.invite}`);
    }
  };

  const handleForwardShare = async (shareId: string) => {
    const rawJids = targetJidsMap[shareId] || '';
    const cleanJids = rawJids
      .split(',')
      .map(j => j.trim())
      .filter(Boolean);

    if (cleanJids.length === 0) {
      setFeedback({ type: 'error', text: 'Please enter at least one valid Group ID or JID to forward to.' });
      return;
    }

    const share = shares.find(s => s.id === shareId);
    const shouldAttachChannelTag = useChannelTagMap[shareId] !== false;
    const shouldShowForwarded = showForwardedTagMap[shareId] !== undefined ? showForwardedTagMap[shareId] : defaultShowForwardedTag;
    const selectedLayout = cardLayoutMap[shareId] || share?.cardLayout || 'album';
    const customLink = channelLinkMap[shareId];
    const effectiveLink = customLink !== undefined && customLink !== '' 
      ? customLink.trim() 
      : (share?.channelLink || defaultChannelLink || undefined);
    const shouldAppendLink = appendChannelLinkMap[shareId] === true;

    setIsForwardingMap(prev => ({ ...prev, [shareId]: true }));
    setForwardResultsMap(prev => ({ ...prev, [shareId]: [] }));

    try {
      const res = await fetchWithAuth('/api/shares/forward', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shareId,
          targetJids: cleanJids,
          sessionId: activeSessionId,
          useChannelTag: shouldAttachChannelTag,
          channelInfo: shouldAttachChannelTag ? share?.channelInfo : null,
          channelLink: effectiveLink,
          appendChannelLink: shouldAppendLink,
          showForwardedTag: shouldShowForwarded,
          cardLayout: selectedLayout
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        const channelMsg = data.channelInfo ? ` (Channel: "${data.channelInfo.newsletterName}")` : '';
        const fwdMsg = data.showForwardedTag ? ' [Forwarded Tag: ON]' : ' [Clean • No Forwarded Tag]';
        const multiMsg = data.mediaCount && data.mediaCount > 1 ? ` [${data.mediaCount} Media in Card]` : '';
        setFeedback({ type: 'success', text: `Dispatch complete!${channelMsg}${fwdMsg}${multiMsg}` });
        setForwardResultsMap(prev => ({ ...prev, [shareId]: data.results || [] }));
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

  const getMediaBadge = (type?: string, extraCount = 0) => {
    if (extraCount > 0) {
      const total = (['image', 'video', 'document', 'audio'].includes(type || '') ? 1 : 0) + extraCount;
      if (total > 1) {
        return (
          <span className="flex items-center gap-1 text-[10px] bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded-full font-bold">
            <Layers className="w-3 h-3 text-indigo-400" />
            <span>Multi-Media Card ({total})</span>
          </span>
        );
      }
    }
    switch (type) {
      case 'video':
        return (
          <span className="flex items-center gap-1 text-[10px] bg-purple-500/10 text-purple-400 border border-purple-500/20 px-2 py-0.5 rounded-full font-bold">
            <Video className="w-3 h-3 text-purple-400" />
            <span>Video Media</span>
          </span>
        );
      case 'image':
        return (
          <span className="flex items-center gap-1 text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full font-bold">
            <ImageIcon className="w-3 h-3 text-blue-400" />
            <span>Image Photo</span>
          </span>
        );
      case 'document':
        return (
          <span className="flex items-center gap-1 text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full font-bold">
            <FileText className="w-3 h-3 text-amber-400" />
            <span>Document / PDF</span>
          </span>
        );
      case 'audio':
        return (
          <span className="flex items-center gap-1 text-[10px] bg-pink-500/10 text-pink-400 border border-pink-500/20 px-2 py-0.5 rounded-full font-bold">
            <Music className="w-3 h-3 text-pink-400" />
            <span>Audio Note</span>
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1 text-[10px] bg-slate-800 text-slate-300 border border-slate-700 px-2 py-0.5 rounded-full font-semibold">
            <MessageSquare className="w-3 h-3 text-emerald-400" />
            <span>Formatted Message</span>
          </span>
        );
    }
  };

  return (
    <div id="shares-manager-page" className="space-y-6">
      {/* Header Panel */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Share2 className="w-5 h-5 text-emerald-400" />
            <span>WhatsApp Channel & Shares Studio</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
            Share single or <strong className="text-indigo-300">multi-media</strong> WhatsApp Channel cards (Album Grid or Swipeable Carousel) with native <strong className="text-emerald-400">Channel Tags</strong> and optional <strong className="text-slate-200">&quot;Forwarded&quot;</strong> badge control.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
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
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold rounded-lg transition-all cursor-pointer shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Multi-Media Card</span>
          </button>

          <button
            onClick={() => fetchShares()}
            disabled={isLoading}
            className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-semibold rounded-lg border border-slate-700/60 transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-emerald-400' : ''}`} />
            <span>Refresh</span>
          </button>

          {shares.length > 0 && (
            <button
              onClick={handleClearAllShares}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 hover:text-rose-300 text-xs font-semibold rounded-lg border border-rose-500/30 transition-all cursor-pointer"
              title="Clear all captured shares"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear All ({shares.length})</span>
            </button>
          )}
        </div>
      </div>

      {/* Guide Banner */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-slate-900/60 border border-slate-800/80 p-4 rounded-xl text-xs space-y-2.5">
          <h3 className="font-bold text-slate-200 flex items-center gap-2">
            <Radio className="w-4 h-4 text-emerald-400" />
            <span>Channel Cards, Multi-Media & Forwarded Tag</span>
          </h3>
          <p className="text-slate-400 leading-relaxed text-[11px]">
            Bundle multiple photos, videos, or documents inside the same channel card using <strong className="text-indigo-300">+ Add Media</strong> below or <code className="text-emerald-400 font-mono">.share add</code> in chat. Toggle <strong className="text-slate-200">Show &quot;Forwarded&quot; Tag</strong> on or off per card, globally in Settings, or directly in chat!
          </p>
          <div className="flex flex-wrap gap-1.5 text-[10px] font-mono">
            <span className="bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20">.share noforward</span>
            <span className="bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20">.sharenow noforward</span>
            <span className="bg-indigo-500/10 text-indigo-300 px-2 py-0.5 rounded border border-indigo-500/20">.share add</span>
            <span className="bg-slate-800 text-slate-300 px-2 py-0.5 rounded border border-slate-700">.sharetag off / on</span>
          </div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800/80 p-4 rounded-xl text-xs space-y-2.5">
          <h3 className="font-bold text-slate-200 flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-emerald-400" />
            <span>Quick WhatsApp Chat Workflows</span>
          </h3>
          <ul className="text-slate-400 space-y-1 text-[11px] list-disc list-inside">
            <li>Reply <code className="text-emerald-400 font-mono">.share</code> (or <code className="text-emerald-400 font-mono">.share noforward</code>) to save a post, then reply <code className="text-emerald-400 font-mono">.share add</code> to more photos/videos to bundle them together.</li>
            <li>Reply <code className="text-emerald-400 font-mono">.sharenow</code> or <code className="text-emerald-400 font-mono">.sharenow noforward</code> to broadcast immediately to all joined groups.</li>
          </ul>
        </div>
      </div>

      {/* Main Shares Container */}
      {shares.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 bg-slate-900/40 border border-dashed border-slate-800 rounded-2xl text-center space-y-3">
          <Share2 className="w-8 h-8 text-slate-600 animate-pulse" />
          <p className="text-sm font-semibold text-slate-400">No captured shares found</p>
          <p className="text-xs text-slate-500 max-w-md">
            Reply <span className="font-mono text-emerald-400 font-bold">.share</span> to a WhatsApp post or click <strong className="text-emerald-400">New Multi-Media Card</strong> above to compose one here!
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {shares.map((share) => {
            const isForwarding = isForwardingMap[share.id] || false;
            const results = forwardResultsMap[share.id] || [];
            const useChannelTag = useChannelTagMap[share.id] !== false;
            const showForwardedTag = showForwardedTagMap[share.id] !== undefined ? showForwardedTagMap[share.id] : defaultShowForwardedTag;
            const cardLayout = cardLayoutMap[share.id] || share.cardLayout || 'album';
            const extraMedia = share.extraMedia || [];
            const primaryIsMedia = ['image', 'video', 'document', 'audio'].includes(share.mediaType || '');
            const totalMediaCount = (primaryIsMedia ? 1 : 0) + extraMedia.length;
            const primaryThumb = extractQuotedThumbnailDataUrl(share.quotedMessage);
            const isUploadingThis = !!uploadingMediaMap[share.id];

            return (
              <div 
                key={share.id} 
                className="bg-slate-900 border border-slate-800 rounded-2xl p-6 hover:border-slate-700/80 transition-all flex flex-col gap-5 shadow-lg relative overflow-hidden"
              >
                {/* Meta Header */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-800 pb-4">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-mono font-bold bg-slate-950 border border-slate-800 px-2 py-0.5 rounded text-slate-300">
                        {share.id}
                      </span>
                      {getMediaBadge(share.mediaType, extraMedia.length)}
                      
                      {share.channelInfo ? (
                        <div className="flex items-center gap-1.5 text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-0.5 rounded-full font-bold">
                          <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
                          <span>Channel: {share.channelInfo.newsletterName}</span>
                        </div>
                      ) : (
                        <span className="text-[10px] bg-slate-800/80 text-slate-400 border border-slate-700/60 px-2 py-0.5 rounded-full font-medium">
                          No Channel Tag Attached
                        </span>
                      )}

                      {showForwardedTag ? (
                        <span className="flex items-center gap-1 text-[10px] bg-slate-800 text-slate-300 border border-slate-700 px-2 py-0.5 rounded-full font-semibold">
                          <Forward className="w-2.5 h-2.5 text-slate-400" />
                          <span>Forwarded Tag: ON</span>
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[10px] bg-teal-500/10 text-teal-300 border border-teal-500/25 px-2 py-0.5 rounded-full font-semibold">
                          <EyeOff className="w-2.5 h-2.5 text-teal-400" />
                          <span>Clean (No Forwarded Tag)</span>
                        </span>
                      )}

                      {/* Channel Link Badge */}
                      {(share.channelLink || share.channelInfo?.channelLink || defaultChannelLink) && (
                        <a
                          href={share.channelLink || share.channelInfo?.channelLink || defaultChannelLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[10px] bg-blue-500/10 text-blue-400 hover:text-blue-300 border border-blue-500/20 px-2.5 py-0.5 rounded-full font-medium transition-colors"
                          title="Open WhatsApp Channel Link"
                        >
                          <LinkIcon className="w-2.5 h-2.5" />
                          <span className="truncate max-w-[170px]">
                            {share.channelLink || share.channelInfo?.channelLink ? 'Custom Link' : 'Default Link'}: {share.channelLink || share.channelInfo?.channelLink || defaultChannelLink}
                          </span>
                        </a>
                      )}

                      {share.status === 'forwarded' ? (
                        <span className="flex items-center gap-1 text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-semibold">
                          <Check className="w-2.5 h-2.5" />
                          <span>Sent</span>
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full font-semibold">
                          <Clock className="w-2.5 h-2.5 animate-pulse" />
                          <span>Pending</span>
                        </span>
                      )}
                    </div>

                    <div className="text-[11px] text-slate-400 flex flex-wrap gap-x-3 gap-y-1">
                      <span>Source: <strong className="text-slate-200">{share.from}</strong></span>
                      <span>•</span>
                      <span>Sender: <strong className="text-slate-200">{share.quotedSender ? share.quotedSender.split('@')[0] : 'Studio'}</strong></span>
                      <span>•</span>
                      <span>Captured: <strong className="text-slate-300">{new Date(share.timestamp).toLocaleString()}</strong></span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-auto">
                    <button
                      onClick={() => handleOpenChannelModal(share)}
                      className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-emerald-400 hover:bg-emerald-500/10 border border-emerald-500/20 rounded-lg transition-all cursor-pointer font-medium"
                    >
                      <Tag className="w-3 h-3" />
                      <span>{share.channelInfo ? 'Edit Channel Tag & Link' : '+ Channel Tag'}</span>
                    </button>

                    <button
                      onClick={() => handleDeleteShare(share.id)}
                      className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 border border-transparent hover:border-rose-500/20 rounded-lg transition-all cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>

                {/* Quoted Message & Multi-Media Preview Box */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 relative overflow-hidden space-y-3">
                  <div className="flex flex-wrap justify-between items-center gap-2 text-[10px] text-slate-500 font-mono font-semibold border-b border-slate-900 pb-2">
                    <span>WHATSAPP CARD PREVIEW ({totalMediaCount} MEDIA)</span>
                    <div className="flex items-center gap-2 font-sans">
                      {showForwardedTag ? (
                        <span className="text-slate-400 flex items-center gap-1 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                          <Forward className="w-2.5 h-2.5" />
                          Forwarded badge visible
                        </span>
                      ) : (
                        <span className="text-teal-400 flex items-center gap-1 bg-teal-500/10 px-2 py-0.5 rounded border border-teal-500/20">
                          <EyeOff className="w-2.5 h-2.5" />
                          No &quot;Forwarded&quot; badge
                        </span>
                      )}
                      {useChannelTag && share.channelInfo && (
                        <span className="text-emerald-400 flex items-center gap-1">
                          <Radio className="w-3 h-3" />
                          View Channel pill active
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <div className="w-1.5 bg-emerald-500 rounded self-stretch shrink-0"></div>
                    <div className="space-y-2.5 flex-1 min-w-0">
                      {/* Simulated WhatsApp Card Header Pills */}
                      <div className="flex flex-wrap items-center gap-2">
                        {showForwardedTag && (
                          <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-900 border border-slate-700/80 text-slate-400 text-[10px] italic">
                            <Forward className="w-2.5 h-2.5" />
                            <span>Forwarded</span>
                          </div>
                        )}
                        {useChannelTag && share.channelInfo && (
                          <div className="inline-flex flex-wrap items-center gap-2 px-2.5 py-1 rounded bg-emerald-950/60 border border-emerald-800/60 text-emerald-300 text-[11px] font-semibold">
                            <Radio className="w-3 h-3 text-emerald-400" />
                            <span>Channel Header: <strong>{share.channelInfo.newsletterName}</strong></span>
                            {share.channelInfo.newsletterJid && (
                              <span className="text-[10px] text-emerald-500 font-mono">({share.channelInfo.newsletterJid})</span>
                            )}
                            {share.channelInfo.serverMessageId && share.channelInfo.serverMessageId > 1 && (
                              <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.2 rounded font-mono">
                                Post #{share.channelInfo.serverMessageId}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Media Grid inside the Card */}
                      {(primaryIsMedia || extraMedia.length > 0) && (
                        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-2.5 pt-1">
                          {primaryIsMedia && (
                            <div className="relative group bg-slate-900 border border-slate-800 rounded-xl overflow-hidden aspect-square flex flex-col items-center justify-center p-2">
                              {primaryThumb ? (
                                <img src={primaryThumb} alt="Captured media" className="w-full h-full object-cover rounded-lg" />
                              ) : (
                                <div className="flex flex-col items-center gap-1 text-slate-400">
                                  {share.mediaType === 'video' ? <Video className="w-6 h-6 text-purple-400" /> :
                                   share.mediaType === 'document' ? <FileText className="w-6 h-6 text-amber-400" /> :
                                   share.mediaType === 'audio' ? <Music className="w-6 h-6 text-pink-400" /> :
                                   <ImageIcon className="w-6 h-6 text-blue-400" />}
                                  <span className="text-[10px] uppercase font-bold">{share.mediaType}</span>
                                </div>
                              )}
                              <span className="absolute bottom-1.5 left-1.5 bg-black/75 text-emerald-300 text-[9px] font-bold px-1.5 py-0.5 rounded">
                                #1 Captured
                              </span>
                            </div>
                          )}

                          {extraMedia.map((item, idx) => {
                            const srcUrl = getMediaSrcUrl(item);
                            const mediaIdx = (primaryIsMedia ? 2 : 1) + idx;
                            return (
                              <div key={item.id} className="relative group bg-slate-900 border border-slate-800 rounded-xl overflow-hidden aspect-square flex flex-col items-center justify-center p-2">
                                {item.mediaType === 'image' && srcUrl ? (
                                  <img src={srcUrl} alt={item.fileName || 'Media'} className="w-full h-full object-cover rounded-lg" />
                                ) : item.mediaType === 'video' && srcUrl && !item.quotedMessage ? (
                                  <video src={srcUrl} className="w-full h-full object-cover rounded-lg" muted />
                                ) : item.mediaType === 'video' && srcUrl && item.quotedMessage ? (
                                  <img src={srcUrl} alt="Video thumbnail" className="w-full h-full object-cover rounded-lg" />
                                ) : (
                                  <div className="flex flex-col items-center gap-1 text-slate-400 text-center px-1">
                                    {item.mediaType === 'video' ? <Video className="w-6 h-6 text-purple-400" /> :
                                     item.mediaType === 'document' ? <FileText className="w-6 h-6 text-amber-400" /> :
                                     item.mediaType === 'audio' ? <Music className="w-6 h-6 text-pink-400" /> :
                                     <ImageIcon className="w-6 h-6 text-blue-400" />}
                                    <span className="text-[9px] font-medium truncate max-w-[90px]">{item.fileName || item.mediaType}</span>
                                  </div>
                                )}
                                <span className="absolute bottom-1.5 left-1.5 bg-black/75 text-indigo-300 text-[9px] font-bold px-1.5 py-0.5 rounded">
                                  #{mediaIdx} {item.mediaType}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveExtraMedia(share.id, item.id)}
                                  className="absolute top-1.5 right-1.5 bg-rose-600/90 hover:bg-rose-500 text-white rounded-full p-1 transition-all cursor-pointer shadow"
                                  title="Remove this media item"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Caption display / inline editor */}
                      {editingCaptionId === share.id ? (
                        <div className="space-y-2 pt-1">
                          <textarea
                            rows={3}
                            value={captionDraft}
                            onChange={(e) => setCaptionDraft(e.target.value)}
                            className="w-full bg-slate-900 border border-emerald-500/60 rounded-lg px-3 py-2 text-xs text-white outline-none"
                            placeholder="Enter caption for this channel card..."
                          />
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={async () => {
                                await handleUpdateShareOption(share.id, { caption: captionDraft });
                                setEditingCaptionId(null);
                                setFeedback({ type: 'success', text: 'Card caption updated.' });
                              }}
                              className="px-3 py-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-[11px] rounded-lg cursor-pointer"
                            >
                              Save Caption
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingCaptionId(null)}
                              className="px-2.5 py-1 text-slate-400 hover:text-white text-[11px] cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm text-slate-100 whitespace-pre-wrap font-sans leading-relaxed break-words flex-1">
                            {share.caption || share.displayText}
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingCaptionId(share.id);
                              setCaptionDraft(share.caption !== undefined ? share.caption : share.displayText);
                            }}
                            className="text-[10px] text-slate-400 hover:text-emerald-400 flex items-center gap-1 shrink-0 px-2 py-1 rounded bg-slate-900 border border-slate-800 cursor-pointer"
                            title="Edit card caption"
                          >
                            <Edit2 className="w-3 h-3" />
                            <span>Edit Text</span>
                          </button>
                        </div>
                      )}

                      {/* Multi-Media Actions Toolbar */}
                      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-900">
                        <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 border border-indigo-500/30 rounded-lg text-[11px] font-semibold cursor-pointer transition-all">
                          <Upload className={`w-3.5 h-3.5 ${isUploadingThis ? 'animate-bounce' : ''}`} />
                          <span>{isUploadingThis ? 'Adding Media...' : '+ Add Photos / Videos / Docs to Card'}</span>
                          <input
                            type="file"
                            multiple
                            accept="image/*,video/*,application/pdf,.doc,.docx,audio/*"
                            className="hidden"
                            disabled={isUploadingThis}
                            onChange={(e) => {
                              handleAddFilesToShare(share.id, e.target.files);
                              e.target.value = '';
                            }}
                          />
                        </label>

                        <button
                          type="button"
                          onClick={() => setShowUrlAddMap(prev => ({ ...prev, [share.id]: !prev[share.id] }))}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded-lg text-[11px] font-medium cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Add Media URL</span>
                        </button>

                        {totalMediaCount >= 2 && (
                          <div className="flex items-center gap-1.5 ml-auto bg-slate-900 border border-slate-800 px-2.5 py-1 rounded-lg">
                            <Layers className="w-3 h-3 text-indigo-400" />
                            <span className="text-[10px] text-slate-400 font-medium">Card Style:</span>
                            <select
                              value={cardLayout}
                              onChange={(e) => {
                                const val = e.target.value === 'carousel' ? 'carousel' : 'album';
                                setCardLayoutMap(prev => ({ ...prev, [share.id]: val }));
                                handleUpdateShareOption(share.id, { cardLayout: val });
                              }}
                              className="bg-transparent text-[11px] text-indigo-300 font-semibold outline-none cursor-pointer"
                            >
                              <option value="album" className="bg-slate-900 text-white">Native Album Grid</option>
                              <option value="carousel" className="bg-slate-900 text-white">Swipeable Carousel Card</option>
                            </select>
                          </div>
                        )}
                      </div>

                      {showUrlAddMap[share.id] && (
                        <div className="flex flex-col sm:flex-row gap-2 pt-1">
                          <input
                            type="text"
                            value={urlInputMap[share.id] || ''}
                            onChange={(e) => setUrlInputMap(prev => ({ ...prev, [share.id]: e.target.value }))}
                            placeholder="https://example.com/image.jpg or video.mp4 or file.pdf"
                            className="flex-1 bg-slate-900 border border-slate-800 focus:border-indigo-500 rounded-lg px-3 py-1.5 text-xs text-white outline-none font-mono"
                          />
                          <button
                            type="button"
                            disabled={isUploadingThis}
                            onClick={() => handleAddUrlToShare(share.id)}
                            className="px-3 py-1.5 bg-indigo-500 hover:bg-indigo-400 text-slate-950 font-bold text-xs rounded-lg cursor-pointer"
                          >
                            Attach URL
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Forwarding Form with Channel Tag & Forwarded Badge Controls */}
                <div className="space-y-3 bg-slate-950/50 border border-slate-800/80 p-4 rounded-xl">
                  <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-2.5">
                    <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                      <Forward className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Forward Destination JIDs (WhatsApp Groups)</span>
                    </label>

                    <div className="flex flex-wrap items-center gap-4">
                      {/* Show Forwarded Tag Toggle */}
                      <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={showForwardedTag}
                          onChange={() => {
                            const nextVal = !showForwardedTag;
                            setShowForwardedTagMap(prev => ({ ...prev, [share.id]: nextVal }));
                            handleUpdateShareOption(share.id, { showForwardedTag: nextVal });
                          }}
                          className="w-3.5 h-3.5 rounded text-teal-500 accent-teal-500 cursor-pointer"
                        />
                        <span className="text-slate-300 flex items-center gap-1">
                          {showForwardedTag ? <Eye className="w-3.5 h-3.5 text-slate-400" /> : <EyeOff className="w-3.5 h-3.5 text-teal-400" />}
                          <span>Show &quot;Forwarded&quot; Tag</span>
                        </span>
                      </label>

                      {/* Channel Tag Forward Toggle */}
                      <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={useChannelTag}
                          onChange={() => setUseChannelTagMap(prev => ({ ...prev, [share.id]: !prev[share.id] }))}
                          className="w-3.5 h-3.5 rounded text-emerald-500 accent-emerald-500 cursor-pointer"
                        />
                        <span className="text-slate-300 flex items-center gap-1">
                          <Radio className="w-3 h-3 text-emerald-400" />
                          <span>Include Official Channel Banner</span>
                        </span>
                      </label>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3">
                    <input
                      type="text"
                      value={targetJidsMap[share.id] || ''}
                      onChange={(e) => setTargetJidsMap(prev => ({ ...prev, [share.id]: e.target.value }))}
                      placeholder="Paste target group JIDs (e.g. 120363294321932452@g.us, ...)"
                      className="flex-1 bg-slate-950 text-white border border-slate-800 hover:border-slate-700 focus:border-emerald-500 rounded-xl px-4 py-2.5 text-xs outline-none transition-all font-mono"
                    />
                    <button
                      onClick={() => handleForwardShare(share.id)}
                      disabled={isForwarding}
                      className="flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 text-slate-950 disabled:text-slate-500 text-xs font-bold rounded-xl transition-all cursor-pointer disabled:cursor-not-allowed shrink-0"
                    >
                      <Send className={`w-3.5 h-3.5 ${isForwarding ? 'animate-bounce' : ''}`} />
                      <span>
                        {isForwarding
                          ? 'Broadcasting...'
                          : totalMediaCount > 1
                            ? `Send ${totalMediaCount}-Media Card`
                            : 'Forward Message'}
                      </span>
                    </button>
                  </div>

                  {/* Channel Link Option for this Forward */}
                  <div className="pt-2.5 border-t border-slate-800/80 space-y-2">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-1.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <LinkIcon className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-[11px] font-semibold text-slate-300">Channel Link for &quot;View Channel&quot; Tag</span>
                        <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                          {appendChannelLinkMap[share.id] ? 'Link Shown in Caption' : 'Tag Active • Link Hidden in Caption'}
                        </span>
                      </div>
                      
                      <label className="flex items-center gap-1.5 text-[10.5px] font-medium text-slate-400 hover:text-slate-200 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={appendChannelLinkMap[share.id] === true}
                          onChange={() => setAppendChannelLinkMap(prev => ({ ...prev, [share.id]: !prev[share.id] }))}
                          className="w-3.5 h-3.5 rounded text-emerald-500 accent-emerald-500 cursor-pointer"
                        />
                        <span>Also append raw link in caption</span>
                      </label>
                    </div>

                    <input
                      type="text"
                      value={channelLinkMap[share.id] !== undefined ? channelLinkMap[share.id] : (share.channelLink || '')}
                      onChange={(e) => setChannelLinkMap(prev => ({ ...prev, [share.id]: e.target.value }))}
                      placeholder={defaultChannelLink ? `Default: ${defaultChannelLink}` : 'e.g. https://whatsapp.com/channel/0029Va.../123 (or leave empty to use default)'}
                      className="w-full bg-slate-950 text-white border border-slate-800 hover:border-slate-700 focus:border-emerald-500 rounded-xl px-3 py-2 text-xs outline-none transition-all font-mono text-[11px]"
                    />

                    <div className="flex flex-wrap items-center justify-between text-[10px] text-slate-400 gap-1">
                      <span>
                        {channelLinkMap[share.id]?.trim() ? (
                          <span className="text-emerald-400 font-semibold flex items-center gap-1">
                            <Check className="w-2.5 h-2.5" /> Using custom channel link for this forward
                          </span>
                        ) : defaultChannelLink ? (
                          <span className="text-slate-400">
                            No custom link entered &rarr; using default: <strong className="text-emerald-400 font-mono">{defaultChannelLink}</strong>
                          </span>
                        ) : (
                          <span className="text-slate-500">
                            No default link configured in Settings (enter link above or configure default in Settings)
                          </span>
                        )}
                      </span>

                      <span className="text-emerald-400/90 font-medium">
                        {showForwardedTag
                          ? '↪ "Forwarded" label ON • Native Channel banner active'
                          : '✨ Clean card (No "Forwarded" label) • Native Channel banner active'}
                      </span>
                    </div>
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

                  {/* Real-time Forwarding Results */}
                  {results.length > 0 && (
                    <div className="mt-3 p-3 bg-slate-950 border border-slate-800 rounded-lg space-y-2">
                      <div className="flex justify-between items-center pb-1.5 border-b border-slate-800">
                        <span className="text-[11px] font-bold text-white">Dispatch Status:</span>
                        <button
                          onClick={() => setForwardResultsMap(prev => ({ ...prev, [share.id]: [] }))}
                          className="text-[9px] text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
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
                                <span>Sent {showForwardedTag ? '(with Forwarded Tag)' : '(Clean • No Forwarded Tag)'}</span>
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

      {/* Create New Multi-Media Channel Card Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl p-6 space-y-5 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-white text-base">Create Multi-Media Channel Card</h3>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Multi-file uploader */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-300 block">
                  Attach Multiple Photos, Videos, or Documents ({createMediaList.length} selected)
                </label>
                <label className="flex flex-col items-center justify-center gap-2 p-5 bg-slate-950 border-2 border-dashed border-slate-800 hover:border-emerald-500/60 rounded-xl cursor-pointer transition-colors">
                  <Upload className="w-6 h-6 text-emerald-400" />
                  <span className="text-xs font-semibold text-slate-300">Click to select multiple images, videos, PDFs, or audio files</span>
                  <span className="text-[10px] text-slate-500">Selected items will be sent together inside the same WhatsApp channel card</span>
                  <input
                    type="file"
                    multiple
                    accept="image/*,video/*,application/pdf,.doc,.docx,audio/*"
                    className="hidden"
                    onChange={(e) => {
                      handleCreateFilesSelect(e.target.files);
                      e.target.value = '';
                    }}
                  />
                </label>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={createUrlInput}
                    onChange={(e) => setCreateUrlInput(e.target.value)}
                    placeholder="Or paste an image/video URL..."
                    className="flex-1 bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl px-3 py-2 text-xs text-white outline-none font-mono"
                  />
                  <button
                    type="button"
                    onClick={handleAddCreateUrl}
                    className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl cursor-pointer"
                  >
                    + Add URL
                  </button>
                </div>

                {createMediaList.length > 0 && (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5 pt-1">
                    {createMediaList.map((m, idx) => (
                      <div key={m.id} className="relative bg-slate-950 border border-slate-800 rounded-xl overflow-hidden aspect-square flex flex-col items-center justify-center p-1.5">
                        {m.mediaType === 'image' && (m.dataUrl || m.url) ? (
                          <img src={m.dataUrl || m.url} alt={m.fileName} className="w-full h-full object-cover rounded-lg" />
                        ) : (
                          <div className="flex flex-col items-center gap-1 text-slate-400 text-center px-1">
                            {m.mediaType === 'video' ? <Video className="w-5 h-5 text-purple-400" /> :
                             m.mediaType === 'document' ? <FileText className="w-5 h-5 text-amber-400" /> :
                             <Music className="w-5 h-5 text-pink-400" />}
                            <span className="text-[9px] truncate max-w-[80px]">{m.fileName}</span>
                          </div>
                        )}
                        <span className="absolute bottom-1 left-1 bg-black/75 text-emerald-300 text-[9px] font-bold px-1.5 py-0.5 rounded">
                          #{idx + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => setCreateMediaList(prev => prev.filter(x => x.id !== m.id))}
                          className="absolute top-1 right-1 bg-rose-600 text-white rounded-full p-0.5 cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Caption */}
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">Card Caption / Message Text</label>
                <textarea
                  rows={3}
                  value={createCaption}
                  onChange={(e) => setCreateCaption(e.target.value)}
                  placeholder="Write your WhatsApp Channel card caption..."
                  className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl px-3.5 py-2.5 text-xs text-white outline-none"
                />
              </div>

              {/* Channel Link & Name */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">WhatsApp Channel Link</label>
                  <input
                    type="text"
                    value={createChannelLink}
                    onChange={(e) => setCreateChannelLink(e.target.value)}
                    placeholder="https://whatsapp.com/channel/..."
                    className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl px-3 py-2 text-xs text-white outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Channel Display Name</label>
                  <input
                    type="text"
                    value={createChannelName}
                    onChange={(e) => setCreateChannelName(e.target.value)}
                    placeholder="e.g. Official Tech Deals"
                    className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl px-3 py-2 text-xs text-white outline-none"
                  />
                </div>
              </div>

              {/* Card Layout & Forwarded Tag */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">Multi-Media Card Style</label>
                  <select
                    value={createCardLayout}
                    onChange={(e) => setCreateCardLayout(e.target.value === 'carousel' ? 'carousel' : 'album')}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none cursor-pointer"
                  >
                    <option value="album">Native Album Grid (Photos & Videos)</option>
                    <option value="carousel">Swipeable Carousel Card (Mixed Media)</option>
                  </select>
                </div>

                <label className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex items-center justify-between cursor-pointer select-none">
                  <div>
                    <span className="text-[11px] font-bold text-slate-200 block">Show &quot;Forwarded&quot; Tag</span>
                    <span className="text-[10px] text-slate-500 block">
                      {createShowForwardedTag ? 'Shows Forwarded label' : 'Clean card without Forwarded label'}
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={createShowForwardedTag}
                    onChange={(e) => setCreateShowForwardedTag(e.target.checked)}
                    className="w-4 h-4 rounded text-teal-500 accent-teal-500 cursor-pointer"
                  />
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-xs text-slate-400 hover:text-white rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isCreatingCard || (createMediaList.length === 0 && !createCaption.trim())}
                onClick={handleCreateMultiMediaCard}
                className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold text-xs rounded-xl cursor-pointer"
              >
                {isCreatingCard ? 'Saving Card...' : 'Save Multi-Media Card'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Channel Tag & Link Management Modal */}
      {editingShareForChannel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 space-y-5 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Radio className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-white text-base">Configure Channel Tag & Direct Link</h3>
              </div>
              <button
                onClick={() => setEditingShareForChannel(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* How to get message link guide */}
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs space-y-1.5">
              <div className="flex items-center gap-1.5 font-bold text-emerald-300">
                <HelpCircle className="w-3.5 h-3.5 text-emerald-400" />
                <span>How to get a link that sends users to a particular message:</span>
              </div>
              <ol className="text-slate-300 list-decimal list-inside space-y-0.5 text-[11px]">
                <li>In WhatsApp, open your Channel.</li>
                <li>Long-press or tap the 3 dots on the specific message you want to link.</li>
                <li>Tap <strong>&quot;Copy Link&quot;</strong> (format: <code className="text-emerald-300 font-mono">https://whatsapp.com/channel/&lt;code&gt;/&lt;msgId&gt;</code>).</li>
                <li>Paste it below & click <strong>&quot;Auto-Resolve Link&quot;</strong>!</li>
              </ol>
            </div>

            {/* Quick Pick From Connected Account's Followed Channels */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-[11px] font-bold text-slate-300">
                  Followed WhatsApp Channels on Account
                </label>
                <button
                  type="button"
                  onClick={fetchUserChannels}
                  disabled={isLoadingChannels}
                  className="text-[10px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className={`w-3 h-3 ${isLoadingChannels ? 'animate-spin' : ''}`} />
                  <span>Fetch Channels</span>
                </button>
              </div>

              {userChannels.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-2 bg-slate-950 border border-slate-800 rounded-xl">
                  {userChannels.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => handleSelectDiscoveredChannel(c)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold border text-left transition-all cursor-pointer ${
                        channelInputJid === c.id
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500'
                          : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <span>{c.name}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-[11px] text-slate-500 italic p-2 bg-slate-950/60 border border-slate-800/80 rounded-xl">
                  Click &quot;Fetch Channels&quot; or paste a link below.
                </div>
              )}
            </div>

            {/* Manual Inputs & Inspector */}
            <div className="space-y-3">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-semibold text-slate-300">Channel Link / Message Link</label>
                  <button
                    type="button"
                    onClick={handleInspectChannelLink}
                    disabled={isInspectingChannel || (!channelInputLink.trim() && !channelInputJid.trim() && !channelInputName.trim())}
                    className="text-[10px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-semibold disabled:opacity-50 cursor-pointer"
                  >
                    <Search className={`w-3 h-3 ${isInspectingChannel ? 'animate-spin' : ''}`} />
                    <span>Auto-Resolve Link</span>
                  </button>
                </div>
                <input
                  type="text"
                  placeholder="e.g. https://whatsapp.com/channel/0029Va... or https://whatsapp.com/channel/0029Va.../123"
                  value={channelInputLink}
                  onChange={(e) => setChannelInputLink(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white outline-none focus:border-emerald-500 transition-colors font-mono"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  If left empty, your default channel link ({defaultChannelLink || 'None configured'}) will be used.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Channel Display Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Official Tech Deals"
                    value={channelInputName}
                    onChange={(e) => setChannelInputName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white outline-none focus:border-emerald-500 transition-colors"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Specific Message # (optional)</label>
                  <input
                    type="number"
                    placeholder="e.g. 45"
                    value={channelInputMsgId}
                    onChange={(e) => setChannelInputMsgId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white outline-none focus:border-emerald-500 transition-colors font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Numeric Newsletter JID (Auto-filled)</label>
                <input
                  type="text"
                  placeholder="120363xxx@newsletter"
                  value={channelInputJid}
                  onChange={(e) => setChannelInputJid(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white outline-none focus:border-emerald-500 transition-colors font-mono text-[11px]"
                />
              </div>

              {channelInputJid && /^\d{10,25}@newsletter$/.test(channelInputJid.trim()) ? (
                <div className="flex items-center gap-1.5 p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-[11px] text-emerald-300">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>Channel JID verified: Official WhatsApp banner is active.</span>
                </div>
              ) : channelInputName && !channelInputJid ? (
                <div className="flex items-center gap-1.5 p-2 bg-amber-500/10 border border-amber-500/20 rounded-xl text-[11px] text-amber-300">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>Tip: Click &quot;Auto-Resolve Link&quot; to verify the JID so clicking the tag on WhatsApp works smoothly without error.</span>
                </div>
              ) : null}
            </div>

            <div className="flex justify-between items-center pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => handleSaveChannelTag(true)}
                disabled={isSavingChannelTag}
                className="px-3 py-1.5 text-xs text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
              >
                Clear Tag & Link
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditingShareForChannel(null)}
                  className="px-3.5 py-2 text-xs text-slate-400 hover:text-white rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveChannelTag(false)}
                  disabled={isSavingChannelTag || (!channelInputName && !channelInputJid && !channelInputLink)}
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold text-xs rounded-xl transition-all cursor-pointer"
                >
                  {isSavingChannelTag ? 'Saving...' : 'Apply Tag & Link'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
