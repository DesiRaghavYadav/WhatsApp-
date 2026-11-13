import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import WorkflowsBuilderPage from './components/WorkflowsBuilderPage';
import ListFlowStudioPage from './components/ListFlowStudioPage';
import LeadsHubPage from './components/LeadsHubPage';
import SharesManagerPage from './components/SharesManagerPage';
import StatusBroadcastPage from './components/StatusBroadcastPage';
import { QueueManagerPage } from './components/QueueManagerPage';
import { FirestoreStatusCard } from './components/FirestoreStatusCard';
import GroupInvitesManagerPage from './components/GroupInvitesManagerPage';
import LiveQrScannerPage from './components/LiveQrScannerPage';
import { 
  Send, 
  QrCode, 
  CheckCircle, 
  AlertCircle, 
  RefreshCw, 
  Phone, 
  MessageSquare, 
  LogOut, 
  FileText, 
  Terminal, 
  Wifi, 
  WifiOff,
  User,
  Info,
  Clock,
  Check,
  X,
  Plus,
  Trash2,
  Sparkles,
  Link2,
  Smartphone,
  Maximize2,
  Eye,
  MoreVertical,
  Layers,
  Zap,
  Bookmark,
  ExternalLink,
  Users,
  Paperclip,
  Ban,
  ImageIcon,
  Video,
  FileCode,
  UploadCloud,
  Copy,
  Sliders,
  Activity,
  PlusCircle,
  Server,
  Settings,
  ShieldAlert,
  ChevronDown,
  Lock,
  UserPlus,
  BarChart3,
  List,
  HardDrive,
  Globe,
  Share2,
  Forward,
  Menu,
  Play,
  Pause,
  ArrowUp,
  ArrowDown,
  Search,
  Save,
  Code,
  Gauge,
  Edit2,
  Target,
  Smile,
  Radio
} from 'lucide-react';

import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';

interface ConnectionLog {
  id: string;
  timestamp: string;
  message: string;
  type: 'info' | 'error' | 'success';
}

interface QrSessionHistoryItem {
  id: string;
  sessionId: string;
  sessionName: string;
  qrBase64?: string | null;
  pairingCode?: string | null;
  timestamp: string;
  hasSavedCredentials?: boolean;
  userName?: string | null;
}

interface SentMessage {
  id: string;
  phoneNumber: string;
  message: string;
  timestamp: string;
  status: 'sent' | 'failed';
  error?: string;
}

interface LiveLinkPreview {
  title: string;
  description: string;
  canonicalUrl: string;
  matchedText: string;
  imageUrl?: string;
  thumbnailBase64?: string;
}

interface QuickTemplate {
  id: string;
  title: string;
  text: string;
  category: 'Sales' | 'Support' | 'Alert' | 'Utility';
  msgType?: 'text' | 'buttons' | 'template' | 'navi-template';
  attachmentType?: 'none' | 'image' | 'video' | 'pdf' | 'doc';
  attachmentSource?: 'preset' | 'url' | 'upload';
  attachmentUrl?: string;
  inlineAttachment?: boolean;
  buttons?: ButtonItem[];
  templateButtons?: TemplateButtonItem[];
  footer?: string;
}

const DEFAULT_TEMPLATES: QuickTemplate[] = [
  { id: 't1', title: 'Welcome Greeting', text: 'Hello! Thank you for connecting with us. How can we assist you today? 😊', category: 'Utility' },
  { id: 't2', title: 'Payment Reminder', text: 'Hi! This is a friendly reminder that invoice #1042 is due. Please process it to avoid service disruption.', category: 'Alert' },
  { id: 't3', title: 'Order Dispatched', text: 'Great news! Your package has been handed over to our courier. You can track it using the details provided below.', category: 'Sales' },
  { id: 't4', title: 'Support Follow-up', text: 'Thank you for contacting our customer care! Your ticket has been marked resolved. Have an amazing day!', category: 'Support' },
  { 
    id: 't5', 
    title: '📄 Invoice PDF + Pay Button', 
    text: 'Hi there!\n\nYour monthly premium invoice from Navi has been generated. Please review the attached PDF document and complete the payment using the secure link below.', 
    category: 'Alert',
    msgType: 'template',
    attachmentType: 'pdf',
    attachmentSource: 'preset',
    inlineAttachment: true,
    footer: 'Navi Billing Secure Service',
    templateButtons: [
      { type: 'url', text: '💳 Pay Invoice', url: 'https://ai.studio/build' },
      { type: 'call', text: '📞 Support Helpline', phoneNumber: '+1234567890' },
      { type: 'quickReply', text: 'Learn More', id: 'invoice-help' }
    ]
  },
  { 
    id: 't6', 
    title: '🎬 Feature Video + Join Beta', 
    text: 'Hello!\n\nWe are excited to share a short video demonstration of the all-new Navi App features. Check it out and click below to join the beta program.', 
    category: 'Sales',
    msgType: 'template',
    attachmentType: 'video',
    attachmentSource: 'preset',
    inlineAttachment: true,
    footer: 'Navi Product Team',
    templateButtons: [
      { type: 'url', text: '🚀 Join Beta', url: 'https://ai.studio/build' },
      { type: 'quickReply', text: '❓ View FAQs', id: 'faq-help' }
    ]
  },
  { 
    id: 't7', 
    title: '🖼️ Marketing Promo + 3 Actions', 
    text: 'Good News!\n\nYou have been selected for an exclusive 30% discount on all custom plans at Navi. Take advantage of this limited-time offer today!', 
    category: 'Sales',
    msgType: 'buttons',
    attachmentType: 'image',
    attachmentSource: 'preset',
    inlineAttachment: true,
    footer: 'Navi Promotions Group',
    buttons: [
      { id: 'accept-discount', text: '🎉 Claim 30% Off' },
      { id: 'remind-discount', text: '⏰ Remind Me Later' },
      { id: 'opt-out-discount', text: 'No, thanks' }
    ]
  },
  { 
    id: 't8', 
    title: '📋 Feedback Survey + Image Header', 
    text: 'We value your experience! Please rate your recent interaction with our engineering support by using the options below.', 
    category: 'Support',
    msgType: 'buttons',
    attachmentType: 'image',
    attachmentSource: 'preset',
    inlineAttachment: true,
    footer: 'Navi Quality Assurance',
    buttons: [
      { id: 'feedback-excellent', text: '⭐⭐⭐⭐⭐ Excellent' },
      { id: 'feedback-good', text: '⭐⭐⭐ Average' },
      { id: 'feedback-poor', text: '⭐ Needs Work' }
    ]
  },
  { 
    id: 't9', 
    title: '📁 Catalog Doc + Download Link', 
    text: 'Hi!\n\nWe have attached our latest product catalog document. Open it to find our special summer offerings and click the button to book a personal consult.', 
    category: 'Sales',
    msgType: 'template',
    attachmentType: 'doc',
    attachmentSource: 'preset',
    inlineAttachment: true,
    footer: 'Navi Catalog Service',
    templateButtons: [
      { type: 'url', text: '📅 Book Consult', url: 'https://ai.studio/build' },
      { type: 'quickReply', text: 'Contact Agent', id: 'contact-agent-id' }
    ]
  },
  {
    id: 't10',
    title: '⚠️ Service Alert + Option Buttons',
    text: 'ATTENTION: Scheduled system maintenance will begin in 2 hours. Click below to view the downtime map or contact the sysadmin.',
    category: 'Alert',
    msgType: 'template',
    attachmentType: 'none',
    footer: 'Navi Operations Center',
    templateButtons: [
      { type: 'url', text: '🗺️ Maintenance Map', url: 'https://ai.studio/build' },
      { type: 'quickReply', text: 'Acknowledge Alert', id: 'ack-maint' }
    ]
  }
];

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

