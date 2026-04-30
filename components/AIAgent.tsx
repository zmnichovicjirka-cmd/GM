
import React, { useState, useRef, useEffect } from 'react';
import { StudyResult, UserProfile, Assistant } from '../types';
import { agentContextResponse, refineStudy } from '../services/geminiService';
import { FormattedText } from './StudyOutput';
import Gymi, { GymiPose } from './Gymi';
import { collection, query, limit, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { handleFirestoreError, OperationType } from '../services/dbService';

interface AIAgentProps {
  currentContext: StudyResult | null;
  userProfile: UserProfile;
  onUpdateResult?: (newResult: StudyResult) => void;
  onGenerateTopic?: (topic: string) => void;
  topicIntro?: { subjectName: string, what: string, why: string } | null;
  isEmbedded?: boolean;
}

const AIAgent: React.FC<AIAgentProps> = ({ 
  currentContext, 
  userProfile, 
  onUpdateResult, 
  onGenerateTopic, 
  topicIntro,
  isEmbedded = false
}) => {
  const [isOpen, setIsOpen] = useState(isEmbedded);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [messages, setMessages] = useState<{ role: 'user' | 'ai', content: string, actions?: { type: 'update_lesson' | 'create_lesson', payload: any, label: string }[] }[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [pose, setPose] = useState<GymiPose>('idle');
  const [firstAvatar, setFirstAvatar] = useState<Assistant | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (isLoading) {
      setPose('thinking');
    } else {
      setPose('idle');
    }
  }, [isLoading]);

  // Handle posing based on AI messages
  useEffect(() => {
    if (messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.role === 'ai') {
        const text = lastMsg.content.toLowerCase();
        if (text.includes('skvělý') || text.includes('dobrý') || text.includes('super')) setPose('happy');
        else if (text.includes('?') || text.includes('nechápete')) setPose('thinking');
        else if (text.includes('rozumím') || text.includes('jasně')) setPose('pointing');
        else if (text.includes('bohužel') || text.includes('chyba')) setPose('surprised');
        else setPose('idle');
      }
    }
  }, [messages]);

  // Initialize Speech Recognition
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'cs-CZ';

      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInput(prev => prev + (prev.length > 0 ? ' ' : '') + transcript);
        setIsListening(false);
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error("Speech recognition error", event.error);
        setIsListening(false);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    }
  }, []);

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      setIsListening(true);
      recognitionRef.current?.start();
    }
  };

  // Fetch first available avatar for guest/new users
  useEffect(() => {
    const fetchAvatar = async () => {
      const avatarsPath = 'avatars';
      if (!userProfile?.avatarURL) {
        try {
          const q = query(collection(db, avatarsPath), limit(1));
          const snap = await getDocs(q);
          if (!snap.empty) {
            setFirstAvatar(snap.docs[0].data() as Assistant);
          }
        } catch (e) {
          handleFirestoreError(e, OperationType.GET, avatarsPath);
          console.error("Agent: Failed to fetch default avatar", e);
        }
      }
    };
    fetchAvatar();
  }, [userProfile?.avatarURL]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (isLoading) {
      setPose('thinking');
    } else if (messages.length > 0 && messages[messages.length - 1].role === 'ai') {
      setPose('happy');
      const timer = setTimeout(() => setPose('idle'), 3000);
      return () => clearTimeout(timer);
    } else {
      setPose('idle');
    }
  }, [isLoading, messages]);

  useEffect(() => {
    const handleOpenChat = (e: any) => {
      const { message } = e.detail;
      setIsOpen(true);
      if (message) {
        handleSend(message);
      }
    };
    window.addEventListener('open-agent-chat', handleOpenChat);
    return () => window.removeEventListener('open-agent-chat', handleOpenChat);
  }, [currentContext, messages]);

  useEffect(() => {
    if (topicIntro) {
      setIsOpen(true);
      const subject = topicIntro.subjectName || "Studium";
      const what = topicIntro.what || "Zpracovávám téma...";
      const why = topicIntro.why || "To se brzy dozvíš!";
      
      setMessages(prev => [
        ...prev, 
        { 
          role: 'ai', 
          content: `### 🧠 Neural Update: ${subject}\n\nJasně, jdeme na to! Téma jsem ti zařadil do předmětu **${subject}**.\n\n**🔍 O co jde?**\n${what}\n\n**💡 Proč se to naučit?**\n${why}\n\n*Mezitím co si to pročítáš, už ti na pozadí připravuji kompletní rozbor a interaktivní materiály...*`
        }
      ]);
      setPose('happy');
    }
  }, [topicIntro]);

  const handleSend = async (overrideMsg?: string) => {
    const msg = overrideMsg || input;
    if (!msg.trim() || !currentContext || isLoading) return;
    if (!overrideMsg) setInput('');
    setMessages(prev => [...prev, { role: 'user', content: msg }]);
    setIsLoading(true);

    try {
      const res = await agentContextResponse(msg, currentContext, messages);
      setMessages(prev => [...prev, { role: 'ai', content: res.message, actions: res.actions }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'ai', content: "Mám dočasný výpadek, zkus to za chvilku." }]);
      setPose('surprised');
    } finally {
      setIsLoading(false);
    }
  };

  const executeAction = async (action: { type: 'update_lesson' | 'create_lesson', payload: any, label: string }) => {
    if (action.type === 'create_lesson') {
      onGenerateTopic?.(action.payload);
      setIsOpen(false);
    } else if (action.type === 'update_lesson') {
      setIsLoading(true);
      try {
        const updated = await refineStudy(currentContext, action.payload);
        onUpdateResult?.(updated);
        setMessages(prev => [...prev, { role: 'ai', content: `Hotovo! Rozbor byl upraven: ${action.payload}` }]);
      } catch (e) {
        setMessages(prev => [...prev, { role: 'ai', content: "Nepodařilo se mi rozbor upravit." }]);
      } finally {
        setIsLoading(false);
      }
    }
  };

  if (!currentContext && !isEmbedded) return null;

  const chatUI = (
    <div className={`${isEmbedded ? 'w-full h-full border-none shadow-none bg-transparent' : (isFullScreen ? 'w-full h-full rounded-none' : 'w-[450px] h-[650px] rounded-[3.5rem] bg-zinc-950 border border-white/15 shadow-[0_50px_150px_rgba(0,0,0,1)]')} flex flex-col overflow-hidden animate-fade backdrop-blur-3xl relative group`}>
      {/* Decorative Glow */}
      {!isEmbedded && <div className="absolute -top-24 -left-24 w-64 h-64 bg-indigo-500/10 rounded-full blur-[100px] pointer-events-none group-hover:bg-indigo-500/20 transition-all duration-1000"></div>}
      
      {!isEmbedded && (
        <div className="p-8 border-b border-white/5 bg-gradient-to-r from-indigo-600/10 to-transparent flex items-center justify-between relative z-10">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-transparent flex items-center justify-center text-white shadow-2xl overflow-hidden border border-white/10 relative group/avatar">
              <div className={`absolute inset-0 bg-indigo-500/20 animate-pulse ${isLoading ? 'opacity-100' : 'opacity-0'}`}></div>
              <Gymi 
                pose={pose} 
                size={60} 
                className="scale-125 relative z-10" 
                avatarURL={userProfile.avatarURL || firstAvatar?.avatarURL}
                avatarPoses={userProfile.avatarPoses || firstAvatar?.avatarPoses}
              />
            </div>
            <div>
              <p className="text-[10px] font-mono font-black uppercase text-indigo-400 tracking-[0.3em] mb-1">Neural AI :: 01</p>
              <p className="text-xs text-white font-black uppercase tracking-tight truncate max-w-[200px]">{currentContext?.title || "Systémový asistent"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setIsFullScreen(!isFullScreen)} 
              className="w-10 h-10 rounded-full hover:bg-white/5 text-zinc-500 hover:text-white transition-all flex items-center justify-center"
              title={isFullScreen ? "Zmenšit" : "Na celou obrazovku"}
            >
              <i className={`fa-solid ${isFullScreen ? 'fa-compress' : 'fa-expand'}`}></i>
            </button>
            <button onClick={() => { setIsOpen(false); setIsFullScreen(false); }} className="w-10 h-10 rounded-full hover:bg-white/5 text-zinc-500 hover:text-white transition-all flex items-center justify-center">
              <i className="fa-solid fa-xmark"></i>
            </button>
          </div>
        </div>
      )}
      
      <div className={`flex-grow overflow-y-auto ${isEmbedded ? 'px-0 py-8' : 'p-8'} space-y-8 no-scrollbar relative z-10 scroll-smooth`} ref={scrollRef}>
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center px-10 gap-8">
            <div className="relative">
              <div className="absolute inset-0 bg-indigo-500/20 blur-3xl rounded-full scale-150 animate-pulse"></div>
              <Gymi 
                pose="waving" 
                size={isEmbedded ? 140 : 180} 
                className="relative z-10"
                avatarURL={userProfile.avatarURL || firstAvatar?.avatarURL}
                avatarPoses={userProfile.avatarPoses || firstAvatar?.avatarPoses}
              />
            </div>
            <div className="space-y-4">
              <p className="text-[11px] font-mono font-black uppercase tracking-[0.5em] text-indigo-400">Memory Loaded // Link OK</p>
              <p className="text-sm font-bold text-zinc-400 leading-relaxed italic-serif-header uppercase tracking-tighter">„Jsem připraven ti pomoci. Ptej se na cokoliv.“</p>
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex gap-4 ${m.role === 'user' ? 'flex-row-reverse' : 'flex-row'} items-start animate-fade-up`}>
             {m.role === 'ai' && (
               <div className="w-12 h-12 rounded-xl bg-transparent border border-white/10 flex-shrink-0 flex items-center justify-center overflow-hidden shadow-xl mt-2">
                  <Gymi 
                    pose={i === messages.length - 1 ? pose : 'idle'}
                    size={35}
                    className="scale-125"
                    avatarURL={userProfile.avatarURL || firstAvatar?.avatarURL}
                    avatarPoses={userProfile.avatarPoses || firstAvatar?.avatarPoses}
                  />
               </div>
             )}
            <div className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'} flex-grow min-w-0`}>
              <div className={`p-6 rounded-[2rem] shadow-2xl relative ${m.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-white/5 border border-white/10 rounded-tl-none'}`}>
                <div className={`absolute top-0 ${m.role === 'user' ? 'right-0 -translate-y-full pb-2' : 'left-0 -translate-y-full pb-2'}`}>
                    <span className="text-[8px] font-mono font-black uppercase tracking-widest text-zinc-600">
                      {m.role === 'user' ? 'Ty' : 'Neural Agent'}
                    </span>
                </div>
                {m.role === 'ai' ? <FormattedText text={m.content} className="text-sm font-medium leading-relaxed" /> : <p className="text-sm font-bold leading-relaxed">{m.content}</p>}
              </div>
              {m.actions && m.actions.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-4">
                  {m.actions.map((a, ai) => (
                    <button 
                      key={ai} 
                      onClick={() => executeAction(a)}
                      className="px-5 py-2.5 rounded-2xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[10px] font-black uppercase tracking-widest hover:bg-indigo-600 hover:text-white transition-all shadow-lg hover:shadow-indigo-500/20"
                    >
                      <i className="fa-solid fa-bolt mr-2 text-[8px]"></i>
                      {a.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex gap-4 items-start animate-pulse">
            <div className="w-12 h-12 rounded-xl bg-transparent border border-white/10 flex-shrink-0"></div>
            <div className="w-24 h-12 rounded-[2rem] bg-white/5 border border-white/10"></div>
          </div>
        )}
        <div ref={scrollRef} className="h-4" />
      </div>
      
      <div className={`p-8 ${isEmbedded ? 'px-0' : ''} bg-zinc-950/80 backdrop-blur-xl relative z-20`}>
        <div className="flex gap-3 bg-black/40 p-2 rounded-3xl border border-white/5 group-focus-within:border-indigo-500/30 transition-all">
          <button 
            onClick={toggleListening}
            className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all ${isListening ? 'bg-red-500 text-white animate-pulse' : 'bg-white/5 text-zinc-500 hover:text-white hover:bg-white/10'}`}
            title="Mluvit"
          >
            <i className={`fa-solid ${isListening ? 'fa-microphone-lines' : 'fa-microphone'} text-lg`}></i>
          </button>
          <input 
            className="flex-grow bg-transparent p-4 text-sm text-zinc-100 focus:outline-none placeholder:text-zinc-700 font-medium"
            placeholder={isListening ? "Poslouchám..." : "Zeptej se asistenta..."}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
          />
          <button 
            onClick={() => handleSend()} 
            className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-xl hover:bg-indigo-500 transition-all active:scale-95 disabled:opacity-20 disabled:grayscale"
            disabled={!input.trim() || isLoading}
          >
            <i className="fa-solid fa-paper-plane text-sm"></i>
          </button>
        </div>
      </div>
    </div>
  );

  if (isEmbedded) return chatUI;

  return null;
};

export default AIAgent;
