import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Mic, MicOff, Settings, History, Image as ImageIcon, 
  Send, Plus, Trash2, X, ChevronRight, User, 
  Zap, Brain, Compass, Code, Monitor, Globe, 
  MapPin, Clock, Check, CheckCheck, Sparkles,
  Play, Pause, Volume2, Download, Maximize2,
  Sun, Moon, Palette
} from 'lucide-react';
import Logo from './Logo';
import { getGeminiClient, generateProImage, editImage, speakText, getSystemInstruction, generateImageFn, manageMemoryFn } from '../services/gemini';
import { decode, decodeAudioData, createBlob } from '../utils/audio';
import { LiveServerMessage, Modality } from '@google/genai';
import { Message, VoiceType, AppMode, Memory, UserProfile, AspectRatio, ImageSize } from '../types';

interface AssistantViewProps {
  onArtifactGenerated: (url: string, prompt: string, type: 'image' | 'video') => void;
  voiceType: VoiceType;
  onVoiceChange: (v: VoiceType) => void;
  mode: AppMode; 
  onModeChange: (m: AppMode) => void;
  memories: Memory[];
  onUpdateMemory: (action: 'add' | 'delete' | 'edit', content: string, id?: string) => void;
  profile: UserProfile;
  onProfileChange: (p: UserProfile) => void;
  onViewGallery: () => void;
  onToggleTheme: () => void;
  imageSize: ImageSize;
  onImageSizeChange: (s: ImageSize) => void;
  aspectRatio: AspectRatio;
  onAspectRatioChange: (ar: AspectRatio) => void;
}

interface SavedChat {
  title: string;
  messages: Message[];
  timestamp: number;
}

interface Notification {
  message: string;
  type: 'error' | 'info' | 'success';
}