export default function App() {
  // Navigation View State
  const [currentView, setCurrentView] = useState<'dispatch' | 'workflows' | 'analytics' | 'lists' | 'leads' | 'settings' | 'shares' | 'group-invites' | 'queue-manager' | 'status' | 'scan'>(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('view') === 'scan' || window.location.pathname.startsWith('/scan') || window.location.pathname.startsWith('/live-qr')) {
      return 'scan';
    }
    return 'dispatch';
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  
  // User Authentication State (Supports url token parameter e.g. for live scanner page opened on another phone)
  const [token, setToken] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('token');
    if (urlToken) {
      localStorage.setItem('wa_auth_token', urlToken);
      return urlToken;
    }
    return localStorage.getItem('wa_auth_token');
  });
  const [username, setUsername] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    const urlUser = params.get('user') || params.get('username');
    if (urlUser) {
      localStorage.setItem('wa_username', urlUser);
      return urlUser;
    }
    return localStorage.getItem('wa_username');
  });
  const [isLoginMode, setIsLoginMode] = useState<boolean>(true);
  const [authUsernameInput, setAuthUsernameInput] = useState<string>('');
  const [authPasswordInput, setAuthPasswordInput] = useState<string>('');
  const [authFeedback, setAuthFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState<boolean>(false);
  const [isClearingCache, setIsClearingCache] = useState<boolean>(false);

  // Settings & Group Invites State
  const [secretPrefix, setSecretPrefix] = useState<string>('.');
  const [disableTextProcessing, setDisableTextProcessing] = useState<boolean>(false);
  const [shareBatchSize, setShareBatchSize] = useState<number>(5);
  const [shareBatchPauseSeconds, setShareBatchPauseSeconds] = useState<number>(10);
  const [defaultChannelJid, setDefaultChannelJid] = useState<string>('');
  const [defaultChannelName, setDefaultChannelName] = useState<string>('');
  const [defaultChannelInviteLink, setDefaultChannelInviteLink] = useState<string>('');
  const [autoAttachChannelTag, setAutoAttachChannelTag] = useState<boolean>(false);
  const [appendChannelLinkToShare, setAppendChannelLinkToShare] = useState<boolean>(false);
  const [showForwardedTagOnShare, setShowForwardedTagOnShare] = useState<boolean>(true);
  const [followedChannels, setFollowedChannels] = useState<any[]>([]);
  const [isLoadingFollowedChannels, setIsLoadingFollowedChannels] = useState<boolean>(false);
  const [isVerifyingChannel, setIsVerifyingChannel] = useState<boolean>(false);
  const [globalBlockedGroups, setGlobalBlockedGroups] = useState<string[]>([]);
  const [blockedInput, setBlockedInput] = useState<string>('');
  const [isSavingBlocked, setIsSavingBlocked] = useState<boolean>(false);
  const [capturedGroupInvites, setCapturedGroupInvites] = useState<any[]>([]);
  const [isLoadingCapturedGroups, setIsLoadingCapturedGroups] = useState<boolean>(false);
  const [isSavingSettings, setIsSavingSettings] = useState<boolean>(false);
  const [serverResources, setServerResources] = useState<any>(null);

  // Reusable Permanent Saved 4-Digit Codes State
  const [savedCodes, setSavedCodes] = useState<any[]>([]);
  const [saveCodeInput, setSaveCodeInput] = useState<string>('');
  const [isSavingCode, setIsSavingCode] = useState<boolean>(false);

  // Reusable Draft Message Templates State (Usable across accounts)
  const [draftsList, setDraftsList] = useState<any[]>([]);
  const [draftNameInput, setDraftNameInput] = useState<string>('');
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [isSavingDraft, setIsSavingDraft] = useState<boolean>(false);

  // Delivery Analytics State
  const [dailyLimitCap, setDailyLimitCap] = useState<number>(() => {
    const saved = localStorage.getItem('wa_daily_limit_cap');
    return saved ? parseInt(saved, 10) || 1000 : 1000;
  });
  const [isEditingCap, setIsEditingCap] = useState<boolean>(false);
  const [capInput, setCapInput] = useState<string>('1000');

  const [analyticsData, setAnalyticsData] = useState<any>({
    summary: { totalSent: 0, totalFailed: 0, todaySent: 0, todayFailed: 0, todayTotal: 0, queuePending: 0, queueProcessing: 0, avgSpeedSeconds: 2, loadPercentage: 0 },
    dailyTrend: [],
    sessionsLoad: []
  });
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState<boolean>(false);

  // Authenticated fetch wrapper
  const fetchWithAuth = async (url: string, options: any = {}) => {
    const activeToken = token || localStorage.getItem('wa_auth_token');
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
      ...(activeToken ? { 'Authorization': `Bearer ${activeToken}` } : {})
    };
    const res = await fetch(url, { ...options, headers });
    if (res.status === 401) {
      localStorage.removeItem('wa_auth_token');
      localStorage.removeItem('wa_username');
      setToken(null);
      setUsername(null);
    }
    return res;
  };
  
  // Workflows Automation State
  const [workflowsList, setWorkflowsList] = useState<WorkflowRule[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [isSavingWorkflows, setIsSavingWorkflows] = useState<boolean>(false);

  // Connection and Authentication State
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [activePairingCode, setActivePairingCode] = useState<string | null>(null);
  const [linkMode, setLinkMode] = useState<'qr' | 'pairing'>('qr');
  const [showSessionHelp, setShowSessionHelp] = useState<boolean>(false);
  const [pairingPhone, setPairingPhone] = useState<string>('');
  const [isRequestingCode, setIsRequestingCode] = useState<boolean>(false);
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [connected, setConnected] = useState<boolean>(false);
  const [user, setUser] = useState<{ id: string; name: string } | null>(null);
  const [logs, setLogs] = useState<ConnectionLog[]>([]);
  const [sentHistory, setSentHistory] = useState<SentMessage[]>([]);
  const [serverOnline, setServerOnline] = useState<boolean>(true);

  // Multi-Session state
  const [sessionsList, setSessionsList] = useState<any[]>([]);
  const sessionsListRef = useRef<any[]>([]);
  const connectingStartTimesRef = useRef<Record<string, number>>({});
  const autoReconnectingSessionsRef = useRef<Record<string, boolean>>({});

  useEffect(() => {
    sessionsListRef.current = sessionsList;
  }, [sessionsList]);
  const [selectedSessionIds, setSelectedSessionIds] = useState<string[]>(['primary']);
  const [newSessionId, setNewSessionId] = useState<string>('');
  const [newSessionName, setNewSessionName] = useState<string>('');
  const [isCreatingSession, setIsCreatingSession] = useState<boolean>(false);
  const [showSessionModal, setShowSessionModal] = useState<boolean>(false);
  const [activeLinkSessionId, setActiveLinkSessionId] = useState<string>('primary');

  // QR Session History state
  const [qrHistory, setQrHistory] = useState<QrSessionHistoryItem[]>(() => {
    try {
      const saved = localStorage.getItem('navi_qr_session_history');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error('Failed to parse saved QR session history', e);
    }
    return [];
  });
  const [previewQrModal, setPreviewQrModal] = useState<QrSessionHistoryItem | null>(null);
  const [qrHistorySearch, setQrHistorySearch] = useState<string>('');

  // Explicitly record QR session history when login attempt is made or when session connects
  const recordAttemptedQr = (sess: any) => {
    if (!sess || (!sess.qrBase64 && !sess.pairingCode && !sess.hasSavedCredentials && sess.status !== 'connected')) return;
    setQrHistory((prevHistory) => {
      const existing = prevHistory.find(
        (h) =>
          h.sessionId === sess.id &&
          ((sess.qrBase64 && h.qrBase64 === sess.qrBase64) ||
            (sess.pairingCode && h.pairingCode === sess.pairingCode) ||
            (sess.status === 'connected' && h.status === 'connected'))
      );
      if (existing) return prevHistory;

      const newItem: QrSessionHistoryItem = {
        id: `qrhist_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        sessionId: sess.id,
        sessionName: sess.name || sess.id,
        qrBase64: sess.qrBase64 || null,
        pairingCode: sess.pairingCode || null,
        timestamp: new Date().toISOString(),
        hasSavedCredentials: !!sess.hasSavedCredentials,
        userName: sess.user?.name || null
      };
      const updated = [newItem, ...prevHistory].slice(0, 30);
      try {
        localStorage.setItem('navi_qr_session_history', JSON.stringify(updated));
      } catch (e) {
        console.error('Failed to save QR session history', e);
      }
      return updated;
    });
  };

  // Automatically capture ONLY successfully logged in or connected sessions into QR Session History
  useEffect(() => {
    if (!Array.isArray(sessionsList) || sessionsList.length === 0) return;

    setQrHistory((prevHistory) => {
      let updated = [...prevHistory];
      let changed = false;

      for (const sess of sessionsList) {
        if (sess.status !== 'connected' && !sess.hasSavedCredentials) continue;

        const existing = updated.find(
          (h) => h.sessionId === sess.id && (h.userName === sess.user?.name || h.hasSavedCredentials === sess.hasSavedCredentials)
        );

        if (!existing) {
          changed = true;
          const newItem: QrSessionHistoryItem = {
            id: `qrhist_${Date.now()}_${Math.random().toString(36).substring(7)}`,
            sessionId: sess.id,
            sessionName: sess.name || sess.id,
            qrBase64: sess.qrBase64 || null,
            pairingCode: sess.pairingCode || null,
            timestamp: new Date().toISOString(),
            hasSavedCredentials: !!sess.hasSavedCredentials,
            userName: sess.user?.name || null
          };
          updated = [newItem, ...updated].slice(0, 30);
        }
      }

      if (changed) {
        try {
          localStorage.setItem('navi_qr_session_history', JSON.stringify(updated));
        } catch (e) {
          console.error('Failed to save QR session history', e);
        }
        return updated;
      }
      return prevHistory;
    });
  }, [sessionsList]);

  // Saved groups state
  const [savedGroups, setSavedGroups] = useState<any[]>([]);
  const [isSyncingGroups, setIsSyncingGroups] = useState<boolean>(false);
  const [groupFilter, setGroupFilter] = useState<'all' | 'canSend' | 'onlyAdmin'>('all');
  const [logFilterQuery, setLogFilterQuery] = useState<string>('');
  const [autoScrollLogs, setAutoScrollLogs] = useState<boolean>(true);

  // Group Member Extractor Modal State
  const [showMembersExtractor, setShowMembersExtractor] = useState<boolean>(false);
  const [extractorTarget, setExtractorTarget] = useState<'individual' | 'filtered' | 'all'>('all');
  const [extractorGroupJid, setExtractorGroupJid] = useState<string>('');
  const [isBulkSavingLeads, setIsBulkSavingLeads] = useState<boolean>(false);

  // Queue state
  const [queueItems, setQueueItems] = useState<any[]>([]);
  const [pausedSessions, setPausedSessions] = useState<string[]>([]);
  const [isProcessingQueueState, setIsProcessingQueueState] = useState<boolean>(false);
  const [globalDelaySecondsState, setGlobalDelaySecondsState] = useState<number>(2);

  // Multi-recipient state
  const [splitByCommas, setSplitByCommas] = useState<boolean>(true);
  const [tagGroupMembers, setTagGroupMembers] = useState<boolean>(false);

  // Form State
  const [phoneNumber, setPhoneNumber] = useState<string>('');
  const [message, setMessage] = useState<string>('');
  const [isSending, setIsSending] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [scheduledAt, setScheduledAt] = useState<string>('');
  const [isTemplatePreviewOpen, setIsTemplatePreviewOpen] = useState<boolean>(false);
  const [previewLogs, setPreviewLogs] = useState<string[]>([]);

  // Live Auto Link Preview States
  const [liveLinkPreview, setLiveLinkPreview] = useState<LiveLinkPreview | null>(null);
  const [isLoadingLinkPreview, setIsLoadingLinkPreview] = useState<boolean>(false);
  const [dismissedLinkUrl, setDismissedLinkUrl] = useState<string>('');

  useEffect(() => {
    const urlRegex = /(https?:\/\/[^\s]+)/i;
    const match = message.match(urlRegex);
    if (!match) {
      setLiveLinkPreview(null);
      return;
    }

    const detectedUrl = match[0].replace(/[.,;!?)]+$/, '');

    if (dismissedLinkUrl === detectedUrl) {
      return;
    }

    const timer = setTimeout(async () => {
      setIsLoadingLinkPreview(true);
      try {
        const activeToken = token || localStorage.getItem('wa_auth_token');
        const res = await fetch('/api/fetch-link-preview', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${activeToken}`
          },
          body: JSON.stringify({ url: detectedUrl })
        });
        const data = await res.json();
        if (data.success && data.preview) {
          setLiveLinkPreview(data.preview);
        } else {
          setLiveLinkPreview(null);
        }
      } catch (err) {
        console.error('Failed to fetch link preview:', err);
      } finally {
        setIsLoadingLinkPreview(false);
      }
    }, 450);

    return () => clearTimeout(timer);
  }, [message, dismissedLinkUrl, token]);

  // Advanced Message Type State
  const [msgType, setMsgType] = useState<'navi-template' | 'text' | 'buttons' | 'template'>('navi-template');
  const [footerText, setFooterText] = useState<string>('Sent via WhatsApp Bridge');
  const [useLegacy, setUseLegacy] = useState<boolean>(true);

  // Multi-Message Sequence State & Timer Slider State
  const [messagesSequence, setMessagesSequence] = useState<Array<{
    id: string;
    text: string;
    msgType?: 'text' | 'buttons' | 'template';
    attachmentType?: 'none' | 'image' | 'video' | 'pdf' | 'doc';
    attachmentSource?: 'url' | 'upload';
    attachmentUrl?: string;
    attachmentData?: string;
    attachmentName?: string;
    buttons?: ButtonItem[];
    templateButtons?: TemplateButtonItem[];
    showMediaConfig?: boolean;
    showButtonsConfig?: boolean;
  }>>([
    { id: 'msg-1', text: '', attachmentType: 'none', buttons: [], templateButtons: [] }
  ]);
  const [interMessageDelaySeconds, setInterMessageDelaySeconds] = useState<number>(3);

  const handleAddMessage = () => {
    setMessagesSequence(prev => [
      ...prev,
      {
        id: `msg-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        text: '',
        attachmentType: 'none',
        attachmentSource: 'url',
        attachmentUrl: '',
        attachmentData: '',
        attachmentName: '',
        buttons: [],
        templateButtons: [],
        showMediaConfig: false,
        showButtonsConfig: false
      }
    ]);
  };

  const handleRemoveMessage = (index: number) => {
    if (messagesSequence.length <= 1) return;
    setMessagesSequence(prev => {
      const updated = prev.filter((_, i) => i !== index);
      if (updated[0]) {
        setMessage(updated[0].text);
      }
      return updated;
    });
  };

  const handleSequenceFieldChange = (index: number, field: string, value: any) => {
    setMessagesSequence(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      if (index === 0 && field === 'text') {
        setMessage(value);
      }
      return updated;
    });
  };

  const handleSequenceAddButton = (index: number) => {
    setMessagesSequence(prev => {
      const updated = [...prev];
      const current = updated[index];
      const currentBtns = current.buttons || [];
      if (currentBtns.length >= 3) return prev;
      const nextId = `btn-${Date.now()}-${Math.random().toString(36).substring(7)}`;
      updated[index] = {
        ...current,
        buttons: [...currentBtns, { id: nextId, text: 'Custom Button' }]
      };
      return updated;
    });
  };

  const handleSequenceUpdateButtonText = (msgIndex: number, btnIndex: number, text: string) => {
    setMessagesSequence(prev => {
      const updated = [...prev];
      const current = updated[msgIndex];
      const buttons = [...(current.buttons || [])];
      buttons[btnIndex] = { ...buttons[btnIndex], text };
      updated[msgIndex] = { ...current, buttons };
      return updated;
    });
  };

  const handleSequenceRemoveButton = (msgIndex: number, btnIndex: number) => {
    setMessagesSequence(prev => {
      const updated = [...prev];
      const current = updated[msgIndex];
      const buttons = (current.buttons || []).filter((_, i) => i !== btnIndex);
      updated[msgIndex] = { ...current, buttons };
      return updated;
    });
  };

  const handleSequenceAddTemplateButton = (msgIndex: number, type: 'url' | 'call' | 'quickReply') => {
    setMessagesSequence(prev => {
      const updated = [...prev];
      const current = updated[msgIndex];
      const currentTmplBtns = current.templateButtons || [];
      if (currentTmplBtns.length >= 3) return prev;
      let newBtn: TemplateButtonItem;
      if (type === 'url') {
        newBtn = { type: 'url', text: 'Visit Link', url: 'https://ai.studio/build' };
      } else if (type === 'call') {
        newBtn = { type: 'call', text: 'Call Support', phoneNumber: '+1234567890' };
      } else {
        newBtn = { type: 'quickReply', text: 'Quick Reply', id: `qr-${Date.now()}` };
      }
      updated[msgIndex] = {
        ...current,
        templateButtons: [...currentTmplBtns, newBtn]
      };
      return updated;
    });
  };

  const handleSequenceUpdateTemplateButton = (msgIndex: number, btnIndex: number, field: string, val: string) => {
    setMessagesSequence(prev => {
      const updated = [...prev];
      const current = updated[msgIndex];
      const tmplBtns = [...(current.templateButtons || [])];
      tmplBtns[btnIndex] = { ...tmplBtns[btnIndex], [field]: val };
      updated[msgIndex] = { ...current, templateButtons: tmplBtns };
      return updated;
    });
  };

  const handleSequenceRemoveTemplateButton = (msgIndex: number, btnIndex: number) => {
    setMessagesSequence(prev => {
      const updated = [...prev];
      const current = updated[msgIndex];
      const tmplBtns = (current.templateButtons || []).filter((_, i) => i !== btnIndex);
      updated[msgIndex] = { ...current, templateButtons: tmplBtns };
      return updated;
    });
  };

  const handleSequenceFileUpload = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const base64Data = evt.target?.result as string;
      let type: 'image' | 'video' | 'pdf' | 'doc' = 'doc';
      if (file.type.startsWith('image/')) type = 'image';
      else if (file.type.startsWith('video/')) type = 'video';
      else if (file.type.includes('pdf')) type = 'pdf';

      setMessagesSequence(prev => {
        const updated = [...prev];
        updated[index] = {
          ...updated[index],
          attachmentType: type,
          attachmentSource: 'upload',
          attachmentName: file.name,
          attachmentData: base64Data
        };
        return updated;
      });
    };
    reader.readAsDataURL(file);
  };

  const buildFormattedSequence = () => {
    return messagesSequence
      .filter(m => (m.text && m.text.trim()) || (m.attachmentType && m.attachmentType !== 'none') || (m.buttons && m.buttons.length > 0) || (m.templateButtons && m.templateButtons.length > 0))
      .map((m, idx) => {
        const itemMsgType = m.msgType || (m.templateButtons && m.templateButtons.length > 0 ? 'template' : (m.buttons && m.buttons.length > 0 ? 'buttons' : msgType));
        
        const itemAttachType = (m.attachmentType && m.attachmentType !== 'none') 
          ? m.attachmentType 
          : (idx === 0 ? attachmentType : 'none');
        
        const itemAttachUrl = m.attachmentUrl 
          ? m.attachmentUrl 
          : (idx === 0 ? (attachmentSource === 'preset' || attachmentSource === 'url' ? attachmentUrl : undefined) : undefined);
        
        const itemAttachData = m.attachmentData 
          ? m.attachmentData 
          : (idx === 0 ? (attachmentSource === 'upload' ? attachmentData : undefined) : undefined);
        
        const itemAttachName = m.attachmentName 
          ? m.attachmentName 
          : (idx === 0 ? (attachmentSource === 'upload' ? attachmentName : undefined) : undefined);

        const itemButtons = (m.buttons && m.buttons.length > 0) 
          ? m.buttons 
          : (itemMsgType === 'buttons' ? customButtons : undefined);
        
        const itemTemplateButtons = (m.templateButtons && m.templateButtons.length > 0) 
          ? m.templateButtons 
          : (itemMsgType === 'template' ? templateButtons : undefined);

        return {
          message: (m.text || '').trim(),
          msgType: itemMsgType,
          footer: footerText,
          buttons: itemButtons,
          templateButtons: itemTemplateButtons,
          attachmentType: itemAttachType,
          attachmentUrl: itemAttachUrl,
          attachmentData: itemAttachData,
          attachmentName: itemAttachName,
          inlineAttachment: true,
          customDelaySeconds: interMessageDelaySeconds
        };
      });
  };

  // Group and Attachment States
  const [recipientType, setRecipientType] = useState<'individual' | 'group'>('individual');
  const [attachmentType, setAttachmentType] = useState<'none' | 'image' | 'video' | 'pdf' | 'doc'>('none');
  const [attachmentSource, setAttachmentSource] = useState<'preset' | 'url' | 'upload'>('preset');
  const [attachmentUrl, setAttachmentUrl] = useState<string>('');
  const [attachmentData, setAttachmentData] = useState<string>('');
  const [attachmentName, setAttachmentName] = useState<string>('');
  const [inlineAttachment, setInlineAttachment] = useState<boolean>(true);

  const PRESET_URLS = {
    image: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800',
    video: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    pdf: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
    doc: 'https://calibre-ebook.com/downloads/demos/demo.docx'
  };

  useEffect(() => {
    if (attachmentSource === 'preset') {
      if (attachmentType === 'image') setAttachmentUrl(PRESET_URLS.image);
      else if (attachmentType === 'video') setAttachmentUrl(PRESET_URLS.video);
      else if (attachmentType === 'pdf') setAttachmentUrl(PRESET_URLS.pdf);
      else if (attachmentType === 'doc') setAttachmentUrl(PRESET_URLS.doc);
      else setAttachmentUrl('');
    }
  }, [attachmentType, attachmentSource]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (file.size > 10 * 1024 * 1024) {
      setFeedback({ type: 'error', text: 'File is too large. Please select a file smaller than 10MB.' });
      return;
    }

    setAttachmentName(file.name);
    
    const reader = new FileReader();
    reader.onload = () => {
      const base64String = reader.result as string;
      setAttachmentData(base64String);
      setFeedback({ type: 'success', text: `File "${file.name}" loaded successfully and ready to send!` });
    };
    reader.onerror = () => {
      setFeedback({ type: 'error', text: 'Error reading local file.' });
    };
    reader.readAsDataURL(file);
  };
  
  // Custom interactive buttons (Up to 3)
  const [customButtons, setCustomButtons] = useState<ButtonItem[]>([
    { id: 'yes', text: 'Yes, absolutely!' },
    { id: 'no', text: 'No, thank you.' }
  ]);

  // Template buttons (Up to 3)
  const [templateButtons, setTemplateButtons] = useState<TemplateButtonItem[]>([
    { type: 'url', text: 'Visit Website', url: 'https://ai.studio/build' },
    { type: 'call', text: 'Call Hotline', phoneNumber: '+1234567890' },
    { type: 'quickReply', text: 'Learn More', id: 'learn-more-id' }
  ]);

  // Quick Templates State (Saved in LocalStorage)
  const [quickTemplates, setQuickTemplates] = useState<QuickTemplate[]>([]);
  const [newTemplateTitle, setNewTemplateTitle] = useState<string>('');
  const [newTemplateText, setNewTemplateText] = useState<string>('');
  const [newTemplateCat, setNewTemplateCat] = useState<'Sales' | 'Support' | 'Alert' | 'Utility'>('Utility');
  const [showTemplateModal, setShowTemplateModal] = useState<boolean>(false);
  const [newTemplateMsgType, setNewTemplateMsgType] = useState<'text' | 'buttons' | 'template'>('text');
  const [newTemplateFooter, setNewTemplateFooter] = useState<string>('');
  const [newTemplateAttachType, setNewTemplateAttachType] = useState<'none' | 'image' | 'video' | 'pdf' | 'doc'>('none');
  const [newTemplateAttachUrl, setNewTemplateAttachUrl] = useState<string>('');
  const [newTemplateButtons, setNewTemplateButtons] = useState<ButtonItem[]>([
    { id: 'yes', text: 'Yes, absolutely!' }
  ]);
  const [newTemplateTmplButtons, setNewTemplateTmplButtons] = useState<TemplateButtonItem[]>([
    { type: 'url', text: 'Visit Link', url: 'https://ai.studio/build' }
  ]);

  // UI States
  const [activeTab, setActiveTab] = useState<'history' | 'logs'>('history');
  const [isResetting, setIsResetting] = useState<boolean>(false);
  
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const terminalContainerRef = useRef<HTMLDivElement>(null);

  // Load Quick Templates from LocalStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('wa_quick_templates');
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as QuickTemplate[];
        // If the saved templates only consist of the old 4 templates, upgrade them to show the new ones too
        if (parsed.length <= 4) {
          setQuickTemplates(DEFAULT_TEMPLATES);
          localStorage.setItem('wa_quick_templates', JSON.stringify(DEFAULT_TEMPLATES));
        } else {
          setQuickTemplates(parsed);
        }
      } catch (e) {
        setQuickTemplates(DEFAULT_TEMPLATES);
      }
    } else {
      setQuickTemplates(DEFAULT_TEMPLATES);
      localStorage.setItem('wa_quick_templates', JSON.stringify(DEFAULT_TEMPLATES));
    }
  }, []);

  // Save templates helper
  const saveTemplates = (updated: QuickTemplate[]) => {
    setQuickTemplates(updated);
    localStorage.setItem('wa_quick_templates', JSON.stringify(updated));
  };

  const fetchWorkflows = async () => {
    try {
      const res = await fetchWithAuth('/api/workflows');
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.workflows)) {
          setWorkflowsList(data.workflows);
          if (data.workflows.length > 0 && !selectedWorkflowId) {
            setSelectedWorkflowId(data.workflows[0].id);
          }
        }
      }
    } catch (e) {
      console.error('Error fetching workflows:', e);
    }
  };

  const fetchSettings = async () => {
    try {
      const res = await fetchWithAuth('/api/settings');
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.settings) {
          setSecretPrefix(data.settings.secretPrefix || '.');
          setDisableTextProcessing(!!data.settings.disableTextProcessing);
          setShareBatchSize(data.settings.shareBatchSize || 5);
          setShareBatchPauseSeconds(data.settings.shareBatchPauseSeconds || 10);
          setDefaultChannelJid(data.settings.defaultChannelJid || '');
          setDefaultChannelName(data.settings.defaultChannelName || '');
          setDefaultChannelInviteLink(data.settings.defaultChannelInviteLink || '');
          setAutoAttachChannelTag(!!data.settings.autoAttachChannelTag);
          setAppendChannelLinkToShare(!!data.settings.appendChannelLinkToShare);
          setShowForwardedTagOnShare(data.settings.showForwardedTagOnShare !== undefined ? !!data.settings.showForwardedTagOnShare : true);
        }
      }
    } catch (e) {
      console.error('Error fetching settings:', e);
    }
  };

  const saveSettings = async (
    prefix: string, 
    disableText: boolean, 
    batchSize: number, 
    pauseSec: number,
    channelJid?: string,
    channelName?: string,
    autoAttach?: boolean,
    channelInviteLink?: string,
    appendLink?: boolean,
    showForwardedTag?: boolean
  ) => {
    setIsSavingSettings(true);
    try {
      const res = await fetchWithAuth('/api/settings', {
        method: 'POST',
        body: JSON.stringify({ 
          secretPrefix: prefix, 
          disableTextProcessing: disableText,
          shareBatchSize: batchSize,
          shareBatchPauseSeconds: pauseSec,
          defaultChannelJid: channelJid !== undefined ? channelJid : defaultChannelJid,
          defaultChannelName: channelName !== undefined ? channelName : defaultChannelName,
          defaultChannelInviteLink: channelInviteLink !== undefined ? channelInviteLink : defaultChannelInviteLink,
          autoAttachChannelTag: autoAttach !== undefined ? autoAttach : autoAttachChannelTag,
          appendChannelLinkToShare: appendLink !== undefined ? appendLink : appendChannelLinkToShare,
          showForwardedTagOnShare: showForwardedTag !== undefined ? showForwardedTag : showForwardedTagOnShare
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSecretPrefix(data.settings.secretPrefix);
        setDisableTextProcessing(!!data.settings.disableTextProcessing);
        setShareBatchSize(data.settings.shareBatchSize);
        setShareBatchPauseSeconds(data.settings.shareBatchPauseSeconds);
        setDefaultChannelJid(data.settings.defaultChannelJid || '');
        setDefaultChannelName(data.settings.defaultChannelName || '');
        setDefaultChannelInviteLink(data.settings.defaultChannelInviteLink || '');
        setAutoAttachChannelTag(!!data.settings.autoAttachChannelTag);
        setAppendChannelLinkToShare(!!data.settings.appendChannelLinkToShare);
        setShowForwardedTagOnShare(data.settings.showForwardedTagOnShare !== undefined ? !!data.settings.showForwardedTagOnShare : true);
        setFeedback({ type: 'success', text: 'Settings updated successfully!' });
      } else {
        setFeedback({ type: 'error', text: data.error || 'Failed to save settings.' });
      }
    } catch (e) {
      setFeedback({ type: 'error', text: 'Network error saving settings.' });
    } finally {
      setIsSavingSettings(false);
    }
  };

  const fetchFollowedChannels = async () => {
    setIsLoadingFollowedChannels(true);
    try {
      const res = await fetchWithAuth('/api/channels');
      if (res.ok) {
        const data = await res.json();
        const chs = data.channels || [];
        setFollowedChannels(chs);
        if (chs.length > 0) {
          setFeedback({ type: 'success', text: `Loaded ${chs.length} WhatsApp channel(s) from connected session.` });
        } else {
          setFeedback({ type: 'error', text: 'No followed channels found. You can paste your channel link directly.' });
        }
      }
    } catch (e: any) {
      setFeedback({ type: 'error', text: 'Failed to fetch channels: ' + e.message });
    } finally {
      setIsLoadingFollowedChannels(false);
    }
  };

  const handleVerifyChannel = async () => {
    const candidate = defaultChannelInviteLink.trim() || defaultChannelJid.trim() || defaultChannelName.trim();
    if (!candidate) {
      alert('Please enter a Channel Link, JID, or Name to verify.');
      return;
    }
    setIsVerifyingChannel(true);
    try {
      const res = await fetchWithAuth('/api/channels/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelInput: candidate })
      });
      const data = await res.json();
      if (res.ok && data.channel) {
        setDefaultChannelJid(data.channel.id);
        if (data.channel.name) {
          setDefaultChannelName(data.channel.name);
        }
        if (data.channel.channelLink || data.channel.invite) {
          setDefaultChannelInviteLink(data.channel.channelLink || (data.channel.invite.startsWith('http') ? data.channel.invite : `https://whatsapp.com/channel/${data.channel.invite}`));
        }
        setFeedback({ 
          type: 'success', 
          text: `Verified Channel: "${data.channel.name}" (${data.channel.id})${data.channel.serverMessageId ? ` [Message #${data.channel.serverMessageId}]` : ''}` 
        });
      } else {
        setFeedback({ type: 'error', text: data.error || 'Could not verify channel with WhatsApp.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', text: 'Verification error: ' + err.message });
    } finally {
      setIsVerifyingChannel(false);
    }
  };

  const fetchBlockedGroups = async () => {
    try {
      const res = await fetchWithAuth('/api/blocked-groups');
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.blockedGroupIds)) {
          setGlobalBlockedGroups(data.blockedGroupIds);
        }
      }
    } catch (e) {
      console.error('Error fetching blocked groups:', e);
    }
  };

  const saveBlockedGroups = async (newList: string[]) => {
    setIsSavingBlocked(true);
    try {
      const res = await fetchWithAuth('/api/blocked-groups', {
        method: 'POST',
        body: JSON.stringify({ blockedGroupIds: newList })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setGlobalBlockedGroups(data.blockedGroupIds);
        setBlockedInput('');
        setFeedback({ type: 'success', text: 'Global banned group list updated successfully!' });
      } else {
        setFeedback({ type: 'error', text: data.error || 'Failed to save banned groups.' });
      }
    } catch (e) {
      setFeedback({ type: 'error', text: 'Network error updating banned groups.' });
    } finally {
      setIsSavingBlocked(false);
    }
  };

  const fetchCapturedGroupInvites = async () => {
    setIsLoadingCapturedGroups(true);
    try {
      const res = await fetchWithAuth('/api/captured-group-invites');
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.invites)) {
          setCapturedGroupInvites(data.invites);
        }
      }
    } catch (e) {
      console.error('Error fetching captured group invites:', e);
    } finally {
      setIsLoadingCapturedGroups(false);
    }
  };

  const clearCapturedGroupInvites = async () => {
    try {
      const res = await fetchWithAuth('/api/captured-group-invites', { method: 'DELETE' });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setCapturedGroupInvites([]);
          setFeedback({ type: 'success', text: 'Captured WhatsApp group link database cleared.' });
        }
      }
    } catch (e) {
      setFeedback({ type: 'error', text: 'Error clearing captured group invites database.' });
    }
  };

  const fetchSavedCodes = async () => {
    try {
      const res = await fetchWithAuth('/api/saved-codes');
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.savedCodes)) {
          setSavedCodes(data.savedCodes);
        }
      }
    } catch (e) {
      console.error('Error fetching saved codes:', e);
    }
  };

  const handleSaveAsCode = async () => {
    const cleanDigits = saveCodeInput.replace(/\D/g, '').trim();
    if (cleanDigits.length !== 4) {
      setFeedback({ type: 'error', text: 'Please enter a valid 4-digit numeric code (e.g. 1234 or 5678).' });
      return;
    }

    if (!phoneNumber) {
      setFeedback({ type: 'error', text: 'Please enter target phone number or Group JID.' });
      return;
    }

    if (!message && attachmentType === 'none') {
      setFeedback({ type: 'error', text: 'Please type a message body or attach a file to save with this code.' });
      return;
    }

    const formattedSequence = buildFormattedSequence();

    setIsSavingCode(true);
    try {
      const res = await fetchWithAuth('/api/saved-codes', {
        method: 'POST',
        body: JSON.stringify({
          code: cleanDigits,
          phoneNumber,
          message,
          messagesSequence: formattedSequence.length > 0 ? formattedSequence : undefined,
          interMessageDelaySeconds,
          recipientType,
          delaySeconds: globalDelaySecondsState,
          tagGroupMembers,
          sessionIds: selectedSessionIds,
          msgType,
          footer: footerText,
          attachmentType,
          attachmentUrl,
          attachmentName,
          attachmentData,
          inlineAttachment,
          buttons: customButtons,
          templateButtons
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setSavedCodes(data.savedCodes || []);
        setSaveCodeInput('');
        setFeedback({
          type: 'success',
          text: `🎉 Code .${cleanDigits} saved permanently! Send .${cleanDigits} in WhatsApp anytime to trigger message delivery.`
        });
      } else {
        setFeedback({ type: 'error', text: data.error || 'Failed to save code.' });
      }
    } catch (e) {
      setFeedback({ type: 'error', text: 'Network error saving code.' });
    } finally {
      setIsSavingCode(false);
    }
  };

  const handleDeleteSavedCode = async (id: string) => {
    try {
      const res = await fetchWithAuth(`/api/saved-codes/${id}`, { method: 'DELETE' });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setSavedCodes(data.savedCodes || []);
          setFeedback({ type: 'success', text: 'Saved code deleted successfully.' });
        }
      }
    } catch (e) {
      console.error('Error deleting saved code:', e);
    }
  };

  const handleTriggerSavedCode = async (id: string, code: string) => {
    try {
      const res = await fetchWithAuth(`/api/saved-codes/trigger/${id}`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        setFeedback({ type: 'success', text: `🚀 Triggered .${code}! Enqueued ${data.enqueuedCount} message(s).` });
        fetchQueue();
      } else {
        setFeedback({ type: 'error', text: data.error || 'Failed to trigger saved code.' });
      }
    } catch (e) {
      setFeedback({ type: 'error', text: 'Network error triggering saved code.' });
    }
  };

  // Draft Message Templates Handlers (Usable across accounts, supports incomplete messages)
  const fetchDrafts = async () => {
    try {
      const res = await fetchWithAuth('/api/drafts');
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.drafts)) {
          setDraftsList(data.drafts);
        }
      }
    } catch (e) {
      console.error('Error fetching drafts:', e);
    }
  };

  const handleSaveDraft = async () => {
    setIsSavingDraft(true);
    const formattedSequence = buildFormattedSequence();

    try {
      const res = await fetchWithAuth('/api/drafts', {
        method: 'POST',
        body: JSON.stringify({
          id: activeDraftId,
          name: draftNameInput || `Draft Template ${draftsList.length + 1}`,
          phoneNumber,
          recipientType,
          message,
          messagesSequence: formattedSequence.length > 0 ? formattedSequence : undefined,
          interMessageDelaySeconds,
          msgType,
          footer: footerText,
          attachmentType,
          attachmentUrl,
          attachmentName,
          attachmentData,
          inlineAttachment,
          buttons: customButtons,
          templateButtons,
          delaySeconds: globalDelaySecondsState,
          tagGroupMembers,
          sessionIds: selectedSessionIds
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setDraftsList(data.drafts || []);
        setActiveDraftId(data.draft?.id || null);
        setDraftNameInput('');
        setFeedback({
          type: 'success',
          text: `📁 Draft template "${data.draft?.name}" saved successfully! Available across all logged in accounts.`
        });
      } else {
        setFeedback({ type: 'error', text: data.error || 'Failed to save draft template.' });
      }
    } catch (e) {
      console.error('Error saving draft:', e);
      setFeedback({ type: 'error', text: 'Network error saving draft template.' });
    } finally {
      setIsSavingDraft(false);
    }
  };

  const handleLoadDraft = (draft: any) => {
    if (!draft) return;
    setPhoneNumber(draft.phoneNumber || '');
    setRecipientType(draft.recipientType || 'individual');
    setMessage(draft.message || '');

    if (Array.isArray(draft.messagesSequence) && draft.messagesSequence.length > 0) {
      setMessagesSequence(
        draft.messagesSequence.map((item: any, i: number) => ({
          id: `msg-${i}-${Date.now()}`,
          text: typeof item === 'string' ? item : (item.message || ''),
          msgType: typeof item === 'object' ? item.msgType : undefined,
          attachmentType: typeof item === 'object' ? (item.attachmentType || 'none') : 'none',
          attachmentSource: typeof item === 'object' && item.attachmentUrl ? 'url' : (item && item.attachmentData ? 'upload' : 'url'),
          attachmentUrl: typeof item === 'object' ? (item.attachmentUrl || '') : '',
          attachmentName: typeof item === 'object' ? (item.attachmentName || '') : '',
          attachmentData: typeof item === 'object' ? (item.attachmentData || '') : '',
          buttons: typeof item === 'object' && Array.isArray(item.buttons) ? item.buttons : [],
          templateButtons: typeof item === 'object' && Array.isArray(item.templateButtons) ? item.templateButtons : [],
          showMediaConfig: typeof item === 'object' && ((item.attachmentType && item.attachmentType !== 'none') || !!item.attachmentUrl || !!item.attachmentData),
          showButtonsConfig: typeof item === 'object' && ((item.buttons && item.buttons.length > 0) || (item.templateButtons && item.templateButtons.length > 0))
        }))
      );
    } else {
      setMessagesSequence([{
        id: 'msg-1',
        text: draft.message || '',
        attachmentType: draft.attachmentType || 'none',
        attachmentUrl: draft.attachmentUrl || '',
        attachmentName: draft.attachmentName || '',
        attachmentData: draft.attachmentData || '',
        buttons: Array.isArray(draft.buttons) ? draft.buttons : [],
        templateButtons: Array.isArray(draft.templateButtons) ? draft.templateButtons : []
      }]);
    }

    if (typeof draft.interMessageDelaySeconds === 'number') {
      setInterMessageDelaySeconds(draft.interMessageDelaySeconds);
    }

    setMsgType(draft.msgType || 'text');
    setFooterText(draft.footer || 'Sent via WhatsApp Bridge');
    setAttachmentType(draft.attachmentType || 'none');
    setAttachmentUrl(draft.attachmentUrl || '');
    setAttachmentName(draft.attachmentName || '');
    setAttachmentData(draft.attachmentData || '');
    setInlineAttachment(draft.inlineAttachment ?? true);
    if (Array.isArray(draft.buttons)) setCustomButtons(draft.buttons);
    if (Array.isArray(draft.templateButtons)) setTemplateButtons(draft.templateButtons);
    if (Array.isArray(draft.sessionIds) && draft.sessionIds.length > 0) setSelectedSessionIds(draft.sessionIds);
    if (typeof draft.delaySeconds === 'number') setGlobalDelaySecondsState(draft.delaySeconds);
    if (typeof draft.tagGroupMembers === 'boolean') setTagGroupMembers(draft.tagGroupMembers);
    setActiveDraftId(draft.id);
    setDraftNameInput(draft.name || '');
    setFeedback({
      type: 'success',
      text: `📋 Draft Template "${draft.name || 'Draft'}" loaded into form! Edit or complete inputs anytime.`
    });
  };

  const handleDeleteDraft = async (id: string) => {
    try {
      const res = await fetchWithAuth(`/api/drafts/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok && data.success) {
        setDraftsList(data.drafts || []);
        if (activeDraftId === id) {
          setActiveDraftId(null);
        }
        setFeedback({ type: 'success', text: 'Draft template deleted successfully.' });
      } else {
        setFeedback({ type: 'error', text: data.error || 'Failed to delete draft template.' });
      }
    } catch (e) {
      console.error('Error deleting draft:', e);
    }
  };

  useEffect(() => {
    if (token) {
      fetchWorkflows();
      fetchSettings();
      fetchBlockedGroups();
      fetchCapturedGroupInvites();
      fetchSavedCodes();
      fetchDrafts();
    }
  }, [token]);

  useEffect(() => {
    let active = true;
    const fetchResources = async () => {
      try {
        const res = await fetch('/api/public/server-resources');
        if (res.ok) {
          const contentType = res.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            const data = await res.json();
            if (data.success && active) {
              setServerResources(data.resources);
            }
          }
        }
      } catch (e) {
        console.error('Error fetching server resources:', e);
      }
    };

    fetchResources();
    const interval = setInterval(fetchResources, 5000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  const saveWorkflows = async (updated: WorkflowRule[]) => {
    setIsSavingWorkflows(true);
    try {
      const res = await fetchWithAuth('/api/workflows', {
        method: 'POST',
        body: JSON.stringify({ workflows: updated })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setWorkflowsList(data.workflows);
        setFeedback({ type: 'success', text: 'Workflows config updated successfully!' });
      } else {
        setFeedback({ type: 'error', text: data.error || 'Failed to save workflows.' });
      }
    } catch (e) {
      setFeedback({ type: 'error', text: 'Network error saving workflows.' });
    } finally {
      setIsSavingWorkflows(false);
    }
  };

  // Add new custom message template
  const handleAddTemplate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTemplateTitle.trim() || !newTemplateText.trim()) return;

    const added: QuickTemplate = {
      id: 'custom-' + Math.random().toString(36).substring(7),
      title: newTemplateTitle.trim(),
      text: newTemplateText.trim(),
      category: newTemplateCat,
      msgType: newTemplateMsgType,
      footer: newTemplateMsgType !== 'text' ? newTemplateFooter.trim() : undefined,
      attachmentType: newTemplateAttachType,
      attachmentSource: newTemplateAttachType !== 'none' ? 'url' : undefined,
      attachmentUrl: newTemplateAttachType !== 'none' ? newTemplateAttachUrl.trim() : undefined,
      buttons: newTemplateMsgType === 'buttons' ? newTemplateButtons : undefined,
      templateButtons: newTemplateMsgType === 'template' ? newTemplateTmplButtons : undefined,
      inlineAttachment: true
    };

    saveTemplates([...quickTemplates, added]);
    setNewTemplateTitle('');
    setNewTemplateText('');
    setNewTemplateFooter('');
    setNewTemplateAttachType('none');
    setNewTemplateAttachUrl('');
    setNewTemplateButtons([{ id: 'yes', text: 'Yes, absolutely!' }]);
    setNewTemplateTmplButtons([{ type: 'url', text: 'Visit Link', url: 'https://ai.studio/build' }]);
    setShowTemplateModal(false);
  };

  // Delete message template
  const handleDeleteTemplate = (id: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent template selection
    const filtered = quickTemplates.filter(t => t.id !== id);
    saveTemplates(filtered);
  };

  // Apply Quick Template to main message textarea
  const handleApplyTemplate = (tmpl: QuickTemplate) => {
    setMessage(tmpl.text);
    if (tmpl.msgType) {
      setMsgType(tmpl.msgType);
    } else {
      setMsgType('text');
    }
    
    if (tmpl.attachmentType) {
      setAttachmentType(tmpl.attachmentType);
    } else {
      setAttachmentType('none');
    }
    
    if (tmpl.attachmentSource) {
      setAttachmentSource(tmpl.attachmentSource);
    }
    
    if (tmpl.attachmentUrl) {
      setAttachmentUrl(tmpl.attachmentUrl);
    }
    
    if (tmpl.inlineAttachment !== undefined) {
      setInlineAttachment(tmpl.inlineAttachment);
    }
    
    if (tmpl.buttons) {
      setCustomButtons(tmpl.buttons);
    }
    
    if (tmpl.templateButtons) {
      setTemplateButtons(tmpl.templateButtons);
    }
    
    if (tmpl.footer) {
      setFooterText(tmpl.footer);
    }
    
    setUseLegacy(false);
    setFeedback({ type: 'success', text: `Template "${tmpl.title}" loaded successfully with active parameters!` });
  };

  // Apply Rich Media + Action Template to Dispatch Studio
  const handleApplyRichMediaTemplate = (templateType: 'invoice' | 'demo' | 'promo') => {
    setInlineAttachment(true);
    setUseLegacy(false); // Native interactive buttons are modern and clean
    
    if (templateType === 'invoice') {
      setMsgType('template');
      setMessage('Hi there!\n\nYour monthly premium invoice from Navi has been generated. Please review the attached PDF document and complete the payment using the secure link below.');
      setFooterText('Navi Billing Secure Service');
      setAttachmentType('pdf');
      setAttachmentSource('preset');
      setAttachmentUrl(PRESET_URLS.pdf);
      setTemplateButtons([
        { type: 'url', text: '💳 Pay Invoice', url: 'https://ai.studio/build' },
        { type: 'call', text: '📞 Support Helpline', phoneNumber: '+1234567890' },
        { type: 'quickReply', text: 'Learn More', id: 'invoice-help' }
      ]);
      setFeedback({ type: 'success', text: '📄 Premium Invoice PDF + URL Template loaded successfully!' });
    } else if (templateType === 'demo') {
      setMsgType('template');
      setMessage('Hello!\n\nWe are excited to share a short video demonstration of the all-new Navi App features. Check it out and click below to join the beta program.');
      setFooterText('Navi Product Team');
      setAttachmentType('video');
      setAttachmentSource('preset');
      setAttachmentUrl(PRESET_URLS.video);
      setTemplateButtons([
        { type: 'url', text: '🚀 Join Beta', url: 'https://ai.studio/build' },
        { type: 'quickReply', text: '❓ View FAQs', id: 'faq-help' }
      ]);
      setFeedback({ type: 'success', text: '🎬 Feature Demo Video + URL Template loaded successfully!' });
    } else if (templateType === 'promo') {
      setMsgType('buttons');
      setMessage('Good News!\n\nYou have been selected for an exclusive 30% discount on all custom plans at Navi. Take advantage of this limited-time offer today!');
      setFooterText('Navi Promotions Group');
      setAttachmentType('image');
      setAttachmentSource('preset');
      setAttachmentUrl(PRESET_URLS.image);
      setCustomButtons([
        { id: 'accept-discount', text: '🎉 Claim 30% Off' },
        { id: 'remind-discount', text: '⏰ Remind Me Later' },
        { id: 'opt-out-discount', text: 'No, thanks' }
      ]);
      setFeedback({ type: 'success', text: '🖼️ Marketing Promo Image + Quick Reply Buttons Template loaded!' });
    }
  };

  // Poll function to fetch latest state
  const fetchStatus = async () => {
    try {
      const res = await fetchWithAuth('/api/status');
      if (res.ok) {
        const data = await res.json();
        setConnected(data.connected);
        setStatus(data.status);
        setUser(data.user);
        setLogs(data.logs || []);
        setSentHistory(data.sentHistory || []);
        if (data.pairingCode) {
          setActivePairingCode(data.pairingCode);
        }
        setServerOnline(true);
      } else {
        setServerOnline(false);
      }
    } catch (err) {
      setServerOnline(false);
      console.warn('Backend server connectivity issue while fetching status (retrying...)');
    }
  };

  const checkStuckConnectingSessions = (sessions: any[]) => {
    if (!Array.isArray(sessions)) return;
    const now = Date.now();
    const STUCK_THRESHOLD_MS = 25000; // 25 seconds stuck in 'connecting'

    sessions.forEach((sess: any) => {
      const id = sess.id;
      if (!id) return;

      if (sess.status === 'connecting') {
        if (!connectingStartTimesRef.current[id]) {
          connectingStartTimesRef.current[id] = now;
        } else {
          const duration = now - connectingStartTimesRef.current[id];
          if (duration >= STUCK_THRESHOLD_MS && !autoReconnectingSessionsRef.current[id]) {
            autoReconnectingSessionsRef.current[id] = true;
            console.warn(`[AUTO-RECONNECT] Session "${id}" has been stuck in 'connecting' for ${Math.round(duration / 1000)}s. Triggering automatic socket reset...`);

            fetchWithAuth('/api/sessions/reconnect', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id, sessionId: id })
            })
              .then(async (res) => {
                const resData = await res.json().catch(() => ({}));
                if (res.ok && resData.success) {
                  console.log(`[AUTO-RECONNECT] Successfully triggered Baileys socket restart for session "${id}".`);
                }
              })
              .catch((err) => {
                console.error(`[AUTO-RECONNECT] Failed to auto-reconnect session "${id}":`, err);
              })
              .finally(() => {
                connectingStartTimesRef.current[id] = Date.now();
                autoReconnectingSessionsRef.current[id] = false;
              });
          }
        }
      } else {
        // Reset timestamp if session is connected, disconnected, or in QR state
        delete connectingStartTimesRef.current[id];
        delete autoReconnectingSessionsRef.current[id];
      }
    });
  };

  const fetchSessions = async () => {
    try {
      const res = await fetchWithAuth('/api/sessions');
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.sessions)) {
          setSessionsList(data.sessions);
          checkStuckConnectingSessions(data.sessions);

          // Auto sync selected ids with connected sessions if state gets out of sync
          const existingIds = data.sessions.map((s: any) => s.id);
          setSelectedSessionIds(prev => {
            const valid = prev.filter(id => existingIds.includes(id));
            if (valid.length === 0 && existingIds.includes('primary')) {
              return ['primary'];
            }
            return valid;
          });
        }
        setServerOnline(true);
      } else {
        setServerOnline(false);
      }
    } catch (e) {
      setServerOnline(false);
      console.warn('Backend server connectivity issue while fetching sessions (retrying...)');
    }
  };

  const fetchGroups = async () => {
    try {
      const res = await fetchWithAuth('/api/groups');
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.groups)) {
          setSavedGroups(data.groups);
        }
        setServerOnline(true);
      } else {
        setServerOnline(false);
      }
    } catch (e) {
      setServerOnline(false);
      console.warn('Backend server connectivity issue while fetching groups (retrying...)');
    }
  };

  const fetchQueue = async () => {
    try {
      const res = await fetchWithAuth('/api/queue');
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.queue)) {
          setQueueItems(data.queue);
          setIsProcessingQueueState(data.isProcessing);
          setGlobalDelaySecondsState(data.delaySeconds);
        }
        setServerOnline(true);
      } else {
        setServerOnline(false);
      }
    } catch (e) {
      setServerOnline(false);
      console.warn('Backend server connectivity issue while fetching queue (retrying...)');
    }
  };

  const fetchPausedSessions = async () => {
    try {
      const res = await fetchWithAuth('/api/queue/paused');
      if (res.ok) {
        const contentType = res.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const data = await res.json();
          if (data.success && Array.isArray(data.pausedSessions)) {
            setPausedSessions(data.pausedSessions);
          }
        } else {
          console.warn('Paused sessions API returned non-JSON content:', contentType);
        }
      }
    } catch (e) {
      console.error('Error fetching paused sessions:', e);
    }
  };

  const handleTogglePauseSession = async (sessionId: string) => {
    try {
      const res = await fetchWithAuth('/api/queue/paused/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId })
      });
      if (res.ok) {
        const contentType = res.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const data = await res.json();
          if (data.success && Array.isArray(data.pausedSessions)) {
            setPausedSessions(data.pausedSessions);
            fetchQueue();
          }
        } else {
          console.warn('Toggle pause session API returned non-JSON content:', contentType);
        }
      }
    } catch (e) {
      console.error('Error toggling paused session:', e);
    }
  };

  const handleQueueReorder = async (itemId: string, action: 'up' | 'down' | 'top' | 'delete') => {
    try {
      const res = await fetchWithAuth('/api/queue/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, action })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.queue)) {
          setQueueItems(data.queue);
        }
      }
    } catch (e) {
      console.error('Error reordering queue:', e);
    }
  };

  const fetchAnalytics = async () => {
    setIsLoadingAnalytics(true);
    try {
      const res = await fetchWithAuth('/api/analytics');
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setAnalyticsData(data);
        }
      }
    } catch (e) {
      console.error('Error fetching analytics:', e);
    } finally {
      setIsLoadingAnalytics(false);
    }
  };

  const handleRequestPairingCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pairingPhone.trim()) {
      setFeedback({ type: 'error', text: 'Please enter a valid phone number with country code.' });
      return;
    }

    const cleanNum = pairingPhone.replace(/\D/g, '');
    if (!cleanNum) {
      setFeedback({ type: 'error', text: 'Invalid phone number. Please use digits only.' });
      return;
    }

    setIsRequestingCode(true);
    setFeedback(null);

    try {
      const res = await fetchWithAuth('/api/request-pairing-code', {
        method: 'POST',
        body: JSON.stringify({ phoneNumber: cleanNum })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setActivePairingCode(data.code);
        setFeedback({ type: 'success', text: `Pairing code generated! Type it on your phone.` });
        fetchStatus();
      } else {
        setFeedback({ type: 'error', text: data.error || 'Failed to request pairing code.' });
      }
    } catch (err) {
      setFeedback({ type: 'error', text: 'Failed to connect to the server.' });
    } finally {
      setIsRequestingCode(false);
    }
  };

  const fetchQR = async () => {
    try {
      const targetSessionId = activeLinkSessionId || 'primary';
      const res = await fetchWithAuth(`/api/qr?sessionId=${targetSessionId}`);
      if (res.ok) {
        const data = await res.json();
        setQrCode(data.qr);
        if (data.status) {
          setStatus(data.status);
        }
        setServerOnline(true);
      } else {
        setServerOnline(false);
      }
    } catch (err) {
      setServerOnline(false);
      console.warn('Backend server connectivity issue while fetching QR (retrying...)');
    }
  };

  // Session actions
  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSessionId.trim() || !newSessionName.trim()) {
      setFeedback({ type: 'error', text: 'Please fill in all session fields.' });
      return;
    }
    setIsCreatingSession(true);
    try {
      const res = await fetchWithAuth('/api/sessions/create', {
        method: 'POST',
        body: JSON.stringify({ id: newSessionId.trim().toLowerCase(), name: newSessionName.trim() })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setFeedback({ type: 'success', text: `Session "${newSessionName}" created successfully! Please link it.` });
        setNewSessionId('');
        setNewSessionName('');
        setShowSessionModal(false);
        setActiveLinkSessionId(data.id); // auto select for linking
        fetchSessions();
      } else {
        setFeedback({ type: 'error', text: data.error || 'Failed to create session.' });
      }
    } catch (e) {
      setFeedback({ type: 'error', text: 'Network error creating session.' });
    } finally {
      setIsCreatingSession(false);
    }
  };

  const handleDeleteSession = async (id: string) => {
    if (id === 'primary') {
      setFeedback({ type: 'error', text: 'Cannot delete primary session.' });
      return;
    }
    try {
      const res = await fetchWithAuth(`/api/sessions/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok && data.success) {
        setFeedback({ type: 'success', text: `Session "${id}" deleted successfully.` });
        if (activeLinkSessionId === id) {
          setActiveLinkSessionId('primary');
        }
        fetchSessions();
      } else {
        setFeedback({ type: 'error', text: data.error || 'Failed to delete session.' });
      }
    } catch (e) {
      setFeedback({ type: 'error', text: 'Network error deleting session.' });
    }
  };

  const [isReconnectingSession, setIsReconnectingSession] = useState<Record<string, boolean>>({});

  const handleReconnectSession = async (sessionId: string) => {
    setIsReconnectingSession(prev => ({ ...prev, [sessionId]: true }));
    try {
      const res = await fetchWithAuth('/api/sessions/reconnect', {
        method: 'POST',
        body: JSON.stringify({ id: sessionId, sessionId })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setFeedback({ type: 'success', text: data.message || `Reconnecting session "${sessionId}"...` });
        fetchSessions();
      } else {
        setFeedback({ type: 'error', text: data.error || 'Failed to reconnect session.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Error reconnecting session.' });
    } finally {
      setIsReconnectingSession(prev => ({ ...prev, [sessionId]: false }));
    }
  };

  const [isRegeneratingQr, setIsRegeneratingQr] = useState<Record<string, boolean>>({});

  const handleRegenerateSessionQr = async (sessionId: string) => {
    setIsRegeneratingQr(prev => ({ ...prev, [sessionId]: true }));
    try {
      const res = await fetchWithAuth('/api/sessions/regenerate-qr', {
        method: 'POST',
        body: JSON.stringify({ id: sessionId, sessionId })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setFeedback({ type: 'success', text: data.message || `Generating brand new QR code for session "${sessionId}"...` });
        fetchSessions();
      } else {
        setFeedback({ type: 'error', text: data.error || 'Failed to generate new QR code.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Error generating new QR code.' });
    } finally {
      setIsRegeneratingQr(prev => ({ ...prev, [sessionId]: false }));
    }
  };

  const handleRequestSessionPairingCode = async (sessId: string, phone: string) => {
    if (!phone.trim()) {
      setFeedback({ type: 'error', text: 'Please enter a valid phone number.' });
      return;
    }
    const cleanNum = phone.replace(/\D/g, '');
    try {
      const res = await fetchWithAuth('/api/sessions/request-pairing-code', {
        method: 'POST',
        body: JSON.stringify({ sessionId: sessId, phoneNumber: cleanNum })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setFeedback({ type: 'success', text: `Pairing code generated for session ${sessId}!` });
        fetchSessions();
      } else {
        setFeedback({ type: 'error', text: data.error || 'Failed to generate pairing code.' });
      }
    } catch (e) {
      setFeedback({ type: 'error', text: 'Network error generating pairing code.' });
    }
  };

  // Group actions
  const handleDeleteGroup = async (jid: string) => {
    try {
      const res = await fetchWithAuth(`/api/groups/${encodeURIComponent(jid)}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok && data.success) {
        setFeedback({ type: 'success', text: 'Group details deleted successfully.' });
        fetchGroups();
      } else {
        setFeedback({ type: 'error', text: data.error || 'Failed to delete group.' });
      }
    } catch (e) {
      setFeedback({ type: 'error', text: 'Network error deleting group.' });
    }
  };

  const handleSyncGroups = async () => {
    setIsSyncingGroups(true);
    setFeedback({ type: 'info', text: 'Initiating WhatsApp Group synchronization...' });
    try {
      const res = await fetchWithAuth('/api/groups/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionIds: selectedSessionIds })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setFeedback({ type: 'success', text: data.message || 'Successfully synchronized all joined groups!' });
        fetchGroups();
      } else {
        setFeedback({ type: 'error', text: data.error || 'Failed to synchronize groups.' });
      }
    } catch (e) {
      setFeedback({ type: 'error', text: 'Network error synchronizing groups.' });
    } finally {
      setIsSyncingGroups(false);
    }
  };

  // Queue actions
  const handleUpdateDelay = async (seconds: number) => {
    try {
      const res = await fetchWithAuth('/api/queue/config', {
        method: 'POST',
        body: JSON.stringify({ delaySeconds: seconds })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setGlobalDelaySecondsState(data.delaySeconds);
      }
    } catch (e) {
      console.error('Error updating queue config:', e);
    }
  };

  const handleClearQueue = async (type: 'pending' | 'history' | 'all' | any = 'all') => {
    const cleanType: 'pending' | 'history' | 'all' = (typeof type === 'string' && ['pending', 'history', 'all'].includes(type)) ? (type as any) : 'all';

    try {
      const res = await fetchWithAuth('/api/queue/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: cleanType })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (Array.isArray(data.queue)) {
          setQueueItems(data.queue);
        } else {
          setQueueItems([]);
        }
        setFeedback({
          type: 'success',
          text: cleanType === 'pending'
            ? 'Pending queue items cleared.'
            : cleanType === 'history'
              ? 'Queue history cleared.'
              : 'Message queue cleared.'
        });
        fetchQueue();
      } else {
        setFeedback({ type: 'error', text: data.error || 'Failed to clear queue.' });
      }
    } catch (e) {
      console.error('Error clearing queue:', e);
      setFeedback({ type: 'error', text: 'Network error clearing queue.' });
    }
  };

  const handleClearMessageHistory = async () => {
    try {
      const res = await fetchWithAuth('/api/history/clear', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        setSentHistory([]);
        setFeedback({ type: 'success', text: 'All message history logs cleared.' });
      } else {
        setFeedback({ type: 'error', text: data.error || 'Failed to clear message history.' });
      }
    } catch (e) {
      console.error('Error clearing message history:', e);
      setFeedback({ type: 'error', text: 'Network error clearing message history.' });
    }
  };

  const handleDeleteMessageHistoryItem = async (id: string) => {
    try {
      const res = await fetchWithAuth(`/api/history/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok && data.success) {
        setSentHistory(prev => prev.filter(item => item.id !== id));
        setFeedback({ type: 'success', text: 'Message history entry deleted.' });
      } else {
        setFeedback({ type: 'error', text: data.error || 'Failed to delete message entry.' });
      }
    } catch (e) {
      console.error('Error deleting message history entry:', e);
      setFeedback({ type: 'error', text: 'Network error deleting message entry.' });
    }
  };

  // Snappy multi-state and multi-session polling loop
  useEffect(() => {
    if (!token) return;

    fetchStatus();
    fetchSessions();
    fetchGroups();
    fetchQueue();
    fetchPausedSessions();
    fetchCapturedGroupInvites();
    if (currentView === 'analytics') {
      fetchAnalytics();
    }

    const interval = setInterval(() => {
      fetchStatus();
      fetchSessions();
      fetchGroups();
      fetchQueue();
      fetchPausedSessions();
      if (currentView === 'analytics') {
        fetchAnalytics();
      }
      if (currentView === 'settings' || currentView === 'group-invites') {
        fetchCapturedGroupInvites();
      }
      
      const primaryConnected = sessionsListRef.current.find(s => s.id === 'primary')?.status === 'connected';
      if (!primaryConnected) {
        fetchQR();
      }
    }, 2000); // Poll on a snappy 2000ms interval for immediate indicator and queue updates

    return () => clearInterval(interval);
  }, [token, currentView]);

  // Scroll to bottom of terminal when logs update (only if autoScrollLogs is enabled)
  useEffect(() => {
    if (activeTab === 'logs' && autoScrollLogs && terminalContainerRef.current) {
      const container = terminalContainerRef.current;
      container.scrollTop = container.scrollHeight;
    }
  }, [logs, activeTab, autoScrollLogs]);

  const getExtractorContacts = () => {
    let targetGroups: any[] = [];
    if (extractorTarget === 'individual') {
      targetGroups = savedGroups.filter(g => g.jid === extractorGroupJid);
    } else if (extractorTarget === 'filtered') {
      const filteredGroups = savedGroups.filter(g => {
        if (groupFilter === 'canSend') {
          return g.canUserSend !== false;
        }
        if (groupFilter === 'onlyAdmin') {
          return g.isAdmin === true;
        }
        return true;
      });
      targetGroups = filteredGroups;
    } else {
      targetGroups = savedGroups;
    }

    const contactsMap = new Map<string, { phone: string; name: string; groupName: string }>();
    targetGroups.forEach(g => {
      if (Array.isArray(g.participants)) {
        g.participants.forEach((pJid: string) => {
          if (!pJid || typeof pJid !== 'string') return;
          const userNum = pJid.split('@')[0].split(':')[0];
          if (userNum && /^\d+$/.test(userNum) && !contactsMap.has(userNum)) {
            const isLid = pJid.endsWith('@lid');
            contactsMap.set(userNum, {
              phone: userNum,
              name: isLid ? `Group Member (ID: ${userNum})` : `Group Member (${userNum})`,
              groupName: g.name || 'Group'
            });
          }
        });
      }
    });

    return Array.from(contactsMap.values());
  };

  const handleBulkSaveLeads = async (contacts: any[]) => {
    if (contacts.length === 0) return;
    setIsBulkSavingLeads(true);
    try {
      const formattedContacts = contacts.map(c => ({
        phone: c.phone,
        name: c.name,
        notes: `Extracted from Group "${c.groupName}"`,
        sessionName: 'Extractor'
      }));

      const res = await fetchWithAuth('/api/leads/bulk-add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contacts: formattedContacts })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setFeedback({ 
            type: 'success', 
            text: `Successfully imported ${data.addedCount} new group members to Leads Hub!` 
          });
          setShowMembersExtractor(false);
        } else {
          setFeedback({ type: 'error', text: data.error || 'Failed to import leads.' });
        }
      } else {
        setFeedback({ type: 'error', text: 'Server error importing contacts.' });
      }
    } catch (err: any) {
      console.error(err);
      setFeedback({ type: 'error', text: 'Network error saving leads: ' + err.message });
    } finally {
      setIsBulkSavingLeads(false);
    }
  };

  const getCleanNumber = (num: string) => {
    return num.replace(/\D/g, '');
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const isNavi = msgType === 'navi-template';

    if (!phoneNumber.trim()) {
      setFeedback({ type: 'error', text: 'Please fill in the recipient field.' });
      return;
    }

    if (!isNavi && !message.trim() && attachmentType === 'none') {
      setFeedback({ type: 'error', text: 'Please fill in the message or select an attachment.' });
      return;
    }

    // Check if at least one selected session is connected
    const activeConnectedCount = sessionsList.filter(s => selectedSessionIds.includes(s.id) && s.status === 'connected').length;
    if (activeConnectedCount === 0) {
      setFeedback({ 
        type: 'error', 
        text: 'None of the selected WhatsApp sending accounts are connected. Please connect at least one account.' 
      });
      return;
    }

    setIsSending(true);
    setFeedback(null);

    try {
      const formattedSequence = buildFormattedSequence();

      const endpoint = isNavi ? '/api/send-template' : '/api/send';
      const bodyPayload = isNavi 
        ? { 
            phoneNumber: phoneNumber.trim(), 
            recipientType,
            sessionIds: selectedSessionIds,
            splitByCommas,
            tagGroupMembers: recipientType === 'group' ? tagGroupMembers : false
          }
        : {
            phoneNumber: phoneNumber.trim(),
            recipientType,
            message: message,
            messagesSequence: formattedSequence.length > 0 ? formattedSequence : undefined,
            interMessageDelaySeconds,
            msgType: msgType,
            footer: footerText,
            buttons: msgType === 'buttons' ? customButtons : undefined,
            templateButtons: msgType === 'template' ? templateButtons : undefined,
            useLegacy: useLegacy,
            attachmentType,
            attachmentSource,
            attachmentUrl: attachmentSource === 'preset' || attachmentSource === 'url' ? attachmentUrl : undefined,
            attachmentData: attachmentSource === 'upload' ? attachmentData : undefined,
            attachmentName: attachmentSource === 'upload' ? attachmentName : undefined,
            inlineAttachment,
            sessionIds: selectedSessionIds,
            splitByCommas,
            tagGroupMembers: recipientType === 'group' ? tagGroupMembers : false,
            scheduledAt: scheduledAt || undefined
          };

      const res = await fetchWithAuth(endpoint, {
        method: 'POST',
        body: JSON.stringify(bodyPayload),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setFeedback({ 
          type: 'success', 
          text: data.message || 'Message successfully dispatched to queue!' 
        });
        if (msgType === 'text') {
          setMessage('');
        }
        setScheduledAt('');
        // Reset attachments upon successful delivery
        setAttachmentType('none');
        setAttachmentData('');
        setAttachmentName('');
        
        fetchStatus(); // Refresh history immediately
        fetchQueue();
      } else {
        setFeedback({ type: 'error', text: data.error || 'Failed to send message.' });
      }
    } catch (err: any) {
      console.error('Error sending message:', err);
      setFeedback({ 
        type: 'error', 
        text: err?.message ? `Network error sending message: ${err.message}` : 'Network error. Could not connect to the API server.' 
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleLogout = async () => {
    setIsResetting(true);
    try {
      const res = await fetchWithAuth('/api/logout', { method: 'POST' });
      if (res.ok) {
        setConnected(false);
        setStatus('disconnected');
        setUser(null);
        setQrCode(null);
        setFeedback({ type: 'success', text: 'Session successfully disconnected & reset!' });
        fetchStatus();
        fetchQR();
      } else {
        setFeedback({ type: 'error', text: 'Failed to reset session.' });
      }
    } catch (err) {
      setFeedback({ type: 'error', text: 'Error connecting to backend server during reset.' });
    } finally {
      setIsResetting(false);
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authUsernameInput.trim() || !authPasswordInput.trim()) {
      setAuthFeedback({ type: 'error', text: 'Username and password are required.' });
      return;
    }
    setIsAuthenticating(true);
    setAuthFeedback(null);
    try {
      const endpoint = isLoginMode ? '/api/auth/login' : '/api/auth/signup';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: authUsernameInput.trim(), password: authPasswordInput.trim() })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        localStorage.setItem('wa_auth_token', data.token);
        localStorage.setItem('wa_username', data.username);
        setToken(data.token);
        setUsername(data.username);
        setAuthFeedback({ type: 'success', text: isLoginMode ? 'Login successful!' : 'Account registered successfully!' });
        setAuthUsernameInput('');
        setAuthPasswordInput('');
      } else {
        setAuthFeedback({ type: 'error', text: data.error || 'Authentication failed.' });
      }
    } catch (err) {
      setAuthFeedback({ type: 'error', text: 'Network connection failure.' });
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleClearCache = async (silent: boolean = false) => {
    if (!silent) setIsClearingCache(true);
    try {
      const res = await fetchWithAuth('/api/media/clear-cache', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.success && !silent) {
          setFeedback({ type: 'success', text: data.message || 'Media cache cleared successfully.' });
        }
      }
    } catch (err: any) {
      if (!silent) {
        setFeedback({ type: 'error', text: err.message || 'Error clearing media cache.' });
      }
    } finally {
      if (!silent) setIsClearingCache(false);
    }
  };

  const handleUserSignOut = async () => {
    // Attempt to clear server-side media cache before purging credentials
    try {
      await fetchWithAuth('/api/media/clear-cache', { method: 'POST' });
    } catch (err) {
      console.warn('Silent cache clear on logout warning:', err);
    }
    localStorage.removeItem('wa_auth_token');
    localStorage.removeItem('wa_username');
    setToken(null);
    setUsername(null);
    setFeedback({ type: 'success', text: 'Logged out of your user account and cleared all media caches successfully.' });
  };

  // Button operations (Max 3)
  const addCustomButton = () => {
    if (customButtons.length >= 3) return;
    const nextId = 'btn-' + Math.random().toString(36).substring(5);
    setCustomButtons([...customButtons, { id: nextId, text: 'Custom Button' }]);
  };

  const removeCustomButton = (index: number) => {
    const next = [...customButtons];
    next.splice(index, 1);
    setCustomButtons(next);
  };

  const updateCustomButton = (index: number, field: 'id' | 'text', val: string) => {
    const next = [...customButtons];
    next[index] = { ...next[index], [field]: val };
    setCustomButtons(next);
  };

  // Template button operations (Max 3)
  const addTemplateButton = () => {
    if (templateButtons.length >= 3) return;
    setTemplateButtons([...templateButtons, { type: 'quickReply', text: 'New action', id: 'action-id' }]);
  };

  const removeTemplateButton = (index: number) => {
    const next = [...templateButtons];
    next.splice(index, 1);
    setTemplateButtons(next);
  };

  const updateTemplateButton = (index: number, field: keyof TemplateButtonItem, val: any) => {
    const next = [...templateButtons];
    next[index] = { ...next[index], [field]: val };
    setTemplateButtons(next);
  };

  // Early return for standalone Live QR scanner mode if requested via URL (/scan or /live-qr or ?view=scan)
  const isScanRoute = window.location.pathname.startsWith('/scan') || 
                      window.location.pathname.startsWith('/live-qr') || 
                      new URLSearchParams(window.location.search).get('view') === 'scan';

  if (isScanRoute) {
    return (
      <LiveQrScannerPage
        token={token}
        username={username}
        initialSessionId={activeLinkSessionId}
        onBackToDashboard={token ? () => {
          window.history.pushState({}, '', '/');
          setCurrentView('dispatch');
        } : undefined}
        isStandalone={true}
      />
    );
  }

  // Early return for login mode if not authenticated
  if (!token) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-emerald-500/30 selection:text-emerald-300 relative flex flex-col justify-between">
        {/* Reconnecting Banner */}
        {!serverOnline && (
          <div className="bg-amber-500/15 border-b border-amber-500/20 text-amber-400 py-2.5 px-6 text-center text-xs font-semibold flex items-center justify-center gap-2 animate-pulse sticky top-0 z-50 backdrop-blur-md">
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-500" />
            <span>Backend Server Connection Stale — Reconnecting automatically...</span>
          </div>
        )}

        {/* Background Ambient Accents */}
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-emerald-500/10 rounded-full filter blur-[120px] pointer-events-none" />
        <div className="absolute bottom-10 right-1/4 w-96 h-96 bg-teal-500/5 rounded-full filter blur-[120px] pointer-events-none" />

        {/* Header */}
        <header className="sticky top-0 z-10 backdrop-blur-md bg-slate-950/80 border-b border-slate-800 px-6 py-4">
          <div className="max-w-7xl mx-auto flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="bg-emerald-500 text-slate-950 p-2.5 rounded-xl shadow-lg shadow-emerald-500/20">
                <MessageSquare className="w-6 h-6" />
              </div>
              <div>
                <h1 id="app-title" className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                  WhatsApp Web Dashboard <span className="text-xs px-2 py-0.5 bg-emerald-500/15 text-emerald-400 font-mono rounded-full border border-emerald-500/20">v1.5.0</span>
                </h1>
                <p className="text-xs text-slate-400">Secure Node.js & Baileys WebSocket API Client</p>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content Dashboard */}
        <main className="max-w-7xl mx-auto px-6 py-12 flex-1 flex items-center justify-center w-full">
          <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl relative overflow-hidden animate-fadeIn">
            <div className="absolute top-0 left-0 w-1.5 h-full bg-emerald-500" />
            <div className="text-center mb-6">
              <div className="inline-flex bg-emerald-500/10 text-emerald-400 p-3 rounded-2xl mb-3">
                <Lock className="w-6 h-6 animate-pulse" />
              </div>
              <h2 className="text-xl font-bold text-white tracking-tight">
                {isLoginMode ? 'Sign In to Dashboard' : 'Create an Account'}
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                {isLoginMode ? 'Enter credentials to manage isolated sessions' : 'Sign up for private WhatsApp instances'}
              </p>
            </div>

            {authFeedback && (
              <div className={`p-3 rounded-xl text-xs mb-4 flex items-center gap-2 border ${
                authFeedback.type === 'success' 
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                  : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
              }`}>
                {authFeedback.type === 'success' ? <Check className="w-3.5 h-3.5 flex-shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />}
                <span>{authFeedback.text}</span>
              </div>
            )}

            <form onSubmit={handleAuthSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">Username</label>
                <div className="relative">
                  <User className="absolute left-3.5 top-3 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    required
                    value={authUsernameInput}
                    onChange={(e) => setAuthUsernameInput(e.target.value)}
                    placeholder="Enter username"
                    className="w-full bg-slate-950 border border-slate-850 focus:border-emerald-500 rounded-xl py-2 px-10 text-sm text-white placeholder-slate-600 focus:outline-none transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-3 w-4 h-4 text-slate-500" />
                  <input
                    type="password"
                    required
                    value={authPasswordInput}
                    onChange={(e) => setAuthPasswordInput(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-slate-950 border border-slate-850 focus:border-emerald-500 rounded-xl py-2 px-10 text-sm text-white placeholder-slate-600 focus:outline-none transition-all"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isAuthenticating}
                className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-2.5 px-4 rounded-xl text-xs transition-colors cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/15 disabled:opacity-50"
              >
                {isAuthenticating && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>{isLoginMode ? 'Access Dashboard' : 'Register Account'}</span>
              </button>
            </form>

            <div className="mt-6 pt-6 border-t border-slate-800 text-center">
              <button
                onClick={() => {
                  setIsLoginMode(!isLoginMode);
                  setAuthFeedback(null);
                }}
                className="text-xs text-emerald-400 hover:text-emerald-300 font-medium transition-colors cursor-pointer font-semibold"
              >
                {isLoginMode ? "Don't have an account? Sign Up" : 'Already have an account? Sign In'}
              </button>
            </div>

            {/* Firestore Status Card for Sign In screen */}
            <FirestoreStatusCard variant="signin" />

            {/* Server Resources Display */}
            {serverResources && (
              <div className="mt-8 pt-6 border-t border-slate-850 text-left">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[10px] font-bold text-slate-300 tracking-wider uppercase flex items-center gap-1.5">
                    <Server className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Host Server Resources</span>
                  </span>
                  <span className="flex items-center gap-1 text-[9px] font-mono text-emerald-400 font-bold bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                    <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                    Live Metrics
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-4">
                  {/* CPU Cores */}
                  <div className="bg-slate-950 border border-slate-850 rounded-xl p-3">
                    <span className="text-[10px] text-slate-500 block font-semibold mb-0.5">CPU Cores</span>
                    <span className="text-sm font-bold text-white font-mono flex items-center gap-1">
                      {serverResources.cpuCount || 0} <span className="text-[10px] text-slate-400 font-normal">Cores</span>
                    </span>
                    <span className="text-[9px] text-slate-500 font-mono block mt-1 truncate" title={serverResources.cpuModel}>
                      {serverResources.cpuModel || 'Intel/AMD Core'}
                    </span>
                  </div>

                  {/* Server Host IP */}
                  <div className="bg-slate-950 border border-slate-850 rounded-xl p-3">
                    <span className="text-[10px] text-slate-500 block font-semibold mb-0.5">Server IP Address</span>
                    <span className="text-sm font-bold text-emerald-400 font-mono flex items-center gap-1 truncate" title={serverResources.serverIp}>
                      <Globe className="w-3 h-3 text-emerald-500 shrink-0" />
                      <span className="truncate">{serverResources.serverIp || '127.0.0.1'}</span>
                    </span>
                    <span className="text-[9px] text-slate-500 font-mono block mt-1">
                      Private VPC Network
                    </span>
                  </div>

                  {/* RAM Status */}
                  <div className="bg-slate-950 border border-slate-850 rounded-xl p-3 col-span-2">
                    <div className="flex justify-between items-start mb-1.5">
                      <div>
                        <span className="text-[10px] text-slate-500 block font-semibold">RAM Allocation</span>
                        <span className="text-xs font-bold text-white font-mono">
                          {serverResources.usedMem ? (serverResources.usedMem / (1024 * 1024 * 1024)).toFixed(2) : '0'} / {serverResources.totalMem ? (serverResources.totalMem / (1024 * 1024 * 1024)).toFixed(1) : '0'} GB
                        </span>
                      </div>
                      <span className="text-[9px] text-slate-400 font-mono">
                        Free: {serverResources.freeMem ? (serverResources.freeMem / (1024 * 1024 * 1024)).toFixed(2) : '0'} GB
                      </span>
                    </div>
                    {/* Progress bar for RAM usage */}
                    <div className="space-y-1">
                      <div className="w-full h-1 bg-slate-900 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-emerald-500 rounded-full transition-all duration-1000"
                          style={{ width: `${Math.round((serverResources.usedMem / (serverResources.totalMem || 1)) * 100) || 0}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[9px] text-slate-500">
                        <span>Utilized</span>
                        <span className="font-mono text-emerald-400">{Math.round((serverResources.usedMem / (serverResources.totalMem || 1)) * 100) || 0}%</span>
                      </div>
                    </div>
                  </div>

                  {/* Disk/SSD Storage */}
                  <div className="bg-slate-950 border border-slate-850 rounded-xl p-3 col-span-2">
                    <div className="flex justify-between items-start mb-1.5">
                      <div>
                        <span className="text-[10px] text-slate-500 block font-semibold flex items-center gap-1">
                          <HardDrive className="w-3 h-3 text-slate-500" />
                          <span>SSD Persistent Storage</span>
                        </span>
                        <span className="text-xs font-bold text-white font-mono">
                          {serverResources.diskUsed ? (serverResources.diskUsed / (1024 * 1024 * 1024)).toFixed(1) : '0'} / {serverResources.diskTotal ? (serverResources.diskTotal / (1024 * 1024 * 1024)).toFixed(1) : '0'} GB
                        </span>
                      </div>
                      <span className="text-[9px] text-slate-400 font-mono">
                        Free: {serverResources.diskFree ? (serverResources.diskFree / (1024 * 1024 * 1024)).toFixed(1) : '0'} GB
                      </span>
                    </div>
                    {/* Progress bar for Disk usage */}
                    <div className="space-y-1">
                      <div className="w-full h-1 bg-slate-900 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-blue-500 rounded-full transition-all duration-1000"
                          style={{ width: `${Math.round((serverResources.diskUsed / (serverResources.diskTotal || 1)) * 100) || 0}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[9px] text-slate-500">
                        <span>Utilized</span>
                        <span className="font-mono text-blue-400">{Math.round((serverResources.diskUsed / (serverResources.diskTotal || 1)) * 100) || 0}%</span>
                      </div>
                    </div>
                  </div>

                  {/* Internet / Network speed */}
                  <div className="bg-slate-950 border border-slate-850 rounded-xl p-3 col-span-2">
                    <span className="text-[10px] text-slate-500 block font-semibold mb-1 flex items-center gap-1">
                      <Activity className="w-3 h-3 text-slate-500" />
                      <span>Host Internet Network Speed</span>
                    </span>
                    <div className="grid grid-cols-2 gap-2 text-left pt-0.5">
                      <div>
                        <span className="text-[9px] text-slate-500 block">Download Speed</span>
                        <span className="text-xs font-bold text-white font-mono">
                          ~{serverResources.internetSpeed || 1000} <span className="text-[9px] text-slate-400 font-normal">Mbps</span>
                        </span>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-500 block">Network Ping (Google)</span>
                        <span className="text-xs font-bold text-emerald-400 font-mono">
                          {serverResources.internetPing || 12} <span className="text-[9px] text-slate-500 font-normal">ms</span>
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>

        <footer className="border-t border-slate-900 bg-slate-950 px-6 py-4 text-center text-[10px] text-slate-600">
          <p>© 2026 WhatsApp Web Bridge Gateway. Multi-user isolate secure container.</p>
        </footer>
      </div>
    );
  }

  // If token is present, render the beautiful, premium sidebar dashboard!
  const navigationItems = [
    {
      id: 'dispatch',
      label: 'Dispatch Studio',
      description: 'Direct & bulk messaging engine',
      icon: Send,
    },
    {
      id: 'status',
      label: 'Status Broadcast',
      description: 'Publish Stories & Status updates',
      icon: Sparkles,
    },
    {
      id: 'workflows',
      label: 'Interactive Workflows',
      description: 'Trigger-based custom flows',
      icon: Zap,
    },
    {
      id: 'lists',
      label: 'List Flow Studio',
      description: 'Interactive button menus',
      icon: List,
    },
    {
      id: 'analytics',
      label: 'Delivery Analytics',
      description: 'Performance stats & metrics',
      icon: BarChart3,
    },
    {
      id: 'leads',
      label: 'Leads & Personalization',
      description: 'Manage contacts & groups',
      icon: Users,
      badge: savedGroups.length > 0 ? savedGroups.length : undefined
    },
    {
      id: 'group-invites',
      label: 'Group Links & Auto-Join',
      description: 'Auto-join (≥400), verify removal & captured links',
      icon: Link2,
      badge: capturedGroupInvites.length > 0 ? capturedGroupInvites.length : undefined
    },
    {
      id: 'scan',
      label: 'Live QR Scanner',
      description: 'Auto-syncing link for other phone',
      icon: Smartphone,
    },
    {
      id: 'shares',
      label: 'Captured Shares',
      description: 'Incoming media & links log',
      icon: Share2,
    },
    {
      id: 'queue-manager',
      label: 'Queue Studio',
      description: 'Pause or prioritize account message queues',
      icon: List,
    },
    {
      id: 'settings',
      label: 'Global Settings & Invites',
      description: 'Command filters & log rules',
      icon: Sliders,
    },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-emerald-500/30 selection:text-emerald-300 flex flex-col lg:flex-row relative">
      {/* Reconnecting Banner */}
      {!serverOnline && (
        <div className="bg-amber-500/15 border-b border-amber-500/20 text-amber-400 py-2.5 px-6 text-center text-xs font-semibold flex items-center justify-center gap-2 animate-pulse fixed top-0 left-0 right-0 z-50 backdrop-blur-md">
          <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-500" />
          <span>Backend Server Connection Stale — Reconnecting automatically...</span>
        </div>
      )}

      {/* Background Ambient Accents */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-emerald-500/10 rounded-full filter blur-[120px] pointer-events-none" />
      <div className="absolute bottom-10 right-1/4 w-96 h-96 bg-teal-500/5 rounded-full filter blur-[120px] pointer-events-none" />

      {/* ====== DESKTOP SIDEBAR ====== */}
      <aside className="hidden lg:flex lg:w-80 lg:flex-col lg:fixed lg:inset-y-0 bg-slate-900 border-r border-slate-850 p-6 z-30 select-none overflow-y-auto justify-between shadow-2xl">
        <div className="space-y-8">
          {/* Brand header */}
          <div className="flex items-center gap-3 pb-6 border-b border-slate-850/60">
            <div className="bg-emerald-500 text-slate-950 p-2.5 rounded-xl shadow-lg shadow-emerald-500/20">
              <MessageSquare className="w-6 h-6" />
            </div>
            <div>
              <h1 id="app-title" className="text-sm font-bold tracking-tight text-white flex items-center gap-1.5 uppercase tracking-wide">
                <span>WhatsApp Bridge</span>
                <span className="text-[10px] lowercase px-1.5 py-0.2 bg-emerald-500/15 text-emerald-400 font-mono rounded-full border border-emerald-500/20 font-bold">v1.5</span>
              </h1>
              <p className="text-[10px] text-slate-400">Secure WebSocket Agent Client</p>
            </div>
          </div>

          {/* Navigation Items */}
          <nav className="space-y-1.5">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-3 mb-2">Navigation Menu</p>
            {navigationItems.map((item) => {
              const IconComponent = item.icon;
              const isActive = currentView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setCurrentView(item.id as any);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between p-3 rounded-xl text-left transition-all group relative cursor-pointer ${
                    isActive
                      ? 'bg-slate-800 text-white border-l-2 border-emerald-500 shadow-md shadow-emerald-500/5 font-semibold'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850/50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <IconComponent className={`w-4 h-4 shrink-0 transition-colors ${isActive ? 'text-emerald-400' : 'text-slate-400 group-hover:text-slate-300'}`} />
                    <div>
                      <span className="text-xs block">{item.label}</span>
                      <span className="text-[9px] text-slate-500 font-normal block max-w-[170px] truncate">{item.description}</span>
                    </div>
                  </div>
                  
                  {item.badge !== undefined && (
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                      isActive 
                        ? 'bg-emerald-500/20 text-emerald-400' 
                        : 'bg-slate-800 text-slate-400 group-hover:bg-slate-750 group-hover:text-slate-300'
                    }`}>
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer details */}
        <div className="space-y-4 pt-6 border-t border-slate-850/60 mt-8">
          {/* Host Server Resources Widget */}
          {serverResources && (
            <div className="bg-slate-950/30 border border-slate-850/50 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between font-bold text-slate-300">
                <span className="flex items-center gap-1.5 text-[10px] tracking-wider uppercase">
                  <Server className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Host Server Health</span>
                </span>
                <span className="flex items-center gap-1 text-[8px] text-emerald-400 font-bold bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded-full">
                  <span className="w-1 h-1 bg-emerald-400 rounded-full animate-pulse" />
                  Live
                </span>
              </div>
              
              <div className="grid grid-cols-2 gap-1.5 text-[9px] text-slate-400">
                <div className="bg-slate-950/50 p-1.5 rounded-lg border border-slate-850/40">
                  <span className="text-[7.5px] text-slate-500 block mb-0.5">CPU CORES</span>
                  <span className="font-bold text-slate-200 font-mono">{serverResources.cpuCount || 0} Cores</span>
                </div>
                <div className="bg-slate-950/50 p-1.5 rounded-lg border border-slate-850/40">
                  <span className="text-[7.5px] text-slate-500 block mb-0.5">SERVER IP</span>
                  <span className="font-bold text-emerald-400 font-mono truncate block" title={serverResources.serverIp}>{serverResources.serverIp || '127.0.0.1'}</span>
                </div>
              </div>
              
              <div className="space-y-1">
                <div className="flex justify-between text-[8.5px]">
                  <span className="text-slate-500">RAM Utilized</span>
                  <span className="font-mono text-emerald-400 font-bold">{Math.round((serverResources.usedMem / (serverResources.totalMem || 1)) * 100) || 0}%</span>
                </div>
                <div className="w-full h-1 bg-slate-950 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-emerald-500 rounded-full transition-all duration-1000"
                    style={{ width: `${Math.round((serverResources.usedMem / (serverResources.totalMem || 1)) * 100) || 0}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Current Connected Session / User Info */}
          <div className="bg-slate-950/40 border border-slate-850/60 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">Active User:</span>
              <span className="font-bold text-slate-300 truncate max-w-[120px]">{username}</span>
            </div>
            
            {/* Connection Status Indicator */}
            <div className={`flex items-center gap-2 px-2.5 py-1 rounded-lg text-[10px] font-medium border ${
              connected 
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25' 
                : status === 'connecting'
                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/25'
                  : 'bg-slate-900 text-slate-400 border-slate-800'
            }`}>
              {connected ? (
                <>
                  <Wifi className="w-3 h-3 animate-pulse" />
                  <span>WhatsApp Connected</span>
                </>
              ) : status === 'connecting' ? (
                <>
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  <span>Connecting Socket...</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3 h-3" />
                  <span>Socket Offline</span>
                </>
              )}
            </div>
          </div>

          {/* Quick Admin action panel */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => handleClearCache()}
              disabled={isClearingCache}
              className="flex items-center justify-center gap-1.5 py-2 px-1 bg-slate-950 hover:bg-slate-850 text-slate-400 hover:text-slate-200 text-[10px] font-bold rounded-lg border border-slate-850 cursor-pointer disabled:opacity-50"
              title="Purge cached media upload files to free up disk space"
            >
              <Trash2 className={`w-3 h-3 text-rose-400/90 ${isClearingCache ? 'animate-spin' : ''}`} />
              <span>Cache</span>
            </button>
            <button
              onClick={handleUserSignOut}
              className="flex items-center justify-center gap-1.5 py-2 px-1 bg-slate-950 hover:bg-slate-850 text-slate-400 hover:text-rose-400 text-[10px] font-bold rounded-lg border border-slate-850 cursor-pointer transition-colors"
              title="Sign out of multi-user dashboard"
            >
              <Lock className="w-3 h-3 text-slate-500" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </aside>

      {/* ====== MAIN PANEL CONTENT AREA ====== */}
      <div className="flex-1 lg:pl-80 flex flex-col min-h-screen">
        
        {/* ====== MOBILE NAV HEADER (Sticky top, hidden on large screens) ====== */}
        <header className="sticky top-0 z-20 backdrop-blur-md bg-slate-950/80 border-b border-slate-850 px-6 py-3.5 lg:hidden flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-emerald-500 text-slate-950 p-1.5 rounded-lg">
              <MessageSquare className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-xs font-black uppercase tracking-wider text-white">WhatsApp Bridge</h1>
              <span className="text-[10px] text-slate-400 block -mt-0.5">
                {navigationItems.find(item => item.id === currentView)?.label || 'Dashboard'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Tiny connection status light */}
            <div className={`w-2.5 h-2.5 rounded-full ${connected ? 'bg-emerald-400 animate-pulse' : status === 'connecting' ? 'bg-amber-400 animate-pulse' : 'bg-rose-500'}`} title={connected ? "Connected" : "Disconnected"} />
            
            {/* Menu trigger button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 bg-slate-900 border border-slate-800 text-slate-300 hover:text-white rounded-lg transition-all"
            >
              <Menu className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* ====== MOBILE NAVIGATION EXAPANDED DROPDOWN DRAWER ====== */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="lg:hidden absolute top-[52px] left-0 right-0 bg-slate-900 border-b border-slate-850 z-20 overflow-hidden shadow-2xl"
            >
              <div className="p-4 space-y-4">
                <div className="grid grid-cols-1 gap-1">
                  {navigationItems.map((item) => {
                    const IconComponent = item.icon;
                    const isActive = currentView === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => {
                          setCurrentView(item.id as any);
                          setMobileMenuOpen(false);
                        }}
                        className={`w-full flex items-center justify-between p-2.5 rounded-lg text-left transition-all ${
                          isActive
                            ? 'bg-slate-800 text-emerald-400 font-bold border-l-2 border-emerald-500'
                            : 'text-slate-400 hover:bg-slate-850/50 hover:text-slate-200'
                        }`}
                      >
                        <div className="flex items-center gap-3 text-xs">
                          <IconComponent className="w-3.5 h-3.5 shrink-0" />
                          <span>{item.label}</span>
                        </div>
                        {item.badge !== undefined && (
                          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-slate-850 text-slate-400">
                            {item.badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-4 text-xs">
                  <div className="text-slate-400">
                    User: <strong className="text-white">{username}</strong>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        handleClearCache();
                        setMobileMenuOpen(false);
                      }}
                      className="py-1 px-2.5 bg-slate-950 hover:bg-slate-850 border border-slate-800 text-[10px] text-slate-300 rounded-lg font-bold"
                    >
                      Clear Cache
                    </button>
                    <button
                      onClick={() => {
                        handleUserSignOut();
                        setMobileMenuOpen(false);
                      }}
                      className="py-1 px-2.5 bg-slate-950 hover:bg-slate-850 border border-slate-850 text-[10px] text-rose-400 rounded-lg font-bold"
                    >
                      Sign Out
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ====== MAIN CORE CONTENT VIEW ====== */}
        <main className="p-6 md:p-8 max-w-7xl w-full mx-auto flex-1">
          {currentView === 'dispatch' ? (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* LEFT COLUMN: Connection, Quick Messages templates */}
          <div className="lg:col-span-5 flex flex-col gap-8">
            
            {/* Multi-Account Manager & Authentication Gateways */}
            <div id="connection-card" className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-xl backdrop-blur-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1.5 h-full bg-emerald-500" />
              
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-bold text-white flex items-center gap-2 uppercase tracking-wider">
                  <Server className="w-4 h-4 text-emerald-400" />
                  <span>1. Accounts & Multi-Login</span>
                </h2>
                <button
                  type="button"
                  onClick={() => setShowSessionModal(true)}
                  className="flex items-center gap-1 px-2.5 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-[11px] font-bold rounded-lg border border-emerald-500/20 transition-all cursor-pointer"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>Add Account</span>
                </button>
              </div>

              <p className="text-xs text-slate-400 mb-4 leading-relaxed">
                Configure and scan QR/Pairing codes for multiple WhatsApp numbers. Checked accounts will be used in round-robin loop dispatching.
              </p>

              {/* Accounts List */}
              <div className="space-y-3 mb-5 max-h-[220px] overflow-y-auto pr-1">
                {sessionsList.map((sess) => {
                  const isLinkSelected = activeLinkSessionId === sess.id;
                  const isConnected = sess.status === 'connected';
                  const isChecked = selectedSessionIds.includes(sess.id);

                  return (
                    <div 
                      key={sess.id}
                      onClick={() => {
                        if (!isConnected) {
                          setActiveLinkSessionId(sess.id);
                        }
                      }}
                      className={`p-3.5 rounded-xl border transition-all text-left relative ${
                        isLinkSelected && !isConnected
                          ? 'bg-slate-950/90 border-emerald-500/30 ring-1 ring-emerald-500/20' 
                          : 'bg-slate-950/60 border-slate-850 hover:bg-slate-950/80'
                      } ${!isConnected ? 'cursor-pointer' : ''}`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2 min-w-0">
                          {isConnected && (
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedSessionIds([...selectedSessionIds, sess.id]);
                                } else {
                                  setSelectedSessionIds(selectedSessionIds.filter(id => id !== sess.id));
                                }
                              }}
                              className="rounded text-teal-500 focus:ring-teal-500 bg-slate-900 border-slate-800 shrink-0 cursor-pointer"
                            />
                          )}
                          <div className="truncate">
                            <span className="font-bold text-xs text-slate-200 block truncate">
                              {sess.name}
                            </span>
                            <span className="text-[9.5px] text-slate-500 font-mono block truncate">
                              ID: {sess.id}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase border ${
                            isConnected 
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/15' 
                              : sess.status === 'connecting'
                                ? 'bg-amber-500/10 text-amber-400 border-amber-500/15'
                                : 'bg-slate-800 text-slate-400 border-slate-750'
                          }`}>
                            {sess.status}
                          </span>

                          {sess.id !== 'primary' && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteSession(sess.id);
                              }}
                              className="text-slate-600 hover:text-rose-400 p-0.5 rounded transition-all cursor-pointer"
                              title="Delete Session"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {isConnected ? (
                        <div className="bg-slate-900/60 p-2 rounded-lg border border-slate-850 space-y-1 mt-1 text-[10px] text-slate-400 font-mono">
                          <div className="flex items-center gap-1">
                            <User className="w-3 h-3 text-emerald-400" />
                            <span className="truncate">Active: {sess.user?.name || 'Authorized'}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Info className="w-3 h-3 text-emerald-400" />
                            <span className="truncate select-all">{sess.user?.id || 'Unknown JID'}</span>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2 mt-1">
                          <div className="text-[10px] text-slate-500 flex items-center justify-between">
                            <span>Click card to configure linking credentials.</span>
                            {isLinkSelected && <span className="text-emerald-400 font-bold animate-pulse">Selected</span>}
                          </div>

                          <div className="grid grid-cols-2 gap-1.5">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleReconnectSession(sess.id);
                              }}
                              disabled={isReconnectingSession[sess.id] || sess.status === 'connecting'}
                              className="text-[10px] font-bold px-2 py-1.5 bg-emerald-500/15 hover:bg-emerald-500/25 active:scale-[0.98] text-emerald-400 border border-emerald-500/30 hover:border-emerald-500/50 rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                              title="Try Reconnecting to Previous Session Credentials"
                            >
                              <RefreshCw className={`w-3 h-3 ${isReconnectingSession[sess.id] || sess.status === 'connecting' ? 'animate-spin' : ''}`} />
                              <span className="truncate">{isReconnectingSession[sess.id] ? 'Connecting...' : 'Reconnect'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveLinkSessionId(sess.id);
                                handleRegenerateSessionQr(sess.id);
                              }}
                              disabled={isRegeneratingQr[sess.id]}
                              className="text-[10px] font-bold px-2 py-1.5 bg-blue-500/15 hover:bg-blue-500/25 active:scale-[0.98] text-blue-400 border border-blue-500/30 hover:border-blue-500/50 rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                              title="Clear stale credentials and generate a fresh live QR code"
                            >
                              <QrCode className="w-3 h-3" />
                              <span className="truncate">{isRegeneratingQr[sess.id] ? 'Generating...' : 'Fresh QR'}</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Linking Interface Sub-Panel for Disconnected Active Session */}
              {(() => {
                const activeSess = sessionsList.find(s => s.id === activeLinkSessionId);
                if (!activeSess || activeSess.status === 'connected') return null;

                return (
                  <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-4.5 space-y-4 animate-fadeIn">
                    <div className="flex items-center justify-between border-b border-slate-850 pb-2">
                      <span className="text-xs font-bold text-emerald-400 uppercase tracking-wide flex items-center gap-1">
                        <QrCode className="w-3.5 h-3.5" />
                        <span>Link: {activeSess.name}</span>
                      </span>
                      <span className="text-[8.5px] font-mono px-2 py-0.5 bg-slate-900 text-slate-400 border border-slate-850 rounded uppercase font-bold">
                        {linkMode} Mode
                      </span>
                    </div>

                    {/* Saved Session Credentials Quick Reconnect & QR Generation Banner */}
                    <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-0.5">
                        <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                          <Zap className="w-4 h-4 text-emerald-400 shrink-0" />
                          <span>Session Credentials & Linking</span>
                        </span>
                        <p className="text-[10.5px] text-slate-300 leading-snug">
                          If disconnected, reconnect with saved credentials or generate a fresh QR code immediately.
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleReconnectSession(activeSess.id)}
                          disabled={isReconnectingSession[activeSess.id] || activeSess.status === 'connecting'}
                          className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-850 border border-emerald-500/30 text-emerald-300 font-bold text-xs rounded-lg transition-all cursor-pointer shadow-md disabled:opacity-50"
                          title="Try reconnecting with saved credentials"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${isReconnectingSession[activeSess.id] || activeSess.status === 'connecting' ? 'animate-spin' : ''}`} />
                          <span>{isReconnectingSession[activeSess.id] ? 'Reconnecting...' : 'Try Saved Session'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRegenerateSessionQr(activeSess.id)}
                          disabled={isRegeneratingQr[activeSess.id]}
                          className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-lg transition-all cursor-pointer shadow-md disabled:opacity-50"
                          title="Purge stale credentials and generate a brand new live QR code"
                        >
                          <QrCode className="w-3.5 h-3.5" />
                          <span>{isRegeneratingQr[activeSess.id] ? 'Generating...' : 'Scan New QR'}</span>
                        </button>
                      </div>
                    </div>

                    {/* Mode selector */}
                    <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-850">
                      <button
                        type="button"
                        onClick={() => setLinkMode('qr')}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                          linkMode === 'qr'
                            ? 'bg-emerald-500 text-slate-950 shadow-md font-bold'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <QrCode className="w-3 h-3" />
                        <span>QR Code</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setLinkMode('pairing')}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                          linkMode === 'pairing'
                            ? 'bg-emerald-500 text-slate-950 shadow-md font-bold'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <Link2 className="w-3 h-3" />
                        <span>Pairing Code</span>
                      </button>
                    </div>

                    {linkMode === 'qr' ? (
                      <div className="space-y-4 text-center">
                        <div className="flex items-center justify-between text-left">
                          <p className="text-[11px] text-slate-300 leading-relaxed">
                            Scan this QR code with WhatsApp on your phone to link <span className="text-emerald-400 font-semibold">"{activeSess.name}"</span>.
                          </p>
                          <button
                            type="button"
                            onClick={() => handleRegenerateSessionQr(activeSess.id)}
                            disabled={isRegeneratingQr[activeSess.id]}
                            className="shrink-0 text-[10.5px] font-bold px-2.5 py-1 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 hover:border-emerald-500/50 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                            title="Force clear stale credential lock & generate a fresh dynamic QR"
                          >
                            <RefreshCw className={`w-3 h-3 ${isRegeneratingQr[activeSess.id] ? 'animate-spin' : ''}`} />
                            <span>{isRegeneratingQr[activeSess.id] ? 'Generating...' : 'Generate Fresh QR'}</span>
                          </button>
                        </div>

                        <div className="flex flex-col items-center justify-center gap-2">
                          <div className="relative p-2.5 bg-white rounded-xl border border-slate-700 shadow-xl flex flex-col items-center justify-center min-h-[170px] min-w-[170px]">
                            {activeSess.qrBase64 ? (
                              <div className="relative">
                                <img 
                                  src={activeSess.qrBase64} 
                                  alt="WhatsApp QR Code" 
                                  className="w-36 h-36 block"
                                  referrerPolicy="no-referrer"
                                />
                                <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-500 opacity-60 animate-bounce" />
                              </div>
                            ) : (
                              <div className="flex flex-col items-center justify-center gap-2 text-slate-850 p-3">
                                <RefreshCw className="w-6 h-6 text-emerald-600 animate-spin" />
                                <span className="text-[9.5px] font-bold text-slate-500 px-2 leading-tight">
                                  Waiting for dynamic QR generation...
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleRegenerateSessionQr(activeSess.id)}
                                  disabled={isRegeneratingQr[activeSess.id]}
                                  className="mt-1 text-[10px] font-bold px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md transition-all flex items-center gap-1 cursor-pointer"
                                >
                                  <QrCode className="w-3 h-3" />
                                  <span>Force Generate QR</span>
                                </button>
                              </div>
                            )}
                          </div>

                          <span className="text-[9.5px] text-slate-500">
                            Auto-refreshes every 20-30s. If QR is stuck, click "Generate Fresh QR" above.
                          </span>

                          {/* Shareable Live QR Link for Other Phone / Screen */}
                          <div className="w-full pt-3 mt-1 border-t border-slate-800/80 flex flex-col gap-2">
                            <div className="flex items-center justify-between gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  const url = `${window.location.origin}/scan?session=${encodeURIComponent(activeSess.id)}${token ? `&token=${encodeURIComponent(token)}` : ''}`;
                                  window.open(url, '_blank');
                                }}
                                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-400 font-bold text-[11px] rounded-xl transition-all cursor-pointer shadow-sm"
                                title="Open live auto-syncing QR code in a separate screen or send to another phone"
                              >
                                <Smartphone className="w-3.5 h-3.5" />
                                <span>Open Live QR on Other Phone</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  const url = `${window.location.origin}/scan?session=${encodeURIComponent(activeSess.id)}${token ? `&token=${encodeURIComponent(token)}` : ''}`;
                                  navigator.clipboard.writeText(url);
                                  setFeedback({ type: 'success', text: '📋 Live Scanner Link copied! Open this URL on your second phone to scan.' });
                                }}
                                className="px-3 py-2 bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-300 font-semibold text-[11px] rounded-xl transition-all cursor-pointer flex items-center gap-1"
                                title="Copy direct live QR link to clipboard"
                              >
                                <Copy className="w-3.5 h-3.5" />
                                <span>Copy Link</span>
                              </button>
                            </div>
                            <span className="text-[9px] text-slate-400">
                              💡 As the QR code refreshes on the server, the link also updates in real-time!
                            </span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <p className="text-[11px] text-slate-300 leading-relaxed">
                          Request an 8-character pairing code to connect <span className="text-emerald-400 font-semibold">"{activeSess.name}"</span> without camera scans.
                        </p>

                        <div className="space-y-3">
                          <div>
                            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wide block mb-1">
                              WhatsApp Phone Number
                            </label>
                            <div className="relative">
                              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                                <Phone className="w-3.5 h-3.5" />
                              </div>
                              <input
                                type="text"
                                required
                                placeholder="e.g. 919876543210"
                                value={pairingPhone}
                                onChange={(e) => setPairingPhone(e.target.value)}
                                className="w-full bg-slate-900 border border-slate-800 hover:border-slate-750 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-xl pl-8.5 pr-3 py-1.5 text-xs text-white placeholder-slate-600 outline-none"
                              />
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleRequestSessionPairingCode(activeSess.id, pairingPhone)}
                            className="w-full py-1.5 px-3 bg-emerald-500 hover:bg-emerald-600 active:scale-[0.98] text-slate-950 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-emerald-500/10"
                          >
                            <Link2 className="w-3.5 h-3.5" />
                            <span>Request Pairing Code</span>
                          </button>
                        </div>

                        {activeSess.pairingCode && (
                          <div className="bg-slate-900/80 border border-emerald-500/30 rounded-xl p-3.5 text-center space-y-1.5">
                            <span className="text-[9.5px] font-bold text-emerald-400 uppercase tracking-wider block">
                              Active Pairing Code
                            </span>
                            <div className="text-xl font-black text-white font-mono tracking-widest bg-slate-950 border border-slate-850 py-2 px-4 rounded-lg select-all inline-block">
                              {activeSess.pairingCode}
                            </div>
                            <p className="text-[9px] text-slate-500 leading-normal">
                              Enter this code on your mobile device when prompted by WhatsApp.
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Disconnection & QR Troubleshooting Info Accordion */}
                    <div className="pt-2 border-t border-slate-850/60">
                      <button
                        type="button"
                        onClick={() => setShowSessionHelp(!showSessionHelp)}
                        className="w-full text-left flex items-center justify-between text-[11px] font-semibold text-slate-400 hover:text-emerald-400 py-1 transition-colors cursor-pointer"
                      >
                        <span className="flex items-center gap-1.5">
                          <Info className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Why did my session disconnect or stop generating a QR code?</span>
                        </span>
                        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showSessionHelp ? 'rotate-180' : ''}`} />
                      </button>

                      {showSessionHelp && (
                        <div className="mt-2.5 p-3 bg-slate-900/90 border border-slate-800 rounded-xl space-y-2.5 text-[11px] text-slate-300 leading-relaxed animate-fadeIn">
                          <div className="space-y-1">
                            <span className="font-bold text-emerald-400 flex items-center gap-1">
                              <span>1. Why sessions disconnect automatically:</span>
                            </span>
                            <ul className="list-disc list-inside space-y-0.5 text-slate-400 pl-1 text-[10.5px]">
                              <li><strong className="text-white">Multi-Device Conflict (Code 440):</strong> Opening WhatsApp Web on another browser or device logs this session out because WhatsApp only allows 1 active web stream per linked session.</li>
                              <li><strong className="text-white">Phone Sleep / Battery Saver:</strong> If your phone's battery saver puts WhatsApp to sleep or turns off Wi-Fi/mobile data, the WebSocket stream closes.</li>
                              <li><strong className="text-white">Device Unlinked on Phone:</strong> If you logged out the linked device in WhatsApp on your phone (<em className="text-slate-300">Settings &gt; Linked Devices</em>).</li>
                            </ul>
                          </div>

                          <div className="space-y-1 border-t border-slate-800/80 pt-2">
                            <span className="font-bold text-emerald-400 flex items-center gap-1">
                              <span>2. Why no new QR code was generated:</span>
                            </span>
                            <p className="text-[10.5px] text-slate-400">
                              When WhatsApp disconnects, if stale credentials remain on disk, the system assumes you are reconnecting an existing session and enters <em className="text-slate-200">Credential Restore Mode</em> instead of pairing mode. In restore mode, WhatsApp <strong>does not emit a QR code</strong>!
                            </p>
                            <p className="text-[10.5px] text-emerald-300 font-medium">
                              💡 <strong>Solution:</strong> The system now automatically purges stale credentials when a session is revoked. You can also simply click <strong className="text-white font-bold">"Generate Fresh QR"</strong> or <strong className="text-white font-bold">"Scan New QR"</strong> anytime to wipe expired credential locks and get a brand new QR code in 1-2 seconds.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* QR Session History Sub-Panel inside Connection Card */}
              <div className="mt-5 pt-4 border-t border-slate-850/80 space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      <Clock className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                        <span>QR Session History</span>
                        <span className="text-[10px] font-mono px-2 py-0.5 bg-slate-900 text-emerald-400 border border-slate-800 rounded-full font-bold">
                          {qrHistory.length} Recorded
                        </span>
                      </h3>
                      <p className="text-[10px] text-slate-400">
                        Select & re-authenticate previously generated session QR codes without starting setup from scratch.
                      </p>
                    </div>
                  </div>

                  {qrHistory.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setQrHistory([]);
                        localStorage.removeItem('navi_qr_session_history');
                        setFeedback({ type: 'success', text: 'QR session history cleared.' });
                      }}
                      className="text-[10.5px] font-semibold text-slate-400 hover:text-rose-400 flex items-center gap-1.5 px-2.5 py-1 bg-slate-900 border border-slate-800 hover:border-rose-500/30 rounded-lg transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Clear History</span>
                    </button>
                  )}
                </div>

                {/* Filter/Search if history > 3 */}
                {qrHistory.length > 3 && (
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Filter QR history by session name or ID..."
                      value={qrHistorySearch}
                      onChange={(e) => setQrHistorySearch(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-850 rounded-lg pl-8 pr-3 py-1 text-xs text-white placeholder-slate-600 outline-none focus:border-emerald-500"
                    />
                  </div>
                )}

                {qrHistory.length === 0 ? (
                  <div className="bg-slate-950/50 border border-dashed border-slate-800/80 rounded-xl p-4 text-center space-y-1">
                    <QrCode className="w-5 h-5 text-slate-600 mx-auto opacity-70" />
                    <span className="text-xs text-slate-400 font-semibold block">No QR Session History Yet</span>
                    <p className="text-[10px] text-slate-500 max-w-sm mx-auto leading-normal">
                      As QR codes and pairing codes are generated for your WhatsApp sessions, they will be automatically logged here for fast re-authentication.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                    {qrHistory
                      .filter((item) => {
                        if (!qrHistorySearch.trim()) return true;
                        const q = qrHistorySearch.toLowerCase();
                        return (
                          item.sessionId.toLowerCase().includes(q) ||
                          item.sessionName.toLowerCase().includes(q) ||
                          (item.userName && item.userName.toLowerCase().includes(q))
                        );
                      })
                      .map((item) => {
                        const matchedSess = sessionsList.find((s) => s.id === item.sessionId);
                        const isConnected = matchedSess?.status === 'connected';
                        const isConnecting = isReconnectingSession[item.sessionId] || matchedSess?.status === 'connecting';
                        const isSelected = activeLinkSessionId === item.sessionId;

                        return (
                          <div
                            key={item.id}
                            className={`p-3 rounded-xl border transition-all text-left flex items-center justify-between gap-3 ${
                              isSelected
                                ? 'bg-slate-950/90 border-emerald-500/40 ring-1 ring-emerald-500/20'
                                : 'bg-slate-950/60 border-slate-850 hover:border-slate-800'
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              {item.qrBase64 ? (
                                <div
                                  onClick={() => setPreviewQrModal(item)}
                                  className="relative group shrink-0 cursor-pointer"
                                  title="Click to view QR in high resolution"
                                >
                                  <img
                                    src={item.qrBase64}
                                    alt="QR Code"
                                    className="w-11 h-11 rounded-lg bg-white p-1 border border-slate-700 object-contain group-hover:scale-105 transition-transform"
                                    referrerPolicy="no-referrer"
                                  />
                                  <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                                    <Eye className="w-3.5 h-3.5 text-white" />
                                  </div>
                                </div>
                              ) : (
                                <div className="w-11 h-11 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center shrink-0">
                                  <QrCode className="w-5 h-5 text-slate-500" />
                                </div>
                              )}

                              <div className="min-w-0 flex-1 space-y-0.5">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-bold text-xs text-white truncate">
                                    {item.sessionName}
                                  </span>
                                  <span className="text-[9px] font-mono text-slate-500 px-1.5 py-0.2 bg-slate-900 border border-slate-800 rounded">
                                    ID: {item.sessionId}
                                  </span>
                                  {isConnected ? (
                                    <span className="text-[8.5px] font-bold px-1.5 py-0.2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full uppercase">
                                      Connected
                                    </span>
                                  ) : (
                                    <span className="text-[8.5px] font-bold px-1.5 py-0.2 bg-slate-800 text-slate-400 border border-slate-750 rounded-full uppercase">
                                      {matchedSess?.status || 'Saved'}
                                    </span>
                                  )}
                                </div>

                                <div className="flex items-center gap-2 text-[10px] text-slate-400 flex-wrap">
                                  <span className="flex items-center gap-1">
                                    <Clock className="w-3 h-3 text-slate-500" />
                                    <span>{new Date(item.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</span>
                                  </span>
                                  {item.pairingCode && (
                                    <span className="font-mono text-amber-400 bg-amber-500/10 px-1.5 py-0.2 rounded border border-amber-500/20 text-[9.5px]">
                                      Code: {item.pairingCode}
                                    </span>
                                  )}
                                  {item.userName && (
                                    <span className="text-emerald-400 text-[9.5px] truncate">
                                      User: {item.userName}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveLinkSessionId(item.sessionId);
                                  handleReconnectSession(item.sessionId);
                                }}
                                disabled={isConnecting}
                                className="px-2.5 py-1.5 bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] text-slate-950 font-bold text-xs rounded-lg transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-md shadow-emerald-500/10"
                                title="Select session and trigger re-authentication with saved credentials"
                              >
                                <RefreshCw className={`w-3.5 h-3.5 ${isConnecting ? 'animate-spin' : ''}`} />
                                <span>{isConnecting ? 'Connecting...' : 'Re-authenticate'}</span>
                              </button>

                              {item.qrBase64 && (
                                <button
                                  type="button"
                                  onClick={() => setPreviewQrModal(item)}
                                  className="p-1.5 text-slate-400 hover:text-white bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-lg transition-colors cursor-pointer"
                                  title="View QR Code full size"
                                >
                                  <Maximize2 className="w-3.5 h-3.5" />
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => {
                                  const filtered = qrHistory.filter((h) => h.id !== item.id);
                                  setQrHistory(filtered);
                                  localStorage.setItem('navi_qr_session_history', JSON.stringify(filtered));
                                }}
                                className="p-1.5 text-slate-500 hover:text-rose-400 bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-lg transition-colors cursor-pointer"
                                title="Remove from history"
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
            </div>

            {/* Saved Groups Directory */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-xl backdrop-blur-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1.5 h-full bg-indigo-500" />
              
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold text-white flex items-center gap-2 uppercase tracking-wider">
                  <Users className="w-4 h-4 text-indigo-400" />
                  <span>2. Saved WhatsApp Groups</span>
                </h2>
                <span className="text-[9px] font-mono px-2 py-0.5 bg-indigo-500/15 text-indigo-400 border border-indigo-500/20 rounded-full font-bold">
                  {savedGroups.length} Saved
                </span>
              </div>

              <p className="text-xs text-slate-400 mb-4 leading-relaxed">
                Manually logs when "getid" or "id" is sent in group chats. You can also synchronize all your joined groups live.
              </p>

              {/* Sync Live Groups Block */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4 bg-slate-950/40 p-3 rounded-xl border border-slate-850">
                <div className="text-xs text-slate-300">
                  <strong className="text-indigo-400">Sync Live Groups:</strong> Fetch all groups from your connected WhatsApp account instantly with live send settings.
                </div>
                <button
                  type="button"
                  disabled={isSyncingGroups}
                  onClick={handleSyncGroups}
                  className="w-full sm:w-auto py-1.5 px-3 bg-indigo-500 hover:bg-indigo-400 disabled:bg-slate-800 text-slate-950 font-bold text-xs rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:text-slate-500"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncingGroups ? 'animate-spin' : ''}`} />
                  <span>{isSyncingGroups ? 'Syncing...' : 'Sync Active Groups'}</span>
                </button>
              </div>

              {savedGroups.length === 0 ? (
                <div className="p-4 bg-slate-950/40 rounded-xl border border-slate-850/60 text-center text-slate-500 text-[11px] italic">
                  No saved groups found. Connect WhatsApp and click "Sync Active Groups" or send "getid" in a group.
                </div>
              ) : (
                (() => {
                  const filteredGroups = savedGroups.filter(g => {
                    if (groupFilter === 'canSend') {
                      return g.canUserSend !== false;
                    }
                    if (groupFilter === 'onlyAdmin') {
                      return g.isAdmin === true;
                    }
                    return true;
                  });

                  return (
                    <div className="space-y-3.5">
                      {/* Filter Controls */}
                      <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-950/20 rounded-lg border border-slate-850/60">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 select-none shrink-0">Show:</span>
                        <button
                          type="button"
                          onClick={() => setGroupFilter('all')}
                          className={`px-2.5 py-1 rounded text-xs transition-all cursor-pointer ${
                            groupFilter === 'all' 
                              ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-bold' 
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          All ({savedGroups.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setGroupFilter('canSend')}
                          className={`px-2.5 py-1 rounded text-xs transition-all cursor-pointer flex items-center gap-1 ${
                            groupFilter === 'canSend' 
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold' 
                              : 'text-slate-400 hover:text-white'
                          }`}
                          title="Groups where everyone can send, or where you are an admin"
                        >
                          <span>✓ Allowed to Post</span>
                          <span className="text-[10px] opacity-75">({savedGroups.filter(g => g.canUserSend !== false).length})</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setGroupFilter('onlyAdmin')}
                          className={`px-2.5 py-1 rounded text-xs transition-all cursor-pointer flex items-center gap-1 ${
                            groupFilter === 'onlyAdmin' 
                              ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30 font-bold' 
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          <span>⭐ You Are Admin</span>
                          <span className="text-[10px] opacity-75">({savedGroups.filter(g => g.isAdmin === true).length})</span>
                        </button>
                      </div>

                      {/* Select Group Dropdown */}
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Insert JID into Recipient Field</label>
                        <select
                          onChange={(e) => {
                            const jid = e.target.value;
                            if (jid) {
                              setPhoneNumber(jid);
                              setRecipientType('group');
                              const matched = savedGroups.find(g => g.jid === jid);
                              if (matched && matched.sessionId) {
                                  if (!selectedSessionIds.includes(matched.sessionId)) {
                                    setSelectedSessionIds([...selectedSessionIds, matched.sessionId]);
                                  }
                              }
                            }
                          }}
                          className="w-full bg-slate-950 border border-slate-850 rounded-xl px-3 py-2 text-xs text-white outline-none cursor-pointer"
                        >
                          <option value="">-- Click to select and insert Group JID ({filteredGroups.length} visible) --</option>
                          {filteredGroups.map(g => {
                            let suffix = '';
                            if (g.isAdmin) suffix += ' [Admin ⭐]';
                            if (g.canUserSend === false) suffix += ' [Locked 🔒]';
                            return (
                              <option key={g.jid} value={g.jid}>
                                {g.name || 'No Name'} ({g.jid.split('@')[0]}){suffix}{g.sessionId ? ` [Owner: ${g.sessionId}]` : ''}
                              </option>
                            );
                          })}
                        </select>
                      </div>

                      {/* Bulk Management: Select All Checkbox & Unselect All Button */}
                      <div className="flex items-center justify-between p-2.5 bg-slate-950/40 border border-slate-850/60 rounded-xl">
                        <div className="flex items-center gap-2">
                          <input
                            id="select-all-groups"
                            type="checkbox"
                            checked={filteredGroups.length > 0 && filteredGroups.every(g => phoneNumber.includes(g.jid))}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              if (checked) {
                                setRecipientType('group');
                                const separator = splitByCommas ? ', ' : '\n';
                                const allJids = filteredGroups.map(g => g.jid).join(separator);
                                setPhoneNumber(allJids);
                                
                                // Ensure all owners of the saved groups are selected in session IDs
                                const newSessionIds = [...selectedSessionIds];
                                filteredGroups.forEach(g => {
                                  if (g.sessionId && !newSessionIds.includes(g.sessionId)) {
                                    newSessionIds.push(g.sessionId);
                                  }
                                });
                                setSelectedSessionIds(newSessionIds);
                                setFeedback({ type: 'success', text: `Selected all ${filteredGroups.length} filtered groups in recipient list!` });
                              } else {
                                setPhoneNumber('');
                                setFeedback({ type: 'info', text: 'Cleared group selections.' });
                              }
                            }}
                            className="rounded text-indigo-500 focus:ring-indigo-500 bg-slate-900 border-slate-800 cursor-pointer h-4 w-4"
                          />
                          <label htmlFor="select-all-groups" className="text-[11px] font-medium text-slate-300 cursor-pointer select-none">
                            Select All ({filteredGroups.length} Groups)
                          </label>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setPhoneNumber('');
                            setFeedback({ type: 'info', text: 'Cleared recipient input field.' });
                          }}
                          className="py-1 px-2.5 bg-slate-900 hover:bg-slate-850 active:scale-[0.97] border border-slate-850 hover:border-slate-800 text-[10px] font-bold text-rose-400 hover:text-rose-350 rounded-lg transition-all flex items-center gap-1 cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                          <span>Unselect All</span>
                        </button>
                      </div>

                      {/* Rich Action Controls Grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-950/20 p-2.5 rounded-xl border border-slate-850">
                        <button
                          type="button"
                          onClick={() => {
                            const jids = filteredGroups.map(g => g.jid).join(', ');
                            navigator.clipboard.writeText(jids);
                            setFeedback({ type: 'success', text: `Copied all ${filteredGroups.length} filtered group JIDs joined by commas!` });
                          }}
                          className="py-2 px-2 bg-slate-950 hover:bg-slate-850 border border-slate-850 hover:border-slate-800 text-[10px] font-bold text-indigo-400 hover:text-white rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                          title="Copy visible group JIDs with comma separation"
                        >
                          <Copy className="w-3.5 h-3.5 shrink-0" />
                          <span>Copy JIDs (,)</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const jids = filteredGroups.map(g => g.jid).join('\n');
                            navigator.clipboard.writeText(jids);
                            setFeedback({ type: 'success', text: `Copied all ${filteredGroups.length} filtered group JIDs on new lines!` });
                          }}
                          className="py-2 px-2 bg-slate-950 hover:bg-slate-850 border border-slate-850 hover:border-slate-800 text-[10px] font-bold text-indigo-400 hover:text-white rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                          title="Copy visible group JIDs with newline separation"
                        >
                          <Copy className="w-3.5 h-3.5 shrink-0" />
                          <span>Copy JIDs (\n)</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setExtractorTarget('filtered');
                            setShowMembersExtractor(true);
                          }}
                          className="py-2 px-2 bg-indigo-950/40 hover:bg-indigo-500/20 border border-indigo-500/25 hover:border-indigo-500/40 text-[10px] font-bold text-indigo-300 hover:text-white rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                          title="Extract and save phone numbers from currently filtered groups"
                        >
                          <Users className="w-3.5 h-3.5 shrink-0 animate-pulse text-indigo-400" />
                          <span>Scrape Filtered ({filteredGroups.length})</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setExtractorTarget('all');
                            setShowMembersExtractor(true);
                          }}
                          className="py-2 px-2 bg-emerald-950/40 hover:bg-emerald-500/20 border border-emerald-500/25 hover:border-emerald-500/40 text-[10px] font-bold text-emerald-300 hover:text-white rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                          title="Extract and save phone numbers from all saved groups"
                        >
                          <Users className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
                          <span>Scrape All ({savedGroups.length})</span>
                        </button>
                      </div>

                      {/* Scrollable Individual Groups List */}
                      <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                        {filteredGroups.length === 0 ? (
                          <div className="p-4 bg-slate-950/20 text-center text-slate-500 text-[11px] rounded-lg border border-slate-850/40">
                            No groups match this filter.
                          </div>
                        ) : (
                          filteredGroups.map(g => (
                            <div key={g.jid} className="p-2.5 bg-slate-950 border border-slate-850 hover:border-slate-800 rounded-lg flex items-center justify-between gap-2 text-left">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center flex-wrap gap-1.5">
                                  <span className="font-bold text-xs text-slate-300 truncate">{g.name || 'Unnamed Group'}</span>
                                  {g.isAdmin && (
                                    <span className="text-[8.5px] font-extrabold px-1.5 py-0.5 bg-teal-500/10 text-teal-400 border border-teal-500/20 rounded">
                                      ⭐ Admin
                                    </span>
                                  )}
                                  {g.canUserSend === false ? (
                                    <span className="text-[8.5px] font-extrabold px-1.5 py-0.5 bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded">
                                      🔒 Locked
                                    </span>
                                  ) : g.onlyAdminsCanSend ? (
                                    <span className="text-[8.5px] font-extrabold px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded">
                                      ✓ Postable (Admin)
                                    </span>
                                  ) : (
                                    <span className="text-[8.5px] font-semibold px-1.5 py-0.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded">
                                      ✓ Everyone can Post
                                    </span>
                                  )}
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                  <span className="font-mono text-[9.5px] text-slate-500 truncate select-all">{g.jid}</span>
                                  {g.sessionId && (
                                    <span className="text-[9px] px-1.5 py-0.5 bg-indigo-500/15 text-indigo-400 border border-indigo-500/20 rounded font-mono font-bold shrink-0">
                                      📱 Session: {g.sessionId}
                                    </span>
                                  )}
                                  {g.memberCount > 0 && (
                                    <span className="text-[9px] px-1.5 py-0.5 bg-slate-850 text-slate-400 border border-slate-800 rounded font-mono shrink-0">
                                      👥 {g.memberCount} members
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setExtractorTarget('individual');
                                    setExtractorGroupJid(g.jid);
                                    setShowMembersExtractor(true);
                                  }}
                                  className="p-1 bg-indigo-950/40 hover:bg-indigo-500/20 text-indigo-400 hover:text-white rounded border border-indigo-500/20 hover:border-indigo-500/40 transition-colors cursor-pointer"
                                  title="👥 Extract & Save Member Numbers"
                                >
                                  <Users className="w-3 h-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    navigator.clipboard.writeText(g.jid);
                                    setFeedback({ type: 'success', text: `Group JID copied: ${g.jid}` });
                                  }}
                                  className="p-1 bg-slate-900 hover:bg-slate-850 text-indigo-400 hover:text-white rounded border border-slate-850 transition-colors cursor-pointer"
                                  title="Copy JID"
                                >
                                  <Copy className="w-3 h-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteGroup(g.jid)}
                                  className="p-1 bg-slate-900 hover:bg-slate-850 text-rose-500 hover:text-rose-400 rounded border border-slate-850 transition-colors cursor-pointer"
                                  title="Delete Metadata"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })()
              )}
            </div>

            {/* Background Throttled Queue Manager */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-xl backdrop-blur-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1.5 h-full bg-teal-500" />
              
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold text-white flex items-center gap-2 uppercase tracking-wider">
                  <Activity className="w-4 h-4 text-teal-400" />
                  <span>3. Background Dispatch Queue</span>
                </h2>
                <span className={`text-[9.5px] font-mono px-2 py-0.5 rounded-full font-bold uppercase ${
                  isProcessingQueueState 
                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20' 
                    : 'bg-slate-850 text-slate-500 border border-slate-800'
                }`}>
                  {isProcessingQueueState ? 'Processing' : 'Idle'}
                </span>
              </div>

              <p className="text-xs text-slate-400 mb-4 leading-relaxed">
                Anti-block protection queues all messages and dispatches them with a delay to secure accounts against automated blocking algorithms.
              </p>

              <div className="space-y-4">
                {/* Sliders delay configurator */}
                <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-850 space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="text-slate-300">Throttle Wait Timer</span>
                    <span className="text-teal-400 font-mono font-bold">{globalDelaySecondsState}s / message</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="300"
                    value={globalDelaySecondsState}
                    onChange={(e) => handleUpdateDelay(parseInt(e.target.value))}
                    className="w-full accent-teal-500 bg-slate-900 h-1.5 rounded-lg cursor-pointer"
                  />
                  <span className="text-[9px] text-slate-500 block leading-tight">
                    Higher wait intervals reduce block rates. Includes an automated <span className="text-teal-400 font-semibold">±5–10s randomized human-like variation</span> on each dispatch for enhanced ban protection.
                  </span>
                </div>

                {/* Queue status block */}
                {(() => {
                  const pendingCount = queueItems.filter(i => i.status === 'pending').length;
                  const sendingCount = queueItems.filter(i => i.status === 'sending').length;
                  const activeCount = pendingCount + sendingCount;
                  const sortedQueue = [...queueItems].sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime());

                  return (
                    <>
                      <div className="flex items-center justify-between bg-slate-950 p-3 rounded-lg border border-slate-850 text-xs">
                        <span className="text-slate-400">Enqueued Pending Tasks:</span>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white font-mono bg-slate-900 border border-slate-850 px-2 py-0.5 rounded">
                            {activeCount} active / {queueItems.length} total
                          </span>
                          {queueItems.length > 0 && (
                            <button
                              type="button"
                              onClick={() => handleClearQueue('all')}
                              className="text-xs text-rose-400 hover:text-rose-300 font-bold uppercase transition-colors cursor-pointer"
                            >
                              Clear
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Queue items slider view */}
                      {sortedQueue.length > 0 && (
                        <div className="space-y-1.5 max-h-[140px] overflow-y-auto pr-1">
                          {sortedQueue.slice(0, 5).map((item) => (
                            <div key={item.id} className="p-2 bg-slate-950 border border-slate-850 rounded text-[10px] font-mono flex items-center justify-between gap-2">
                              <span className="text-slate-400 truncate flex-1">
                                [{item.sessionId}] ➔ {item.recipient.split('@')[0]}
                              </span>
                              <span className={`shrink-0 font-bold uppercase text-[9px] px-1.5 py-0.5 rounded ${
                                item.status === 'sending' ? 'text-sky-400 bg-sky-500/10 border border-sky-500/20' :
                                item.status === 'pending' ? 'text-amber-400 bg-amber-500/10 border border-amber-500/20' :
                                item.status === 'sent' ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20' :
                                'text-rose-400 bg-rose-500/10 border border-rose-500/20'
                              }`}>
                                {item.status}
                              </span>
                            </div>
                          ))}
                          {sortedQueue.length > 5 && (
                            <div className="text-center text-[9px] text-slate-500 italic pt-1">
                              And {sortedQueue.length - 5} more items in background queue history...
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>

          </div>

          {/* RIGHT COLUMN: Send Message Panel & Live Phone Mock */}
          <div className="lg:col-span-7 flex flex-col gap-8">
            
            {/* MESSAGING DISPATCH PANEL */}
            <div id="messaging-card" className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-xl backdrop-blur-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1.5 h-full bg-teal-500" />
              
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-850">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <Zap className="w-5 h-5 text-teal-400" />
                    <span>2. Dispatch Studio</span>
                    {isProcessingQueueState && queueItems.some(i => i.status === 'pending' || i.status === 'sending') && (
                      <span className="flex items-center gap-1.5 ml-2 px-2.5 py-0.5 bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 rounded-full text-[10px] font-bold uppercase tracking-wider animate-pulse">
                        <RefreshCw className="w-3 h-3 animate-spin" />
                        <span>Sending Queue ({queueItems.filter(i => i.status === 'pending' || i.status === 'sending').length})</span>
                      </span>
                    )}
                  </h2>

                  <button
                    type="button"
                    onClick={() => {
                      setIsTemplatePreviewOpen(true);
                      setPreviewLogs([`[${new Date().toLocaleTimeString()}] Live device preview session initialized.`]);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1 bg-teal-500/10 hover:bg-teal-500/25 text-teal-400 hover:text-teal-300 border border-teal-500/20 hover:border-teal-400/40 rounded-lg text-[10.5px] font-bold tracking-wide transition-all cursor-pointer shadow-sm active:scale-95"
                  >
                    <Smartphone className="w-3.5 h-3.5 animate-pulse" />
                    <span>📱 Template Preview</span>
                  </button>
                </div>

                {/* Message type selector */}
                <div className="flex flex-wrap bg-slate-950 p-1 rounded-xl border border-slate-850 gap-1">
                  <button
                    type="button"
                    onClick={() => setMsgType('navi-template')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                      msgType === 'navi-template' 
                        ? 'bg-emerald-500 text-slate-950 shadow font-bold' 
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    🚀 Navi UPI Template
                  </button>
                  <button
                    type="button"
                    onClick={() => setMsgType('text')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                      msgType === 'text' 
                        ? 'bg-teal-500 text-slate-950 shadow' 
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Plain Text
                  </button>
                  <button
                    type="button"
                    onClick={() => setMsgType('buttons')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                      msgType === 'buttons' 
                        ? 'bg-teal-500 text-slate-950 shadow' 
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Quick-Reply Buttons
                  </button>
                  <button
                    type="button"
                    onClick={() => setMsgType('template')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                      msgType === 'template' 
                        ? 'bg-teal-500 text-slate-950 shadow' 
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Call/URL Templates
                  </button>
                </div>
              </div>

              {/* Group Tagging Batch Progress Bar */}
              {(() => {
                const activeTagJobItem = queueItems.find(i => i.tagJobId && (i.status === 'pending' || i.status === 'sending'));
                if (!activeTagJobItem) return null;

                const tagJobItems = queueItems.filter(i => i.tagJobId === activeTagJobItem.tagJobId);
                const tagJobPendingOrSending = tagJobItems.filter(i => i.status === 'pending' || i.status === 'sending');
                const tagJobTotal = activeTagJobItem.tagJobTotal || 0;
                const tagJobCompletedMembersCount = activeTagJobItem.tagJobCompleted || 0;
                const tagJobProgressPercent = tagJobTotal > 0 ? Math.round((tagJobCompletedMembersCount / tagJobTotal) * 100) : 0;
                const tagJobTimeRemainingSec = tagJobPendingOrSending.length * globalDelaySecondsState;

                return (
                  <motion.div 
                    initial={{ opacity: 0, y: -10 }} 
                    animate={{ opacity: 1, y: 0 }} 
                    exit={{ opacity: 0, y: -10 }}
                    className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4.5 mb-6 text-left relative overflow-hidden"
                  >
                    <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500 animate-pulse" />
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Activity className="w-4.5 h-4.5 text-emerald-400 animate-spin" />
                        <div>
                          <span className="text-xs font-bold text-white block">Active Group Tagging Batch Cycle</span>
                          <span className="text-[10px] text-slate-400 font-mono">Job ID: {activeTagJobItem.tagJobId}</span>
                        </div>
                      </div>
                      <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/15 px-2.5 py-0.5 rounded border border-emerald-500/20">
                        {tagJobProgressPercent}%
                      </span>
                    </div>

                    <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden mb-2.5 border border-slate-800">
                      <div 
                        className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full rounded-full transition-all duration-500" 
                        style={{ width: `${tagJobProgressPercent}%` }}
                      />
                    </div>

                    <div className="flex flex-wrap justify-between items-center text-[11px] text-slate-300 gap-2">
                      <div className="flex items-center gap-1">
                        <span>Processed:</span>
                        <strong className="text-white font-bold">{tagJobCompletedMembersCount}</strong>
                        <span>/</span>
                        <strong className="text-white font-bold">{tagJobTotal} members</strong>
                        <span className="text-slate-500 font-mono">({activeTagJobItem.tagJobBatchIndex} of {activeTagJobItem.tagJobBatchCount} batches)</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-slate-400">
                        <Clock className="w-3.5 h-3.5 text-teal-400" />
                        <span>Cycle Duration: {globalDelaySecondsState}s/msg</span>
                        <span className="text-slate-600">|</span>
                        <span className="text-white">Est. Time Remaining: <strong className="text-teal-400 font-mono font-extrabold">{tagJobTimeRemainingSec}s</strong></span>
                      </div>
                    </div>
                  </motion.div>
                );
              })()}

              <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
                
                {/* Send Form Column */}
                <div className="md:col-span-7 space-y-4">
                  <form id="msg-form" onSubmit={handleSendMessage} className="space-y-4">
                                    {/* Recipient Type Toggle */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                        Recipient Type
                      </label>
                      <div className="grid grid-cols-2 gap-2 bg-slate-950 p-1 rounded-xl border border-slate-850">
                        <button
                          type="button"
                          onClick={() => setRecipientType('individual')}
                          className={`flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                            recipientType === 'individual'
                              ? 'bg-slate-800 text-teal-400 font-bold shadow'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          <User className="w-3.5 h-3.5" />
                          Direct Contact
                        </button>
                        <button
                          type="button"
                          onClick={() => setRecipientType('group')}
                          className={`flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                            recipientType === 'group'
                              ? 'bg-slate-800 text-teal-400 font-bold shadow'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          <Users className="w-3.5 h-3.5" />
                          WhatsApp Group
                        </button>
                      </div>
                    </div>

                    {/* Quick Template Loading Dropdowns */}
                    <div className="grid grid-cols-2 gap-3 p-3 bg-slate-950/40 rounded-xl border border-slate-850">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide flex items-center gap-1">
                          <Bookmark className="w-3.5 h-3.5 text-teal-400" />
                          <span>Quick Messages</span>
                        </label>
                        <select
                          onChange={(e) => {
                            const selectedId = e.target.value;
                            if (selectedId) {
                              const found = quickTemplates.find(t => t.id === selectedId);
                              if (found) {
                                handleApplyTemplate(found);
                              }
                            }
                          }}
                          className="w-full bg-slate-950 border border-slate-850 rounded-lg px-2 py-1.5 text-xs text-white outline-none cursor-pointer"
                        >
                          <option value="">-- Select Template --</option>
                          {quickTemplates.map(t => (
                            <option key={t.id} value={t.id}>{t.title}</option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide flex items-center gap-1">
                          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                          <span>Unified Actions</span>
                        </label>
                        <select
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val) {
                              handleApplyRichMediaTemplate(val as any);
                            }
                          }}
                          className="w-full bg-slate-950 border border-slate-850 rounded-lg px-2 py-1.5 text-xs text-white outline-none cursor-pointer"
                        >
                          <option value="">-- Select Unified --</option>
                          <option value="invoice">Premium Invoice PDF</option>
                          <option value="demo">Feature Demo Video</option>
                          <option value="promo">Exclusive 30% Promo</option>
                        </select>
                      </div>
                    </div>

                    {/* Phone/Group input */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label htmlFor="phone-input" className="text-xs font-bold text-slate-300 uppercase tracking-wide flex items-center gap-1">
                          {recipientType === 'individual' ? <Phone className="w-3.5 h-3.5 text-teal-400" /> : <Users className="w-3.5 h-3.5 text-teal-400" />}
                          <span>{recipientType === 'individual' ? 'Recipient Numbers' : 'WhatsApp Group JIDs'}</span>
                        </label>
                        <span className="text-[10px] text-slate-500 lowercase">
                          {recipientType === 'individual' ? 'with country codes' : 'ending in @g.us'}
                        </span>
                      </div>

                      <textarea
                        id="phone-input"
                        required
                        rows={2}
                        placeholder={
                          recipientType === 'individual' 
                            ? (splitByCommas ? "e.g. 919876543210, 919876543211" : "e.g. 919876543210\n919876543211") 
                            : (splitByCommas ? "e.g. id1@g.us, id2@g.us" : "e.g. id1@g.us\nid2@g.us")
                        }
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        className="w-full bg-slate-950/80 border border-slate-850 hover:border-slate-700 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-650 outline-none transition-colors font-mono"
                      />

                      {/* Checkbox for Comma-Separated Splitting */}
                      <div className="flex items-center justify-between p-2.5 bg-slate-950/30 rounded-lg border border-slate-850/60">
                        <div className="flex items-center gap-2">
                          <input
                            id="split-commas"
                            type="checkbox"
                            checked={splitByCommas}
                            onChange={(e) => setSplitByCommas(e.target.checked)}
                            className="rounded text-teal-500 focus:ring-teal-500 bg-slate-900 border-slate-800 cursor-pointer"
                          />
                          <label htmlFor="split-commas" className="text-[11px] font-medium text-slate-400 cursor-pointer select-none">
                            Separate multiple entries by commas (Check) or line-by-line (Uncheck)
                          </label>
                        </div>
                        <span className="text-[10px] text-teal-400 font-mono font-bold">
                          {splitByCommas ? "Comma Split" : "Newline Split"}
                        </span>
                      </div>

                      {recipientType === 'group' && (
                        <div className="flex items-center justify-between p-2.5 bg-slate-950/30 rounded-lg border border-slate-850/60 animate-fadeIn">
                          <div className="flex items-center gap-2">
                            <input
                              id="tag-group-members"
                              type="checkbox"
                              checked={tagGroupMembers}
                              onChange={(e) => setTagGroupMembers(e.target.checked)}
                              className="rounded text-teal-500 focus:ring-teal-500 bg-slate-900 border-slate-800 cursor-pointer"
                            />
                            <label htmlFor="tag-group-members" className="text-[11px] font-medium text-slate-400 cursor-pointer select-none">
                              Tag all members in background (excluding admins and me)
                            </label>
                          </div>
                          <span className="text-[10px] text-teal-400 font-mono font-bold">
                            {tagGroupMembers ? "Tags Active" : "No Tags"}
                          </span>
                        </div>
                      )}

                      {phoneNumber.trim() && (
                        <p className="text-[10px] text-slate-500 font-mono">
                          Parsed Recipients Count: <span className="text-emerald-400 font-semibold select-all">
                            {phoneNumber.split(splitByCommas ? ',' : '\n').filter(p => p.trim()).length} target(s)
                          </span>
                        </p>
                      )}
                    </div>

                    {/* Message Body Textarea or Navi Predefined Text */}
                    {msgType === 'navi-template' ? (
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-emerald-400 uppercase tracking-wide flex items-center justify-between">
                          <span>Predefined Template Body (Locked)</span>
                          <span className="text-[9px] text-slate-500">Read-Only</span>
                        </label>
                        <div className="bg-slate-950/80 border border-emerald-500/20 p-4 rounded-xl text-xs text-slate-300 whitespace-pre-wrap font-sans relative select-all leading-relaxed">
                          <div className="absolute top-2.5 right-2.5">
                            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 uppercase font-bold border border-emerald-500/20">Native Button</span>
                          </div>
                          {'Hello\n\nYour prepaid recharge of ₹199 for Airtel is expiring today.\n\nPay Now via Navi UPI.'}
                          <div className="mt-3 pt-3 border-t border-slate-850 text-slate-400 text-[10px]">
                            <span className="font-bold text-slate-300">Footer Line: </span>Secure service from Meta
                          </div>
                          <div className="mt-2.5 flex items-center gap-1.5 text-emerald-400 font-bold font-mono text-[10px]">
                            <span>Button Action: </span>
                            <span className="px-2 py-0.5 bg-emerald-500/15 rounded border border-emerald-500/30 text-emerald-300">🔗 Pay Now (Navi Play Store App)</span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-300 uppercase tracking-wide flex items-center gap-1.5">
                              <MessageSquare className="w-4 h-4 text-emerald-400" />
                              <span>Messages Sequence ({messagesSequence.length})</span>
                            </span>
                            {messagesSequence.length > 1 && (
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-teal-500/10 text-teal-400 border border-teal-500/20 font-semibold">
                                Multi-Message Mode
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {isLoadingLinkPreview && (
                              <div className="flex items-center gap-1.5 text-xs text-emerald-400 animate-pulse">
                                <RefreshCw className="w-3 h-3 animate-spin" />
                                <span className="font-mono text-[11px]">Generating link preview...</span>
                              </div>
                            )}
                            <button
                              type="button"
                              onClick={handleAddMessage}
                              className="px-2.5 py-1 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 text-xs font-bold rounded-lg transition-all flex items-center gap-1 cursor-pointer shadow-sm"
                              title="Add another message to sequence"
                            >
                              <Plus className="w-3.5 h-3.5 text-emerald-400" />
                              <span>Add Message</span>
                            </button>
                          </div>
                        </div>

                        <div className="space-y-3">
                          {messagesSequence.map((msgItem, index) => (
                            <div key={msgItem.id || index} className="p-3.5 bg-slate-950/90 border border-slate-850 hover:border-slate-800 rounded-xl space-y-3 transition-all shadow-md">
                              {/* Sequence Item Header */}
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 font-mono text-[11px] flex items-center justify-center font-bold border border-emerald-500/30">
                                    {index + 1}
                                  </span>
                                  <span className="text-xs font-bold text-slate-300">Message #{index + 1}</span>

                                  {/* Badges for custom media attached */}
                                  {msgItem.attachmentType && msgItem.attachmentType !== 'none' && (
                                    <span className="text-[9.5px] font-mono px-2 py-0.5 rounded bg-teal-500/15 text-teal-300 border border-teal-500/30 font-semibold flex items-center gap-1">
                                      <Paperclip className="w-3 h-3 text-teal-400" />
                                      <span>{msgItem.attachmentType.toUpperCase()}</span>
                                    </span>
                                  )}

                                  {/* Badges for Quick Reply buttons attached */}
                                  {msgItem.buttons && msgItem.buttons.length > 0 && (
                                    <span className="text-[9.5px] font-mono px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-semibold flex items-center gap-1">
                                      <Smile className="w-3 h-3 text-emerald-400" />
                                      <span>{msgItem.buttons.length} Buttons</span>
                                    </span>
                                  )}

                                  {/* Badges for Template CTA Link buttons attached */}
                                  {msgItem.templateButtons && msgItem.templateButtons.length > 0 && (
                                    <span className="text-[9.5px] font-mono px-2 py-0.5 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 font-semibold flex items-center gap-1">
                                      <Link2 className="w-3 h-3 text-indigo-400" />
                                      <span>{msgItem.templateButtons.length} CTA Links</span>
                                    </span>
                                  )}
                                </div>

                                <div className="flex items-center gap-1.5">
                                  {/* Toggle Media drawer for this specific message */}
                                  <button
                                    type="button"
                                    onClick={() => handleSequenceFieldChange(index, 'showMediaConfig', !msgItem.showMediaConfig)}
                                    className={`px-2.5 py-1 text-[11px] font-medium rounded-lg border transition-all flex items-center gap-1 cursor-pointer ${
                                      msgItem.showMediaConfig || (msgItem.attachmentType && msgItem.attachmentType !== 'none')
                                        ? 'bg-teal-500/20 text-teal-300 border-teal-500/40 font-bold shadow-sm'
                                        : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white hover:border-slate-700'
                                    }`}
                                    title="Attach custom Image, Video, or Document to this specific message"
                                  >
                                    <Paperclip className="w-3.5 h-3.5" />
                                    <span>+ Media</span>
                                  </button>

                                  {/* Toggle Buttons/Links drawer for this specific message */}
                                  <button
                                    type="button"
                                    onClick={() => handleSequenceFieldChange(index, 'showButtonsConfig', !msgItem.showButtonsConfig)}
                                    className={`px-2.5 py-1 text-[11px] font-medium rounded-lg border transition-all flex items-center gap-1 cursor-pointer ${
                                      msgItem.showButtonsConfig || (msgItem.buttons && msgItem.buttons.length > 0) || (msgItem.templateButtons && msgItem.templateButtons.length > 0)
                                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 font-bold shadow-sm'
                                        : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white hover:border-slate-700'
                                    }`}
                                    title="Add Quick Reply buttons or CTA Link/Call buttons to this message"
                                  >
                                    <Smile className="w-3.5 h-3.5" />
                                    <span>+ Buttons/Links</span>
                                  </button>

                                  {/* Remove Message Button */}
                                  {messagesSequence.length > 1 && (
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveMessage(index)}
                                      className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                                      title="Remove this message from sequence"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>

                              {/* Textarea for message text & links */}
                              <textarea
                                required={index === 0 && attachmentType === 'none' && (!msgItem.attachmentType || msgItem.attachmentType === 'none')}
                                rows={index === 0 ? 3 : 2}
                                placeholder={`Type message #${index + 1} text body, promo info, or paste link here...`}
                                value={msgItem.text}
                                onChange={(e) => handleSequenceFieldChange(index, 'text', e.target.value)}
                                className="w-full bg-slate-900/90 border border-slate-850 hover:border-slate-700 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-600 outline-none transition-colors resize-none"
                              />

                              {/* Drawer: Media Attachment Configuration */}
                              {msgItem.showMediaConfig && (
                                <div className="p-3 bg-slate-900/90 border border-teal-500/35 rounded-xl space-y-2.5 animate-fadeIn">
                                  <div className="flex items-center justify-between">
                                    <span className="text-[11px] font-bold text-teal-300 uppercase tracking-wide flex items-center gap-1.5">
                                      <Paperclip className="w-3.5 h-3.5 text-teal-400" />
                                      <span>Message #{index + 1} Dedicated Media Attachment</span>
                                    </span>
                                    <span className="text-[10px] text-slate-400 font-mono">Image / Video / Document</span>
                                  </div>

                                  <div className="grid grid-cols-2 gap-2">
                                    <div>
                                      <label className="text-[10px] text-slate-400 font-medium block mb-1">Media Type</label>
                                      <select
                                        value={msgItem.attachmentType || 'none'}
                                        onChange={(e) => handleSequenceFieldChange(index, 'attachmentType', e.target.value)}
                                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-white outline-none cursor-pointer"
                                      >
                                        <option value="none">No Media (Text Only)</option>
                                        <option value="image">🖼️ Image (JPEG/PNG)</option>
                                        <option value="video">🎥 Video (MP4)</option>
                                        <option value="pdf">📄 PDF Document</option>
                                        <option value="doc">📁 Word / Document</option>
                                      </select>
                                    </div>

                                    <div>
                                      <label className="text-[10px] text-slate-400 font-medium block mb-1">Media Source</label>
                                      <select
                                        value={msgItem.attachmentSource || 'url'}
                                        onChange={(e) => handleSequenceFieldChange(index, 'attachmentSource', e.target.value)}
                                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-white outline-none cursor-pointer"
                                      >
                                        <option value="url">🔗 Remote Media Link URL</option>
                                        <option value="upload">💻 Upload Local File</option>
                                      </select>
                                    </div>
                                  </div>

                                  {msgItem.attachmentType && msgItem.attachmentType !== 'none' && (
                                    <div className="pt-1">
                                      {msgItem.attachmentSource === 'upload' ? (
                                        <div>
                                          <label className="text-[10px] text-slate-400 font-medium block mb-1">Upload File for Msg #{index + 1}</label>
                                          <input
                                            type="file"
                                            onChange={(e) => handleSequenceFileUpload(index, e)}
                                            className="w-full text-xs text-slate-400 file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-teal-500/20 file:text-teal-300 hover:file:bg-teal-500/30 cursor-pointer"
                                          />
                                          {msgItem.attachmentName && (
                                            <span className="text-[10px] font-mono text-teal-400 block mt-1">
                                              Selected File: {msgItem.attachmentName}
                                            </span>
                                          )}
                                        </div>
                                      ) : (
                                        <div>
                                          <label className="text-[10px] text-slate-400 font-medium block mb-1">Direct Media URL</label>
                                          <input
                                            type="text"
                                            placeholder="https://example.com/image.jpg or video.mp4 or document.pdf"
                                            value={msgItem.attachmentUrl || ''}
                                            onChange={(e) => handleSequenceFieldChange(index, 'attachmentUrl', e.target.value)}
                                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-650 outline-none font-mono"
                                          />
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Drawer: Custom Interactive Buttons & CTA Links */}
                              {msgItem.showButtonsConfig && (
                                <div className="p-3 bg-slate-900/90 border border-emerald-500/35 rounded-xl space-y-3 animate-fadeIn">
                                  <div className="flex items-center justify-between">
                                    <span className="text-[11px] font-bold text-emerald-300 uppercase tracking-wide flex items-center gap-1.5">
                                      <Smile className="w-3.5 h-3.5 text-emerald-400" />
                                      <span>Message #{index + 1} Interactive Buttons & Links</span>
                                    </span>
                                  </div>

                                  {/* Quick Reply Buttons */}
                                  <div className="space-y-2 border-b border-slate-850 pb-2.5">
                                    <div className="flex items-center justify-between">
                                      <span className="text-[10px] font-bold text-slate-300 uppercase">Quick Reply Text Buttons ({msgItem.buttons?.length || 0}/3)</span>
                                      {(msgItem.buttons?.length || 0) < 3 && (
                                        <button
                                          type="button"
                                          onClick={() => handleSequenceAddButton(index)}
                                          className="text-[10px] px-2 py-0.5 bg-emerald-500/15 text-emerald-300 rounded border border-emerald-500/30 hover:bg-emerald-500/25 cursor-pointer flex items-center gap-1"
                                        >
                                          <Plus className="w-3 h-3 text-emerald-400" />
                                          <span>Add Button</span>
                                        </button>
                                      )}
                                    </div>
                                    {msgItem.buttons && msgItem.buttons.map((btn, bIdx) => (
                                      <div key={btn.id || bIdx} className="flex items-center gap-2">
                                        <input
                                          type="text"
                                          placeholder={`Button #${bIdx + 1} Title`}
                                          value={btn.text}
                                          onChange={(e) => handleSequenceUpdateButtonText(index, bIdx, e.target.value)}
                                          className="flex-1 bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-xs text-white outline-none"
                                        />
                                        <button
                                          type="button"
                                          onClick={() => handleSequenceRemoveButton(index, bIdx)}
                                          className="p-1 text-slate-500 hover:text-rose-400 cursor-pointer"
                                          title="Remove button"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    ))}
                                  </div>

                                  {/* Template CTA Link / Call Buttons */}
                                  <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                      <span className="text-[10px] font-bold text-slate-300 uppercase">CTA Link & Call Phone Buttons ({msgItem.templateButtons?.length || 0}/3)</span>
                                      {(msgItem.templateButtons?.length || 0) < 3 && (
                                        <div className="flex items-center gap-1.5">
                                          <button
                                            type="button"
                                            onClick={() => handleSequenceAddTemplateButton(index, 'url')}
                                            className="text-[10px] px-2 py-0.5 bg-indigo-500/15 text-indigo-300 rounded border border-indigo-500/30 hover:bg-indigo-500/25 cursor-pointer flex items-center gap-1"
                                          >
                                            <Plus className="w-3 h-3 text-indigo-400" />
                                            <span>+ URL Link</span>
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => handleSequenceAddTemplateButton(index, 'call')}
                                            className="text-[10px] px-2 py-0.5 bg-indigo-500/15 text-indigo-300 rounded border border-indigo-500/30 hover:bg-indigo-500/25 cursor-pointer flex items-center gap-1"
                                          >
                                            <Plus className="w-3 h-3 text-indigo-400" />
                                            <span>+ Call</span>
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                    {msgItem.templateButtons && msgItem.templateButtons.map((tmplBtn, tIdx) => (
                                      <div key={tIdx} className="p-2.5 bg-slate-950 rounded-lg border border-slate-800 space-y-2">
                                        <div className="flex items-center justify-between">
                                          <span className="text-[10px] font-mono text-indigo-400 uppercase font-bold">
                                            {tmplBtn.type === 'url' ? '🔗 URL Link Button' : tmplBtn.type === 'call' ? '📞 Call Phone Button' : '💬 Quick Button'}
                                          </span>
                                          <button
                                            type="button"
                                            onClick={() => handleSequenceRemoveTemplateButton(index, tIdx)}
                                            className="text-slate-500 hover:text-rose-400 cursor-pointer"
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </button>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                          <input
                                            type="text"
                                            placeholder="Button Title (e.g. Visit Website)"
                                            value={tmplBtn.text}
                                            onChange={(e) => handleSequenceUpdateTemplateButton(index, tIdx, 'text', e.target.value)}
                                            className="bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-xs text-white outline-none"
                                          />
                                          {tmplBtn.type === 'url' && (
                                            <input
                                              type="text"
                                              placeholder="https://website.com"
                                              value={tmplBtn.url || ''}
                                              onChange={(e) => handleSequenceUpdateTemplateButton(index, tIdx, 'url', e.target.value)}
                                              className="bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-xs text-white outline-none font-mono"
                                            />
                                          )}
                                          {tmplBtn.type === 'call' && (
                                            <input
                                              type="text"
                                              placeholder="+1234567890"
                                              value={tmplBtn.phoneNumber || ''}
                                              onChange={(e) => handleSequenceUpdateTemplateButton(index, tIdx, 'phoneNumber', e.target.value)}
                                              className="bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-xs text-white outline-none font-mono"
                                            />
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>

                        {/* Inter-Message Delay Timer Slider */}
                        <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-850 space-y-2">
                          <div className="flex items-center justify-between text-xs font-semibold">
                            <span className="text-slate-300 flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5 text-teal-400" />
                              <span>Inter-Message Delay (Timer Slider)</span>
                            </span>
                            <div className="flex items-center gap-1.5">
                              <input
                                type="number"
                                min="0"
                                max="300"
                                value={interMessageDelaySeconds}
                                onChange={(e) => {
                                  const val = Math.min(300, Math.max(0, parseInt(e.target.value) || 0));
                                  setInterMessageDelaySeconds(val);
                                }}
                                className="w-16 bg-slate-900 border border-slate-800 rounded px-1.5 py-0.5 text-center text-teal-400 font-mono font-bold text-xs outline-none focus:border-teal-500"
                              />
                              <span className="text-teal-400 font-mono font-bold bg-teal-500/10 px-2.5 py-0.5 rounded border border-teal-500/20 text-[11px]">
                                {interMessageDelaySeconds}s delay{interMessageDelaySeconds >= 60 ? ` (${Math.floor(interMessageDelaySeconds / 60)}m${interMessageDelaySeconds % 60 ? ` ${interMessageDelaySeconds % 60}s` : ''})` : ''}
                              </span>
                            </div>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="300"
                            value={interMessageDelaySeconds}
                            onChange={(e) => setInterMessageDelaySeconds(parseInt(e.target.value) || 0)}
                            className="w-full accent-teal-500 bg-slate-900 h-1.5 rounded-lg cursor-pointer"
                          />
                          <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono px-0.5">
                            <span>0s (Instant)</span>
                            <span>60s (1m)</span>
                            <span>180s (3m)</span>
                            <span>300s (5m)</span>
                          </div>
                          <span className="text-[9.5px] text-slate-400 block leading-relaxed">
                            Controls time pause between consecutive messages to each ID (0 to 300s / 5 min). Message #1 is sent, then after <strong className="text-teal-400 font-mono">{interMessageDelaySeconds}s</strong> delay Message #2 is sent to the same ID before moving to the next target ID.
                          </span>
                        </div>

                        {/* WhatsApp Web Style Automatic Live Link Preview Card */}
                        {liveLinkPreview && (
                          <div className="relative mt-2 p-3 bg-slate-900/95 border border-emerald-500/35 rounded-xl overflow-hidden shadow-2xl space-y-2 group">
                            <button
                              type="button"
                              onClick={() => {
                                setDismissedLinkUrl(liveLinkPreview.canonicalUrl);
                                setLiveLinkPreview(null);
                              }}
                              className="absolute top-2 right-2 z-10 p-1.5 bg-slate-950/80 hover:bg-red-500 text-slate-400 hover:text-white rounded-full transition-colors cursor-pointer border border-slate-800"
                              title="Dismiss link preview"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>

                            <div className="flex flex-col sm:flex-row gap-3 items-start">
                              {(liveLinkPreview.thumbnailBase64 || liveLinkPreview.imageUrl) && (
                                <div className="w-full sm:w-48 h-32 shrink-0 rounded-lg overflow-hidden bg-slate-950 border border-slate-800 relative">
                                  <img
                                    src={liveLinkPreview.thumbnailBase64 || liveLinkPreview.imageUrl}
                                    alt="Link Preview"
                                    className="w-full h-full object-cover"
                                  />
                                  <span className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-black/80 text-[8.5px] text-emerald-400 font-mono rounded border border-emerald-500/20">
                                    Hero Card (16:9)
                                  </span>
                                </div>
                              )}
                              <div className="flex-1 space-y-1 pr-6">
                                <div className="flex items-center gap-1.5 text-[10px] font-mono text-emerald-400 font-semibold uppercase tracking-wider">
                                  <Globe className="w-3 h-3 text-emerald-400" />
                                  <span>{liveLinkPreview.canonicalUrl.replace(/^https?:\/\//i, '').split('/')[0]}</span>
                                </div>
                                <h4 className="text-sm font-bold text-white leading-snug line-clamp-2">
                                  {liveLinkPreview.title}
                                </h4>
                                <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                                  {liveLinkPreview.description}
                                </p>
                                <div className="pt-1 flex items-center gap-2">
                                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-300 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/30">
                                    <Check className="w-3 h-3 text-emerald-400" /> WhatsApp Link Card attached automatically
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Footer Text (Only shown for Buttons & Template) */}
                    {(msgType === 'buttons' || msgType === 'template') && (
                      <div className="space-y-3">
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-slate-300 uppercase tracking-wide">
                            Footer Caption Text
                          </label>
                          <input
                            type="text"
                            placeholder="Footer context line..."
                            value={footerText}
                            onChange={(e) => setFooterText(e.target.value)}
                            className="w-full bg-slate-950/80 border border-slate-850 hover:border-slate-700 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-xl px-4 py-2 text-xs text-white placeholder-slate-600 outline-none transition-colors"
                          />
                        </div>

                        {/* Protocol Style Toggle Selector */}
                        <div className="p-3 bg-slate-950/40 rounded-xl border border-slate-850 space-y-2">
                          <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center justify-between">
                            <span>Button Payload Protocol</span>
                            <span className="text-[9px] text-emerald-400 font-mono">Select Compatibility Style</span>
                          </label>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => setUseLegacy(true)}
                              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex flex-col items-center justify-center cursor-pointer border ${
                                useLegacy
                                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                  : 'bg-slate-950/40 text-slate-500 border-slate-900 hover:border-slate-800'
                              }`}
                            >
                              <span>Legacy Buttons</span>
                              <span className="text-[8px] font-normal opacity-75">Max compatibility</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setUseLegacy(false)}
                              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex flex-col items-center justify-center cursor-pointer border ${
                                !useLegacy
                                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                  : 'bg-slate-950/40 text-slate-500 border-slate-900 hover:border-slate-800'
                              }`}
                            >
                              <span>Modern Meta</span>
                              <span className="text-[8px] font-normal opacity-75">Interactive Message</span>
                            </button>
                          </div>
                          <p className="text-[9px] text-slate-500 leading-normal">
                            {useLegacy 
                              ? "Legacy style maps classic parameters. Since Meta deprecated original legacy structures, these are transparently auto-upgraded to modern interactive protocols under the hood for guaranteed delivery."
                              : "Modern style compiles directly into Meta's protobuf Interactive structures (nativeFlowMessage), ideal for all modern personal and business accounts."}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* DYNAMIC FORM SECTION: Quick-Reply Buttons Builder */}
                    {msgType === 'buttons' && (
                      <div className="space-y-3 pt-2 border-t border-slate-850">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-teal-400 uppercase tracking-wider flex items-center gap-1">
                            <Layers className="w-3.5 h-3.5" />
                            <span>Quick-Reply Actions (Max 3)</span>
                          </span>
                          {customButtons.length < 3 && (
                            <button
                              type="button"
                              onClick={addCustomButton}
                              className="text-[11px] font-bold text-emerald-400 hover:text-white flex items-center gap-0.5 cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>Add Action</span>
                            </button>
                          )}
                        </div>

                        <div className="space-y-2 max-h-[180px] overflow-y-auto">
                          {customButtons.map((btn, index) => (
                            <div key={index} className="flex gap-2 items-center bg-slate-950/60 p-2.5 rounded-xl border border-slate-850">
                              <div className="flex-1 grid grid-cols-2 gap-2">
                                <input
                                  type="text"
                                  placeholder="ID (e.g. opt-1)"
                                  value={btn.id}
                                  required
                                  onChange={(e) => updateCustomButton(index, 'id', e.target.value)}
                                  className="bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-xs text-white outline-none"
                                />
                                <input
                                  type="text"
                                  placeholder="Display Label"
                                  value={btn.text}
                                  required
                                  onChange={(e) => updateCustomButton(index, 'text', e.target.value)}
                                  className="bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-xs text-white outline-none"
                                />
                              </div>
                              <button
                                type="button"
                                onClick={() => removeCustomButton(index)}
                                className="text-slate-500 hover:text-rose-400 p-1 cursor-pointer"
                                title="Remove Button"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* DYNAMIC FORM SECTION: Template Buttons Builder */}
                    {msgType === 'template' && (
                      <div className="space-y-3 pt-2 border-t border-slate-850">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-teal-400 uppercase tracking-wider flex items-center gap-1">
                            <Layers className="w-3.5 h-3.5" />
                            <span>Template Call/URL Actions (Max 3)</span>
                          </span>
                          {templateButtons.length < 3 && (
                            <button
                              type="button"
                              onClick={addTemplateButton}
                              className="text-[11px] font-bold text-emerald-400 hover:text-white flex items-center gap-0.5 cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>Add Action</span>
                            </button>
                          )}
                        </div>

                        <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                          {templateButtons.map((btn, index) => (
                            <div key={index} className="bg-slate-950/60 p-3 rounded-xl border border-slate-850 space-y-2">
                              <div className="flex justify-between items-center">
                                <select
                                  value={btn.type}
                                  onChange={(e) => updateTemplateButton(index, 'type', e.target.value)}
                                  className="bg-slate-900 border border-slate-800 rounded text-xs text-slate-300 px-2 py-0.5 outline-none cursor-pointer"
                                >
                                  <option value="quickReply">Quick Reply</option>
                                  <option value="url">Web URL Button</option>
                                  <option value="call">Call Phone Button</option>
                                </select>
                                <button
                                  type="button"
                                  onClick={() => removeTemplateButton(index)}
                                  className="text-slate-600 hover:text-rose-400 p-1 cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>

                              <div className="grid grid-cols-1 gap-2">
                                <input
                                  type="text"
                                  placeholder="Action Label text"
                                  value={btn.text}
                                  required
                                  onChange={(e) => updateTemplateButton(index, 'text', e.target.value)}
                                  className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-white"
                                />

                                {btn.type === 'url' && (
                                  <input
                                    type="url"
                                    placeholder="https://..."
                                    value={btn.url || ''}
                                    required
                                    onChange={(e) => updateTemplateButton(index, 'url', e.target.value)}
                                    className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-white"
                                  />
                                )}

                                {btn.type === 'call' && (
                                  <input
                                    type="text"
                                    placeholder="+1234567890"
                                    value={btn.phoneNumber || ''}
                                    required
                                    onChange={(e) => updateTemplateButton(index, 'phoneNumber', e.target.value)}
                                    className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-white"
                                  />
                                )}

                                {btn.type === 'quickReply' && (
                                  <input
                                    type="text"
                                    placeholder="Payload ID (e.g. opt-id)"
                                    value={btn.id || ''}
                                    required
                                    onChange={(e) => updateTemplateButton(index, 'id', e.target.value)}
                                    className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-white"
                                  />
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Media Attachments Section */}
                    {msgType !== 'navi-template' && (
                      <div className="space-y-3 pt-3 border-t border-slate-850">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-teal-400 uppercase tracking-wider flex items-center gap-1.5">
                            <Paperclip className="w-3.5 h-3.5" />
                            <span>Media & Document Attachments</span>
                          </span>
                          {attachmentType !== 'none' && (
                            <button
                              type="button"
                              onClick={() => setAttachmentType('none')}
                              className="text-[10px] text-rose-400 hover:text-rose-300 font-bold uppercase tracking-wider"
                            >
                              Reset
                            </button>
                          )}
                        </div>

                        {/* Attachment Type Grid */}
                        <div className="grid grid-cols-5 gap-1 bg-slate-950 p-1 rounded-xl border border-slate-850">
                          {[
                            { id: 'none', label: 'No File', icon: Ban },
                            { id: 'image', label: 'Image', icon: ImageIcon },
                            { id: 'video', label: 'Video', icon: Video },
                            { id: 'pdf', label: 'PDF', icon: FileText },
                            { id: 'doc', label: 'Doc File', icon: FileCode }
                          ].map((item) => {
                            const IconComp = item.icon;
                            return (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => setAttachmentType(item.id as any)}
                                className={`flex flex-col items-center justify-center py-2 rounded-lg transition-all cursor-pointer ${
                                  attachmentType === item.id
                                    ? 'bg-slate-850 text-teal-400 shadow font-bold border border-teal-500/20'
                                    : 'text-slate-500 hover:text-slate-300'
                                }`}
                              >
                                <IconComp className="w-4 h-4 mb-1" />
                                <span className="text-[9px] tracking-tight">{item.label}</span>
                              </button>
                            );
                          })}
                        </div>

                        {/* If an attachment type is selected, show source selectors and parameters */}
                        {attachmentType !== 'none' && (
                          <div className="p-3.5 bg-slate-950/40 rounded-xl border border-slate-850 space-y-3.5">
                            <div className="flex items-center justify-between border-b border-slate-850/60 pb-2.5">
                              <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wide">Select Source Mode</span>
                              <span className="text-[9px] px-2 py-0.5 bg-teal-500/10 text-teal-400 border border-teal-500/20 rounded font-mono uppercase font-bold">
                                {attachmentType} attached
                              </span>
                            </div>

                            {/* Unified Header Mode switch (only for buttons / templates) */}
                            {(msgType === 'buttons' || msgType === 'template') && (
                              <div className="flex items-center justify-between p-2.5 bg-teal-500/5 hover:bg-teal-500/10 rounded-lg border border-teal-500/15 transition-all">
                                <div className="space-y-0.5">
                                  <span className="text-[10px] font-bold text-teal-400 uppercase tracking-wide flex items-center gap-1">
                                    <Zap className="w-3 h-3 text-amber-400" />
                                    <span>Unified Header Mode</span>
                                  </span>
                                  <p className="text-[8px] text-slate-400 leading-tight">
                                    Send attachment and buttons as ONE single message instead of two.
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setInlineAttachment(!inlineAttachment)}
                                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                    inlineAttachment ? 'bg-teal-500' : 'bg-slate-800'
                                  }`}
                                >
                                  <span
                                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                      inlineAttachment ? 'translate-x-4' : 'translate-x-0'
                                    }`}
                                  />
                                </button>
                              </div>
                            )}

                            {/* Source Tabs */}
                            <div className="grid grid-cols-3 gap-1 bg-slate-950 p-1 rounded-lg border border-slate-900">
                              <button
                                type="button"
                                onClick={() => setAttachmentSource('preset')}
                                className={`py-1 text-[10px] font-semibold rounded transition-colors cursor-pointer ${
                                  attachmentSource === 'preset'
                                    ? 'bg-slate-900 text-white shadow'
                                    : 'text-slate-500 hover:text-slate-300'
                                }`}
                              >
                                🎁 Test Sample
                              </button>
                              <button
                                type="button"
                                onClick={() => setAttachmentSource('url')}
                                className={`py-1 text-[10px] font-semibold rounded transition-colors cursor-pointer ${
                                  attachmentSource === 'url'
                                    ? 'bg-slate-900 text-white shadow'
                                    : 'text-slate-500 hover:text-slate-300'
                                }`}
                              >
                                🔗 Public URL
                              </button>
                              <button
                                type="button"
                                onClick={() => setAttachmentSource('upload')}
                                className={`py-1 text-[10px] font-semibold rounded transition-colors cursor-pointer ${
                                  attachmentSource === 'upload'
                                    ? 'bg-slate-900 text-white shadow'
                                    : 'text-slate-500 hover:text-slate-300'
                                }`}
                              >
                                📤 Upload Local
                              </button>
                            </div>

                            {/* Render Source Inputs */}
                            {attachmentSource === 'preset' && (
                              <div className="space-y-1.5">
                                <div className="text-[9px] text-slate-400 block font-mono bg-slate-950/50 p-3.5 rounded border border-slate-850/60 leading-relaxed whitespace-normal break-all">
                                  <span className="text-teal-400 font-bold block mb-1">🎁 Premium Sample Asset Loaded:</span>
                                  <div className="text-slate-300 select-all underline font-sans mb-1.5">{attachmentUrl}</div>
                                  <span className="text-[8px] text-slate-500 block leading-tight">This sample file is hosted on high-availability fast public storage to guarantee rapid WhatsApp caching and delivery.</span>
                                </div>
                              </div>
                            )}

                            {attachmentSource === 'url' && (
                              <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Enter Public File URL</label>
                                <input
                                  type="url"
                                  required
                                  placeholder="https://example.com/invoice.pdf"
                                  value={attachmentUrl}
                                  onChange={(e) => setAttachmentUrl(e.target.value)}
                                  className="w-full bg-slate-950 border border-slate-900 focus:border-teal-500 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-700 outline-none transition-colors"
                                />
                                <span className="text-[8px] text-slate-500 block">Make sure the file is publicly accessible via HTTPS for WhatsApp's servers to fetch.</span>
                              </div>
                            )}

                            {attachmentSource === 'upload' && (
                              <div className="space-y-2">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block">Upload Local File</label>
                                <div className="border border-dashed border-slate-800 hover:border-slate-700 rounded-xl p-4 flex flex-col items-center justify-center text-center cursor-pointer relative bg-slate-950/20 transition-colors">
                                  <input
                                    type="file"
                                    onChange={handleFileChange}
                                    accept={
                                      attachmentType === 'image' ? 'image/*' :
                                      attachmentType === 'video' ? 'video/*' :
                                      attachmentType === 'pdf' ? 'application/pdf' :
                                      attachmentType === 'doc' ? '.docx,.doc,.xls,.xlsx,.txt' :
                                      '*/*'
                                    }
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                  />
                                  <UploadCloud className="w-6 h-6 text-slate-500 mb-1" />
                                  <span className="text-[11px] font-bold text-slate-300">
                                    {attachmentName ? 'Change selected file' : 'Click or Drag to Upload'}
                                  </span>
                                  <span className="text-[9px] text-slate-500 mt-0.5">
                                    {attachmentType === 'image' && 'Image (PNG, JPG, WEBP)'}
                                    {attachmentType === 'video' && 'Video (MP4, MOV)'}
                                    {attachmentType === 'pdf' && 'PDF Document'}
                                    {attachmentType === 'doc' && 'Word, Sheet or TXT'}
                                  </span>
                                </div>
                                {attachmentName && (
                                  <div className="flex items-center justify-between bg-slate-950/80 px-3 py-1.5 rounded-lg border border-slate-850/60">
                                    <div className="flex items-center gap-1.5 overflow-hidden">
                                      <CheckCircle className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                                      <span className="text-[10px] text-slate-300 truncate font-mono">{attachmentName}</span>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setAttachmentName('');
                                        setAttachmentData('');
                                      }}
                                      className="text-xs text-rose-500 hover:text-rose-400 cursor-pointer"
                                    >
                                      Remove
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Future Scheduling */}
                    <div className="space-y-2 bg-slate-950/40 p-3.5 rounded-xl border border-slate-850">
                      <div className="flex justify-between items-center">
                        <label className="text-xs font-bold text-slate-300 uppercase tracking-wide flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-teal-400" />
                          <span>Future Dispatch Start Time</span>
                        </label>
                        {scheduledAt && (
                          <button
                            type="button"
                            onClick={() => setScheduledAt('')}
                            className="text-[10px] text-rose-400 hover:text-rose-300 font-bold uppercase tracking-wider cursor-pointer"
                          >
                            Cancel Schedule
                          </button>
                        )}
                      </div>
                      <p className="text-[9px] text-slate-500 leading-tight">
                        Queue this dispatch to process automatically at a future date and time. Leave empty to dispatch immediately.
                      </p>
                      <input
                        type="datetime-local"
                        value={scheduledAt}
                        onChange={(e) => setScheduledAt(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-850 hover:border-slate-700 focus:border-teal-500 rounded-lg px-3 py-1.5 text-xs text-white outline-none cursor-pointer font-mono"
                      />
                      {scheduledAt && (
                        <div className="text-[9.5px] text-emerald-400 font-medium font-mono flex items-center gap-1">
                          <span>🎯 Queued to dispatch after: {new Date(scheduledAt).toLocaleString()}</span>
                        </div>
                      )}
                    </div>

                    {/* Feedback Alert */}
                    <AnimatePresence>
                      {feedback && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className={`flex items-start gap-2.5 p-3 rounded-lg text-xs leading-normal overflow-hidden ${
                            feedback.type === 'success' 
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                              : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          }`}
                        >
                          {feedback.type === 'success' ? (
                            <CheckCircle className="w-4 h-4 shrink-0" />
                          ) : (
                            <AlertCircle className="w-4 h-4 shrink-0" />
                          )}
                          <div className="flex-1">{feedback.text}</div>
                          <button 
                            type="button" 
                            onClick={() => setFeedback(null)} 
                            className="text-slate-400 hover:text-white shrink-0 cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Submit Button */}
                    <button
                      id="btn-send"
                      type="submit"
                      disabled={isSending || !connected}
                      className={`w-full py-2.5 px-4 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer ${
                        !connected
                          ? 'bg-slate-800 text-slate-500 border border-slate-750 cursor-not-allowed'
                          : isSending
                            ? 'bg-teal-500/40 text-teal-300'
                            : 'bg-teal-500 hover:bg-teal-400 text-slate-950 shadow-lg shadow-teal-500/15'
                      }`}
                    >
                      {isSending ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Dispatching Socket...</span>
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4" />
                          <span>
                            {msgType === 'navi-template' 
                              ? 'Send Navi UPI Template' 
                              : msgType === 'text' 
                                ? 'Send Message' 
                                : msgType === 'buttons' 
                                  ? 'Send Button Msg' 
                                  : 'Send Template Msg'}
                          </span>
                        </>
                      )}
                    </button>

                    {/* Save as Permanent 4-Digit Code Section */}
                    <div className="pt-4 border-t border-slate-850 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-white flex items-center gap-2">
                          <Bookmark className="w-4 h-4 text-amber-400" />
                          <span>Save Message as Permanent Code</span>
                        </span>
                        <span className="text-[10px] text-amber-400 font-mono bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 font-semibold">
                          Trigger via .code in chat
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center">
                        <div className="sm:col-span-5 relative">
                          <input
                            type="text"
                            maxLength={4}
                            placeholder="e.g. 1234"
                            value={saveCodeInput}
                            onChange={(e) => setSaveCodeInput(e.target.value.replace(/\D/g, ''))}
                            className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl pl-7 pr-3 py-2 text-xs text-white font-mono placeholder-slate-600 outline-none transition-colors tracking-widest text-center font-bold"
                          />
                          <span className="absolute left-3 top-2 text-xs font-mono text-amber-400 font-bold">.</span>
                        </div>

                        <button
                          type="button"
                          disabled={isSavingCode || !saveCodeInput.trim() || saveCodeInput.replace(/\D/g, '').length !== 4}
                          onClick={handleSaveAsCode}
                          className="sm:col-span-7 flex items-center justify-center gap-1.5 py-2 px-3 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-xl transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-md shadow-amber-500/10"
                        >
                          {isSavingCode ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Save className="w-3.5 h-3.5" />
                          )}
                          <span>Save as Code {saveCodeInput ? `.${saveCodeInput}` : ''}</span>
                        </button>
                      </div>

                      <p className="text-[10px] text-slate-400 leading-relaxed">
                        Saves message body, targets (<code className="text-amber-400 font-mono">{phoneNumber || 'Group ID'}</code>), and <code className="text-amber-400 font-mono">{globalDelaySecondsState}s delay</code>. Type <code className="text-amber-400 font-mono font-bold">.{saveCodeInput || '1234'}</code> in WhatsApp chat anytime to execute!
                      </p>
                    </div>

                    {/* Save as Reusable Draft Template Section */}
                    <div className="pt-4 border-t border-slate-850 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-white flex items-center gap-2">
                          <FileText className="w-4 h-4 text-teal-400" />
                          <span>Save as Reusable Draft Template</span>
                        </span>
                        <span className="text-[10px] text-teal-400 font-mono bg-teal-500/10 px-2 py-0.5 rounded border border-teal-500/20 font-semibold">
                          Usable across accounts
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center">
                        <div className="sm:col-span-7 relative">
                          <input
                            type="text"
                            placeholder="Draft Name (e.g. Promo Template)"
                            value={draftNameInput}
                            onChange={(e) => setDraftNameInput(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 focus:border-teal-500 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 outline-none transition-colors"
                          />
                        </div>

                        <button
                          type="button"
                          disabled={isSavingDraft}
                          onClick={handleSaveDraft}
                          className="sm:col-span-5 flex items-center justify-center gap-1.5 py-2 px-3 bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-bold rounded-xl transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-md shadow-teal-500/10"
                        >
                          {isSavingDraft ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Save className="w-3.5 h-3.5" />
                          )}
                          <span>{activeDraftId ? 'Update Draft' : 'Save Draft'}</span>
                        </button>
                      </div>

                      <p className="text-[10px] text-slate-400 leading-relaxed">
                        Saves message text, buttons, templates, and attachments as a reusable draft template for any logged-in account (incomplete fields allowed).
                      </p>
                    </div>

                    {/* Reusable Draft Templates List Card */}
                    {draftsList.length > 0 && (
                      <div className="pt-3 border-t border-slate-850 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5 uppercase tracking-wider">
                            <FileText className="w-3.5 h-3.5 text-teal-400" />
                            <span>Saved Draft Templates ({draftsList.length})</span>
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono">Multi-Account Drafts</span>
                        </div>

                        <div className="space-y-2 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
                          {draftsList.map((dt) => (
                            <div key={dt.id} className="bg-slate-950/80 border border-slate-800/90 rounded-xl p-3 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                              <div className="space-y-1 flex-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="px-2 py-0.5 bg-teal-500/15 text-teal-400 font-bold text-xs rounded border border-teal-500/30">
                                    {dt.name || 'Draft'}
                                  </span>
                                  <span className="text-[10px] text-slate-400 font-mono">
                                    {dt.msgType || 'text'}
                                  </span>
                                  {!dt.phoneNumber && (
                                    <span className="text-[10px] text-amber-400/80 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                                      No recipient (Fill on load)
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-slate-300 truncate font-sans">
                                  {dt.message || dt.attachmentName || '(Empty message body)'}
                                </p>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => handleLoadDraft(dt)}
                                  className="px-2.5 py-1 bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 border border-teal-500/30 text-[10.5px] font-bold rounded-lg transition-all flex items-center gap-1 cursor-pointer"
                                  title="Load draft values into message form"
                                >
                                  <FileText className="w-3 h-3 text-teal-400" />
                                  <span>Load Draft</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteDraft(dt.id)}
                                  className="p-1.5 hover:bg-rose-500/20 text-slate-500 hover:text-rose-400 rounded-lg transition-colors cursor-pointer"
                                  title="Delete draft template"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Permanent Saved Codes List Card */}
                    {savedCodes.length > 0 && (
                      <div className="pt-3 border-t border-slate-850 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5 uppercase tracking-wider">
                            <Code className="w-3.5 h-3.5 text-amber-400" />
                            <span>Saved Reusable Codes ({savedCodes.length})</span>
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono">Permanent</span>
                        </div>

                        <div className="space-y-2 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
                          {savedCodes.map((sc) => (
                            <div key={sc.id} className="bg-slate-950/80 border border-slate-800/90 rounded-xl p-3 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                              <div className="space-y-1 flex-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="px-2 py-0.5 bg-amber-500/15 text-amber-400 font-mono font-bold text-xs rounded border border-amber-500/30">
                                    .{sc.code}
                                  </span>
                                  <span className="text-[10px] text-slate-400 font-mono truncate max-w-[140px]">
                                    🎯 {sc.phoneNumber}
                                  </span>
                                  <span className="text-[10px] text-emerald-400 font-mono font-semibold">
                                    ⏱️ {sc.delaySeconds || 0}s
                                  </span>
                                </div>
                                <p className="text-[11px] text-slate-300 truncate font-sans">
                                  {sc.message || '(Attachment)'}
                                </p>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => handleTriggerSavedCode(sc.id, sc.code)}
                                  className="px-2.5 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 text-[10.5px] font-bold rounded-lg transition-all flex items-center gap-1 cursor-pointer"
                                  title="Test run from web UI"
                                >
                                  <Play className="w-3 h-3 text-emerald-400" />
                                  <span>Run</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteSavedCode(sc.id)}
                                  className="p-1.5 hover:bg-rose-500/20 text-slate-500 hover:text-rose-400 rounded-lg transition-colors cursor-pointer"
                                  title="Delete saved code"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                  </form>
                </div>

                {/* Simulated Interactive Mobile Screen Mockup */}
                <div className="md:col-span-5 flex flex-col items-center justify-center border-t md:border-t-0 md:border-l border-slate-800/85 pt-6 md:pt-0 md:pl-6">
                  <div className="w-full max-w-[220px] aspect-[9/18] bg-slate-950 border-4 border-slate-800 rounded-3xl relative overflow-hidden flex flex-col shadow-inner">
                    {/* Speaker */}
                    <div className="absolute top-2 left-1/2 -translate-x-1/2 w-12 h-3 bg-slate-800 rounded-full z-10" />
                    
                    {/* Header */}
                    <div className="bg-teal-700/85 text-[10px] text-slate-200 px-3 pt-6 pb-2.5 flex items-center justify-between border-b border-teal-800">
                      <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                        <span className="font-semibold select-none truncate max-w-[90px]">
                          {phoneNumber ? '+' + getCleanNumber(phoneNumber) : 'Recipient'}
                        </span>
                      </div>
                      <div className="text-[8px] font-mono opacity-80">Online</div>
                    </div>

                    {/* Chat Canvas Area */}
                    <div className="flex-1 p-2 bg-[radial-gradient(#ffffff0a_1px,transparent_1px)] [background-size:10px_10px] bg-slate-950 flex flex-col justify-end overflow-y-auto">
                      <AnimatePresence>
                        {msgType === 'navi-template' || message.trim() ? (
                          <motion.div
                            key="active-message-preview"
                            initial={{ scale: 0.85, opacity: 0, y: 10 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            className="bg-[#0b141a] border border-[#202c33] rounded-lg text-slate-100 max-w-[95%] self-end relative break-words shadow-lg overflow-hidden flex flex-col"
                          >
                            {/* Hero Link Preview Banner Card */}
                            {liveLinkPreview && (
                              <div className="bg-[#111b21] border-b border-[#202c33] overflow-hidden">
                                {(liveLinkPreview.thumbnailBase64 || liveLinkPreview.imageUrl) && (
                                  <img
                                    src={liveLinkPreview.thumbnailBase64 || liveLinkPreview.imageUrl}
                                    alt="Link Preview"
                                    className="w-full h-32 object-cover"
                                  />
                                )}
                                <div className="p-2 space-y-0.5">
                                  <div className="text-[9px] font-bold text-slate-100 line-clamp-1">
                                    {liveLinkPreview.title}
                                  </div>
                                  <div className="text-[8px] text-slate-400 line-clamp-2 leading-tight">
                                    {liveLinkPreview.description}
                                  </div>
                                  <div className="text-[7.5px] font-mono text-emerald-400 uppercase tracking-wider pt-0.5">
                                    {liveLinkPreview.canonicalUrl.replace(/^https?:\/\//i, '').split('/')[0]}
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Message Body Content */}
                            <div className="p-2 text-[10px] leading-relaxed whitespace-pre-wrap text-left select-text">
                              {msgType === 'navi-template' 
                                ? 'Hello\n\nYour prepaid recharge of ₹199 for Airtel is expiring today.\n\nPay Now via Navi UPI.'
                                : message}
                            </div>

                            {/* Footer text if enabled */}
                            {msgType === 'navi-template' ? (
                              <div className="px-2 pb-1.5 text-[8.5px] text-slate-400 italic text-left border-t border-[#202c33]/40 pt-1">
                                Secure service from Meta
                              </div>
                            ) : (
                              (msgType === 'buttons' || msgType === 'template') && footerText && (
                                <div className="px-2 pb-1.5 text-[8.5px] text-slate-400 italic text-left border-t border-[#202c33]/40 pt-1">
                                  {footerText}
                                </div>
                              )
                            )}

                            {/* Interactive Buttons (Traditional / Quick-Replies) */}
                            {msgType === 'buttons' && !(msgType === 'navi-template') && customButtons.length > 0 && (
                              <div className="border-t border-[#202c33] flex flex-col divide-y divide-[#202c33] bg-[#111b21]">
                                {customButtons.map((btn, i) => (
                                  <button
                                    key={i}
                                    type="button"
                                    className="w-full text-center py-2 text-[9px] font-semibold text-emerald-400 hover:bg-[#202c33]/45 transition-colors select-none"
                                  >
                                    {btn.text || `Button ${i+1}`}
                                  </button>
                                ))}
                              </div>
                            )}

                            {/* Template Buttons (Call / Web URL / Quick Reply) */}
                            {msgType === 'template' && !(msgType === 'navi-template') && templateButtons.length > 0 && (
                              <div className="border-t border-[#202c33] flex flex-col divide-y divide-[#202c33] bg-[#111b21]">
                                {templateButtons.map((btn, i) => (
                                  <button
                                    key={i}
                                    type="button"
                                    className="w-full flex items-center justify-center gap-1 py-1.5 px-2 text-[9px] font-medium text-emerald-400 hover:bg-[#202c33]/45 transition-colors select-none"
                                  >
                                    {btn.type === 'url' && <Link2 className="w-2.5 h-2.5 text-slate-400 shrink-0" />}
                                    {btn.type === 'call' && <Phone className="w-2.5 h-2.5 text-slate-400 shrink-0" />}
                                    <span className="truncate">{btn.text || 'Action'}</span>
                                  </button>
                                ))}
                              </div>
                            )}

                            {/* Navi Template Button */}
                            {msgType === 'navi-template' && (
                              <div className="border-t border-[#202c33] flex flex-col divide-y divide-[#202c33] bg-[#111b21]">
                                <button
                                  type="button"
                                  className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2 text-[9px] font-bold text-emerald-400 hover:bg-[#202c33]/45 transition-colors select-none"
                                >
                                  <Link2 className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                                  <span className="truncate">🔗 Pay Now</span>
                                </button>
                              </div>
                            )}

                            {/* Status and timestamp */}
                            <div className="px-2 pb-1 flex justify-end items-center gap-0.5 text-[7px] text-slate-500 font-mono select-none self-end bg-[#0b141a] w-full pt-0.5 border-t border-[#202c33]/20">
                              <span>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                              <Check className="w-2.5 h-2.5 text-emerald-400" />
                            </div>
                          </motion.div>
                        ) : (
                          <div className="text-[9px] text-slate-600 text-center select-none py-12 italic">
                            Construct a message type above to preview layout.
                          </div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-500 text-center mt-3 select-none">Live device mockup layout representation</p>
                </div>

              </div>
            </div>

          </div>
        </div>

        {/* BOTTOM FULL-WIDTH DIAGNOSTICS & HISTORY */}
        <div className="mt-8">
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            
            {/* Tabs Selector */}
            <div className="border-b border-slate-800 flex bg-slate-900/40">
              <button
                id="tab-history"
                onClick={() => setActiveTab('history')}
                className={`px-6 py-3.5 text-xs font-bold uppercase tracking-wider flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
                  activeTab === 'history' 
                    ? 'border-emerald-500 text-emerald-400 bg-slate-900/20' 
                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-850/40'
                }`}
              >
                <FileText className="w-4 h-4" />
                <span>Message History ({sentHistory.length})</span>
              </button>
              <button
                id="tab-logs"
                onClick={() => setActiveTab('logs')}
                className={`px-6 py-3.5 text-xs font-bold uppercase tracking-wider flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
                  activeTab === 'logs' 
                    ? 'border-emerald-500 text-emerald-400 bg-slate-900/20' 
                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-850/40'
                }`}
              >
                <Terminal className="w-4 h-4" />
                <span>Console Logs ({logs.length})</span>
              </button>
            </div>

            {/* Tab Container Panels */}
            <div className="p-6">
              
              {/* History Tab */}
              {activeTab === 'history' && (
                <div id="panel-history" className="space-y-4">
                  {/* Firestore Connection Status Banner & Clear History Action Bar */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex-1">
                      <FirestoreStatusCard variant="full" title="Message Logs & Firestore Backup Status" />
                    </div>
                    {sentHistory.length > 0 && (
                      <button
                        type="button"
                        onClick={handleClearMessageHistory}
                        className="self-start sm:self-center px-3.5 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 cursor-pointer shadow-md shadow-rose-500/5"
                        title="Clear all recorded message history logs"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>Clear All Message History ({sentHistory.length})</span>
                      </button>
                    )}
                  </div>

                  {sentHistory.length === 0 ? (
                    <div className="text-center py-10">
                      <div className="inline-flex bg-slate-950 p-4 rounded-full text-slate-700 border border-slate-850 mb-3">
                        <MessageSquare className="w-8 h-8" />
                      </div>
                      <h4 className="text-slate-400 font-bold text-sm">No Messages Logged</h4>
                      <p className="text-xs text-slate-500 mt-1">Successfully dispatched messages will be stored in this diagnostic table.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-slate-800 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            <th className="pb-3 pl-2">Recipient JID</th>
                            <th className="pb-3">Sent Payload Content</th>
                            <th className="pb-3">Timestamp</th>
                            <th className="pb-3 text-center">Status</th>
                            <th className="pb-3 text-right pr-2">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-850">
                          {sentHistory.slice().reverse().map((msg) => (
                            <tr key={msg.id} className="text-xs text-slate-300 hover:bg-slate-850/20 transition-colors">
                              <td className="py-3.5 pl-2 font-mono text-slate-300 select-all">
                                {msg.phoneNumber}@s.whatsapp.net
                              </td>
                              <td className="py-3.5 max-w-md truncate pr-4 text-slate-200 font-medium">
                                {msg.message}
                              </td>
                              <td className="py-3.5 text-slate-400 flex items-center gap-1.5">
                                <Clock className="w-3.5 h-3.5 text-slate-500" />
                                {new Date(msg.timestamp).toLocaleString()}
                              </td>
                              <td className="py-3.5 text-center">
                                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-medium border ${
                                  msg.status === 'sent' 
                                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25' 
                                    : 'bg-rose-500/10 text-rose-400 border-rose-500/25'
                                }`}>
                                  {msg.status === 'sent' ? (
                                    <>
                                      <Check className="w-3 h-3" />
                                      <span>Sent</span>
                                    </>
                                  ) : (
                                    <>
                                      <X className="w-3 h-3" />
                                      <span>Failed</span>
                                    </>
                                  )}
                                </span>
                                {msg.error && (
                                  <p className="text-[10px] text-rose-400 mt-1 italic max-w-xs mx-auto leading-normal">{msg.error}</p>
                                )}
                              </td>
                              <td className="py-3.5 text-right pr-2">
                                <button
                                  type="button"
                                  onClick={() => handleDeleteMessageHistoryItem(msg.id)}
                                  className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg border border-transparent hover:border-rose-500/20 transition-all cursor-pointer"
                                  title="Delete message history entry"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Logs Tab */}
              {activeTab === 'logs' && (
                <div id="panel-logs" className="space-y-3">
                  {/* Search / Filter Input */}
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-500" />
                    <input
                      type="text"
                      placeholder="Search / filter logs by keyword or JID..."
                      value={logFilterQuery}
                      onChange={(e) => setLogFilterQuery(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-850 focus:border-indigo-500/50 rounded-xl pl-9 pr-4 py-2 text-xs text-white outline-none placeholder-slate-500 transition-colors"
                    />
                    {logFilterQuery && (
                      <button
                        type="button"
                        onClick={() => setLogFilterQuery('')}
                        className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300 text-xs font-bold font-mono cursor-pointer"
                      >
                        × Clear Filter
                      </button>
                    )}
                  </div>

                  {/* Telemetry Console */}
                  <div 
                    ref={terminalContainerRef}
                    onScroll={(e) => {
                      const target = e.currentTarget;
                      const isAtBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 40;
                      if (isAtBottom) {
                        setAutoScrollLogs(true);
                      } else {
                        setAutoScrollLogs(false);
                      }
                    }}
                    className="bg-slate-950 border border-slate-850 rounded-xl p-4 font-mono text-xs text-slate-300 h-[380px] overflow-y-auto space-y-1.5 select-text scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-slate-950"
                  >
                    {(() => {
                      const queryClean = logFilterQuery.trim().toLowerCase();
                      const filteredLogs = logs.filter(log => 
                        !queryClean || 
                        log.message.toLowerCase().includes(queryClean) || 
                        log.type.toLowerCase().includes(queryClean)
                      );

                      if (filteredLogs.length === 0) {
                        return (
                          <div className="text-slate-600 italic py-8 text-center">
                            {logs.length === 0 
                              ? "Telemetry idle. No connection events generated." 
                              : "No logs matching current filter."}
                          </div>
                        );
                      }

                      return filteredLogs.map((log) => (
                        <div key={log.id} className="flex items-start gap-2 leading-relaxed border-b border-slate-900/40 pb-1 last:border-b-0">
                          <span className="text-slate-600 shrink-0 select-none font-mono text-[11px]">
                            [{new Date(log.timestamp).toLocaleTimeString()}]
                          </span>
                          <span className={`shrink-0 select-none px-1.5 py-0.2 text-[9px] font-bold rounded uppercase ${
                            log.type === 'success' 
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                              : log.type === 'error'
                                ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                : 'bg-slate-850 text-slate-400 border border-slate-800'
                          }`}>
                            {log.type}
                          </span>
                          <span className={`font-mono text-[11px] ${
                            log.type === 'error' 
                              ? 'text-rose-300/90 font-medium' 
                              : log.type === 'success' 
                                ? 'text-emerald-300/90' 
                                : 'text-slate-300'
                          }`}>
                            {log.message}
                          </span>
                        </div>
                      ));
                    })()}
                    <div ref={terminalEndRef} />
                  </div>

                  {/* Actions / Status Bar below telemetry */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-900/30 p-2.5 rounded-xl border border-slate-850">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 bg-emerald-400 rounded-full animate-ping shrink-0" />
                      <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">SOCKET MONITOR</span>
                      <p className="text-[11px] text-slate-400 hidden sm:inline">— Socket telemetry streams</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Autoscroll toggle */}
                      <button
                        type="button"
                        onClick={() => setAutoScrollLogs(!autoScrollLogs)}
                        className={`px-2.5 py-1 rounded text-[10px] font-bold border transition-all cursor-pointer flex items-center gap-1.5 ${
                          autoScrollLogs 
                            ? 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20 hover:bg-indigo-500/20' 
                            : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-300'
                        }`}
                        title={autoScrollLogs ? "Autoscroll is Active. Click to pause." : "Autoscroll is Paused. Click to enable."}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${autoScrollLogs ? 'bg-indigo-400 animate-pulse' : 'bg-slate-600'}`} />
                        <span>{autoScrollLogs ? 'Autoscroll On' : 'Autoscroll Paused'}</span>
                      </button>

                      {/* Manual scroll to bottom */}
                      <button
                        type="button"
                        onClick={() => {
                          setAutoScrollLogs(true);
                          if (terminalContainerRef.current) {
                            terminalContainerRef.current.scrollTop = terminalContainerRef.current.scrollHeight;
                          }
                        }}
                        className="px-2.5 py-1 bg-slate-950 hover:bg-slate-850 text-slate-300 hover:text-white rounded text-[10px] font-bold border border-slate-850 cursor-pointer"
                      >
                        ↓ Scroll to Bottom
                      </button>

                      {/* Clear Logs */}
                      <button
                        type="button"
                        onClick={() => setLogs([])}
                        className="px-2.5 py-1 bg-rose-950/20 hover:bg-rose-950/40 text-rose-400 hover:text-rose-300 rounded text-[10px] font-bold border border-rose-950/30 cursor-pointer"
                      >
                        Clear Visual Logs
                      </button>
                    </div>
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
          </>
        ) : currentView === 'status' ? (
          <StatusBroadcastPage
            fetchWithAuth={fetchWithAuth}
            setFeedback={setFeedback}
            sessionsList={sessionsList}
          />
        ) : currentView === 'workflows' ? (
          <WorkflowsBuilderPage
            workflowsList={workflowsList}
            setWorkflowsList={setWorkflowsList}
            selectedWorkflowId={selectedWorkflowId}
            setSelectedWorkflowId={setSelectedWorkflowId}
            saveWorkflows={saveWorkflows}
            isSaving={isSavingWorkflows}
            setFeedback={setFeedback}
          />
        ) : currentView === 'lists' ? (
          <ListFlowStudioPage
            fetchWithAuth={fetchWithAuth}
            connected={connected}
            sessionsList={sessionsList}
            selectedSessionIds={selectedSessionIds}
            savedGroups={savedGroups}
            setFeedback={setFeedback}
          />
        ) : currentView === 'leads' ? (
          <LeadsHubPage
            fetchWithAuth={fetchWithAuth}
            setFeedback={setFeedback}
          />
        ) : currentView === 'group-invites' ? (
          <GroupInvitesManagerPage
            token={token}
            username={username}
            addToast={(msg, type) => setFeedback({ message: msg, type })}
            sessions={sessionsList}
          />
        ) : currentView === 'scan' ? (
          <LiveQrScannerPage
            token={token}
            username={username}
            initialSessionId={activeLinkSessionId}
            onBackToDashboard={() => setCurrentView('dispatch')}
          />
        ) : currentView === 'shares' ? (
          <SharesManagerPage
            fetchWithAuth={fetchWithAuth}
            setFeedback={setFeedback}
            sessionsList={sessionsList}
            authToken={token}
          />
        ) : currentView === 'queue-manager' ? (
          <QueueManagerPage
            queueItems={queueItems}
            pausedSessions={pausedSessions}
            sessionsList={sessionsList}
            handleTogglePauseSession={handleTogglePauseSession}
            handleQueueReorder={handleQueueReorder}
            globalDelaySecondsState={globalDelaySecondsState}
            handleClearQueue={handleClearQueue}
          />
        ) : currentView === 'settings' ? (
          <div className="space-y-8 animate-fadeIn">
            {/* Page Header banner */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/40 p-6 rounded-2xl border border-slate-800 backdrop-blur-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1.5 h-full bg-emerald-500" />
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Settings className="w-5 h-5 text-emerald-400" />
                  <span>Global Dashboard Settings & Passive Scanners</span>
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Manage incoming filters, toggle silence state, and audit passively scanned group invitations.
                </p>
              </div>
            </div>

            {/* Grid layout */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              {/* Left Column: Filter & Processing Settings */}
              <div className="lg:col-span-5 space-y-6">
                <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-1.5 h-full bg-emerald-500" />
                  
                  <h3 className="text-sm font-bold text-white flex items-center gap-2 uppercase tracking-wider mb-2">
                    <Sliders className="w-4 h-4 text-emerald-400" />
                    <span>Command Prefix & Silence Mode</span>
                  </h3>
                  
                  <p className="text-xs text-slate-400 mb-6 leading-relaxed">
                    Set up your secret automated prefix trigger or entirely silence incoming text message processing.
                  </p>

                  <div className="space-y-5 text-left">
                    {/* Prefix Input */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-300">Command Secret Prefix</label>
                      <input
                        type="text"
                        maxLength={5}
                        placeholder="e.g. ., /, !, #"
                        value={secretPrefix}
                        onChange={(e) => setSecretPrefix(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-600 outline-none focus:border-emerald-500 transition-colors font-mono font-bold"
                      />
                      <p className="text-[10px] text-slate-500">
                        Workflows and lists will only trigger if incoming messages start with this exact string (e.g., <code className="text-emerald-400 font-mono font-semibold">{secretPrefix}help</code>).
                      </p>
                    </div>

                    {/* Silence Mode Toggle Button */}
                    <div className="pt-2 border-t border-slate-850">
                      <label className="text-xs font-semibold text-slate-300 block mb-2">Text Processing State</label>
                      <button
                        type="button"
                        onClick={() => setDisableTextProcessing(!disableTextProcessing)}
                        className={`w-full flex items-center justify-between p-3 rounded-xl border text-left transition-all cursor-pointer ${
                          disableTextProcessing 
                            ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' 
                            : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <Ban className={`w-4 h-4 ${disableTextProcessing ? 'text-rose-400' : 'text-emerald-400'}`} />
                          <div>
                            <span className="text-xs font-bold block">
                              {disableTextProcessing ? 'Silence Mode Activated' : 'Text Processing Active'}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {disableTextProcessing ? 'Completely ignores incoming text messages' : 'Processes text with prefix matching'}
                            </span>
                          </div>
                        </div>
                        <div className={`w-8 h-4 rounded-full p-0.5 transition-colors ${disableTextProcessing ? 'bg-rose-500' : 'bg-emerald-500'}`}>
                          <div className={`w-3 h-3 bg-slate-950 rounded-full transition-transform transform ${disableTextProcessing ? 'translate-x-4' : 'translate-x-0'}`} />
                        </div>
                      </button>
                    </div>

                    {/* Share Batching & Pause Config */}
                    <div className="pt-4 border-t border-slate-800 space-y-3">
                      <label className="text-xs font-semibold text-slate-300 block flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Share & Forward Batch Rate Limiting</span>
                      </label>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] text-slate-400 block mb-1">Batch Size (Groups/Batch)</label>
                          <input
                            type="number"
                            min={1}
                            max={50}
                            value={shareBatchSize}
                            onChange={(e) => setShareBatchSize(Math.max(1, parseInt(e.target.value) || 1))}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-emerald-500 transition-colors font-mono"
                          />
                        </div>

                        <div>
                          <label className="text-[10px] text-slate-400 block mb-1">Pause After Batch (Seconds)</label>
                          <input
                            type="number"
                            min={0}
                            max={600}
                            value={shareBatchPauseSeconds}
                            onChange={(e) => setShareBatchPauseSeconds(Math.max(0, parseInt(e.target.value) || 0))}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-emerald-500 transition-colors font-mono"
                          />
                        </div>
                      </div>

                      <p className="text-[10px] text-slate-500 leading-relaxed">
                        When using <code className="text-emerald-400 font-mono">.sharenow</code> or forwarding shares, the bot sends to <strong>{shareBatchSize}</strong> groups, pauses for <strong>{shareBatchPauseSeconds}s</strong>, and continues safely.
                      </p>
                    </div>

                    {/* Default WhatsApp Channel Tag Settings */}
                    <div className="pt-4 border-t border-slate-800 space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                          <Radio className="w-3.5 h-3.5 text-emerald-400" />
                          <span>WhatsApp Channel Tag (Attribution)</span>
                        </label>
                        <button
                          type="button"
                          onClick={fetchFollowedChannels}
                          disabled={isLoadingFollowedChannels}
                          className="text-[10px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-semibold cursor-pointer bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full"
                        >
                          <RefreshCw className={`w-3 h-3 ${isLoadingFollowedChannels ? 'animate-spin' : ''}`} />
                          <span>Fetch Channels</span>
                        </button>
                      </div>

                      <p className="text-[10px] text-slate-400 leading-relaxed">
                        Attach this WhatsApp Channel pill to forwarded media & messages. Followers in recipient groups can click to view and follow your official WhatsApp Channel.
                      </p>

                      {/* Dropdown of followed WhatsApp channels if loaded */}
                      {followedChannels.length > 0 && (
                        <div className="p-2.5 bg-slate-950/80 border border-slate-800 rounded-xl space-y-1.5">
                          <span className="text-[10px] text-slate-400 font-medium block">
                            Pick from your followed / owned channels:
                          </span>
                          <select
                            value={defaultChannelJid}
                            onChange={(e) => {
                              const chosen = followedChannels.find(c => c.id === e.target.value);
                              if (chosen) {
                                setDefaultChannelJid(chosen.id);
                                setDefaultChannelName(chosen.name);
                              } else {
                                setDefaultChannelJid(e.target.value);
                              }
                            }}
                            className="w-full bg-slate-900 border border-slate-750 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-emerald-500 transition-colors cursor-pointer"
                          >
                            <option value="">-- Choose a followed channel --</option>
                            {followedChannels.map(c => (
                              <option key={c.id} value={c.id}>
                                {c.name} ({c.id})
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <label className="text-[10px] text-slate-400 font-medium">Default WhatsApp Channel Link or Post Link</label>
                          <button
                            type="button"
                            onClick={handleVerifyChannel}
                            disabled={isVerifyingChannel || (!defaultChannelInviteLink.trim() && !defaultChannelJid.trim() && !defaultChannelName.trim())}
                            className="text-[9px] text-emerald-400 hover:text-emerald-300 font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                          >
                            <Search className={`w-2.5 h-2.5 ${isVerifyingChannel ? 'animate-spin' : ''}`} />
                            <span>Verify & Resolve Link</span>
                          </button>
                        </div>
                        <input
                          type="text"
                          placeholder="e.g. https://whatsapp.com/channel/0029Va... or https://whatsapp.com/channel/0029Va.../123"
                          value={defaultChannelInviteLink}
                          onChange={(e) => setDefaultChannelInviteLink(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-emerald-500 transition-colors font-mono text-[11px]"
                        />
                        <span className="text-[10px] text-slate-500 block mt-1">
                          This default link is automatically attached to <code className="text-emerald-400 font-mono">.sharenow</code> broadcasts and any shares where no custom link was entered.
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] text-slate-400 block mb-1">Channel Display Name</label>
                          <input
                            type="text"
                            placeholder="e.g. Official Tech Deals"
                            value={defaultChannelName}
                            onChange={(e) => setDefaultChannelName(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-emerald-500 transition-colors"
                          />
                        </div>

                        <div>
                          <label className="text-[10px] text-slate-400 block mb-1">Numeric Newsletter JID (Auto-filled)</label>
                          <input
                            type="text"
                            placeholder="120363xxx@newsletter"
                            value={defaultChannelJid}
                            onChange={(e) => setDefaultChannelJid(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-emerald-500 transition-colors font-mono text-[11px]"
                          />
                        </div>
                      </div>

                      {defaultChannelJid && /^\d{10,25}@newsletter$/.test(defaultChannelJid.trim()) ? (
                        <div className="flex items-center gap-1.5 p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-[11px] text-emerald-300">
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span>Channel JID verified & clickable on WhatsApp ({defaultChannelJid})</span>
                        </div>
                      ) : defaultChannelName && !defaultChannelJid ? (
                        <div className="flex items-center gap-1.5 p-2 bg-amber-500/10 border border-amber-500/20 rounded-xl text-[11px] text-amber-300">
                          <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span>Tip: Paste your channel invite link (https://whatsapp.com/channel/...) and click &quot;Verify & Resolve Link&quot; so recipients can tap and open your channel without errors.</span>
                        </div>
                      ) : null}

                      <div className="flex items-center justify-between p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
                        <div>
                          <span className="text-xs font-medium text-slate-200 block">Auto-Attach Channel Tag</span>
                          <span className="text-[10px] text-slate-500 block">
                            Automatically attach this verified channel tag when using <code className="text-emerald-400 font-mono">.share</code> or <code className="text-emerald-400 font-mono">.sharenow</code> if message didn't have one
                          </span>
                        </div>
                        <input
                          type="checkbox"
                          checked={autoAttachChannelTag}
                          onChange={(e) => setAutoAttachChannelTag(e.target.checked)}
                          className="w-4 h-4 rounded text-emerald-500 accent-emerald-500 cursor-pointer"
                        />
                      </div>

                      <div className="flex items-center justify-between p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
                        <div>
                          <span className="text-xs font-medium text-slate-200 block">Hide Channel Link in Captions</span>
                          <span className="text-[10px] text-slate-500 block">
                            Only display the native WhatsApp &quot;View Channel&quot; header banner tag. Keeps photo/video captions and text clean without raw link URLs.
                          </span>
                        </div>
                        <input
                          type="checkbox"
                          checked={!appendChannelLinkToShare}
                          onChange={(e) => setAppendChannelLinkToShare(!e.target.checked)}
                          className="w-4 h-4 rounded text-emerald-500 accent-emerald-500 cursor-pointer"
                        />
                      </div>

                      <div className="flex items-center justify-between p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
                        <div className="pr-3">
                          <span className="text-xs font-medium text-slate-200 block">Show &quot;Forwarded&quot; Tag on Channel Cards</span>
                          <span className="text-[10px] text-slate-500 block">
                            Control whether shared channel cards show WhatsApp&apos;s &quot;Forwarded&quot; label in groups. Turn off for clean channel cards, or override in chat using <code className="text-emerald-400 font-mono">.share noforward</code> / <code className="text-emerald-400 font-mono">.sharetag off</code>.
                          </span>
                        </div>
                        <input
                          type="checkbox"
                          checked={showForwardedTagOnShare}
                          onChange={(e) => setShowForwardedTagOnShare(e.target.checked)}
                          className="w-4 h-4 rounded text-emerald-500 accent-emerald-500 cursor-pointer shrink-0"
                        />
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={isSavingSettings}
                      onClick={() => saveSettings(secretPrefix, disableTextProcessing, shareBatchSize, shareBatchPauseSeconds, defaultChannelJid, defaultChannelName, autoAttachChannelTag, defaultChannelInviteLink, appendChannelLinkToShare, showForwardedTagOnShare)}
                      className="w-full flex items-center justify-center gap-2 py-2.5 bg-emerald-500 hover:bg-emerald-450 text-slate-950 text-xs font-bold rounded-xl transition-all cursor-pointer disabled:opacity-50"
                    >
                      <Check className="w-4 h-4" />
                      <span>{isSavingSettings ? 'Saving Settings...' : 'Save Settings'}</span>
                    </button>
                  </div>
                </div>

                {/* Global Banned / Blocked Group IDs Card */}
                <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-1.5 h-full bg-rose-500" />

                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2 uppercase tracking-wider">
                      <ShieldAlert className="w-4 h-4 text-rose-400" />
                      <span>Global Banned Group IDs ({globalBlockedGroups.length})</span>
                    </h3>
                    <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-rose-500/10 text-rose-400 border border-rose-500/20">
                      All Accounts
                    </span>
                  </div>

                  <p className="text-xs text-slate-400 mb-4 leading-relaxed">
                    Group IDs listed here are banned globally across <strong>all logged-in numbers and users</strong>. The bot will automatically skip these groups in queues, batch shares, and <code className="text-rose-400 font-mono">.sharenow</code>.
                  </p>

                  <div className="space-y-4">
                    {/* Input box for new blocked groups */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-300">Add Banned Group IDs (One per line or comma-separated)</label>
                      <textarea
                        rows={3}
                        placeholder="e.g. 12036301234567890@g.us, 12036398765432100"
                        value={blockedInput}
                        onChange={(e) => setBlockedInput(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white placeholder-slate-600 outline-none focus:border-rose-500 transition-colors font-mono resize-none"
                      />
                      <button
                        type="button"
                        disabled={isSavingBlocked || !blockedInput.trim()}
                        onClick={() => {
                          const newIds = blockedInput
                            .split(/[\n,]/)
                            .map(s => s.trim())
                            .filter(Boolean);
                          if (newIds.length > 0) {
                            const merged = Array.from(new Set([...globalBlockedGroups, ...newIds]));
                            saveBlockedGroups(merged);
                          }
                        }}
                        className="w-full flex items-center justify-center gap-1.5 py-2 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 text-xs font-bold rounded-xl transition-all cursor-pointer disabled:opacity-50"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add to Banned List</span>
                      </button>
                    </div>

                    {/* Badge list of currently blocked group IDs */}
                    {globalBlockedGroups.length > 0 ? (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Active Banned Groups</label>
                          <button
                            type="button"
                            onClick={() => saveBlockedGroups([])}
                            className="text-[10px] text-rose-400 hover:underline flex items-center gap-1 cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Clear All ({globalBlockedGroups.length})</span>
                          </button>
                        </div>

                        <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
                          {globalBlockedGroups.map((jid) => (
                            <div key={jid} className="flex items-center justify-between bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-2 text-xs">
                              <span className="font-mono text-slate-300 text-[11px] truncate mr-2">{jid}</span>
                              <button
                                type="button"
                                title="Unblock / Remove"
                                onClick={() => {
                                  const filtered = globalBlockedGroups.filter(item => item !== jid);
                                  saveBlockedGroups(filtered);
                                }}
                                className="p-1 hover:bg-rose-500/20 text-slate-500 hover:text-rose-400 rounded-lg transition-colors cursor-pointer"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="p-3 bg-slate-950/40 border border-slate-800/60 rounded-xl text-center text-xs text-slate-500">
                        No groups are currently banned globally.
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-5 text-slate-450 text-xs leading-relaxed space-y-2">
                  <h4 className="font-bold text-white flex items-center gap-1.5 mb-1 text-[11px] uppercase tracking-wider text-slate-300">
                    <Info className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Media Processing Rule</span>
                  </h4>
                  <p>
                    Incoming media (images, voice notes, stickers, videos) is **completely ignored and not downloaded** to optimize your container resource bandwidth.
                  </p>
                </div>
              </div>

              {/* Right Column: Captured WhatsApp Group Invites */}
              <div className="lg:col-span-7 space-y-6">
                <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-1.5 h-full bg-emerald-500" />
                  
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2 uppercase tracking-wider">
                      <Link2 className="w-4 h-4 text-emerald-400" />
                      <span>Captured Group Invites Logs ({capturedGroupInvites.length})</span>
                    </h3>
                    
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setCurrentView('group-invites')}
                        className="px-2.5 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-[11px] font-bold rounded-lg border border-emerald-500/30 transition-all cursor-pointer flex items-center gap-1"
                        title="Open full Group Links & Auto-Join Dashboard"
                      >
                        <Users className="w-3 h-3 text-emerald-400" />
                        <span>Open Auto-Join Studio</span>
                      </button>
                      
                      <button
                        onClick={fetchCapturedGroupInvites}
                        disabled={isLoadingCapturedGroups}
                        className="px-2.5 py-1 bg-slate-950 hover:bg-slate-900 text-slate-300 text-[11px] font-semibold rounded-lg border border-slate-800 transition-colors cursor-pointer"
                        title="Reload logs from group.json"
                      >
                        <RefreshCw className={`w-3 h-3 ${isLoadingCapturedGroups ? 'animate-spin' : ''}`} />
                      </button>
                      
                      {capturedGroupInvites.length > 0 && (
                        <button
                          onClick={clearCapturedGroupInvites}
                          className="flex items-center gap-1 px-2.5 py-1 bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 text-[11px] font-bold rounded-lg border border-rose-500/20 transition-all cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3 text-rose-400" />
                          <span>Clear Logs</span>
                        </button>
                      )}
                    </div>
                  </div>

                  <p className="text-xs text-slate-400 mb-6 leading-relaxed">
                    Passively captured WhatsApp group invitation links matched in active chats. Discovered silently without joining.
                  </p>

                  <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1">
                    {capturedGroupInvites.length === 0 ? (
                      <div className="text-center py-12 bg-slate-950/40 border border-slate-850 rounded-xl p-6">
                        <Link2 className="w-8 h-8 text-slate-700 mx-auto mb-3" />
                        <h4 className="text-slate-400 font-bold text-sm">No Group Links Captured Yet</h4>
                        <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                          Incoming text messages containing <code className="text-emerald-400 font-mono">chat.whatsapp.com</code> invite URLs will be parsed and listed here in real-time.
                        </p>
                      </div>
                    ) : (
                      capturedGroupInvites.slice().reverse().map((invite: any, idx: number) => (
                        <div key={idx} className="bg-slate-950 border border-slate-850 rounded-xl p-4 text-left relative overflow-hidden transition-all hover:border-slate-750">
                          <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500/60" />
                          
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div>
                              <h4 className="text-xs font-bold text-white truncate max-w-[280px]">
                                {invite.groupName || 'Unknown Group'}
                              </h4>
                              {invite.groupDescription && (
                                <p className="text-[10px] text-slate-400 mt-0.5 line-clamp-2 max-w-[320px]">
                                  {invite.groupDescription}
                                </p>
                              )}
                            </div>
                            <span className="text-[9px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full shrink-0">
                              {invite.groupSize ? `${invite.groupSize} Members` : 'Size unknown'}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-3 pt-2.5 pb-2 border-t border-b border-slate-850/60 text-[10px] text-slate-400 font-mono">
                            <div>
                              <span className="text-slate-500 block">Sender JID</span>
                              <span className="text-slate-300 text-[9px] truncate block" title={invite.senderJid}>
                                {invite.senderName || 'Sender'} ({invite.senderJid.split('@')[0]})
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-500 block">Creator / Owner</span>
                              <span className="text-slate-300 text-[9px] truncate block" title={invite.creatorJid || 'N/A'}>
                                {invite.creatorJid ? invite.creatorJid.split('@')[0] : 'N/A'}
                              </span>
                            </div>
                          </div>

                          <div className="mt-3 space-y-2">
                            <div className="bg-slate-900/50 p-2.5 rounded-lg border border-slate-850/60 text-[11px] text-slate-300 font-sans leading-relaxed italic">
                              "{invite.messageText}"
                            </div>
                            
                            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[10px]">
                              <span className="text-slate-500 flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {new Date(invite.savedAt).toLocaleString()}
                              </span>
                              
                              <a
                                href={invite.url}
                                target="_blank"
                                rel="noreferrer noopener"
                                className="text-emerald-400 hover:text-emerald-300 font-bold flex items-center gap-1 transition-colors"
                              >
                                <span>Copy Link</span>
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Host Server Resources Detail Panel */}
            {serverResources && (
              <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden mt-6">
                <div className="absolute top-0 left-0 w-1.5 h-full bg-emerald-500" />
                
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 border-b border-slate-850 pb-4">
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2 uppercase tracking-wider">
                      <Server className="w-4 h-4 text-emerald-400" />
                      <span>Host Server System Resources & Diagnostics</span>
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Real-time physical server resource usage, hardware profiles, network throughput, and process metrics.
                    </p>
                  </div>
                  <span className="flex items-center gap-1.5 text-[10px] font-mono text-emerald-400 font-bold bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full shrink-0 self-start sm:self-center">
                    <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                    Monitoring Live
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* CPU Metric */}
                  <div className="bg-slate-950 border border-slate-850/80 rounded-xl p-4 space-y-2">
                    <span className="text-[10px] text-slate-500 block font-bold uppercase tracking-wider">Processor Core Profile</span>
                    <span className="text-xl font-bold text-white font-mono block">
                      {serverResources.cpuCount || 0} <span className="text-xs text-slate-400 font-normal">Logical Cores</span>
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono block truncate" title={serverResources.cpuModel}>
                      {serverResources.cpuModel || 'Intel/AMD Host Processor'}
                    </span>
                    <div className="pt-1.5 text-[9px] text-slate-500 font-mono">
                      Platform Architecture: <span className="text-emerald-400">{serverResources.platform || 'Linux'}</span>
                    </div>
                  </div>

                  {/* RAM Metric */}
                  <div className="bg-slate-950 border border-slate-850/80 rounded-xl p-4 space-y-3">
                    <div className="flex justify-between items-start">
                      <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">RAM Usage State</span>
                      <span className="text-[9px] font-mono text-emerald-400 font-bold">{Math.round((serverResources.usedMem / (serverResources.totalMem || 1)) * 100) || 0}%</span>
                    </div>
                    <div>
                      <span className="text-sm font-bold text-white font-mono block">
                        {(serverResources.usedMem / (1024 * 1024 * 1024)).toFixed(2)} GB <span className="text-[10px] text-slate-400 font-normal">Used</span>
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono block mt-0.5">
                        Allocated: {(serverResources.totalMem / (1024 * 1024 * 1024)).toFixed(1)} GB Total
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-emerald-500 rounded-full transition-all duration-1000"
                        style={{ width: `${Math.round((serverResources.usedMem / (serverResources.totalMem || 1)) * 100) || 0}%` }}
                      />
                    </div>
                  </div>

                  {/* SSD Storage Metric */}
                  <div className="bg-slate-950 border border-slate-850/80 rounded-xl p-4 space-y-3">
                    <div className="flex justify-between items-start">
                      <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">SSD Persistent Space</span>
                      <span className="text-[9px] font-mono text-blue-400 font-bold">{Math.round((serverResources.diskUsed / (serverResources.diskTotal || 1)) * 100) || 0}%</span>
                    </div>
                    <div>
                      <span className="text-sm font-bold text-white font-mono block">
                        {(serverResources.diskUsed / (1024 * 1024 * 1024)).toFixed(1)} GB <span className="text-[10px] text-slate-400 font-normal">Used</span>
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono block mt-0.5">
                        Free Space: {(serverResources.diskFree / (1024 * 1024 * 1024)).toFixed(1)} GB
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-blue-500 rounded-full transition-all duration-1000"
                        style={{ width: `${Math.round((serverResources.diskUsed / (serverResources.diskTotal || 1)) * 100) || 0}%` }}
                      />
                    </div>
                  </div>

                  {/* Network Telemetry Metric */}
                  <div className="bg-slate-950 border border-slate-850/80 rounded-xl p-4 space-y-2">
                    <span className="text-[10px] text-slate-500 block font-bold uppercase tracking-wider">Gateway Network Speed</span>
                    <span className="text-xl font-bold text-white font-mono block">
                      ~{serverResources.internetSpeed || 1000} <span className="text-xs text-slate-400 font-normal">Mbps</span>
                    </span>
                    <div className="pt-1 text-[9px] text-slate-500 space-y-1">
                      <div className="flex justify-between">
                        <span>Latency Ping (Google):</span>
                        <span className="text-emerald-400 font-bold font-mono">{serverResources.internetPing || 12} ms</span>
                      </div>
                      <div className="flex justify-between border-t border-slate-850/60 pt-1">
                        <span>Private Host IP:</span>
                        <span className="text-slate-300 font-mono truncate max-w-[100px]">{serverResources.serverIp || '127.0.0.1'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-8 animate-fadeIn">
            {/* Header Description of Analytics */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/40 p-6 rounded-2xl border border-slate-800 backdrop-blur-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1.5 h-full bg-emerald-500" />
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-emerald-400" />
                  <span>Real-Time Delivery Analytics & Queue Telemetry</span>
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Comprehensive performance insights, queue latency calculations, and isolated user resource statistics.
                </p>
              </div>
              <button
                onClick={fetchAnalytics}
                disabled={isLoadingAnalytics}
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs font-bold rounded-xl border border-emerald-500/20 transition-all cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingAnalytics ? 'animate-spin' : ''}`} />
                <span>{isLoadingAnalytics ? 'Refreshing Metrics...' : 'Sync Analytics'}</span>
              </button>
            </div>

            {/* Performance KPIs Summary */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5">
              {/* Card 1: Success Rate */}
              <div className="bg-slate-900/60 border border-slate-800 p-5 rounded-2xl relative overflow-hidden shadow-xl flex flex-col justify-between">
                <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full filter blur-2xl pointer-events-none" />
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">Success Rate Ratio</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-extrabold text-white">
                      {Math.round((analyticsData.summary.totalSent / (analyticsData.summary.totalSent + analyticsData.summary.totalFailed || 1)) * 100)}%
                    </span>
                    <span className="text-xs font-semibold text-emerald-400 font-mono flex items-center gap-0.5">
                      <CheckCircle className="w-3 h-3" /> SLA
                    </span>
                  </div>
                </div>
                <div className="mt-3.5 text-slate-500 text-[10px] leading-relaxed">
                  Percentage of total dispatched socket packets acknowledged.
                </div>
              </div>

              {/* Card 2: Total Dispatched */}
              <div className="bg-slate-900/60 border border-slate-800 p-5 rounded-2xl relative overflow-hidden shadow-xl flex flex-col justify-between">
                <div className="absolute top-0 right-0 w-24 h-24 bg-teal-500/5 rounded-full filter blur-2xl pointer-events-none" />
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">Total Dispatches</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-extrabold text-white">
                      {analyticsData.summary.totalSent + analyticsData.summary.totalFailed}
                    </span>
                    <span className="text-xs font-medium text-slate-400">Msgs</span>
                  </div>
                </div>
                <div className="mt-3.5 text-slate-400 text-[10px] flex gap-3 font-mono">
                  <span className="text-emerald-400">Sent: {analyticsData.summary.totalSent}</span>
                  <span className="text-rose-400 font-bold">Failed: {analyticsData.summary.totalFailed}</span>
                </div>
              </div>

              {/* Card 3: Daily Message Limit Usage (Configurable Cap) */}
              {(() => {
                const todayMsgCount = analyticsData.summary.todayTotal ?? (analyticsData.summary.todaySent + analyticsData.summary.todayFailed);
                const usagePct = Math.min(100, Math.round((todayMsgCount / (dailyLimitCap || 1)) * 100));
                const isHighUsage = usagePct >= 90;
                const isWarnUsage = usagePct >= 75 && usagePct < 90;
                
                const statusColor = isHighUsage ? 'text-rose-400' : isWarnUsage ? 'text-amber-400' : 'text-emerald-400';
                const statusBg = isHighUsage ? 'bg-rose-500' : isWarnUsage ? 'bg-amber-500' : 'bg-emerald-500';
                const badgeBg = isHighUsage 
                  ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' 
                  : isWarnUsage 
                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' 
                  : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';

                return (
                  <div className="bg-slate-900/60 border border-slate-800 p-5 rounded-2xl relative overflow-hidden shadow-xl flex flex-col justify-between">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/5 rounded-full filter blur-2xl pointer-events-none" />
                    
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                          <Gauge className="w-3 h-3 text-purple-400" />
                          <span>Daily Limit Usage</span>
                        </span>
                        
                        <button
                          onClick={() => {
                            setCapInput(dailyLimitCap.toString());
                            setIsEditingCap(!isEditingCap);
                          }}
                          className="text-[10px] text-slate-400 hover:text-purple-300 transition-colors p-1 rounded hover:bg-slate-800/80 cursor-pointer flex items-center gap-1"
                          title="Configure Daily Cap Limit"
                        >
                          <Edit2 className="w-3 h-3 text-purple-400" />
                          <span className="font-mono text-[9px] text-purple-300 font-bold">{dailyLimitCap.toLocaleString()}/day</span>
                        </button>
                      </div>

                      {/* Inline Daily Cap Configurator */}
                      {isEditingCap ? (
                        <div className="mb-2.5 p-2 bg-slate-950 border border-purple-500/30 rounded-xl space-y-1.5">
                          <label className="text-[9px] font-bold text-slate-300 block">Set Daily Cap Limit:</label>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              min={10}
                              max={100000}
                              value={capInput}
                              onChange={(e) => setCapInput(e.target.value)}
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white font-mono font-bold outline-none focus:border-purple-500"
                            />
                            <button
                              onClick={() => {
                                const newCap = Math.max(1, parseInt(capInput, 10) || 1000);
                                setDailyLimitCap(newCap);
                                localStorage.setItem('wa_daily_limit_cap', newCap.toString());
                                setIsEditingCap(false);
                              }}
                              className="bg-purple-600 hover:bg-purple-500 text-white font-bold text-[10px] px-2 py-1 rounded-lg transition-all cursor-pointer shrink-0"
                            >
                              Save
                            </button>
                          </div>
                          <div className="flex gap-1 pt-1 flex-wrap">
                            {[500, 1000, 2500, 5000].map((preset) => (
                              <button
                                key={preset}
                                onClick={() => {
                                  setCapInput(preset.toString());
                                  setDailyLimitCap(preset);
                                  localStorage.setItem('wa_daily_limit_cap', preset.toString());
                                  setIsEditingCap(false);
                                }}
                                className="text-[9px] bg-slate-900 hover:bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded font-mono cursor-pointer border border-slate-750"
                              >
                                {preset.toLocaleString()}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-baseline gap-2">
                          <span className={`text-3xl font-extrabold ${statusColor}`}>
                            {usagePct}%
                          </span>
                          <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${badgeBg}`}>
                            {isHighUsage ? 'Cap Warning' : isWarnUsage ? 'Moderate' : 'Optimal'}
                          </span>
                        </div>
                      )}

                      {/* Progress Bar */}
                      <div className="w-full bg-slate-950 rounded-full h-1.5 mt-2.5 overflow-hidden border border-slate-800">
                        <div 
                          className={`h-full transition-all duration-500 rounded-full ${statusBg}`} 
                          style={{ width: `${usagePct}%` }}
                        />
                      </div>
                    </div>

                    <div className="mt-3 text-slate-400 text-[10px] flex items-center justify-between font-mono">
                      <span>{todayMsgCount.toLocaleString()} / {dailyLimitCap.toLocaleString()} msgs today</span>
                      <span className="text-slate-500 font-sans">Cap Limit</span>
                    </div>
                  </div>
                );
              })()}

              {/* Card 4: Backlog Delay */}
              <div className="bg-slate-900/60 border border-slate-800 p-5 rounded-2xl relative overflow-hidden shadow-xl flex flex-col justify-between">
                <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full filter blur-2xl pointer-events-none" />
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">Message Queue Backlog</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-extrabold text-white">
                      {analyticsData.summary.queuePending}
                    </span>
                    <span className="text-xs font-semibold text-amber-400 font-mono">Queued</span>
                  </div>
                </div>
                <div className="mt-3.5 text-slate-500 text-[10px] leading-relaxed">
                  In-memory queue scheduler backlog, processing round-robin.
                </div>
              </div>

              {/* Card 5: Avg Speed */}
              <div className="bg-slate-900/60 border border-slate-800 p-5 rounded-2xl relative overflow-hidden shadow-xl flex flex-col justify-between">
                <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full filter blur-2xl pointer-events-none" />
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">Mean Processing Speed</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-extrabold text-white">
                      {analyticsData.summary.avgSpeedSeconds || '2.0'}
                    </span>
                    <span className="text-xs font-medium text-slate-400">sec / msg</span>
                  </div>
                </div>
                <div className="mt-3.5 text-slate-500 text-[10px] leading-relaxed">
                  Calculated response latency per individual thread execution.
                </div>
              </div>
            </div>

            {/* Recharts Graphs Section */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              {/* Delivery Trend (AreaChart) - Left 8 columns */}
              <div className="lg:col-span-8 bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <Activity className="w-4 h-4 text-emerald-400" />
                    <span>Daily Delivery Success & Failures Trend</span>
                  </h3>
                  <span className="text-[10px] font-mono text-slate-500">Trailing 7 Days</span>
                </div>

                <div className="h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={analyticsData.dailyTrend && analyticsData.dailyTrend.length > 0 ? analyticsData.dailyTrend : [
                        { date: 'Mon', success: 0, fail: 0 },
                        { date: 'Tue', success: 0, fail: 0 },
                        { date: 'Wed', success: 0, fail: 0 },
                        { date: 'Thu', success: 0, fail: 0 },
                        { date: 'Fri', success: 0, fail: 0 },
                        { date: 'Sat', success: 0, fail: 0 },
                        { date: 'Sun', success: 0, fail: 0 }
                      ]}
                      margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="colorSuccess" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.25}/>
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorFail" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.25}/>
                          <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                      <XAxis 
                        dataKey="date" 
                        stroke="#64748b" 
                        fontSize={10} 
                        tickLine={false} 
                        axisLine={false} 
                        dy={8}
                      />
                      <YAxis 
                        stroke="#64748b" 
                        fontSize={10} 
                        tickLine={false} 
                        axisLine={false}
                        dx={-8}
                      />
                      <Tooltip
                        content={({ active, payload, label }) => {
                          if (active && payload && payload.length) {
                            return (
                              <div className="bg-slate-900 border border-slate-800 text-[11px] text-white p-3.5 rounded-xl shadow-2xl space-y-1.5 font-mono">
                                <p className="font-bold font-sans text-slate-300">{label}</p>
                                <p className="text-emerald-400 flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
                                  <span>Successes: {payload[0]?.value ?? 0}</span>
                                </p>
                                <p className="text-rose-400 flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 bg-rose-400 rounded-full" />
                                  <span>Failures: {payload[1]?.value ?? 0}</span>
                                </p>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Legend 
                        verticalAlign="top" 
                        height={36} 
                        iconType="circle"
                        iconSize={8}
                        wrapperStyle={{ fontSize: '11px', color: '#64748b', fontFamily: 'monospace' }}
                      />
                      <Area 
                        name="Delivered Successful" 
                        type="monotone" 
                        dataKey="success" 
                        stroke="#10b981" 
                        strokeWidth={2}
                        fillOpacity={1} 
                        fill="url(#colorSuccess)" 
                      />
                      <Area 
                        name="Failed Delivery" 
                        type="monotone" 
                        dataKey="fail" 
                        stroke="#f43f5e" 
                        strokeWidth={2}
                        fillOpacity={1} 
                        fill="url(#colorFail)" 
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Sessions Load Breakdown (BarChart) - Right 4 columns */}
              <div className="lg:col-span-4 bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col justify-between">
                <div>
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2 mb-1.5">
                    <Server className="w-4 h-4 text-emerald-400" />
                    <span>WhatsApp Account Session Loads</span>
                  </h3>
                  <p className="text-[11px] text-slate-400 leading-relaxed mb-6">
                    Breakdown of traffic routing and percentage resource load across connected instances.
                  </p>
                </div>

                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={analyticsData.sessionsLoad && analyticsData.sessionsLoad.length > 0 ? analyticsData.sessionsLoad : [
                        { session: 'Primary', load: 100 }
                      ]}
                      margin={{ top: 0, right: 0, left: -20, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={true} vertical={false} />
                      <XAxis 
                        dataKey="session" 
                        stroke="#64748b" 
                        fontSize={10} 
                        tickLine={false} 
                        axisLine={false}
                        dy={8}
                      />
                      <YAxis 
                        stroke="#64748b" 
                        fontSize={10} 
                        tickLine={false} 
                        axisLine={false}
                        dx={-8}
                        domain={[0, 100]}
                        unit="%"
                      />
                      <Tooltip
                        cursor={{ fill: 'rgba(255, 255, 255, 0.05)' }}
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            return (
                              <div className="bg-slate-900 border border-slate-800 text-[11px] text-white p-3 rounded-xl shadow-2xl font-mono">
                                <p className="font-bold text-slate-300">Session ID: {payload[0]?.payload?.session ?? 'Unknown'}</p>
                                <p className="text-teal-400 mt-1">Resource Load: {payload[0]?.value ?? 0}%</p>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Bar 
                        dataKey="load" 
                        radius={[4, 4, 0, 0]} 
                        fill="#14b8a6"
                      >
                        {
                          analyticsData.sessionsLoad?.map((entry: any, index: number) => (
                            <Cell key={`cell-${index}`} fill={index % 2 === 0 ? '#10b981' : '#14b8a6'} />
                          ))
                        }
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <p className="text-[9px] text-slate-500 mt-4 leading-relaxed font-mono">
                  Round-robin load balanced metrics are aggregated on queue processing cycles.
                </p>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ADD ACCOUNT / SESSION MODAL */}
      <AnimatePresence>
        {showSessionModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md shadow-2xl relative"
            >
              <button
                onClick={() => setShowSessionModal(false)}
                className="absolute top-4 right-4 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>

              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <PlusCircle className="w-5 h-5 text-emerald-400" />
                <span>Add WhatsApp Account</span>
              </h3>

              <p className="text-xs text-slate-400 mb-5 leading-relaxed text-left">
                Provide a unique ID and a human-friendly name to initialize a new session. You can then connect it using a QR or Pairing Code.
              </p>

              <form onSubmit={handleCreateSession} className="space-y-4 text-left">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Account ID (Lowercase, no spaces)</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g., sales_desk_1"
                    value={newSessionId}
                    onChange={(e) => setNewSessionId(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-650 outline-none focus:border-emerald-500 font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Friendly Account Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g., Sales Desk 1"
                    value={newSessionName}
                    onChange={(e) => setNewSessionName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-650 outline-none focus:border-emerald-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isCreatingSession}
                  className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold py-2.5 px-4 rounded-xl text-xs transition-colors cursor-pointer shadow-lg shadow-emerald-500/10 flex items-center justify-center gap-2"
                >
                  {isCreatingSession ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Creating Account...</span>
                    </>
                  ) : (
                    <>
                      <PlusCircle className="w-3.5 h-3.5" />
                      <span>Add Account</span>
                    </>
                  )}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* QUICK TEMPLATE MODAL */}
      <AnimatePresence>
        {showTemplateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-lg shadow-2xl relative max-h-[90vh] overflow-y-auto"
            >
              <button
                onClick={() => setShowTemplateModal(false)}
                className="absolute top-4 right-4 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>

              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <Bookmark className="w-5 h-5 text-emerald-400" />
                <span>Create New Template</span>
              </h3>

              <form onSubmit={handleAddTemplate} className="space-y-4 text-left">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-300">Template Title</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g., Confirmed Payment"
                      value={newTemplateTitle}
                      onChange={(e) => setNewTemplateTitle(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-300">Category Tag</label>
                    <select
                      value={newTemplateCat}
                      onChange={(e) => setNewTemplateCat(e.target.value as any)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none cursor-pointer"
                    >
                      <option value="Utility">Utility / Greeting</option>
                      <option value="Sales">Sales / Promo</option>
                      <option value="Support">Support Help</option>
                      <option value="Alert">Alerts / Notices</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-300">Message Type</label>
                    <select
                      value={newTemplateMsgType}
                      onChange={(e) => setNewTemplateMsgType(e.target.value as any)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none cursor-pointer"
                    >
                      <option value="text">Plain Text Message</option>
                      <option value="buttons">Quick-Reply Buttons</option>
                      <option value="template">Call/URL Actions</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-300">Attachment Type</label>
                    <select
                      value={newTemplateAttachType}
                      onChange={(e) => setNewTemplateAttachType(e.target.value as any)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none cursor-pointer"
                    >
                      <option value="none">No Attachment</option>
                      <option value="image">Image Attachment</option>
                      <option value="video">Video MP4</option>
                      <option value="pdf">PDF Document</option>
                      <option value="doc">Word / Excel / Text</option>
                    </select>
                  </div>
                </div>

                {newTemplateAttachType !== 'none' && (
                  <div className="space-y-1 animate-fadeIn">
                    <label className="text-xs font-semibold text-slate-300">Direct Public Media URL</label>
                    <input
                      type="url"
                      required
                      placeholder="https://example.com/file.png"
                      value={newTemplateAttachUrl}
                      onChange={(e) => setNewTemplateAttachUrl(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 outline-none focus:border-emerald-500 font-mono"
                    />
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Message Main Body Text</label>
                  <textarea
                    required
                    rows={3}
                    placeholder="Type your pre-configured notification body here..."
                    value={newTemplateText}
                    onChange={(e) => setNewTemplateText(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 outline-none focus:border-emerald-500 resize-none font-sans"
                  />
                </div>

                {newTemplateMsgType !== 'text' && (
                  <div className="space-y-1.5 p-3 bg-slate-950/40 rounded-xl border border-slate-850 animate-fadeIn space-y-3">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-300">Footer Context Line</label>
                      <input
                        type="text"
                        placeholder="e.g. Secure service from Meta"
                        value={newTemplateFooter}
                        onChange={(e) => setNewTemplateFooter(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-850 rounded-xl px-3 py-1.5 text-xs text-white outline-none focus:border-emerald-500"
                      />
                    </div>

                    {newTemplateMsgType === 'buttons' && (
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Quick-Reply Labels</label>
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="text"
                            placeholder="Button 1 text"
                            value={newTemplateButtons[0]?.text || ''}
                            onChange={(e) => {
                              const b = [...newTemplateButtons];
                              b[0] = { id: 'btn1', text: e.target.value };
                              setNewTemplateButtons(b);
                            }}
                            className="bg-slate-950 border border-slate-850 rounded-lg px-2 py-1 text-[11px] text-white outline-none"
                          />
                          <input
                            type="text"
                            placeholder="Button 2 text (Optional)"
                            value={newTemplateButtons[1]?.text || ''}
                            onChange={(e) => {
                              const b = [...newTemplateButtons];
                              b[1] = { id: 'btn2', text: e.target.value };
                              setNewTemplateButtons(b);
                            }}
                            className="bg-slate-950 border border-slate-850 rounded-lg px-2 py-1 text-[11px] text-white outline-none"
                          />
                        </div>
                      </div>
                    )}

                    {newTemplateMsgType === 'template' && (
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Action Buttons (Url & Call)</label>
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-slate-500 shrink-0 font-bold">URL:</span>
                            <input
                              type="text"
                              placeholder="Button Label"
                              value={newTemplateTmplButtons[0]?.text || ''}
                              onChange={(e) => {
                                const b = [...newTemplateTmplButtons];
                                b[0] = { ...b[0], type: 'url', text: e.target.value };
                                setNewTemplateTmplButtons(b);
                              }}
                              className="flex-1 bg-slate-950 border border-slate-850 rounded-lg px-2 py-1 text-[11px] text-white outline-none"
                            />
                            <input
                              type="url"
                              placeholder="Action URL"
                              value={newTemplateTmplButtons[0]?.url || ''}
                              onChange={(e) => {
                                const b = [...newTemplateTmplButtons];
                                b[0] = { ...b[0], type: 'url', url: e.target.value };
                                setNewTemplateTmplButtons(b);
                              }}
                              className="flex-1 bg-slate-950 border border-slate-850 rounded-lg px-2 py-1 text-[11px] text-white outline-none font-mono"
                            />
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-slate-500 shrink-0 font-bold">Call:</span>
                            <input
                              type="text"
                              placeholder="Call Label"
                              value={newTemplateTmplButtons[1]?.text || ''}
                              onChange={(e) => {
                                const b = [...newTemplateTmplButtons];
                                if (!b[1]) b[1] = { type: 'call', text: '', phoneNumber: '' };
                                b[1] = { ...b[1], type: 'call', text: e.target.value };
                                setNewTemplateTmplButtons(b);
                              }}
                              className="flex-1 bg-slate-950 border border-slate-850 rounded-lg px-2 py-1 text-[11px] text-white outline-none"
                            />
                            <input
                              type="text"
                              placeholder="Phone Number"
                              value={newTemplateTmplButtons[1]?.phoneNumber || ''}
                              onChange={(e) => {
                                const b = [...newTemplateTmplButtons];
                                if (!b[1]) b[1] = { type: 'call', text: '', phoneNumber: '' };
                                b[1] = { ...b[1], type: 'call', phoneNumber: e.target.value };
                                setNewTemplateTmplButtons(b);
                              }}
                              className="flex-1 bg-slate-950 border border-slate-850 rounded-lg px-2 py-1 text-[11px] text-white outline-none font-mono"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-2.5 px-4 rounded-xl text-xs transition-colors cursor-pointer shadow-lg shadow-emerald-500/10"
                >
                  Save Quick Template
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Immersive Fullscreen Template Preview Modal */}
      <AnimatePresence>
        {isTemplatePreviewOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-4 md:p-8 overflow-y-auto"
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-5xl shadow-2xl overflow-hidden flex flex-col md:flex-row h-full max-h-[85vh]"
            >
              {/* Left Column: Interactive Mobile Mockup (Large scale) */}
              <div className="flex-1 bg-slate-950/50 p-6 flex flex-col items-center justify-center border-b md:border-b-0 md:border-r border-slate-800/80 overflow-y-auto">
                <div className="w-full max-w-[340px] aspect-[9/18.5] bg-slate-950 border-8 border-slate-800 rounded-[40px] relative overflow-hidden flex flex-col shadow-2xl ring-4 ring-emerald-500/10">
                  {/* Camera / Speaker Notch */}
                  <div className="absolute top-2 left-1/2 -translate-x-1/2 w-28 h-5 bg-slate-800 rounded-full z-15 flex items-center justify-center">
                    <div className="w-2.5 h-2.5 bg-slate-950 rounded-full mr-2 border border-slate-900" />
                    <div className="w-12 h-1 bg-slate-700 rounded-full" />
                  </div>
                  
                  {/* Phone Status bar */}
                  <div className="bg-teal-700 text-slate-300 px-6 pt-7 pb-1.5 flex justify-between items-center text-[10px] select-none font-mono">
                    <span>9:41 AM</span>
                    <div className="flex items-center gap-1.5">
                      <Wifi className="w-3 h-3 text-emerald-400" />
                      <span className="font-bold text-emerald-400">5G</span>
                      <div className="w-5 h-2.5 border border-slate-400 rounded-sm p-0.5 flex items-center">
                        <div className="bg-emerald-400 h-full w-full rounded-2xs" />
                      </div>
                    </div>
                  </div>

                  {/* Header */}
                  <div className="bg-teal-700/90 text-white px-4 py-3 flex items-center justify-between border-b border-teal-800">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-teal-300">
                        {recipientType === 'individual' ? '👤' : '👥'}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-xs truncate max-w-[150px]">
                          {phoneNumber ? '+' + getCleanNumber(phoneNumber) : 'Recipient Contact'}
                        </div>
                        <div className="text-[9px] text-teal-300 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                          <span>online</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Phone className="w-3.5 h-3.5 text-slate-300 hover:text-white cursor-pointer" />
                      <MoreVertical className="w-3.5 h-3.5 text-slate-300 hover:text-white cursor-pointer" />
                    </div>
                  </div>

                  {/* Chat Canvas Area with high fidelity background pattern */}
                  <div className="flex-1 p-3 bg-[radial-gradient(#ffffff0a_1px,transparent_1px)] [background-size:12px_12px] bg-slate-950 flex flex-col justify-end overflow-y-auto">
                    <AnimatePresence>
                      {msgType === 'navi-template' || message.trim() ? (
                        <motion.div
                          initial={{ scale: 0.95, opacity: 0, y: 15 }}
                          animate={{ scale: 1, opacity: 1, y: 0 }}
                          className="bg-[#0b141a] border border-[#202c33] rounded-2xl text-slate-100 max-w-[90%] self-end relative break-words shadow-2xl overflow-hidden flex flex-col w-full"
                        >
                          {/* Render Attachment if type !== 'none' and URL is provided */}
                          {attachmentType !== 'none' && attachmentUrl && (
                            <div className="p-1 border-b border-[#202c33]/40 bg-[#111b21]/40">
                              {attachmentType === 'image' && (
                                <img
                                  src={attachmentUrl}
                                  alt="Attachment Preview"
                                  className="w-full h-36 object-cover rounded-xl"
                                  onError={(e) => {
                                    e.currentTarget.src = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800";
                                  }}
                                />
                              )}
                              {attachmentType === 'video' && (
                                <div className="relative w-full h-36 bg-black rounded-xl overflow-hidden flex items-center justify-center">
                                  <video src={attachmentUrl} className="w-full h-full object-cover" muted loop autoPlay />
                                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                                    <Video className="w-8 h-8 text-white/80 animate-pulse" />
                                  </div>
                                </div>
                              )}
                              {attachmentType === 'pdf' && (
                                <div className="flex items-center gap-3 p-3 bg-slate-900/60 rounded-xl border border-slate-800">
                                  <FileText className="w-8 h-8 text-rose-500 shrink-0" />
                                  <div className="min-w-0 flex-1">
                                    <div className="text-[11px] font-bold text-white truncate">{attachmentName || "invoice.pdf"}</div>
                                    <div className="text-[9px] text-slate-500 font-mono">PDF Document</div>
                                  </div>
                                </div>
                              )}
                              {attachmentType === 'doc' && (
                                <div className="flex items-center gap-3 p-3 bg-slate-900/60 rounded-xl border border-slate-800">
                                  <FileCode className="w-8 h-8 text-teal-400 shrink-0" />
                                  <div className="min-w-0 flex-1">
                                    <div className="text-[11px] font-bold text-white truncate">{attachmentName || "document.docx"}</div>
                                    <div className="text-[9px] text-slate-500 font-mono">Word Document</div>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Message Body Content */}
                          <div className="p-3.5 text-xs leading-relaxed whitespace-pre-wrap text-left select-text">
                            {msgType === 'navi-template' 
                              ? 'Hello\n\nYour prepaid recharge of ₹199 for Airtel is expiring today.\n\nPay Now via Navi UPI.'
                              : message}
                          </div>

                          {/* Footer text if enabled */}
                          {msgType === 'navi-template' ? (
                            <div className="px-3.5 pb-2.5 text-[9.5px] text-slate-400 italic text-left border-t border-[#202c33]/40 pt-1.5">
                              Secure service from Meta
                            </div>
                          ) : (
                            (msgType === 'buttons' || msgType === 'template') && footerText && (
                              <div className="px-3.5 pb-2.5 text-[9.5px] text-slate-400 italic text-left border-t border-[#202c33]/40 pt-1.5">
                                {footerText}
                              </div>
                            )
                          )}

                          {/* Interactive Buttons (Traditional / Quick-Replies) */}
                          {msgType === 'buttons' && !(msgType === 'navi-template') && customButtons.length > 0 && (
                            <div className="border-t border-[#202c33] flex flex-col divide-y divide-[#202c33] bg-[#111b21]">
                              {customButtons.map((btn, i) => (
                                <button
                                  key={btn.id || i}
                                  type="button"
                                  onClick={() => {
                                    const logMsg = `[${new Date().toLocaleTimeString()}] Clicked Quick-Reply Button: "${btn.text || 'Custom Button'}" (ID: ${btn.id})`;
                                    setPreviewLogs(prev => [...prev, logMsg]);
                                  }}
                                  className="w-full text-center py-2.5 text-xs font-bold text-emerald-400 hover:bg-[#202c33] active:bg-[#202c33]/80 transition-colors select-none cursor-pointer"
                                >
                                  {btn.text || `Button ${i+1}`}
                                </button>
                              ))}
                            </div>
                          )}

                          {/* Template Buttons (Call / Web URL / Quick Reply) */}
                          {msgType === 'template' && !(msgType === 'navi-template') && templateButtons.length > 0 && (
                            <div className="border-t border-[#202c33] flex flex-col divide-y divide-[#202c33] bg-[#111b21]">
                              {templateButtons.map((btn, i) => (
                                <button
                                  key={btn.id || i}
                                  type="button"
                                  onClick={() => {
                                    let logMsg = '';
                                    if (btn.type === 'url') {
                                      logMsg = `[${new Date().toLocaleTimeString()}] Triggered Link Out to URL: "${btn.url || 'https://'}" (Button Label: "${btn.text}")`;
                                    } else if (btn.type === 'call') {
                                      logMsg = `[${new Date().toLocaleTimeString()}] Initiated Mobile Call Sequence to: "${btn.phoneNumber || 'N/A'}" (Button Label: "${btn.text}")`;
                                    } else {
                                      logMsg = `[${new Date().toLocaleTimeString()}] Clicked Template Action: "${btn.text}"`;
                                    }
                                    setPreviewLogs(prev => [...prev, logMsg]);
                                  }}
                                  className="w-full flex items-center justify-center gap-1.5 py-2.5 px-3 text-xs font-bold text-emerald-400 hover:bg-[#202c33] active:bg-[#202c33]/80 transition-colors select-none cursor-pointer"
                                >
                                  {btn.type === 'url' && <Link2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
                                  {btn.type === 'call' && <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
                                  <span className="truncate">{btn.text || 'Action'}</span>
                                </button>
                              ))}
                            </div>
                          )}

                          {/* Navi Template Button */}
                          {msgType === 'navi-template' && (
                            <div className="border-t border-[#202c33] flex flex-col divide-y divide-[#202c33] bg-[#111b21]">
                              <button
                                type="button"
                                onClick={() => {
                                  const logMsg = `[${new Date().toLocaleTimeString()}] Activated Secure Navi UPI payment flow callback (Simulated).`;
                                  setPreviewLogs(prev => [...prev, logMsg]);
                                }}
                                className="w-full flex items-center justify-center gap-2 py-2.5 px-3 text-xs font-extrabold text-emerald-400 hover:bg-[#202c33] active:bg-[#202c33]/80 transition-colors select-none cursor-pointer"
                              >
                                <Link2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                <span className="truncate">🔗 Pay Now</span>
                              </button>
                            </div>
                          )}

                          {/* Status and timestamp */}
                          <div className="px-3 pb-2 flex justify-end items-center gap-0.5 text-[8.5px] text-slate-500 font-mono select-none self-end bg-[#0b141a] w-full pt-1 border-t border-[#202c33]/20">
                            <span>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          </div>
                        </motion.div>
                      ) : (
                        <div className="text-xs text-slate-500 text-center select-none py-20 italic">
                          No active message. Enter text to preview final layout.
                        </div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </div>

              {/* Right Column: Interaction Diagnostics and Controls */}
              <div className="w-full md:w-[380px] p-6 flex flex-col bg-slate-900 border-t md:border-t-0 border-slate-800">
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-emerald-400" />
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">Interactive Feedback</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsTemplatePreviewOpen(false)}
                    className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex-1 flex flex-col justify-between space-y-4">
                  {/* Summary Details */}
                  <div className="space-y-3 bg-slate-950 p-4 rounded-xl border border-slate-850">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Message Attributes</span>
                    <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                      <div>
                        <span className="text-slate-500 block">Type:</span>
                        <span className="text-white font-semibold uppercase">{msgType}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Attachment:</span>
                        <span className="text-white font-semibold uppercase">{attachmentType}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Recipients:</span>
                        <span className="text-white font-semibold">
                          {phoneNumber ? phoneNumber.split(/[\n,]+/).filter(Boolean).length : 0} contacts
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Mode:</span>
                        <span className="text-white font-semibold uppercase">{recipientType}</span>
                      </div>
                    </div>
                  </div>

                  {/* Simulated interaction Logs */}
                  <div className="flex-1 flex flex-col min-h-[160px] max-h-[220px]">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Device Event Logs</span>
                      <button
                        type="button"
                        onClick={() => setPreviewLogs([`[${new Date().toLocaleTimeString()}] Logs cleared.`])}
                        className="text-[9px] text-slate-500 hover:text-slate-300 font-semibold cursor-pointer underline"
                      >
                        Clear
                      </button>
                    </div>
                    <div className="flex-1 bg-slate-950 border border-slate-850 rounded-xl p-3 overflow-y-auto font-mono text-[10px] text-teal-400 space-y-1.5 leading-relaxed">
                      {previewLogs.map((log, index) => (
                        <div key={index} className="border-b border-slate-900/50 pb-1 last:border-0">
                          {log}
                        </div>
                      ))}
                      {previewLogs.length === 0 && (
                        <div className="text-slate-600 italic">No events recorded. Click buttons on the phone screen to simulate clicks.</div>
                      )}
                    </div>
                  </div>

                  {/* Actions info */}
                  <div className="text-[10px] text-slate-400 leading-normal bg-teal-500/5 p-3 rounded-xl border border-teal-500/10">
                    💡 <strong className="text-emerald-400">Interaction Ready:</strong> You can test-click any button inside the WhatsApp mockup bubble on the left to confirm click events, deep linking, or webhook payloads!
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsTemplatePreviewOpen(false)}
                    className="w-full bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold py-2.5 px-4 rounded-xl text-xs transition-colors cursor-pointer text-center"
                  >
                    Return to Dispatch Studio
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Group Member Extractor and Save Modal */}
      <AnimatePresence>
        {showMembersExtractor && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-4 md:p-8 overflow-y-auto"
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
            >
              {/* Modal Header */}
              <div className="p-6 border-b border-slate-800 bg-slate-950 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/15 border border-indigo-500/20 flex items-center justify-center">
                    <Users className="w-5 h-5 text-indigo-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-white uppercase tracking-wider">Group Member Extractor</h3>
                    <p className="text-[11px] text-slate-400">
                      Target: {extractorTarget === 'individual' ? `Individual Group (${extractorGroupJid})` : extractorTarget === 'filtered' ? `Filtered Groups` : 'All Joined Groups'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowMembersExtractor(false)}
                  className="p-1.5 hover:bg-slate-850 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Modal Content */}
              {(() => {
                const contacts = getExtractorContacts();
                
                return (
                  <>
                    <div className="p-6 flex-1 overflow-y-auto space-y-4">
                      {/* Summary Banner */}
                      <div className="p-4 bg-slate-950 border border-slate-850 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <div>
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-0.5">Total Unique Numbers Found</span>
                          <span className="text-2xl font-black text-indigo-400 font-mono">{contacts.length}</span>
                        </div>
                        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                          <button
                            type="button"
                            onClick={() => {
                              const list = contacts.map(c => c.phone).join(', ');
                              navigator.clipboard.writeText(list);
                              setFeedback({ type: 'success', text: `Copied ${contacts.length} numbers separated by commas!` });
                            }}
                            className="flex-1 sm:flex-none py-1.5 px-3 bg-slate-950 hover:bg-slate-850 text-indigo-400 border border-slate-800 rounded-lg text-xs font-bold transition-all cursor-pointer text-center"
                          >
                            Copy (Commas)
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const list = contacts.map(c => c.phone).join('\n');
                              navigator.clipboard.writeText(list);
                              setFeedback({ type: 'success', text: `Copied ${contacts.length} numbers on separate lines!` });
                            }}
                            className="flex-1 sm:flex-none py-1.5 px-3 bg-slate-950 hover:bg-slate-850 text-indigo-400 border border-slate-800 rounded-lg text-xs font-bold transition-all cursor-pointer text-center"
                          >
                            Copy (Newlines)
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const list = contacts.map(c => c.phone).join('\n');
                              const blob = new Blob([list], { type: 'text/plain;charset=utf-8' });
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = `extracted_whatsapp_members_${Date.now()}.txt`;
                              a.click();
                              URL.revokeObjectURL(url);
                              setFeedback({ type: 'success', text: `Downloaded .TXT list of ${contacts.length} numbers!` });
                            }}
                            className="flex-1 sm:flex-none py-1.5 px-3 bg-slate-950 hover:bg-slate-850 text-indigo-400 border border-slate-800 rounded-lg text-xs font-bold transition-all cursor-pointer text-center"
                          >
                            Download .TXT
                          </button>
                        </div>
                      </div>

                      {/* Info alert */}
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        Below is a clean deduplicated preview of the phone numbers found in the chosen scope. You can save all these numbers into your central database (Leads Hub) to easily message them or include them in future personalized campaigns.
                      </p>

                      {/* Scrollable contact list */}
                      <div className="bg-slate-950 border border-slate-850 rounded-2xl p-4 max-h-[250px] overflow-y-auto divide-y divide-slate-900/60 font-mono text-xs select-text">
                        {contacts.length === 0 ? (
                          <div className="text-center italic text-slate-600 py-8">
                            No member numbers found in target scope. Make sure groups have participants metadata.
                          </div>
                        ) : (
                          contacts.map((c, i) => (
                            <div key={c.phone} className="py-2 flex items-center justify-between gap-4">
                              <div className="flex items-center gap-2">
                                <span className="text-slate-600 font-mono text-[10px] w-8 select-none">#{i + 1}</span>
                                <span className="text-white font-bold select-all">+{c.phone}</span>
                              </div>
                              <span className="text-[10.5px] text-slate-500 truncate max-w-[240px]">
                                Group: <span className="text-slate-400">{c.groupName}</span>
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* Modal Footer */}
                    <div className="p-6 bg-slate-950 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="text-[11px] text-slate-400 leading-tight">
                        ⚡ <strong className="text-indigo-400">Direct Database Sync:</strong> Imports numbers as Leads instantly.
                      </div>
                      <div className="flex items-center gap-2 w-full sm:w-auto">
                        <button
                          type="button"
                          onClick={() => setShowMembersExtractor(false)}
                          className="flex-1 sm:flex-none py-2 px-4 bg-slate-900 hover:bg-slate-850 text-slate-400 hover:text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
                        >
                          Close
                        </button>
                        <button
                          type="button"
                          disabled={contacts.length === 0 || isBulkSavingLeads}
                          onClick={() => handleBulkSaveLeads(contacts)}
                          className="flex-1 sm:flex-none py-2 px-5 bg-indigo-500 hover:bg-indigo-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-extrabold rounded-xl text-xs transition-all cursor-pointer flex items-center justify-center gap-2"
                        >
                          <Users className="w-4 h-4 shrink-0" />
                          <span>{isBulkSavingLeads ? 'Importing...' : `Import ${contacts.length} Contacts to Leads Hub`}</span>
                        </button>
                      </div>
                    </div>
                  </>
                );
              })()}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* QR PREVIEW & RE-AUTHENTICATE MODAL */}
      <AnimatePresence>
        {previewQrModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl relative text-center space-y-4 text-left"
            >
              <button
                onClick={() => setPreviewQrModal(null)}
                className="absolute top-4 right-4 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="text-center">
                <h3 className="text-base font-bold text-white flex items-center justify-center gap-2">
                  <QrCode className="w-5 h-5 text-emerald-400" />
                  <span>QR Session History</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Session: <span className="text-emerald-400 font-semibold">{previewQrModal.sessionName}</span> ({previewQrModal.sessionId})
                </p>
              </div>

              {previewQrModal.qrBase64 ? (
                <div className="p-3 bg-white rounded-xl border border-slate-700 shadow-xl flex items-center justify-center mx-auto relative w-fit">
                  <img
                    src={previewQrModal.qrBase64}
                    alt="WhatsApp QR Code"
                    className="w-52 h-52 block mx-auto object-contain"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-500 opacity-60 animate-bounce" />
                </div>
              ) : (
                <div className="p-8 bg-slate-950 rounded-xl border border-slate-800 text-slate-500 text-xs font-mono text-center">
                  No QR image available for this snapshot
                </div>
              )}

              <div className="text-[10.5px] text-slate-400 leading-snug bg-slate-950 p-2.5 rounded-xl border border-slate-850 space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Captured At:</span>
                  <span className="text-slate-300 font-mono">
                    {new Date(previewQrModal.timestamp).toLocaleString()}
                  </span>
                </div>
                {previewQrModal.pairingCode && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Pairing Code:</span>
                    <span className="text-amber-400 font-mono font-bold">
                      {previewQrModal.pairingCode}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setActiveLinkSessionId(previewQrModal.sessionId);
                    handleReconnectSession(previewQrModal.sessionId);
                    setPreviewQrModal(null);
                  }}
                  className="flex-1 py-2 px-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-emerald-500/10"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Re-authenticate</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveLinkSessionId(previewQrModal.sessionId);
                    handleRegenerateSessionQr(previewQrModal.sessionId);
                    setPreviewQrModal(null);
                  }}
                  className="py-2 px-3 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-md"
                  title="Purge stale credentials and generate a fresh live QR code"
                >
                  <QrCode className="w-3.5 h-3.5" />
                  <span>Fresh QR</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewQrModal(null)}
                  className="py-2 px-3 bg-slate-800 hover:bg-slate-750 text-slate-300 font-semibold text-xs rounded-xl transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 px-6 py-6 mt-16 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>© 2026 WhatsApp Web Bridge Gateway. All Rights Reserved.</p>
          <p className="flex items-center gap-1">
            <span>Powered by</span>
            <code className="text-slate-400 font-mono">@queenanya/baileys</code>
            <span>and Express.js</span>
          </p>
        </div>
      </footer>
    </div>
    </div>
  );
}
