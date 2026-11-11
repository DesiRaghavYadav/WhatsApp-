import React, { useState, useEffect, useRef } from 'react';
import { 
  QrCode, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  Sun, 
  Moon, 
  Copy, 
  Check, 
  ExternalLink, 
  Share2, 
  Smartphone, 
  Sparkles, 
  ShieldCheck, 
  ArrowLeft, 
  Volume2, 
  VolumeX, 
  Zap, 
  Link2,
  Clock,
  Layers,
  Camera
} from 'lucide-react';
import QRCode from 'qrcode';

interface LiveQrScannerPageProps {
  token: string | null;
  username: string | null;
  initialSessionId?: string;
  onBackToDashboard?: () => void;
  isStandalone?: boolean;
}

interface SessionQrData {
  success: boolean;
  sessionId: string;
  sessionName?: string;
  qr: string | null;
  status: 'disconnected' | 'connecting' | 'connected';
  user?: { id: string; name: string } | null;
  pairingCode?: string | null;
  error?: string | null;
  timestamp: number;
}

export default function LiveQrScannerPage({
  token,
  username,
  initialSessionId = 'primary',
  onBackToDashboard,
  isStandalone = false
}: LiveQrScannerPageProps) {
  // Query parameters override
  const [sessionId, setSessionId] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('session') || params.get('sessionId') || initialSessionId;
  });

  const [authToken, setAuthToken] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('token') || token || localStorage.getItem('wa_auth_token');
  });

  const [qrData, setQrData] = useState<SessionQrData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [brightnessBoost, setBrightnessBoost] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [showShareModal, setShowShareModal] = useState<boolean>(false);
  const [shareUrlQr, setShareUrlQr] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  
  // Pairing Code Mode
  const [mode, setMode] = useState<'qr' | 'pairing'>('qr');
  const [pairingPhone, setPairingPhone] = useState<string>('');
  const [activePairingCode, setActivePairingCode] = useState<string | null>(null);
  const [isRequestingPairing, setIsRequestingPairing] = useState<boolean>(false);
  const [copiedPairingCode, setCopiedPairingCode] = useState<boolean>(false);

  // Track previous QR to detect changes and animate
  const prevQrRef = useRef<string | null>(null);
  const [qrJustUpdated, setQrJustUpdated] = useState<boolean>(false);
  const [pulseTick, setPulseTick] = useState<number>(0);
  const connectedSoundPlayedRef = useRef<boolean>(false);

  // Available sessions list (if loaded)
  const [availableSessions, setAvailableSessions] = useState<{ id: string; name: string; status: string }[]>([]);

  // Calculate direct shareable URL
  const getShareableUrl = () => {
    const origin = window.location.origin;
    const effectiveToken = authToken || '';
    return `${origin}/scan?session=${encodeURIComponent(sessionId)}${effectiveToken ? `&token=${encodeURIComponent(effectiveToken)}` : ''}`;
  };

  // Play connection success chime using Web Audio API
  const playConnectSuccessSound = () => {
    if (!soundEnabled) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      
      const now = ctx.currentTime;
      // Note 1: E5 (659.25Hz)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(659.25, now);
      gain1.gain.setValueAtTime(0.15, now);
      gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.3);

      // Note 2: G#5 (830.61Hz)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(830.61, now + 0.15);
      gain2.gain.setValueAtTime(0.18, now + 0.15);
      gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.45);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.15);
      osc2.stop(now + 0.45);

      // Note 3: B5 (987.77Hz)
      const osc3 = ctx.createOscillator();
      const gain3 = ctx.createGain();
      osc3.type = 'triangle';
      osc3.frequency.setValueAtTime(987.77, now + 0.3);
      gain3.gain.setValueAtTime(0.2, now + 0.3);
      gain3.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
      osc3.connect(gain3);
      gain3.connect(ctx.destination);
      osc3.start(now + 0.3);
      osc3.stop(now + 0.8);
    } catch (e) {
      console.warn('Could not play sound:', e);
    }
  };

  // Generate QR code for the shareable link so another phone can scan it via camera
  useEffect(() => {
    if (showShareModal) {
      const url = getShareableUrl();
      QRCode.toDataURL(url, { margin: 2, scale: 6 })
        .then(setShareUrlQr)
        .catch(() => setShareUrlQr(null));
    }
  }, [showShareModal, sessionId, authToken]);

  // Fetch session list
  useEffect(() => {
    if (!authToken) return;
    fetch(`/api/sessions?token=${encodeURIComponent(authToken)}`, {
      headers: { Authorization: `Bearer ${authToken}` }
    })
      .then(res => res.json())
      .then(data => {
        if (data.success && Array.isArray(data.sessions)) {
          setAvailableSessions(data.sessions);
        }
      })
      .catch(() => {});
  }, [authToken]);

  // Poll function to fetch live QR & connection status
  const fetchLiveQr = async () => {
    if (!authToken) {
      setIsLoading(false);
      return;
    }

    try {
      const res = await fetch(`/api/qr?sessionId=${encodeURIComponent(sessionId)}&token=${encodeURIComponent(authToken)}`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      
      if (res.ok) {
        const data: SessionQrData = await res.json();
        
        // Detect QR code change and flash visual indicator
        if (data.qr && prevQrRef.current && data.qr !== prevQrRef.current) {
          setQrJustUpdated(true);
          setTimeout(() => setQrJustUpdated(false), 2000);
        }
        if (data.qr) {
          prevQrRef.current = data.qr;
        }

        // Detect successful connection transition and play sound once
        if (data.status === 'connected' && !connectedSoundPlayedRef.current) {
          connectedSoundPlayedRef.current = true;
          playConnectSuccessSound();
        } else if (data.status !== 'connected') {
          connectedSoundPlayedRef.current = false;
        }

        if (data.pairingCode) {
          setActivePairingCode(data.pairingCode);
        }

        setQrData(data);
      }
    } catch (err) {
      console.warn('Polling error on live QR scanner:', err);
    } finally {
      setIsLoading(false);
      setPulseTick(p => (p + 1) % 100);
    }
  };

  // Set up live polling (every 1300ms for instant real-time sync when QR refreshes)
  useEffect(() => {
    fetchLiveQr();
    const interval = setInterval(fetchLiveQr, 1300);
    return () => clearInterval(interval);
  }, [sessionId, authToken]);

  // Handle force fresh QR generation
  const handleForceGenerateQr = async () => {
    if (!authToken) return;
    setIsRefreshing(true);
    setFeedback({ type: 'info', text: 'Requesting brand new WhatsApp Web QR code from server...' });
    try {
      const res = await fetch(`/api/sessions/regenerate-qr?token=${encodeURIComponent(authToken)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`
        },
        body: JSON.stringify({ id: sessionId, sessionId })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setFeedback({ type: 'success', text: 'Fresh QR code generated! Refreshing image...' });
        await fetchLiveQr();
      } else {
        setFeedback({ type: 'error', text: data.error || 'Failed to regenerate QR code.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', text: err?.message || 'Error communicating with server.' });
    } finally {
      setIsRefreshing(false);
    }
  };

  // Handle Try Reconnect with Saved Credentials
  const handleTryReconnect = async () => {
    if (!authToken) return;
    setIsRefreshing(true);
    setFeedback({ type: 'info', text: 'Attempting to reconnect with saved credentials...' });
    try {
      const res = await fetch(`/api/sessions/reconnect?token=${encodeURIComponent(authToken)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`
        },
        body: JSON.stringify({ id: sessionId, sessionId })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setFeedback({ type: 'success', text: data.message || 'Reconnecting WhatsApp session...' });
        await fetchLiveQr();
      } else {
        setFeedback({ type: 'error', text: data.error || 'Failed to reconnect session.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', text: err?.message || 'Error communicating with server.' });
    } finally {
      setIsRefreshing(false);
    }
  };

  // Request 8-digit Pairing Code
  const handleRequestPairing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authToken || !pairingPhone.trim()) return;
    
    const cleanNum = pairingPhone.replace(/\D/g, '');
    if (!cleanNum) {
      setFeedback({ type: 'error', text: 'Please enter a valid phone number with country code.' });
      return;
    }

    setIsRequestingPairing(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/request-pairing-code?token=${encodeURIComponent(authToken)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`
        },
        body: JSON.stringify({ phoneNumber: cleanNum, sessionId })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setActivePairingCode(data.code);
        setFeedback({ type: 'success', text: 'Pairing code generated! Type it on your phone now.' });
      } else {
        setFeedback({ type: 'error', text: data.error || 'Failed to generate pairing code.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', text: 'Network connection failure.' });
    } finally {
      setIsRequestingPairing(false);
    }
  };

  // Copy shareable link
  const handleCopyLink = () => {
    const url = getShareableUrl();
    navigator.clipboard.writeText(url).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    });
  };

  const isConnected = qrData?.status === 'connected';
  const isConnecting = qrData?.status === 'connecting';
  const activeQr = qrData?.qr;

  // Background and theme classes based on brightness boost
  const containerBg = brightnessBoost 
    ? 'bg-neutral-100 text-neutral-900' 
    : 'bg-slate-950 text-slate-100';

  const cardBg = brightnessBoost 
    ? 'bg-white border-2 border-emerald-500 shadow-2xl' 
    : 'bg-slate-900/90 border border-slate-800 shadow-2xl';

  return (
    <div className={`min-h-screen flex flex-col transition-colors duration-300 ${containerBg}`}>
      {/* Top Header / Navigation Bar */}
      <header className={`px-4 sm:px-8 py-3.5 border-b flex items-center justify-between sticky top-0 z-40 backdrop-blur-md ${
        brightnessBoost ? 'bg-white/90 border-neutral-300' : 'bg-slate-950/80 border-slate-850'
      }`}>
        <div className="flex items-center gap-3">
          {onBackToDashboard && (
            <button
              type="button"
              onClick={onBackToDashboard}
              className={`p-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                brightnessBoost 
                  ? 'bg-neutral-200 hover:bg-neutral-300 text-neutral-800 border-neutral-300' 
                  : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-800'
              }`}
              title="Return to main WhatsApp Dashboard"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Dashboard</span>
            </button>
          )}

          <div className="flex items-center gap-2">
            <div className="p-2 bg-emerald-500 text-slate-950 rounded-xl shadow-md shadow-emerald-500/20">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-sm sm:text-base font-bold tracking-tight flex items-center gap-2">
                <span>Live WhatsApp QR Scanner</span>
                <span className="px-1.5 py-0.5 text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-500 rounded-full border border-emerald-500/25 uppercase">
                  Real-Time Sync
                </span>
              </h1>
              <p className={`text-[10px] sm:text-xs truncate max-w-xs sm:max-w-md ${
                brightnessBoost ? 'text-neutral-500' : 'text-slate-400'
              }`}>
                Auto-updates instantly on this screen whenever WhatsApp server refreshes
              </p>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {/* Audio Chime Toggle */}
          <button
            type="button"
            onClick={() => setSoundEnabled(s => !s)}
            className={`p-2 rounded-xl border transition-all cursor-pointer ${
              soundEnabled
                ? 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30'
                : (brightnessBoost ? 'bg-neutral-200 text-neutral-400 border-neutral-300' : 'bg-slate-900 text-slate-500 border-slate-800')
            }`}
            title={soundEnabled ? 'Chime sound enabled on connect' : 'Sound muted'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          {/* Brightness Booster (High Contrast Mode for Phone Cameras) */}
          <button
            type="button"
            onClick={() => setBrightnessBoost(b => !b)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
              brightnessBoost
                ? 'bg-amber-500 text-slate-950 border-amber-600 shadow-md shadow-amber-500/30'
                : 'bg-slate-900 hover:bg-slate-800 text-amber-400 border-slate-800'
            }`}
            title="Max contrast mode to make QR scanning instant for other phone cameras"
          >
            {brightnessBoost ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            <span className="hidden md:inline">{brightnessBoost ? 'Dark Mode' : 'Boost Brightness'}</span>
          </button>

          {/* Share / Copy Live Scanner Link */}
          <button
            type="button"
            onClick={() => setShowShareModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs rounded-xl shadow transition-all cursor-pointer"
            title="Open or share this live QR link with another phone"
          >
            <Smartphone className="w-4 h-4" />
            <span className="hidden sm:inline">Open on Another Phone</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col items-center justify-center p-4 sm:p-8 max-w-4xl mx-auto w-full">
        {/* Status / Feedback Alert Banner */}
        {feedback && (
          <div className={`w-full max-w-md mb-4 p-3 rounded-xl border text-xs flex items-center justify-between gap-2 animate-fadeIn ${
            feedback.type === 'success' 
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' 
              : feedback.type === 'error'
              ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
              : 'bg-sky-500/10 text-sky-400 border-sky-500/30'
          }`}>
            <div className="flex items-center gap-2">
              {feedback.type === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />}
              {feedback.type === 'error' && <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />}
              {feedback.type === 'info' && <RefreshCw className="w-4 h-4 shrink-0 animate-spin text-sky-400" />}
              <span>{feedback.text}</span>
            </div>
            <button onClick={() => setFeedback(null)} className="opacity-70 hover:opacity-100 p-0.5">✕</button>
          </div>
        )}

        {/* Central Display Card */}
        <div className={`w-full max-w-md rounded-3xl p-6 sm:p-8 relative overflow-hidden transition-all duration-300 ${cardBg}`}>
          {/* Top Live Sync Pulse Indicator */}
          <div className="flex items-center justify-between mb-5 pb-3 border-b border-slate-800/60">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                  isConnected ? 'bg-emerald-400' : 'bg-emerald-500'
                }`}></span>
                <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                  isConnected ? 'bg-emerald-500' : 'bg-emerald-400'
                }`}></span>
              </span>
              <span className={`text-[11px] font-mono font-bold uppercase tracking-wider ${
                brightnessBoost ? 'text-neutral-600' : 'text-slate-300'
              }`}>
                {isConnected ? 'WhatsApp Linked' : 'Live Sync Active'}
              </span>
            </div>

            {/* Session Selector (if multiple exist) */}
            {availableSessions.length > 1 ? (
              <select
                value={sessionId}
                onChange={(e) => setSessionId(e.target.value)}
                className={`text-xs font-semibold px-2.5 py-1 rounded-lg border focus:outline-none ${
                  brightnessBoost 
                    ? 'bg-neutral-100 border-neutral-300 text-neutral-800' 
                    : 'bg-slate-950 border-slate-800 text-emerald-400'
                }`}
              >
                {availableSessions.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.status})
                  </option>
                ))}
              </select>
            ) : (
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase ${
                brightnessBoost ? 'bg-neutral-200 text-neutral-700' : 'bg-slate-950 text-slate-400'
              }`}>
                Session: {sessionId}
              </span>
            )}
          </div>

          {/* Mode Switcher Tabs (QR Camera Scan vs Pairing Code) */}
          {!isConnected && (
            <div className={`flex p-1 rounded-xl mb-6 border ${
              brightnessBoost ? 'bg-neutral-100 border-neutral-200' : 'bg-slate-950 border-slate-850'
            }`}>
              <button
                type="button"
                onClick={() => setMode('qr')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  mode === 'qr'
                    ? 'bg-emerald-500 text-slate-950 shadow-md'
                    : (brightnessBoost ? 'text-neutral-600 hover:text-neutral-900' : 'text-slate-400 hover:text-slate-200')
                }`}
              >
                <Camera className="w-3.5 h-3.5" />
                <span>QR Camera Scan</span>
              </button>
              <button
                type="button"
                onClick={() => setMode('pairing')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  mode === 'pairing'
                    ? 'bg-emerald-500 text-slate-950 shadow-md'
                    : (brightnessBoost ? 'text-neutral-600 hover:text-neutral-900' : 'text-slate-400 hover:text-slate-200')
                }`}
              >
                <Link2 className="w-3.5 h-3.5" />
                <span>8-Digit Code</span>
              </button>
            </div>
          )}

          {/* Connected State Display */}
          {isConnected ? (
            <div className="py-6 text-center space-y-4 animate-scaleUp">
              <div className="inline-flex p-4 bg-emerald-500/20 text-emerald-400 rounded-3xl border border-emerald-500/30 shadow-lg shadow-emerald-500/20">
                <CheckCircle2 className="w-16 h-16 animate-bounce" />
              </div>
              <div>
                <h3 className="text-xl font-bold tracking-tight text-emerald-400">
                  WhatsApp Linked Successfully!
                </h3>
                <p className={`text-xs mt-1 ${brightnessBoost ? 'text-neutral-600' : 'text-slate-300'}`}>
                  Your WhatsApp account is active and connected to the bridge gateway.
                </p>
              </div>

              {qrData?.user && (
                <div className={`p-4 rounded-2xl border text-left space-y-1.5 ${
                  brightnessBoost ? 'bg-neutral-50 border-neutral-300' : 'bg-slate-950/80 border-slate-800'
                }`}>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-bold text-slate-500">Connected Device</span>
                    <span className="text-[10px] px-2 py-0.5 bg-emerald-500/20 text-emerald-400 rounded-full font-bold">Online</span>
                  </div>
                  <div className="text-sm font-bold text-emerald-400 font-mono">
                    +{qrData.user.id ? qrData.user.id.split(':')[0].split('@')[0] : 'Unknown Number'}
                  </div>
                  <div className="text-xs text-slate-400">
                    {qrData.user.name || 'WhatsApp Account'}
                  </div>
                </div>
              )}

              <div className="pt-2">
                {onBackToDashboard ? (
                  <button
                    type="button"
                    onClick={onBackToDashboard}
                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-emerald-600/30 transition-all cursor-pointer"
                  >
                    Return to Main Dashboard
                  </button>
                ) : (
                  <div className={`p-3 rounded-xl text-xs font-medium ${
                    brightnessBoost ? 'bg-neutral-100 text-neutral-600' : 'bg-slate-950 text-slate-400'
                  }`}>
                    ✅ Connection complete. You may safely close this browser window or return to your other device.
                  </div>
                )}
              </div>
            </div>
          ) : mode === 'qr' ? (
            /* QR Camera Scan Mode */
            <div className="flex flex-col items-center justify-center space-y-5 text-center">
              {/* Instructions */}
              <div className="space-y-1">
                <h2 className={`text-base font-bold ${brightnessBoost ? 'text-neutral-900' : 'text-white'}`}>
                  Point Camera from Other Phone
                </h2>
                <p className={`text-xs max-w-xs leading-relaxed ${brightnessBoost ? 'text-neutral-600' : 'text-slate-400'}`}>
                  Open WhatsApp &gt; <strong>Linked Devices</strong> &gt; <strong>Link a Device</strong> and point at the code below:
                </p>
              </div>

              {/* QR Image Container with Max Contrast Frame */}
              <div className={`relative p-4 rounded-2xl flex flex-col items-center justify-center transition-all ${
                brightnessBoost 
                  ? 'bg-white border-4 border-emerald-500 shadow-2xl' 
                  : 'bg-white border border-slate-300 shadow-2xl'
              } ${qrJustUpdated ? 'ring-4 ring-emerald-400 ring-offset-2 ring-offset-slate-900' : ''}`}>
                {activeQr ? (
                  <div className="relative group">
                    <img
                      src={activeQr}
                      alt="Live WhatsApp Web QR Code"
                      className="w-56 h-56 sm:w-64 sm:h-64 object-contain block select-none"
                      referrerPolicy="no-referrer"
                    />
                    {/* Animated Scanning Laser Line */}
                    <div className="absolute left-0 right-0 h-1 bg-gradient-to-r from-transparent via-emerald-500 to-transparent opacity-80 animate-pulse pointer-events-none" />
                  </div>
                ) : (
                  <div className="w-56 h-56 sm:w-64 sm:h-64 flex flex-col items-center justify-center gap-3 p-4 text-center">
                    <RefreshCw className="w-10 h-10 text-emerald-600 animate-spin" />
                    <span className="text-xs font-bold text-slate-800 leading-snug">
                      Generating dynamic WhatsApp QR code...
                    </span>
                    <span className="text-[10px] text-slate-500">
                      Syncing with Baileys WebSocket instance
                    </span>
                  </div>
                )}

                {/* Just Updated Indicator */}
                {qrJustUpdated && (
                  <div className="absolute -bottom-3 px-3 py-1 bg-emerald-500 text-slate-950 font-bold text-[10px] rounded-full shadow-lg flex items-center gap-1 animate-bounce">
                    <Sparkles className="w-3 h-3" />
                    <span>QR Updated! Point Camera</span>
                  </div>
                )}
              </div>

              {/* Status and auto-refresh notice */}
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-emerald-500" />
                  <span className={`text-[11px] font-medium ${brightnessBoost ? 'text-neutral-600' : 'text-slate-400'}`}>
                    QR automatically updates on this screen as it changes.
                  </span>
                </div>
                {qrData?.status === 'connecting' && !activeQr && (
                  <span className="text-xs font-bold text-sky-400 animate-pulse block">
                    Connecting to WhatsApp servers...
                  </span>
                )}
              </div>

              {/* Bottom Quick Action Buttons */}
              <div className="grid grid-cols-2 gap-2 w-full pt-2">
                <button
                  type="button"
                  onClick={handleForceGenerateQr}
                  disabled={isRefreshing}
                  className={`flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer disabled:opacity-50 ${
                    brightnessBoost
                      ? 'bg-neutral-100 hover:bg-neutral-200 text-neutral-800 border-neutral-300'
                      : 'bg-slate-950 hover:bg-slate-900 text-emerald-400 border-emerald-500/30'
                  }`}
                  title="Generate a brand new QR code if this one timed out"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                  <span>{isRefreshing ? 'Refreshing...' : 'Generate New QR'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleTryReconnect}
                  disabled={isRefreshing}
                  className={`flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer disabled:opacity-50 ${
                    brightnessBoost
                      ? 'bg-neutral-100 hover:bg-neutral-200 text-neutral-800 border-neutral-300'
                      : 'bg-slate-950 hover:bg-slate-900 text-slate-300 border-slate-800'
                  }`}
                  title="Try re-linking with existing session credentials if previously saved"
                >
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  <span>Try Saved Session</span>
                </button>
              </div>
            </div>
          ) : (
            /* 8-Digit Pairing Code Mode */
            <div className="space-y-4">
              <div className="text-center space-y-1">
                <h2 className={`text-base font-bold ${brightnessBoost ? 'text-neutral-900' : 'text-white'}`}>
                  Link with 8-Digit Phone Code
                </h2>
                <p className={`text-xs leading-relaxed ${brightnessBoost ? 'text-neutral-600' : 'text-slate-400'}`}>
                  No camera needed. Enter your WhatsApp phone number to receive a pairing code to type into WhatsApp.
                </p>
              </div>

              {activePairingCode ? (
                <div className={`p-5 rounded-2xl border text-center space-y-3 ${
                  brightnessBoost ? 'bg-neutral-50 border-neutral-300' : 'bg-slate-950 border-emerald-500/30'
                }`}>
                  <span className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider block">
                    Your WhatsApp Pairing Code
                  </span>
                  <div className="text-3xl sm:text-4xl font-extrabold font-mono tracking-widest text-emerald-400 select-all py-1">
                    {activePairingCode}
                  </div>
                  <p className="text-[11px] text-slate-400 leading-snug">
                    On your phone: Open WhatsApp &gt; <strong>Linked Devices</strong> &gt; <strong>Link with phone number instead</strong> &gt; enter this code.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(activePairingCode);
                      setCopiedPairingCode(true);
                      setTimeout(() => setCopiedPairingCode(false), 2000);
                    }}
                    className="px-4 py-1.5 bg-emerald-500 text-slate-950 font-bold text-xs rounded-lg transition-all cursor-pointer inline-flex items-center gap-1.5"
                  >
                    {copiedPairingCode ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedPairingCode ? 'Copied Code!' : 'Copy Code'}</span>
                  </button>
                </div>
              ) : (
                <form onSubmit={handleRequestPairing} className="space-y-3">
                  <div>
                    <label className={`block text-xs font-semibold mb-1.5 ${
                      brightnessBoost ? 'text-neutral-700' : 'text-slate-300'
                    }`}>
                      WhatsApp Phone Number (with Country Code)
                    </label>
                    <input
                      type="tel"
                      value={pairingPhone}
                      onChange={(e) => setPairingPhone(e.target.value)}
                      placeholder="e.g. +91 9876543210 or +1 4155552671"
                      className={`w-full px-3.5 py-2.5 rounded-xl border text-sm font-mono focus:outline-none ${
                        brightnessBoost 
                          ? 'bg-neutral-50 border-neutral-300 text-neutral-900 focus:border-emerald-500' 
                          : 'bg-slate-950 border-slate-800 text-white focus:border-emerald-500'
                      }`}
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isRequestingPairing || !pairingPhone.trim()}
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs rounded-xl shadow-lg transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <Link2 className={`w-4 h-4 ${isRequestingPairing ? 'animate-spin' : ''}`} />
                    <span>{isRequestingPairing ? 'Generating Pairing Code...' : 'Get 8-Digit Pairing Code'}</span>
                  </button>
                </form>
              )}
            </div>
          )}
        </div>

        {/* Shareable Scanner Link Footer Bar */}
        <div className={`mt-6 w-full max-w-md p-4 rounded-2xl border flex items-center justify-between gap-3 text-xs ${
          brightnessBoost ? 'bg-white border-neutral-300 text-neutral-700' : 'bg-slate-900/60 border-slate-800 text-slate-300'
        }`}>
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl shrink-0">
              <Share2 className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <span className="font-bold block truncate">Direct Live Scanner Link</span>
              <span className={`text-[10px] truncate block opacity-75 font-mono`}>
                {getShareableUrl()}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleCopyLink}
              className={`p-2 rounded-xl border text-xs font-bold flex items-center gap-1 transition-all cursor-pointer ${
                copiedLink 
                  ? 'bg-emerald-500 text-slate-950 border-emerald-500' 
                  : (brightnessBoost ? 'bg-neutral-100 hover:bg-neutral-200 border-neutral-300 text-neutral-800' : 'bg-slate-950 hover:bg-slate-850 border-slate-800 text-slate-300')
              }`}
              title="Copy direct live scanner link"
            >
              {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{copiedLink ? 'Copied' : 'Copy'}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowShareModal(true)}
              className="p-2 bg-emerald-600 hover:bg-emerald-500 text-slate-950 rounded-xl transition-all cursor-pointer"
              title="Show QR Code of this link to scan from second phone camera"
            >
              <QrCode className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </main>

      {/* Share / Scan Link Modal */}
      {showShareModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-6 text-center space-y-4 shadow-2xl relative">
            <button
              onClick={() => setShowShareModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1"
            >
              ✕
            </button>

            <div className="p-3 bg-emerald-500/15 text-emerald-400 rounded-2xl inline-flex">
              <Smartphone className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-base font-bold text-white">Scan Link on Other Phone</h3>
              <p className="text-xs text-slate-400 mt-1">
                Open your second phone's standard camera app and point it here to instantly open the live WhatsApp QR scanner page:
              </p>
            </div>

            {shareUrlQr && (
              <div className="p-3 bg-white rounded-xl inline-block shadow-lg mx-auto">
                <img src={shareUrlQr} alt="URL QR Code" className="w-44 h-44 block" />
              </div>
            )}

            <div className="space-y-2">
              <input
                type="text"
                readOnly
                value={getShareableUrl()}
                className="w-full text-center px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-[11px] font-mono text-emerald-400 select-all"
              />
              <button
                type="button"
                onClick={handleCopyLink}
                className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                {copiedLink ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copiedLink ? 'Link Copied to Clipboard!' : 'Copy Direct Link'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