const AssistantView: React.FC<AssistantViewProps> = ({ 
  onArtifactGenerated, 
  voiceType, 
  onVoiceChange,
  mode, 
  onModeChange,
  memories, 
  onUpdateMemory,
  profile,
  onProfileChange,
  onViewGallery,
  onToggleTheme,
  imageSize,
  onImageSizeChange,
  aspectRatio,
  onAspectRatioChange
}) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [messages, setMessages] = useState<Message[]>(() => {
    const saved = localStorage.getItem('nova_current_chat');
    return saved ? JSON.parse(saved) : [];
  });
  const [inputText, setInputText] = useState('');
  const [status, setStatus] = useState('Standby');
  const [isTyping, setIsTyping] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [settingsView, setSettingsView] = useState<'profile' | 'voice' | 'mode' | 'creation' | 'memories' | 'branding'>('profile');
  const [archivedChats, setArchivedChats] = useState<SavedChat[]>(() => {
    const saved = localStorage.getItem('nova_archived_chats');
    return saved ? JSON.parse(saved) : [];
  });
  const [isPreviewingVoice, setIsPreviewingVoice] = useState<string | null>(null);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [recordedVoiceUrl, setRecordedVoiceUrl] = useState<string | null>(() => localStorage.getItem('nova_custom_voice_url'));
  const [voiceCloningStatus, setVoiceCloningStatus] = useState<'idle' | 'recording' | 'processing' | 'ready'>(recordedVoiceUrl ? 'ready' : 'idle');
  const [uploadedMedia, setUploadedMedia] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [newMemoryValue, setNewMemoryValue] = useState('');
  const [notification, setNotification] = useState<Notification | null>(null);
  const [needsApiKey, setNeedsApiKey] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef(0);
  const sourcesRef = useRef(new Set<AudioBufferSourceNode>());
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const profileAvatarInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Auto-save logic
  useEffect(() => {
    localStorage.setItem('nova_current_chat', JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    localStorage.setItem('nova_archived_chats', JSON.stringify(archivedChats));
  }, [archivedChats]);

  const startNewChat = () => {
    if (messages.length === 0) return;
    
    const newArchive: SavedChat = {
      title: messages[0].text?.slice(0, 40) || "Untitled Session",
      messages: [...messages],
      timestamp: Date.now()
    };
    
    setArchivedChats(prev => [newArchive, ...prev]);
    setMessages([]);
    notify("Session archived. New neural path initialized.", "success");
  };

  const deleteArchivedChat = (timestamp: number) => {
    setArchivedChats(prev => prev.filter(c => c.timestamp !== timestamp));
    notify("Archive purged.", "info");
  };

  const loadArchivedChat = (chat: SavedChat) => {
    // Archive current if exists
    if (messages.length > 0) {
      const currentArchive: SavedChat = {
        title: messages[0].text?.slice(0, 40) || "Untitled Session",
        messages: [...messages],
        timestamp: Date.now()
      };
      setArchivedChats(prev => [currentArchive, ...prev.filter(c => c.timestamp !== chat.timestamp)]);
    }
    
    setMessages(chat.messages);
    setIsHistoryOpen(false);
    notify("Neural state restored.", "success");
  };

  // Initial Mandatory Key Check
  useEffect(() => {
    const checkKey = async () => {
      if (typeof (window as any).aistudio?.hasSelectedApiKey === 'function') {
        const hasKey = await (window as any).aistudio.hasSelectedApiKey();
        setNeedsApiKey(!hasKey);
      }
    };
    checkKey();
  }, []);

  const openKeyDialog = async () => {
    if (typeof (window as any).aistudio?.openSelectKey === 'function') {
      await (window as any).aistudio.openSelectKey();
      setNeedsApiKey(false); // Proceed assuming success
    }
  };

  const startVoiceRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setRecordedVoiceUrl(url);
        localStorage.setItem('nova_custom_voice_url', url);
        setVoiceCloningStatus('ready');
        notify("Voice sample captured. Neural profile updated.", "success");
      };

      recorder.start();
      setIsRecordingVoice(true);
      setVoiceCloningStatus('recording');
    } catch (err) {
      notify("Microphone access denied.", "error");
    }
  };

  const stopVoiceRecording = () => {
    if (mediaRecorderRef.current && isRecordingVoice) {
      mediaRecorderRef.current.stop();
      setIsRecordingVoice(false);
      setVoiceCloningStatus('processing');
    }
  };

  const notify = useCallback((message: string, type: 'error' | 'info' | 'success' = 'info') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 5000);
  }, []);

  const scrollToBottom = () => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  useEffect(() => { scrollToBottom(); }, [messages, isTyping]);

  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem('nova_saved_chats') || '[]');
    setArchivedChats(saved);
  }, [isHistoryOpen]);

  const cleanup = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    for (const source of sourcesRef.current) {
      try { source.stop(); } catch(e) {}
    }
    sourcesRef.current.clear();
    setIsConnected(false);
    setIsConnecting(false);
    setStatus('Standby');
  }, []);

  const playBase64Audio = async (base64Data: string) => {
    try {
      if (!outputAudioContextRef.current) outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      const ctx = outputAudioContextRef.current;
      nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
      const buffer = await decodeAudioData(decode(base64Data), ctx, 24000, 1);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.onended = () => sourcesRef.current.delete(source);
      source.start(nextStartTimeRef.current);
      nextStartTimeRef.current += buffer.duration;
      sourcesRef.current.add(source);
    } catch (err) {
      console.warn("Audio error", err);
    }
  };

  const handleToolCall = useCallback(async (fc: any) => {
    if (fc.name === 'generate_image') {
      setStatus(`Processing Artifact...`);
      try {
        const imageUrl = await generateProImage(fc.args.prompt, { aspectRatio, imageSize });
        if (imageUrl) {
          onArtifactGenerated(imageUrl, fc.args.prompt, 'image');
          setMessages(prev => [...prev, { role: 'model', text: `Artifact synchronized.`, type: 'image', imageUrl, timestamp: Date.now(), status: 'read' }]);
          notify("Artifact generated successfully.", 'success');
          return { result: "Success" };
        }
      } catch (err: any) {
        notify(err.message || "Generation failed.", 'error');
        setMessages(prev => [...prev, { role: 'model', text: `Failed: ${err.message}`, type: 'text', timestamp: Date.now(), status: 'read' }]);
      } finally {
        setStatus(isConnected ? 'Live' : 'Standby');
      }
      return { result: "Failed" };
    }
    if (fc.name === 'manage_memory') {
      try {
        onUpdateMemory(fc.args.action as any, fc.args.content);
        notify(`Vault synchronized.`, 'info');
        return { result: "Success" };
      } catch (err) {
        return { result: "Memory sync error" };
      }
    }
    return { result: "ok" };
  }, [onArtifactGenerated, onUpdateMemory, aspectRatio, imageSize, isConnected, notify]);

  const toggleConnection = useCallback(async () => {
    if (isConnected) { cleanup(); return; }
    try {
      setIsConnecting(true); setStatus('Connecting...');
      const ai = getGeminiClient();
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      if (!outputAudioContextRef.current) outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: getSystemInstruction(mode, voiceType, memories.map(m => m.content)),
          tools: [{ functionDeclarations: [generateImageFn, manageMemoryFn] }],
        },
        callbacks: {
          onopen: () => {
            setIsConnected(true); setIsConnecting(false); setStatus('Live');
            const source = audioContextRef.current!.createMediaStreamSource(stream);
            processorRef.current = audioContextRef.current!.createScriptProcessor(4096, 1, 1);
            processorRef.current.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              sessionPromise.then(session => session.sendRealtimeInput({ media: createBlob(inputData) }));
            };
            source.connect(processorRef.current); processorRef.current.connect(audioContextRef.current!.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            if (message.toolCall) {
              for (const fc of message.toolCall.functionCalls) {
                const response = await handleToolCall(fc);
                sessionPromise.then(session => session.sendToolResponse({ functionResponses: { id: fc.id, name: fc.name, response } }));
              }
            }
            const audioData = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (audioData) {
                setStatus('Transmitting...');
                await playBase64Audio(audioData);
                setTimeout(() => setStatus('Live'), 2000);
            }
            if (message.serverContent?.interrupted) {
              for (const s of sourcesRef.current) {
                try { s.stop(); } catch(e) {}
              }
              sourcesRef.current.clear(); nextStartTimeRef.current = 0;
            }
          },
          onerror: (e) => {
            console.error("Session error:", e);
            notify("Connection dropped.", 'error');
            cleanup();
          }, 
          onclose: () => cleanup()
        }
      });
    } catch (err: any) { 
      setIsConnecting(false); 
      setStatus('Failed'); 
      notify(`Connection error: ${err.message}`, 'error');
    }
  }, [isConnected, cleanup, mode, voiceType, memories, handleToolCall, notify]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const isCmdOrCtrl = e.metaKey || e.ctrlKey;
      if (e.key === 'Escape') { setIsSettingsOpen(false); setIsHistoryOpen(false); }
      if (isCmdOrCtrl && e.key === ',') { e.preventDefault(); setIsSettingsOpen(prev => !prev); }
      if (isCmdOrCtrl && (e.key === 'g' || e.key === 'G')) { e.preventDefault(); onViewGallery(); }
      if (isCmdOrCtrl && (e.key === 'h' || e.key === 'H')) { e.preventDefault(); setIsHistoryOpen(prev => !prev); }
      if (isCmdOrCtrl && (e.key === 'l' || e.key === 'L')) { e.preventDefault(); toggleConnection(); }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onViewGallery, toggleConnection]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() && !uploadedMedia || isTyping) return;
    const userText = inputText;
    const media = uploadedMedia;
    const editing = isEditMode && !!media;
    
    setInputText('');
    setUploadedMedia(null);
    setIsEditMode(false);
    
    const userMessage: Message = { 
      role: 'user', 
      text: editing ? `Remix: ${userText}` : (userText || "Analyze this."), 
      type: 'text', 
      imageUrl: media || undefined,
      timestamp: Date.now(),
      status: 'sent'
    };

    setMessages(prev => [...prev, userMessage]);
    setIsTyping(true);

    try {
      if (editing) {
        setStatus("Remixing...");
        const editUrl = await editImage(media, userText);
        if (editUrl) {
          onArtifactGenerated(editUrl, userText, 'image');
          setMessages(prev => [
            ...prev.map(m => m.timestamp === userMessage.timestamp ? { ...m, status: 'read' } : m),
            { role: 'model', text: "Artifact remixed successfully.", type: 'image', imageUrl: editUrl, timestamp: Date.now(), status: 'read' }
          ]);
        }
        setIsTyping(false); setStatus(isConnected ? 'Live' : 'Standby'); return;
      }

      const ai = getGeminiClient();
      const isComplex = mode === 'Deep' || media || userText    .length > 300;

      const model = 'gemini-1.5-flash';
      
      const contents: any[] = [{ text: userText || "Analyze this." }];
      if (media) contents.push({ inlineData: { data: media.split(',')[1], mimeType: 'image/png' } });

      const config: any = { 
        systemInstruction: getSystemInstruction(mode, voiceType, memories.map(m => m.content)),
        tools: [{ googleSearch: {} }, { googleMaps: {} }, { functionDeclarations: [generateImageFn, manageMemoryFn] }]
      };
      
      // Pass location for Maps grounding if available
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition((pos) => {
          config.toolConfig = {
            retrievalConfig: {
              latLng: { latitude: pos.coords.latitude, longitude: pos.coords.longitude }
            }
          };
        }, () => {});
      }

      if (mode === 'Deep') config.thinkingConfig = { thinkingBudget: 32768 };

      const response = await ai.models.generateContent({ model, contents: { parts: contents }, config });
      
      let textResponse = response.text || "Processed.";
      let groundingUrls: string[] = [];
      let thinking: string | undefined = undefined;

      // Extract metadata
      const candidate = response.candidates?.[0];
      if (candidate) {
        // Grounding URLs
        const chunks = candidate.groundingMetadata?.groundingChunks || [];
        groundingUrls = chunks
          .map((c: any) => c.web?.uri || c.maps?.uri)
          .filter(Boolean);
          
        // Thinking process
        const thoughtPart = candidate.content?.parts.find((p: any) => !!p.thought);
        thinking = thoughtPart ? String(thoughtPart.thought) : undefined;
      }

      setMessages(prev => [
        ...prev.map(m => m.timestamp === userMessage.timestamp ? { ...m, status: 'read' } : m),
        { 
          role: 'model', 
          text: textResponse, 
          type: 'text', 
          timestamp: Date.now(), 
          status: 'read',
          groundingUrls,
          thinking
        }
      ]);
      
      const audioData = await speakText(textResponse, voiceType);
      if (audioData) await playBase64Audio(audioData);
    } catch (err: any) {
      notify(err.message || "Sync failed.", 'error');
      setMessages(prev => [...prev, { role: 'model', text: `Sync Error: ${err.message}`, type: 'text', timestamp: Date.now(), status: 'read' }]);
    } finally { 
      setIsTyping(false); setStatus(isConnected ? 'Live' : 'Standby');
    }
  };

  const formatTime = (ts: number) => {
    return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: 'numeric', hour12: true }).format(ts);
  };

  return (
    <div className="flex flex-col h-full w-full relative overflow-hidden bg-bg text-ink selection:bg-accent/30 font-sans">
      
      {/* Ambient Background Elements */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
        <motion.div 
          animate={{ 
            scale: [1, 1.2, 1],
            opacity: [0.1, 0.15, 0.1],
            x: [0, 50, 0],
            y: [0, -30, 0]
          }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          className="absolute top-[-20%] left-[-10%] w-[70%] h-[70%] bg-accent/20 rounded-full blur-[160px]" 
        />
        <motion.div 
          animate={{ 
            scale: [1.2, 1, 1.2],
            opacity: [0.05, 0.1, 0.05],
            x: [0, -40, 0],
            y: [0, 40, 0]
          }}
          transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
          className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-purple-500/10 rounded-full blur-[140px]" 
        />
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03] mix-blend-overlay" />
      </div>

      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 shrink-0 z-40 glass border-b-0 m-4 rounded-full">
        {/* Left: Profile & Status */}
        <div className="flex items-center gap-4 flex-1">
           <motion.button 
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => {
              if (navigator.vibrate) navigator.vibrate(10);
              setIsSettingsOpen(true);
            }} 
            className="group relative flex items-center justify-center w-10 h-10 rounded-full glass glass-hover"
          >
            {profile.avatar ? (
              <img src={profile.avatar} className="w-full h-full rounded-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <User className="w-4 h-4 text-accent" />
            )}
            <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-bg ${isConnected ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]' : 'bg-slate-500'}`} />
          </motion.button>
          
          <div className="hidden sm:flex flex-col">
            <div className="flex items-center gap-2">
              <motion.div 
                animate={{ 
                  scale: status === 'Thinking' || status === 'Remixing' ? [1, 1.2, 1] : 1,
                  opacity: status === 'Thinking' || status === 'Remixing' ? [0.5, 1, 0.5] : 1
                }}
                transition={{ repeat: Infinity, duration: 1.5 }}
                className={`w-1 h-1 rounded-full ${status === 'Thinking' || status === 'Remixing' ? 'bg-accent' : 'bg-slate-500'}`} 
              />
              <span className="text-[7px] font-black uppercase tracking-[0.3em] text-accent/70 mono">{status}</span>
            </div>
          </div>
        </div>

        {/* Center: Logo */}
        <div className="flex-1 flex justify-center">
          <Logo />
        </div>

        {/* Right: Controls */}
        <div className="flex items-center gap-2 flex-1 justify-end">
          <div className="hidden lg:flex glass rounded-full p-1 gap-1">
             {(['Fast', 'Deep', 'Explore'] as AppMode[]).map(m => (
               <button 
                key={m} 
                onClick={() => onModeChange(m)} 
                className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest transition-all ${mode === m ? 'bg-accent text-white shadow-md shadow-accent/10' : 'text-slate-500 hover:text-white'}`}
               >
                 {m}
               </button>
             ))}
          </div>
          
          <div className="h-6 w-px bg-white/5 mx-1 hidden md:block" />
          
          <motion.button 
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={toggleConnection} 
            className={`px-4 py-1.5 rounded-full font-black text-[8px] uppercase tracking-widest transition-all border flex items-center gap-2 ${
              isConnected 
              ? 'bg-accent/10 text-accent border-accent/20 shadow-[0_0_15px_rgba(16,185,129,0.1)]' 
              : 'glass border-white/5 text-slate-400 hover:text-slate-200'
            }`}
          >
            {isConnecting ? (
              <div className="w-2.5 h-2.5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
            ) : isConnected ? (
              <div className="w-1.5 h-1.5 bg-accent rounded-full animate-pulse" />
            ) : (
              <Mic className="w-2.5 h-2.5" />
            )}
            {isConnecting ? 'LINKING' : isConnected ? 'LIVE' : 'REAL-TIME'}
          </motion.button>
          
          <div className="flex gap-1.5">
            <button onClick={startNewChat} title="New Chat" className="p-2 rounded-full glass glass-hover text-slate-400 hover:text-accent transition-colors">
              <Plus className="w-4 h-4" />
            </button>
            <button onClick={() => setIsHistoryOpen(true)} className="p-2 rounded-full glass glass-hover text-slate-400 hover:text-accent transition-colors">
              <History className="w-4 h-4" />
            </button>
            <button onClick={onViewGallery} className="p-2 rounded-full glass glass-hover text-slate-400 hover:text-accent transition-colors">
              <ImageIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Mandatory Key Block */}
      {needsApiKey && (
        <div className="fixed inset-0 z-[110] bg-black/95 backdrop-blur-2xl flex items-center justify-center p-8 text-center animate-in fade-in duration-500">
          <div className="max-w-md space-y-8">
             <div className="w-20 h-20 bg-accent rounded-[2rem] mx-auto flex items-center justify-center shadow-2xl shadow-accent/20">
                <Settings className="w-10 h-10 text-white" />
             </div>
             <div className="space-y-3">
                <h1 className="text-3xl font-black italic tracking-tighter serif">Premium Link Required</h1>
                <p className="text-slate-500 font-medium text-sm leading-relaxed">To access high-fidelity synthesis models, you must select an API key from a paid GCP project.</p>
                <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" className="text-accent text-[10px] font-black uppercase tracking-widest hover:underline mono">Billing Documentation</a>
             </div>
             <button onClick={openKeyDialog} className="w-full py-5 bg-accent text-white rounded-3xl text-[11px] font-black uppercase tracking-widest hover:bg-accent/90 transition-all active:scale-95 shadow-2xl shadow-accent/20">
                SELECT API KEY
             </button>
          </div>
        </div>
      )}

      {/* Main Experience Space */}
      <main className="flex-1 overflow-y-auto px-6 md:px-32 lg:px-[25%] py-12 space-y-12 custom-scrollbar scroll-smooth relative z-20">
        
        <AnimatePresence mode="popLayout">
          {messages.length === 0 && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="h-full flex flex-col items-center justify-center text-center space-y-10"
            >
               <div className="w-32 h-32 rounded-[3rem] glass flex items-center justify-center relative animate-float">
                  <div className="absolute inset-0 bg-accent/20 blur-3xl rounded-full" />
                  <Sparkles className="w-12 h-12 text-accent" />
               </div>
               <div className="space-y-4">
                  <h1 className="text-6xl font-black tracking-tighter italic serif text-gradient">priya</h1>
                  <p className="text-slate-400 text-lg font-medium max-w-sm mx-auto leading-relaxed">
                    Integrated Neural Studio for logic, voice, and artifact synthesis.
                  </p>
                  <div className="flex gap-4 justify-center pt-8">
                     <div className="text-[9px] font-black uppercase text-accent/60 tracking-[0.2em] px-4 py-2 glass rounded-full mono">âŒ˜ , SETTINGS</div>
                     <div className="text-[9px] font-black uppercase text-accent/60 tracking-[0.2em] px-4 py-2 glass rounded-full mono">âŒ˜ L LIVE</div>
                  </div>
               </div>
            </motion.div>
          )}

          {messages.map((msg, i) => (
            <motion.article 
              key={msg.timestamp + i}
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              layout
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`max-w-[95%] md:max-w-[85%] space-y-3 flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                <div className={`px-8 py-6 rounded-[2.5rem] text-lg font-bold leading-relaxed transition-all shadow-2xl relative group overflow-hidden ${
                  msg.role === 'user' 
                  ? 'bg-accent text-white rounded-tr-none' 
                  : 'glass text-slate-100 rounded-tl-none'
                }`}>
                  {msg.role === 'model' && (
                    <div className="absolute top-0 left-0 w-1 h-full bg-accent/20" />
                  )}
                  {msg.thinking && (
                    <details className="mb-4 text-slate-500 text-sm border-b border-white/5 pb-4 cursor-pointer group/thinking">
                      <summary className="font-black uppercase text-[9px] tracking-widest opacity-50 group-hover/thinking:opacity-100 transition-opacity mono flex items-center gap-2">
                        <Brain className="w-3 h-3 text-accent" /> Neural Pathing
                      </summary>
                      <motion.div 
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mt-4 pl-4 border-l-2 border-accent/10 italic font-medium leading-relaxed opacity-80 whitespace-pre-wrap text-sm bg-accent/5 p-4 rounded-2xl"
                      >
                        {msg.thinking}
                      </motion.div>
                    </details>
                  )}
                  {msg.text && <p className="whitespace-pre-wrap">{msg.text}</p>}
                  {msg.imageUrl && (
                    <div className="mt-6 relative group overflow-hidden rounded-[2rem] border border-white/10 shadow-2xl">
                      <img src={msg.imageUrl} className="w-full max-h-[500px] object-contain transition-transform duration-700 group-hover:scale-[1.02]" referrerPolicy="no-referrer" />
                      <button 
                        onClick={() => { setUploadedMedia(msg.imageUrl!); setIsEditMode(true); }}
                        className="absolute inset-0 bg-accent/20 backdrop-blur-md opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center font-black text-[10px] uppercase tracking-widest text-white gap-2"
                      >
                        <Maximize2 className="w-4 h-4" /> Remorph Artifact
                      </button>
                    </div>
                  )}
                  {msg.groundingUrls && msg.groundingUrls.length > 0 && (
                    <div className="mt-6 pt-4 border-t border-white/5 space-y-2">
                      <p className="text-[9px] font-black uppercase tracking-widest text-accent/60 mono flex items-center gap-2">
                        <Globe className="w-3 h-3" /> Source Grounding
                      </p>
                      <div className="flex flex-wrap gap-2">
                         {msg.groundingUrls.map((url, idx) => (
                           <a key={idx} href={url} target="_blank" className="px-3 py-1.5 glass glass-hover rounded-full text-[9px] font-bold text-slate-400 hover:text-white transition-all truncate max-w-[200px] mono">
                             {new URL(url).hostname}
                           </a>
                         ))}
                      </div>
                    </div>
                  )}
                </div>
                
                <div className="flex items-center gap-3 px-6 opacity-40">
                  <span className="text-[9px] font-black tracking-widest text-slate-500 mono">{formatTime(msg.timestamp)}</span>
                  {msg.role === 'user' && (
                     <div className="flex items-center">
                        {msg.status === 'read' ? (
                          <CheckCheck className="w-3.5 h-3.5 text-accent" />
                        ) : (
                          <Check className="w-3.5 h-3.5 text-slate-500" />
                        )}
                     </div>
                  )}
                </div>
              </div>
            </motion.article>
          ))}
        </AnimatePresence>

        {isTyping && (
          <motion.div 
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex justify-start"
          >
             <div className="px-8 py-4 rounded-[2rem] glass flex items-center gap-4 shadow-xl relative overflow-hidden">
                <div className="absolute inset-0 bg-accent/5 animate-pulse" />
                <div className="flex gap-1.5 relative z-10">
                  <motion.div animate={{ scale: [1, 1.5, 1], opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.2 }} className="w-1.5 h-1.5 bg-accent rounded-full shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                  <motion.div animate={{ scale: [1, 1.5, 1], opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.2, delay: 0.2 }} className="w-1.5 h-1.5 bg-accent rounded-full shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                  <motion.div animate={{ scale: [1, 1.5, 1], opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.2, delay: 0.4 }} className="w-1.5 h-1.5 bg-accent rounded-full shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                </div>
                <span className="text-[9px] font-black uppercase tracking-[0.4em] text-accent/80 mono relative z-10">Neural Syncing</span>
             </div>
          </motion.div>
        )}
        <div ref={chatEndRef} />
      </main>

      {/* Control Hub */}
      <footer className="px-6 md:px-32 lg:px-[25%] pb-12 pt-6 shrink-0 z-30">
        <form onSubmit={handleSendMessage} className="max-w-5xl mx-auto relative group">
          <AnimatePresence>
            {uploadedMedia && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="absolute bottom-full left-0 mb-8 p-5 glass rounded-[2.5rem] flex items-center gap-6 shadow-2xl backdrop-blur-3xl"
              >
                 <div className="relative w-20 h-20 rounded-2xl overflow-hidden border border-white/10">
                    <img src={uploadedMedia} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    <button type="button" onClick={() => { setUploadedMedia(null); setIsEditMode(false); }} className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full shadow-lg">
                      <X className="w-3 h-3" />
                    </button>
                 </div>
                 <div className="space-y-1">
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-accent mono">{isEditMode ? 'REMORPH ACTIVE' : 'MEDIA LOADED'}</p>
                    <p className="text-sm font-bold text-white leading-relaxed">Describe the logic shift.</p>
                 </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className={`relative flex items-center glass rounded-[3rem] transition-all duration-700 shadow-2xl p-2 group-focus-within:ring-4 group-focus-within:ring-accent/10 ${isEditMode ? 'border-accent' : 'border-glass-border group-focus-within:border-white/20'}`}>
            <button type="button" onClick={() => mediaInputRef.current?.click()} title="Upload Media" className="ml-4 p-5 text-slate-500 hover:text-accent glass glass-hover rounded-full transition-all">
              <Plus className="w-6 h-6" />
              <input type="file" ref={mediaInputRef} className="hidden" accept="image/*" onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) { const r = new FileReader(); r.onload = () => setUploadedMedia(r.result as string); r.readAsDataURL(f); }
              }} />
            </button>
            <input 
              type="text" 
              value={inputText} 
              onChange={e => setInputText(e.target.value)} 
              placeholder={isEditMode ? "Modify artifact logic..." : "Consult priya..."} 
              className="flex-1 bg-transparent px-6 py-6 text-white placeholder-slate-700 focus:outline-none text-xl font-bold"
            />
            <motion.button 
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              type="submit" 
              disabled={!inputText.trim() && !uploadedMedia || isTyping} 
              className={`mr-3 px-10 py-5 rounded-[2.5rem] text-[10px] font-black uppercase tracking-[0.2em] shadow-xl disabled:opacity-30 transition-all flex items-center gap-2 ${
                isTyping ? 'bg-slate-800 text-slate-500' : 'bg-accent text-white shadow-accent/20'
              }`}
            >
              {isTyping ? (
                <div className="w-4 h-4 border-2 border-slate-600 border-t-accent rounded-full animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              {isTyping ? 'PROCESSING' : 'EXECUTE'}
            </motion.button>
          </div>
        </form>
      </footer>

      {/* Notifications Toast */}
      {notification && (
        <div className="fixed top-32 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-top-4 duration-500">
           <div className={`px-8 py-4 rounded-[2rem] shadow-2xl flex items-center gap-5 backdrop-blur-3xl border ${
             notification.type === 'error' ? 'bg-red-500/10 border-red-500/20 text-red-500' :
             notification.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-500' :
             'bg-indigo-500/10 border-indigo-500/20 text-indigo-500'
           }`}>
              <div className={`w-2.5 h-2.5 rounded-full animate-pulse ${
                notification.type === 'error' ? 'bg-red-500' :
                notification.type === 'success' ? 'bg-green-500' :
                'bg-indigo-500'
              }`} />
              <p className="text-[12px] font-black uppercase tracking-[0.2em]">{notification.message}</p>
           </div>
        </div>
      )}

      {/* Settings Bottom Sheet */}
      <AnimatePresence>
        {isSettingsOpen && (
          <>
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSettingsOpen(false)}
              className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-md"
            />
            
            {/* Bottom Sheet */}
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              drag="y"
              dragConstraints={{ top: 0 }}
              dragElastic={0.2}
              onDragEnd={(_, info) => {
                if (info.offset.y > 150) setIsSettingsOpen(false);
              }}
              className="fixed bottom-0 left-0 right-0 z-[101] glass rounded-t-[2.5rem] shadow-2xl flex flex-col overflow-hidden max-h-[85vh] md:max-h-[75vh]"
              style={{ height: 'auto' }}
            >
              {/* Drag Indicator */}
              <div className="w-full flex justify-center py-4 shrink-0">
                <div className="w-12 h-1.5 bg-white/20 rounded-full" />
              </div>

              <div className="flex flex-col md:flex-row h-full overflow-hidden">
                {/* Nav Sidebar */}
                <nav className="w-full md:w-72 border-b md:border-b-0 md:border-r border-white/5 p-8 flex flex-col gap-4 shrink-0">
                  <div className="mb-6 px-4">
                    <Logo className="w-full scale-90 origin-left" />
                    <p className="text-[8px] font-black uppercase tracking-[0.3em] text-accent mt-2 mono">PREFERENCES</p>
                  </div>
                  
                  <div className="flex md:flex-col gap-2 overflow-x-auto md:overflow-x-visible pb-4 md:pb-0 no-scrollbar">
                    {[
                      { id: 'profile', label: 'IDENTITY', icon: User },
                      { id: 'voice', label: 'AUDIO', icon: Volume2 },
                      { id: 'mode', label: 'NEURAL', icon: Zap },
                      { id: 'creation', label: 'BRANDING', icon: Palette },
                      { id: 'memories', label: 'VAULT', icon: Brain }
                    ].map((item) => (
                      <motion.button 
                        key={item.id}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => {
                          if (navigator.vibrate) navigator.vibrate(5);
                          setSettingsView(item.id as any);
                        }} 
                        className={`flex items-center gap-4 px-6 py-4 rounded-2xl text-[9px] font-black uppercase tracking-widest transition-all shrink-0 ${
                          settingsView === item.id 
                          ? 'bg-accent text-white shadow-lg shadow-accent/20' 
                          : 'text-slate-500 hover:text-white hover:bg-white/5'
                        }`}
                      >
                        <item.icon className="w-4 h-4" />
                        <span className="whitespace-nowrap">{item.label}</span>
                      </motion.button>
                    ))}
                  </div>
                </nav>

                {/* Content Area */}
                <div className="flex-1 p-8 md:p-12 overflow-y-auto custom-scrollbar">
                  <div className="max-w-3xl mx-auto pb-12">
                    {settingsView === 'profile' && (
                      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-12">
                        <h2 className="text-5xl font-black italic tracking-tighter serif">Identity</h2>
                        <div className="flex flex-col md:flex-row items-start md:items-center gap-10">
                          <motion.button 
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => profileAvatarInputRef.current?.click()} 
                            className="w-32 h-32 rounded-3xl glass flex items-center justify-center overflow-hidden relative group shrink-0"
                          >
                            {profile.avatar ? <img src={profile.avatar} className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : <User className="w-10 h-10 text-accent" />}
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <Plus className="w-8 h-8 text-white" />
                            </div>
                            <input type="file" ref={profileAvatarInputRef} className="hidden" accept="image/*" onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) { const r = new FileReader(); r.onload = () => onProfileChange({ ...profile, avatar: r.result as string }); r.readAsDataURL(f); }
                            }} />
                          </motion.button>
                          <div className="space-y-6 flex-1 w-full">
                            <div className="space-y-3">
                              <label className="text-[10px] font-black uppercase tracking-widest text-slate-600 mono">DISPLAY NAME</label>
                              <input type="text" value={profile.name} onChange={e => onProfileChange({...profile, name: e.target.value})} className="w-full glass rounded-2xl px-8 py-5 text-2xl font-black focus:outline-none focus:border-accent transition-all" />
                            </div>
                            <div className="space-y-3">
                              <label className="text-[10px] font-black uppercase tracking-widest text-slate-600 mono">NEURAL EMAIL</label>
                              <input type="email" value={profile.email} onChange={e => onProfileChange({...profile, email: e.target.value})} className="w-full glass rounded-2xl px-8 py-4 text-lg font-bold text-slate-400 focus:outline-none focus:border-accent transition-all" />
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                          <div className="space-y-4">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-600 mono">SYSTEM THEME</label>
                            <div className="flex gap-4">
                              <motion.button 
                                whileTap={{ scale: 0.98 }}
                                onClick={() => onProfileChange({...profile, theme: 'dark'})}
                                className={`flex-1 flex items-center justify-center gap-3 py-6 rounded-2xl border transition-all ${profile.theme === 'dark' ? 'bg-accent/10 border-accent text-ink' : 'glass glass-hover text-slate-500'}`}
                              >
                                <Moon className="w-5 h-5" />
                                <span className="text-sm font-black uppercase tracking-widest mono">Dark</span>
                              </motion.button>
                              <motion.button 
                                whileTap={{ scale: 0.98 }}
                                onClick={() => onProfileChange({...profile, theme: 'light'})}
                                className={`flex-1 flex items-center justify-center gap-3 py-6 rounded-2xl border transition-all ${profile.theme === 'light' ? 'bg-accent/10 border-accent text-ink' : 'glass glass-hover text-slate-500'}`}
                              >
                                <Sun className="w-5 h-5" />
                                <span className="text-sm font-black uppercase tracking-widest mono">Light</span>
                              </motion.button>
                            </div>
                          </div>

                          <div className="space-y-4">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-600 mono">NEURAL LANGUAGE</label>
                            <div className="relative">
                              <select 
                                value={profile.language} 
                                onChange={e => onProfileChange({...profile, language: e.target.value})}
                                className="w-full glass rounded-2xl px-8 py-6 text-sm font-black uppercase tracking-widest appearance-none focus:outline-none focus:border-accent transition-all cursor-pointer"
                              >
                                {['English', 'Spanish', 'French', 'German', 'Japanese', 'Korean', 'Chinese'].map(lang => (
                                  <option key={lang} value={lang} className="bg-black text-white">{lang}</option>
                                ))}
                              </select>
                              <div className="absolute right-8 top-1/2 -translate-y-1/2 pointer-events-none">
                                <Globe className="w-5 h-5 text-slate-500" />
                              </div>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}

                    {settingsView === 'voice' && (
                      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-12">
                        <div className="flex justify-between items-end">
                          <h2 className="text-5xl font-black italic tracking-tighter serif">Audio</h2>
                          <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-2 mono">Personas & Cloning</p>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {[
                            { id: 'Zephyr', label: 'Zephyr', desc: 'Neutral', accent: 'Global' },
                            { id: 'Puck', label: 'Puck', desc: 'Juvenile', accent: 'Energetic' },
                            { id: 'Charon', label: 'Charon', desc: 'Mature', accent: 'Deep' },
                            { id: 'Kore', label: 'Kore', desc: 'Female', accent: 'Soft' },
                            { id: 'Fenrir', label: 'Fenrir', desc: 'Male', accent: 'Strong' }
                          ].map(v => (
                            <motion.div 
                              key={v.id} 
                              whileTap={{ scale: 0.98 }}
                              onClick={() => onVoiceChange(v.id as VoiceType)} 
                              className={`group flex flex-col p-6 rounded-3xl border cursor-pointer transition-all ${voiceType === v.id ? 'bg-accent/10 border-accent' : 'glass glass-hover'}`}
                            >
                              <div className="flex items-center justify-between mb-4">
                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${voiceType === v.id ? 'bg-accent text-white' : 'bg-black/40 text-slate-500'}`}>
                                  <Volume2 className="w-6 h-6" />
                                </div>
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    speakText(`Hello, I am ${v.label}.`, v.id as VoiceType).then(data => data && playBase64Audio(data));
                                  }}
                                  className="p-3 glass glass-hover rounded-xl text-slate-500"
                                >
                                  <Play className="w-4 h-4" />
                                </button>
                              </div>
                              <h4 className="text-lg font-black uppercase tracking-widest mono">{v.label}</h4>
                              <p className="text-slate-500 text-[9px] uppercase tracking-widest mono">{v.desc} â€¢ {v.accent}</p>
                            </motion.div>
                          ))}

                          {/* Custom Voice Clone Section */}
                          <motion.div 
                            whileTap={{ scale: 0.99 }}
                            onClick={() => onVoiceChange('Custom')}
                            className={`group flex flex-col p-8 rounded-[2.5rem] border cursor-pointer transition-all relative overflow-hidden md:col-span-2 ${voiceType === 'Custom' ? 'bg-accent/10 border-accent' : 'glass glass-hover'}`}
                          >
                            <div className="flex items-center justify-between mb-6">
                              <div className="flex items-center gap-6">
                                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all ${voiceType === 'Custom' ? 'bg-accent text-white' : 'bg-black/40 text-slate-500'}`}>
                                  <Mic className="w-6 h-6" />
                                </div>
                                <div>
                                  <h4 className="text-xl font-black uppercase tracking-widest mono">Neural Clone</h4>
                                  <p className="text-slate-500 text-[9px] uppercase tracking-widest mono">Voice Synthesis</p>
                                </div>
                              </div>

                              <div className="flex items-center gap-3">
                                {voiceCloningStatus === 'ready' && (
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (recordedVoiceUrl) {
                                        const audio = new Audio(recordedVoiceUrl);
                                        audio.play();
                                      }
                                    }}
                                    className="p-3 glass glass-hover rounded-xl text-slate-500"
                                  >
                                    <Play className="w-4 h-4" />
                                  </button>
                                )}
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (isRecordingVoice) stopVoiceRecording();
                                    else startVoiceRecording();
                                  }}
                                  className={`px-6 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${isRecordingVoice ? 'bg-red-600 text-white animate-pulse' : 'bg-accent text-white'}`}
                                >
                                  {isRecordingVoice ? 'STOP' : voiceCloningStatus === 'ready' ? 'RE-RECORD' : 'START'}
                                </button>
                              </div>
                            </div>

                            <div className="space-y-3">
                              <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                                <motion.div 
                                  initial={{ width: 0 }}
                                  animate={{ width: voiceCloningStatus === 'ready' ? '100%' : voiceCloningStatus === 'recording' ? '50%' : '0%' }}
                                  className={`h-full bg-accent transition-all duration-500 ${voiceCloningStatus === 'recording' ? 'animate-pulse' : ''}`} 
                                />
                              </div>
                              <p className="text-[8px] font-black uppercase tracking-[0.2em] text-slate-600 mono">
                                {voiceCloningStatus === 'idle' && 'No sample detected.'}
                                {voiceCloningStatus === 'recording' && 'Capturing patterns...'}
                                {voiceCloningStatus === 'processing' && 'Synthesizing...'}
                                {voiceCloningStatus === 'ready' && 'Neural profile active.'}
                              </p>
                            </div>
                          </motion.div>
                        </div>
                      </motion.div>
                    )}

                    {settingsView === 'mode' && (
                      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-12">
                        <h2 className="text-5xl font-black italic tracking-tighter serif">Core</h2>
                        <div className="grid grid-cols-1 gap-4">
                          {(['Fast', 'Deep', 'Explore', 'Build'] as AppMode[]).map(m => (
                            <motion.div 
                              key={m} 
                              whileTap={{ scale: 0.99 }}
                              onClick={() => onModeChange(m)} 
                              className={`flex items-center gap-6 p-6 rounded-3xl border cursor-pointer transition-all ${mode === m ? 'bg-accent/10 border-accent' : 'glass glass-hover'}`}
                            >
                               <div className="w-14 h-14 rounded-2xl bg-accent/10 flex items-center justify-center shrink-0">
                                 {m === 'Fast' && <Zap className="w-6 h-6 text-accent" />}
                                 {m === 'Deep' && <Brain className="w-6 h-6 text-accent" />}
                                 {m === 'Explore' && <Compass className="w-6 h-6 text-accent" />}
                                 {m === 'Build' && <Code className="w-6 h-6 text-accent" />}
                               </div>
                               <div>
                                 <h4 className="text-xl font-black uppercase tracking-widest mono">{m}</h4>
                                 <p className="text-slate-500 text-xs font-medium">
                                    {m === 'Fast' && 'Optimized for latency.'}
                                    {m === 'Deep' && 'Extended reasoning.'}
                                    {m === 'Explore' && 'Divergent thinking.'}
                                    {m === 'Build' && 'Implementation focused.'}
                                 </p>
                               </div>
                            </motion.div>
                          ))}
                        </div>
                      </motion.div>
                    )}

                    {settingsView === 'creation' && (
                      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-12">
                        <h2 className="text-5xl font-black italic tracking-tighter serif">Branding</h2>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                          <div className="space-y-6">
                             <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-accent mono">Aspect Ratio</h3>
                             <div className="flex flex-wrap gap-3">
                                {(['1:1', '4:3', '3:4', '16:9', '9:16'] as AspectRatio[]).map(ar => (
                                  <button key={ar} onClick={() => onAspectRatioChange(ar)} className={`px-6 py-3 rounded-2xl text-[9px] font-black transition-all mono ${aspectRatio === ar ? 'bg-accent text-white shadow-lg shadow-accent/20' : 'glass glass-hover text-slate-500'}`}>
                                    {ar}
                                  </button>
                                ))}
                             </div>
                          </div>
                          <div className="space-y-6">
                             <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-accent mono">Resolution</h3>
                             <div className="flex flex-wrap gap-3">
                                {(['1K', '2K', '4K'] as ImageSize[]).map(sz => (
                                  <button key={sz} onClick={() => onImageSizeChange(sz)} className={`px-6 py-3 rounded-2xl text-[9px] font-black transition-all mono ${imageSize === sz ? 'bg-accent text-white shadow-lg shadow-accent/20' : 'glass glass-hover text-slate-500'}`}>
                                    {sz}
                                  </button>
                                ))}
                             </div>
                          </div>
                        </div>

                        <div className="space-y-8">
                          <div className="p-8 glass rounded-3xl space-y-6 border-accent/10">
                             <div className="flex items-center gap-6">
                                <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center">
                                   <Logo className="w-10 h-10" />
                                </div>
                                <div className="flex-1">
                                   <h3 className="text-xl font-black serif italic">Neural Branding</h3>
                                   <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mono">Nova AI Studio Identity</p>
                                </div>
                             </div>
                             <motion.button 
                              whileTap={{ scale: 0.98 }}
                              onClick={async () => {
                                setStatus('Branding...');
                                try {
                                  const url = await generateProImage("A high-tech logo for 'Nova AI Studio', futuristic branding", { aspectRatio: '1:1', imageSize: '1K' });
                                  if (url) onArtifactGenerated(url, "Nova Logo", "image");
                                } finally {
                                  setStatus(isConnected ? 'Live' : 'Standby');
                                }
                              }}
                              className="w-full py-5 rounded-2xl bg-accent text-white text-sm font-black uppercase tracking-widest shadow-lg shadow-accent/20 flex items-center justify-center gap-3"
                             >
                                <Sparkles className="w-4 h-4" />
                                Generate Logo
                             </motion.button>
                          </div>
                        </div>
                      </motion.div>
                    )}

                    {settingsView === 'memories' && (
                      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-12">
                        <h2 className="text-5xl font-black italic tracking-tighter serif">Vault</h2>
                        <div className="flex gap-4">
                          <input 
                            type="text" 
                            value={newMemoryValue} 
                            onChange={(e) => setNewMemoryValue(e.target.value)}
                            placeholder="Neural commit..."
                            className="flex-1 glass rounded-2xl px-8 py-4 text-lg font-bold focus:outline-none focus:border-accent transition-all"
                          />
                          <motion.button 
                            whileTap={{ scale: 0.95 }}
                            onClick={() => { if (newMemoryValue.trim()) { onUpdateMemory('add', newMemoryValue); setNewMemoryValue(''); } }}
                            className="px-8 py-4 bg-accent text-white rounded-2xl text-[10px] font-black uppercase tracking-widest"
                          >
                            SYNC
                          </motion.button>
                        </div>
                        <div className="space-y-3">
                          {memories.map(m => (
                            <div key={m.id} className="p-6 glass rounded-2xl flex justify-between items-center group">
                              <p className="text-lg font-bold italic tracking-tight text-slate-300 serif">{m.content}</p>
                              <button onClick={() => onUpdateMemory('delete', m.content, m.id)} className="p-3 glass glass-hover text-red-500 rounded-xl">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* History Overlay Panel */}
      <AnimatePresence>
        {isHistoryOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex justify-end"
          >
            <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setIsHistoryOpen(false)} />
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="relative w-full max-w-xl h-full glass border-l-0 flex flex-col p-16 shadow-2xl"
            >
              <div className="flex justify-between items-center mb-20">
                <h3 className="text-5xl font-black italic tracking-tighter serif text-gradient">Archives</h3>
                <button onClick={() => setIsHistoryOpen(false)} className="p-4 glass glass-hover rounded-full text-slate-500 hover:text-white transition-all">
                  <X className="w-10 h-10" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar space-y-8">
                {archivedChats.map(chat => (
                  <motion.div 
                    whileHover={{ x: -10 }}
                    key={chat.timestamp} 
                    onClick={() => loadArchivedChat(chat)}
                    className="p-12 glass glass-hover rounded-[3rem] cursor-pointer group relative"
                  >
                    <p className="text-2xl font-black group-hover:text-accent transition-colors serif">{chat.title}</p>
                    <div className="flex items-center gap-4 mt-6 mono">
                      <span className="text-[9px] font-black uppercase tracking-widest text-slate-600">{new Date(chat.timestamp).toLocaleDateString()}</span>
                      <span className="w-1 h-1 bg-slate-800 rounded-full" />
                      <span className="text-[9px] font-black uppercase tracking-widest text-slate-600">{chat.messages.length} NODES</span>
                    </div>
                    <button 
                      onClick={(e) => { e.stopPropagation(); deleteArchivedChat(chat.timestamp); }}
                      className="absolute top-10 right-10 p-4 opacity-0 group-hover:opacity-100 glass glass-hover text-red-500 rounded-2xl transition-all"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </motion.div>
                ))}
                {archivedChats.length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center text-center space-y-6">
                     <div className="w-20 h-20 rounded-full glass flex items-center justify-center">
                        <History className="w-8 h-8 text-slate-700" />
                     </div>
                     <p className="text-slate-600 italic text-xl serif">No logs found in neural storage.</p>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AssistantView;
