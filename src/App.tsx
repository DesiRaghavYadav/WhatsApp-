import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import WorkflowsBuilderPage from './components/WorkflowsBuilderPage';
import ListFlowStudioPage from './components/ListFlowStudioPage';
import LeadsHubPage from './components/LeadsHubPage';
import SharesManagerPage from './components/SharesManagerPage';
import StatusBroadcastPage from './components/StatusBroadcastPage';
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
  Menu
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

interface SentMessage {
  id: string;
  phoneNumber: string;
  message: string;
  timestamp: string;
  status: 'sent' | 'failed';
  error?: string;
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
  const [currentView, setCurrentView] = useState<'dispatch' | 'workflows' | 'analytics' | 'lists' | 'leads' | 'settings' | 'shares'>('dispatch');
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  
  // User Authentication State
  const [token, setToken] = useState<string | null>(localStorage.getItem('wa_auth_token'));
  const [username, setUsername] = useState<string | null>(localStorage.getItem('wa_username'));
  const [isLoginMode, setIsLoginMode] = useState<boolean>(true);
  const [authUsernameInput, setAuthUsernameInput] = useState<string>('');
  const [authPasswordInput, setAuthPasswordInput] = useState<string>('');
  const [authFeedback, setAuthFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState<boolean>(false);
  const [isClearingCache, setIsClearingCache] = useState<boolean>(false);

  // Settings & Group Invites State
  const [secretPrefix, setSecretPrefix] = useState<string>('.');
  const [disableTextProcessing, setDisableTextProcessing] = useState<boolean>(false);
  const [capturedGroupInvites, setCapturedGroupInvites] = useState<any[]>([]);
  const [isLoadingCapturedGroups, setIsLoadingCapturedGroups] = useState<boolean>(false);
  const [isSavingSettings, setIsSavingSettings] = useState<boolean>(false);
  const [serverResources, setServerResources] = useState<any>(null);

  // Delivery Analytics State
  const [analyticsData, setAnalyticsData] = useState<any>({
    summary: { totalSent: 0, totalFailed: 0, queuePending: 0, queueProcessing: 0, avgSpeedSeconds: 2, loadPercentage: 0 },
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
  useEffect(() => {
    sessionsListRef.current = sessionsList;
  }, [sessionsList]);
  const [selectedSessionIds, setSelectedSessionIds] = useState<string[]>(['primary']);
  const [newSessionId, setNewSessionId] = useState<string>('');
  const [newSessionName, setNewSessionName] = useState<string>('');
  const [isCreatingSession, setIsCreatingSession] = useState<boolean>(false);
  const [showSessionModal, setShowSessionModal] = useState<boolean>(false);
  const [activeLinkSessionId, setActiveLinkSessionId] = useState<string>('primary');

  // Saved groups state
  const [savedGroups, setSavedGroups] = useState<any[]>([]);

  // Queue state
  const [queueItems, setQueueItems] = useState<any[]>([]);
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

  // Advanced Message Type State
  const [msgType, setMsgType] = useState<'navi-template' | 'text' | 'buttons' | 'template'>('navi-template');
  const [footerText, setFooterText] = useState<string>('Sent via WhatsApp Bridge');
  const [useLegacy, setUseLegacy] = useState<boolean>(true);

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
        }
      }
    } catch (e) {
      console.error('Error fetching settings:', e);
    }
  };

  const saveSettings = async (prefix: string, disableText: boolean) => {
    setIsSavingSettings(true);
    try {
      const res = await fetchWithAuth('/api/settings', {
        method: 'POST',
        body: JSON.stringify({ secretPrefix: prefix, disableTextProcessing: disableText })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSecretPrefix(data.settings.secretPrefix);
        setDisableTextProcessing(!!data.settings.disableTextProcessing);
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

  useEffect(() => {
    if (token) {
      fetchWorkflows();
      fetchSettings();
      fetchCapturedGroupInvites();
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

    if (!token) {
      fetchResources();
      const interval = setInterval(fetchResources, 5000);
      return () => {
        active = false;
        clearInterval(interval);
      };
    }
  }, [token]);

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

  const fetchSessions = async () => {
    try {
      const res = await fetchWithAuth('/api/sessions');
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.sessions)) {
          setSessionsList(data.sessions);
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
      const res = await fetchWithAuth('/api/qr');
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
    if (!window.confirm(`Are you sure you want to delete session "${id}"? This will delete all credentials.`)) {
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

  const handleClearQueue = async () => {
    try {
      const res = await fetchWithAuth('/api/queue/clear', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        setFeedback({ type: 'success', text: 'Message Queue cleared.' });
        fetchQueue();
      }
    } catch (e) {
      console.error('Error clearing queue:', e);
    }
  };

  // Snappy multi-state and multi-session polling loop
  useEffect(() => {
    if (!token) return;

    fetchStatus();
    fetchSessions();
    fetchGroups();
    fetchQueue();
    if (currentView === 'analytics') {
      fetchAnalytics();
    }
    if (currentView === 'settings') {
      fetchCapturedGroupInvites();
    }

    const interval = setInterval(() => {
      fetchStatus();
      fetchSessions();
      fetchGroups();
      fetchQueue();
      if (currentView === 'analytics') {
        fetchAnalytics();
      }
      if (currentView === 'settings') {
        fetchCapturedGroupInvites();
      }
      
      const primaryConnected = sessionsListRef.current.find(s => s.id === 'primary')?.status === 'connected';
      if (!primaryConnected) {
        fetchQR();
      }
    }, 2000); // Poll on a snappy 2000ms interval for immediate indicator and queue updates

    return () => clearInterval(interval);
  }, [token, currentView]);

  // Scroll to bottom of terminal when logs update
  useEffect(() => {
    if (activeTab === 'logs') {
      terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, activeTab]);

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
            tagGroupMembers: recipientType === 'group' ? tagGroupMembers : false
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
        // Reset attachments upon successful delivery
        setAttachmentType('none');
        setAttachmentData('');
        setAttachmentName('');
        
        fetchStatus(); // Refresh history immediately
        fetchQueue();
      } else {
        setFeedback({ type: 'error', text: data.error || 'Failed to send message.' });
      }
    } catch (err) {
      setFeedback({ type: 'error', text: 'Network error. Could not connect to the API server.' });
    } finally {
      setIsSending(false);
    }
  };

  const handleLogout = async () => {
    if (window.confirm('Are you sure you want to disconnect? This purges saved session keys.')) {
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
          alert('Failed to reset session.');
        }
      } catch (err) {
        alert('Error connecting to backend server during reset.');
      } finally {
        setIsResetting(false);
      }
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
      id: 'shares',
      label: 'Captured Shares',
      description: 'Incoming media & links log',
      icon: Share2,
    },
    {
      id: 'settings',
      label: 'Global Settings & Invites',
      description: 'Command filters & log rules',
      icon: Sliders,
      badge: capturedGroupInvites.length > 0 ? capturedGroupInvites.length : undefined
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
                        <div className="text-[10px] text-slate-500 mt-1 flex items-center justify-between">
                          <span>Click card to configure linking credentials.</span>
                          {isLinkSelected && <span className="text-emerald-400 font-bold animate-pulse">Selected</span>}
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
                        <p className="text-[11px] text-slate-300 leading-relaxed text-left">
                          Scan this QR code with WhatsApp on your phone to link <span className="text-emerald-400 font-semibold">"{activeSess.name}"</span>.
                        </p>

                        <div className="flex justify-center">
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
                              <div className="flex flex-col items-center justify-center gap-2 text-slate-850">
                                <RefreshCw className="w-6 h-6 text-emerald-600 animate-spin" />
                                <span className="text-[9px] font-bold text-slate-500 px-2 leading-tight">
                                  Waiting for dynamic QR generation...
                                </span>
                              </div>
                            )}
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
                  </div>
                );
              })()}
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
                When "getid" or "id" is messaged in any group, details are automatically logged. Select or copy them below.
              </p>

              {savedGroups.length === 0 ? (
                <div className="p-4 bg-slate-950/40 rounded-xl border border-slate-850/60 text-center text-slate-500 text-[11px] italic">
                  No saved groups found. Send "getid" in any group chat to capture details.
                </div>
              ) : (
                <div className="space-y-3.5">
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
                      <option value="">-- Click to select and insert Group JID --</option>
                      {savedGroups.map(g => (
                        <option key={g.jid} value={g.jid}>
                          {g.name || 'No Name'} ({g.jid.split('@')[0]}){g.sessionId ? ` [Owner: ${g.sessionId}]` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Bulk Management: Select All Checkbox & Unselect All Button */}
                  <div className="flex items-center justify-between p-2.5 bg-slate-950/40 border border-slate-850/60 rounded-xl">
                    <div className="flex items-center gap-2">
                      <input
                        id="select-all-groups"
                        type="checkbox"
                        checked={savedGroups.length > 0 && savedGroups.every(g => phoneNumber.includes(g.jid))}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          if (checked) {
                            setRecipientType('group');
                            const separator = splitByCommas ? ', ' : '\n';
                            const allJids = savedGroups.map(g => g.jid).join(separator);
                            setPhoneNumber(allJids);
                            
                            // Ensure all owners of the saved groups are selected in session IDs
                            const newSessionIds = [...selectedSessionIds];
                            savedGroups.forEach(g => {
                              if (g.sessionId && !newSessionIds.includes(g.sessionId)) {
                                newSessionIds.push(g.sessionId);
                              }
                            });
                            setSelectedSessionIds(newSessionIds);
                            setFeedback({ type: 'success', text: `Selected all ${savedGroups.length} groups in recipient list!` });
                          } else {
                            setPhoneNumber('');
                            setFeedback({ type: 'info', text: 'Cleared group selections.' });
                          }
                        }}
                        className="rounded text-indigo-500 focus:ring-indigo-500 bg-slate-900 border-slate-800 cursor-pointer h-4 w-4"
                      />
                      <label htmlFor="select-all-groups" className="text-[11px] font-medium text-slate-300 cursor-pointer select-none">
                        Select All ({savedGroups.length} Groups)
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

                  {/* Copy Commands Grid */}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const jids = savedGroups.map(g => g.jid).join(', ');
                        navigator.clipboard.writeText(jids);
                        setFeedback({ type: 'success', text: `Copied all ${savedGroups.length} group JIDs joined by commas!` });
                      }}
                      className="py-1.5 px-2 bg-slate-950 hover:bg-slate-850 border border-slate-850 text-[10px] font-bold text-indigo-400 hover:text-white rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy All (Commas)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const jids = savedGroups.map(g => g.jid).join('\n');
                        navigator.clipboard.writeText(jids);
                        setFeedback({ type: 'success', text: `Copied all ${savedGroups.length} group JIDs on new lines!` });
                      }}
                      className="py-1.5 px-2 bg-slate-950 hover:bg-slate-850 border border-slate-850 text-[10px] font-bold text-indigo-400 hover:text-white rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy All (Newlines)</span>
                    </button>
                  </div>

                  {/* Scrollable Individual Groups List with Click to Copy and delete */}
                  <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                    {savedGroups.map(g => (
                      <div key={g.jid} className="p-2.5 bg-slate-950 border border-slate-850 hover:border-slate-800 rounded-lg flex items-center justify-between gap-2 text-left">
                        <div className="min-w-0 flex-1">
                          <span className="font-bold text-xs text-slate-300 block truncate">{g.name || 'Unnamed Group'}</span>
                          <div className="flex flex-wrap items-center gap-1.5 mt-1">
                            <span className="font-mono text-[9.5px] text-slate-500 truncate select-all">{g.jid}</span>
                            {g.sessionId && (
                              <span className="text-[9px] px-1.5 py-0.5 bg-indigo-500/15 text-indigo-400 border border-indigo-500/20 rounded font-mono font-bold shrink-0">
                                📱 Owner: {g.sessionId}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
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
                    ))}
                  </div>
                </div>
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
                    Higher wait intervals reduce block rates when broadcasting large volume templates.
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
                              onClick={handleClearQueue}
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
              
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-850">
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
                      <div className="space-y-1.5">
                        <label htmlFor="msg-input" className="text-xs font-bold text-slate-300 uppercase tracking-wide">
                          Message Body
                        </label>
                        <textarea
                          id="msg-input"
                          required
                          rows={3}
                          placeholder="Type your main text notification body here..."
                          value={message}
                          onChange={(e) => setMessage(e.target.value)}
                          className="w-full bg-slate-950/80 border border-slate-850 hover:border-slate-700 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 outline-none transition-colors resize-none"
                        />
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
                            <th className="pb-3 text-right pr-2">Status</th>
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
                              <td className="py-3.5 text-right pr-2">
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
                                  <p className="text-[10px] text-rose-400 mt-1 italic max-w-xs ml-auto leading-normal">{msg.error}</p>
                                )}
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
                <div id="panel-logs" className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-slate-400">Live connection and socket telemetry streams</p>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 bg-emerald-400 rounded-full animate-ping" />
                      <span className="text-[10px] font-mono text-emerald-400">SOCKET MONITOR</span>
                    </div>
                  </div>

                  <div className="bg-slate-950 border border-slate-850 rounded-xl p-4 font-mono text-xs text-slate-300 h-64 overflow-y-auto space-y-2 select-text">
                    {logs.length === 0 ? (
                      <p className="text-slate-600 italic">Telemetry idle. No connection events generated.</p>
                    ) : (
                      logs.map((log) => (
                        <div key={log.id} className="flex items-start gap-2 leading-relaxed">
                          <span className="text-slate-600 shrink-0 select-none">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                          <span className={`shrink-0 select-none px-1.5 py-0.2 text-[10px] font-bold rounded uppercase ${
                            log.type === 'success' 
                              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/10' 
                              : log.type === 'error'
                                ? 'bg-rose-500/15 text-rose-400 border border-rose-500/10'
                                : 'bg-slate-800 text-slate-400'
                          }`}>
                            {log.type}
                          </span>
                          <span className={log.type === 'error' ? 'text-rose-300' : log.type === 'success' ? 'text-emerald-300' : 'text-slate-300'}>
                            {log.message}
                          </span>
                        </div>
                      ))
                    )}
                    <div ref={terminalEndRef} />
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
        ) : currentView === 'shares' ? (
          <SharesManagerPage
            fetchWithAuth={fetchWithAuth}
            setFeedback={setFeedback}
            sessionsList={sessionsList}
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

                    <button
                      type="button"
                      disabled={isSavingSettings}
                      onClick={() => saveSettings(secretPrefix, disableTextProcessing)}
                      className="w-full flex items-center justify-center gap-2 py-2.5 bg-emerald-500 hover:bg-emerald-450 text-slate-950 text-xs font-bold rounded-xl transition-all cursor-pointer disabled:opacity-50"
                    >
                      <Check className="w-4 h-4" />
                      <span>{isSavingSettings ? 'Saving Settings...' : 'Save Settings'}</span>
                    </button>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {/* Card 1: Success Rate */}
              <div className="bg-slate-900/60 border border-slate-800 p-5 rounded-2xl relative overflow-hidden shadow-xl">
                <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full filter blur-2xl pointer-events-none" />
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">Success Rate Ratio</span>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-extrabold text-white">
                    {Math.round((analyticsData.summary.totalSent / (analyticsData.summary.totalSent + analyticsData.summary.totalFailed || 1)) * 100)}%
                  </span>
                  <span className="text-xs font-semibold text-emerald-400 font-mono flex items-center gap-0.5">
                    <CheckCircle className="w-3 h-3" /> SLA
                  </span>
                </div>
                <div className="mt-3.5 text-slate-500 text-[10px] leading-relaxed">
                  Percentage of total dispatched socket packets acknowledged.
                </div>
              </div>

              {/* Card 2: Total Dispatched */}
              <div className="bg-slate-900/60 border border-slate-800 p-5 rounded-2xl relative overflow-hidden shadow-xl">
                <div className="absolute top-0 right-0 w-24 h-24 bg-teal-500/5 rounded-full filter blur-2xl pointer-events-none" />
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">Total Dispatches</span>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-extrabold text-white">
                    {analyticsData.summary.totalSent + analyticsData.summary.totalFailed}
                  </span>
                  <span className="text-xs font-medium text-slate-400">Msgs</span>
                </div>
                <div className="mt-3.5 text-slate-400 text-[10px] flex gap-3 font-mono">
                  <span className="text-emerald-400">Sent: {analyticsData.summary.totalSent}</span>
                  <span className="text-rose-400 font-bold">Failed: {analyticsData.summary.totalFailed}</span>
                </div>
              </div>

              {/* Card 3: Backlog Delay */}
              <div className="bg-slate-900/60 border border-slate-800 p-5 rounded-2xl relative overflow-hidden shadow-xl">
                <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full filter blur-2xl pointer-events-none" />
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">Message Queue Backlog</span>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-extrabold text-white">
                    {analyticsData.summary.queuePending}
                  </span>
                  <span className="text-xs font-semibold text-amber-400 font-mono">Queued</span>
                </div>
                <div className="mt-3.5 text-slate-500 text-[10px] leading-relaxed">
                  In-memory queue scheduler backlog, processing round-robin.
                </div>
              </div>

              {/* Card 4: Avg Speed */}
              <div className="bg-slate-900/60 border border-slate-800 p-5 rounded-2xl relative overflow-hidden shadow-xl">
                <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full filter blur-2xl pointer-events-none" />
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">Mean Processing Speed</span>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-extrabold text-white">
                    {analyticsData.summary.avgSpeedSeconds || '2.0'}
                  </span>
                  <span className="text-xs font-medium text-slate-400">sec / msg</span>
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
