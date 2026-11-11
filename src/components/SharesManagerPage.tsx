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
  MessageSquare,
  Radio,
  Video,
  Image as ImageIcon,
  FileText,
  Music,
  Sparkles,
  Edit2,
  Tag,
  ExternalLink,
  Search,
  Plus,
  Link as LinkIcon
} from 'lucide-react';

interface ChannelInfo {
  newsletterJid: string;
  newsletterName: string;
  serverMessageId?: number;
  channelLink?: string;
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
  channelInfo?: ChannelInfo;
  channelLink?: string;
  appendChannelLink?: boolean;
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

interface SharesManagerPageProps {
  fetchWithAuth: (url: string, options?: any) => Promise<Response>;
  setFeedback: (fb: { type: 'success' | 'error'; text: string } | null) => void;
  sessionsList: any[];
}

export default function SharesManagerPage({ fetchWithAuth, setFeedback, sessionsList }: SharesManagerPageProps) {
  const [shares, setShares] = useState<CapturedShare[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [activeSessionId, setActiveSessionId] = useState<string>('primary');
  
  // Default Channel settings from User Settings
  const [defaultChannelLink, setDefaultChannelLink] = useState<string>('');
  const [defaultChannelName, setDefaultChannelName] = useState<string>('');
  
  // Forward form state per-share ID
  const [targetJidsMap, setTargetJidsMap] = useState<Record<string, string>>({});
  const [useChannelTagMap, setUseChannelTagMap] = useState<Record<string, boolean>>({});
  const [channelLinkMap, setChannelLinkMap] = useState<Record<string, string>>({});
  const [appendChannelLinkMap, setAppendChannelLinkMap] = useState<Record<string, boolean>>({});
  const [isForwardingMap, setIsForwardingMap] = useState<Record<string, boolean>>({});
  const [forwardResultsMap, setForwardResultsMap] = useState<Record<string, any[]>>({});

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

  const fetchDefaultSettings = async () => {
    try {
      const res = await fetchWithAuth('/api/settings');
      if (res.ok) {
        const data = await res.json();
        if (data.settings) {
          setDefaultChannelLink(data.settings.defaultChannelInviteLink || '');
          setDefaultChannelName(data.settings.defaultChannelName || '');
        }
      }
    } catch (e) {}
  };

  const fetchShares = async () => {
    setIsLoading(true);
    try {
      const res = await fetchWithAuth('/api/shares');
      if (res.ok) {
        const data = await res.json();
        const loadedShares = data.shares || [];
        setShares(loadedShares);

        // Initialize toggles per share
        setUseChannelTagMap(prev => {
          const updated = { ...prev };
          for (const s of loadedShares) {
            if (updated[s.id] === undefined) {
              updated[s.id] = true;
            }
          }
          return updated;
        });

        setAppendChannelLinkMap(prev => {
          const updated = { ...prev };
          for (const s of loadedShares) {
            if (updated[s.id] === undefined) {
              updated[s.id] = true;
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
    fetchShares();
    fetchDefaultSettings();
  }, []);

  const handleDeleteShare = async (id: string) => {
    // Instant optimistic removal so the card disappears right away without blocking confirm dialogs
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
      alert('Please enter a WhatsApp Channel link, JID, or Name to inspect.');
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
        if (data.channel.name) {
          setChannelInputName(data.channel.name);
        }
        if (data.channel.id) {
          setChannelInputJid(data.channel.id);
        }
        if (data.channel.channelLink || data.channel.invite) {
          setChannelInputLink(data.channel.channelLink || (data.channel.invite.startsWith('http') ? data.channel.invite : `https://whatsapp.com/channel/${data.channel.invite}`));
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
      const res = await fetchWithAuth(`/api/shares/${editingShareForChannel.id}/channel`, {
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
      alert('Please enter at least one valid Group ID or JID to forward to.');
      return;
    }

    const share = shares.find(s => s.id === shareId);
    const shouldAttachChannelTag = useChannelTagMap[shareId] !== false;
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
          appendChannelLink: shouldAppendLink
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        const channelMsg = data.channelInfo ? ` (with View Channel Tag: "${data.channelInfo.newsletterName}")` : '';
        const linkMsg = data.appendChannelLink ? ` [Link: ${data.channelLink}]` : ' [Link hidden from caption]';
        setFeedback({ type: 'success', text: `Forward dispatch complete!${channelMsg}${linkMsg}` });
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

  const handleInputChange = (shareId: string, val: string) => {
    setTargetJidsMap(prev => ({ ...prev, [shareId]: val }));
  };

  const toggleChannelTag = (shareId: string) => {
    setUseChannelTagMap(prev => ({ ...prev, [shareId]: !prev[shareId] }));
  };

  const getMediaBadge = (type?: string) => {
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
            Preserve and share WhatsApp Channel posts with all media (videos, pictures, audio, documents), markdown captions, and native <strong className="text-emerald-400">Channel Tags</strong> across all your groups.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
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
            <span>How WhatsApp Channel Tag Sharing Works</span>
          </h3>
          <p className="text-slate-400 leading-relaxed text-[11px]">
            When you forward a post from a WhatsApp Channel (or apply a Channel Tag), recipient groups see the official <strong className="text-emerald-300">Channel header pill</strong> above the video/image. Members can tap the pill to view, join, and follow your WhatsApp Channel directly.
          </p>
          <div className="flex flex-wrap gap-2 text-[10px] font-mono">
            <span className="bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20">.share [Channel Name]</span>
            <span className="bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20">.sharenow [Channel Name]</span>
          </div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800/80 p-4 rounded-xl text-xs space-y-2.5">
          <h3 className="font-bold text-slate-200 flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-emerald-400" />
            <span>Instant In-WhatsApp Broadcast</span>
          </h3>
          <ul className="text-slate-400 space-y-1 text-[11px] list-disc list-inside">
            <li>Reply <code className="text-emerald-400 font-mono">.share</code> to any channel post to save it here with its media & channel tag.</li>
            <li>Reply <code className="text-emerald-400 font-mono">.sharenow</code> to automatically broadcast the channel message to all joined groups immediately!</li>
          </ul>
        </div>
      </div>

      {/* Main Shares Container */}
      {shares.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 bg-slate-900/40 border border-dashed border-slate-800 rounded-2xl text-center space-y-3">
          <Share2 className="w-8 h-8 text-slate-600 animate-pulse" />
          <p className="text-sm font-semibold text-slate-400">No captured shares found</p>
          <p className="text-xs text-slate-500 max-w-md">
            Go to any WhatsApp chat or channel, reply <span className="font-mono text-emerald-400 font-bold">.share</span> to a post to capture it here with full media & channel tag!
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {shares.map((share) => {
            const isForwarding = isForwardingMap[share.id] || false;
            const results = forwardResultsMap[share.id] || [];
            const useChannelTag = useChannelTagMap[share.id] !== false;

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
                      {getMediaBadge(share.mediaType)}
                      
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
                      <span>Source: <strong className="text-slate-200">{share.from}</strong></span>
                      <span>•</span>
                      <span>Sender: <strong className="text-slate-200">{share.quotedSender ? share.quotedSender.split('@')[0] : 'Unknown'}</strong></span>
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

                {/* Quoted Message & Media Preview Box */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 relative overflow-hidden space-y-3">
                  <div className="flex justify-between items-center text-[10px] text-slate-500 font-mono font-semibold border-b border-slate-900 pb-1.5">
                    <span>QUOTED MEDIA & CONTENT</span>
                    {share.channelInfo && (
                      <span className="text-emerald-400 flex items-center gap-1 font-sans">
                        <Radio className="w-3 h-3" />
                        Channel pill will be shown to recipients
                      </span>
                    )}
                  </div>

                  <div className="flex gap-3">
                    <div className="w-1.5 bg-emerald-500 rounded self-stretch shrink-0"></div>
                    <div className="space-y-1.5 flex-1 min-w-0">
                      {share.channelInfo && (
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

                      <p className="text-sm text-slate-100 whitespace-pre-wrap font-sans leading-relaxed break-words">
                        {share.displayText}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Forwarding Form with Channel Tag Controls & Custom Channel Link */}
                <div className="space-y-3 bg-slate-950/50 border border-slate-800/80 p-4 rounded-xl">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                    <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                      <Forward className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Forward Destination JIDs (WhatsApp Groups)</span>
                    </label>

                    {/* Channel Tag Forward Toggle */}
                    <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={useChannelTag}
                        onChange={() => toggleChannelTag(share.id)}
                        className="w-3.5 h-3.5 rounded text-emerald-500 accent-emerald-500 cursor-pointer"
                      />
                      <span className="text-slate-300 flex items-center gap-1">
                        <Radio className="w-3 h-3 text-emerald-400" />
                        <span>Include Official Channel Banner</span>
                      </span>
                    </label>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3">
                    <input
                      type="text"
                      value={targetJidsMap[share.id] || ''}
                      onChange={(e) => handleInputChange(share.id, e.target.value)}
                      placeholder="Paste target group JIDs (e.g. 120363294321932452@g.us, ...)"
                      className="flex-1 bg-slate-950 text-white border border-slate-800 hover:border-slate-700 focus:border-emerald-500 rounded-xl px-4 py-2.5 text-xs outline-none transition-all font-mono"
                    />
                    <button
                      onClick={() => handleForwardShare(share.id)}
                      disabled={isForwarding}
                      className="flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 text-slate-950 disabled:text-slate-500 text-xs font-bold rounded-xl transition-all cursor-pointer disabled:cursor-not-allowed shrink-0"
                    >
                      <Send className={`w-3.5 h-3.5 ${isForwarding ? 'animate-bounce' : ''}`} />
                      <span>{isForwarding ? 'Broadcasting...' : 'Forward Message'}</span>
                    </button>
                  </div>

                  {/* Channel Link Option for this Forward */}
                  <div className="pt-2.5 border-t border-slate-850 space-y-2">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-1.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <LinkIcon className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-[11px] font-semibold text-slate-300">Channel Link for "View Channel" Tag</span>
                        <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                          Tag Active • Link Hidden in Caption
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
                      placeholder={defaultChannelLink ? `Default: ${defaultChannelLink}` : "e.g. https://whatsapp.com/channel/0029Va.../123 (or leave empty to use default)"}
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
                        ✨ Native "View Channel" header tag active on WhatsApp • Link hidden from caption
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
                                <span>Sent with Channel Tag & Link</span>
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
