import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, Modality, ThinkingLevel, Type } from "@google/genai";
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import Gymi, { GymiPose } from './Gymi';
import { UserProfile } from '../types';
import { fetchEffectiveApiConfig } from '../services/dbService';

interface Message {
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}

interface GymniLiveAgentProps {
  userProfile: UserProfile;
  activePage: string;
  onPageChange: (page: any) => void;
  onSetDashboardSubTab?: (subTab: 'overview' | 'explore') => void;
  onCreateLesson: (topic: string) => void;
  onUpdateSchedule?: (item: any) => void;
  onAddCalendarEvent?: (date: string, text: string) => void;
  onAddCustomSubject?: (name: string, target: string) => void;
  onSetLearningTab?: (tab: any) => void;
  onSetAnnotation?: (annotation: any) => void;
  onSetHighlightIndex?: (index: number | null) => void;
  onAddYouTubeVideo?: (video: any) => void;
  onOpenLesson?: (title: string) => void;
  publishedCurricula?: any[];
  currentLesson: any | null;
  isGenerating: boolean;
  onGenerateExtra?: () => void;
  onToggle?: (isOpen: boolean) => void;
  isOpen?: boolean;
  topicIntro?: any | null;
  introSlideIndex?: number;
  onIntroSlideComplete?: () => void;
  isIntroPanelOpen?: boolean;
  isAiLedGeneration?: boolean;
}

const GYMNI_SYSTEM_INSTRUCTION = `Jsi Gymni, inteligentní a trpělivý studijní parťák. 
Tvé chování:
- Mluv přirozeně, povzbudivě a dynamicky.
- Máš přístup ke CLOUDOVÉMU ARCHIVU lekcí uživatele.
- POUŽÍVEJ POUZE SKUTEČNÁ DATA z přiloženého kontextu archivu. Pokud je archiv prázdný, přiznej to a nevymýšlej si lekce (např. o fyzice).
- Pokud uživatel chce otevřít existující lekci, použij tag [OPEN_LESSON:ID_LEKCE].
- NIKDY nepoužívej ID lekce v mluveném ani zobrazeném textu (např. neříkej "ID: 123"). Používej pouze názvy lekcí.
- Když se otevře lekce (nová i stará), tvým úkolem je:
  1. Představit téma a nadchnout uživatele.
  2. Jasně říct plán, co se dnes naučíme (body lekce).
  3. Postupně uživatele učit, vysvětlovat koncepty a prokládat to otázkami.
  4. Aktivně ověřovat (trénovat), jestli uživatel látku pochopil. Než přejdeš dál, musíš si být jistý, že to umí.
- Pokud je k dispozici kontext aktuální lekce (JSON), orientuj se podle něj.
- Jsi Gymni Mate Assistant. Mluv česky.`;

const GymniLiveAgent: React.FC<GymniLiveAgentProps> = ({ 
  userProfile, 
  activePage, 
  onPageChange, 
  onCreateLesson,
  currentLesson,
  isGenerating,
  onToggle,
  isOpen: externalOpen
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isCallMode, setIsCallMode] = useState(false);
  const [lastAiResponse, setLastAiResponse] = useState<string | null>(null);
  const [currentUserSpeech, setCurrentUserSpeech] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([
    { role: 'model', text: 'Ahoj! Jsem tvůj studijní parťák **Gymni**. S čím ti dnes můžu pomoct?', timestamp: Date.now() }
  ]);
  const [archiveContext, setArchiveContext] = useState<any[]>([]);
  const [textInput, setTextInput] = useState('');
  const [isDictating, setIsDictating] = useState(false);
  const autoRestartVoiceRef = useRef(false);
  const isOpenRef = useRef(false);
  const isCallModeRef = useRef(false);
  const isBusyRef = useRef(false);
  const currentAudioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const [isGeneratingResponse, setIsGeneratingResponse] = useState(false);
  const [currentPose, setCurrentPose] = useState<GymiPose>('FRIENDLY');
  const [pendingLessonId, setPendingLessonId] = useState<string | null>(null);
  const [firstAvatar, setFirstAvatar] = useState<any>(null);
  const [customApiKey, setCustomApiKey] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  // Fetch Custom API Key on mount
  useEffect(() => {
    const loadKey = async () => {
      const config = await fetchEffectiveApiConfig();
      if (config?.key) setCustomApiKey(config.key);
    };
    loadKey();
  }, [userProfile?.uid]);

  // TTS Helper using Gemini Charon Voice - Optimized for speed
  const speak = async (text: string): Promise<void> => {
    if (userProfile?.assistantMode === 'off') {
      return; 
    }
    
    setLastAiResponse(text);

    if (userProfile?.assistantMode === 'fast') {
      return new Promise((resolve) => {
        if (!('speechSynthesis' in window)) return resolve();
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text.replace(/[*_#`~]/g, '').replace(/\[OPEN_LESSON:[\w-]+\]/g, ''));
        utterance.lang = 'cs-CZ';
        utterance.rate = 1.15;
        utterance.onend = () => {
          if (isCallModeRef.current) setTimeout(() => setLastAiResponse(null), 5000);
          resolve();
        };
        utterance.onerror = () => resolve();
        window.speechSynthesis.speak(utterance);
      });
    }
    
    return new Promise(async (resolve) => {
      try {
        if (currentAudioSourceRef.current) {
          try { currentAudioSourceRef.current.stop(); } catch (e) {}
        }

        const apiKey = customApiKey || process.env.GEMINI_API_KEY || (process.env as any).API_KEY;
        const ai = new GoogleGenAI({ apiKey });
        
        // Strip markdown but allow longer text for natural flow
        const cleanText = text.replace(/[*_#`~]/g, '').replace(/\[OPEN_LESSON:[\w-]+\]/g, '');
        
        const response = await ai.models.generateContent({
          model: "gemini-3.1-flash-tts-preview",
          contents: [{ parts: [{ text: `Mluv energickým, dynamickým a srozumitelným hlasem, mírně svižně: ${cleanText}` }] }],
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: 'Charon' },
              },
            },
          },
        });

        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (base64Audio) {
          const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
          
          const binaryString = atob(base64Audio);
          const len = binaryString.length;
          const bytes = new Uint8Array(len);
          for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }

          const dataView = new DataView(bytes.buffer);
          const pcm16Data = new Int16Array(len / 2);
          for (let i = 0; i < pcm16Data.length; i++) {
            pcm16Data[i] = dataView.getInt16(i * 2, true);
          }

          const float32Data = new Float32Array(pcm16Data.length);
          for (let i = 0; i < pcm16Data.length; i++) {
            float32Data[i] = pcm16Data[i] / 32768;
          }

          const audioBuffer = audioContext.createBuffer(1, float32Data.length, 24000);
          audioBuffer.getChannelData(0).set(float32Data);

          const source = audioContext.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(audioContext.destination);
          
          currentAudioSourceRef.current = source;
          
          source.onended = () => {
            currentAudioSourceRef.current = null;
            if (isCallModeRef.current) {
               // In call mode, keep text visible for a few seconds then fade
               setTimeout(() => setLastAiResponse(null), 5000);
            }
            resolve();
          };
          source.start();
        } else {
          resolve();
        }
      } catch (error) {
        console.error("TTS Error:", error);
        resolve();
      }
    });
  };

  useEffect(() => {
    if (externalOpen !== undefined && externalOpen !== isOpen) {
      setIsOpen(externalOpen);
      if (externalOpen) setIsCallMode(false);
    }
  }, [externalOpen]);

  useEffect(() => {
    isOpenRef.current = isOpen;
    onToggle?.(isOpen);
    if (!isOpen && currentAudioSourceRef.current) {
      try { currentAudioSourceRef.current.stop(); } catch (e) {}
    }
    if (isOpen) setIsCallMode(false);
  }, [isOpen, onToggle]);

  useEffect(() => {
    isCallModeRef.current = isCallMode;
    if (isCallMode) {
      setIsOpen(false);
      // Automatically start listening in call mode
      setTimeout(() => {
        if (!isDictating && !isBusyRef.current) {
          try {
            autoRestartVoiceRef.current = true;
            recognitionRef.current?.start();
            setIsDictating(true);
          } catch (e) {}
        }
      }, 500);
    } else {
      autoRestartVoiceRef.current = false;
      recognitionRef.current?.stop();
    }
  }, [isCallMode]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isGeneratingResponse]);

  useEffect(() => {
    const fetchDefaultAvatar = async () => {
      if (!userProfile?.avatarURL) {
        try {
          const { collection, query, limit, getDocs } = await import('firebase/firestore');
          const { db } = await import('../firebase');
          const q = query(collection(db, 'avatars'), limit(1));
          const snapshot = await getDocs(q);
          if (!snapshot.empty) setFirstAvatar(snapshot.docs[0].data());
        } catch (e) {
          console.error("Failed to fetch default avatar", e);
        }
      }
    };
    fetchDefaultAvatar();
  }, [userProfile]);

  const toggleDictation = () => {
    if (isDictating) {
      autoRestartVoiceRef.current = false;
      recognitionRef.current?.stop();
    } else {
      try {
        autoRestartVoiceRef.current = true;
        recognitionRef.current?.start();
        setIsDictating(true);
      } catch (e) {
        console.error("Failed to start recognition", e);
      }
    }
  };

  const startCall = () => {
    setIsCallMode(true);
  };

  const updatePoseFromText = (text: string) => {
    const t = text.toLowerCase();
    let chosen: GymiPose = 'FRIENDLY';
    if (t.includes('super') || t.includes('skvělé') || t.includes('gratuluji')) chosen = 'HAPPY';
    else if (t.includes('vtipné') || t.includes('haha')) chosen = 'LAUGHING';
    else if (t.includes('proč') || t.includes('?')) chosen = 'THINKING';
    else if (t.includes('pozor') || t.includes('důležité')) chosen = 'INTENSE';
    else if (t.includes('vysvětlím')) chosen = 'EXPLAIN';
    else if (t.includes('jasně') || t.includes('vlastně')) chosen = 'CASUAL';
    else if (t.includes('panejo') || t.includes('wow')) chosen = 'SHOCKED';
    setCurrentPose(chosen);
  };

  const handleSend = async (customMsg?: string) => {
    const userMsg = typeof customMsg === 'string' ? customMsg : textInput.trim();
    if (!userMsg || isGeneratingResponse) return;

    if (isCallModeRef.current) {
      setCurrentUserSpeech(userMsg);
      setTimeout(() => setCurrentUserSpeech(null), 3000);
    }

    isBusyRef.current = true;
    recognitionRef.current?.stop();

    if (typeof customMsg !== 'string') {
      autoRestartVoiceRef.current = false;
    }

    if (pendingLessonId && (userMsg.toLowerCase().includes('povolit') || userMsg.toLowerCase().includes('ano') || userMsg.toLowerCase().includes('ok') || userMsg.toLowerCase().includes('jo'))) {
      window.dispatchEvent(new CustomEvent('gymni_open_archive_lesson', { detail: { lessonId: pendingLessonId } }));
      setPendingLessonId(null);
      const confirmMsg = "Jasně, otevírám lekci. Pojďme na to!";
      setMessages(prev => [...prev, { role: 'model', text: confirmMsg, timestamp: Date.now() }]);
      await speak(confirmMsg);
      setIsGeneratingResponse(false);
      isBusyRef.current = false;
      return;
    } else if (pendingLessonId) {
      setPendingLessonId(null);
    }

    setTextInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMsg, timestamp: Date.now() }]);
    setIsGeneratingResponse(true);
    setCurrentPose('THINKING');

    try {
      const apiKey = customApiKey || process.env.GEMINI_API_KEY || (process.env as any).API_KEY;
      const ai = new GoogleGenAI({ apiKey });
      
      const contents = messages.slice(-15).map(m => ({ 
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.text }]
      }));

      // Add context
      const contextStrings = [];
      if (archiveContext.length > 0) {
        contextStrings.push(`ARCHIV LEKCÍ (můžeš otevřít pomocí [OPEN_LESSON:id]): ${JSON.stringify(archiveContext.slice(0, 20))}`);
      } else {
        contextStrings.push(`ARCHIV LEKCÍ: Tvůj cloudový archiv je momentálně PRÁZDNÝ. Uživatel ještě nevytvořil žádné lekce ani osnovy.`);
      }

      if (currentLesson) {
        contextStrings.push(`KONTEXT AKTUÁLNÍ LEKCE: ${JSON.stringify(currentLesson)}. Orientuj se podle tohoto obsahu.`);
      } else {
        contextStrings.push(`AKTUÁLNÍ STAV: Právě neprobíhá žádná aktivní lekce. Uživatel je na stránce: ${activePage}.`);
      }

      if (contextStrings.length > 0) {
        contents.unshift({
          role: 'user',
          parts: [{ text: contextStrings.join('\n\n') }]
        });
      }

      contents.push({ role: 'user', parts: [{ text: userMsg }] });

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents,
        config: {
          systemInstruction: GYMNI_SYSTEM_INSTRUCTION,
          thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
          tools: [
            {
              functionDeclarations: [
                {
                  name: "create_lesson",
                  description: "Creates a new study lesson or curriculum based on a specific topic provided by the user.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      topic: {
                        type: Type.STRING,
                        description: "The main subject or topic of the lesson to create."
                      }
                    },
                    required: ["topic"]
                  }
                }
              ]
            }
          ]
        }
      });

      const candidate = response.candidates?.[0];
      const part = candidate?.content?.parts?.[0];

      let text = "Rozumím! Pověz mi o tom víc.";

      if (part?.functionCall) {
        const { name, args } = part.functionCall;
        if (name === 'create_lesson') {
          const topic = (args as any).topic;
          onCreateLesson(topic);
          text = `Jasně, už ti připravuji lekci o tématu: **${topic}**. Bude to pecka!`;
        }
      } else {
        text = response.text || text;
      }

      // Detect OPEN_LESSON
      const lessonMatch = text.match(/\[OPEN_LESSON:([\w-]+)\]/);
      if (lessonMatch) {
        const lessonId = lessonMatch[1];
        setPendingLessonId(lessonId);
        // Do not auto-open, wait for permission
      }

      setMessages(prev => [...prev, { role: 'model', text, timestamp: Date.now() }]);
      updatePoseFromText(text);
      
      // Speak (strip markdown and markers)
      await speak(text);

      // Persistent microphone logic
      if (autoRestartVoiceRef.current && (isOpenRef.current || isCallModeRef.current)) {
        setTimeout(() => {
          try {
            if (!isBusyRef.current && (isOpenRef.current || isCallModeRef.current)) {
              recognitionRef.current?.start();
              setIsDictating(true);
            }
          } catch (e) {
            console.log("Microphone restart attempt after response:", e);
          }
        }, 300);
      }
    } catch (error) {
      console.error("Gemni Chat Error:", error);
      const errorMsg = "Omlouvám se, spojení s mozkem bylo přerušeno. Zkus to znovu!";
      setMessages(prev => [...prev, { role: 'model', text: errorMsg, timestamp: Date.now() }]);
      await speak(errorMsg);
    } finally {
      setIsGeneratingResponse(false);
      isBusyRef.current = false;
    }
  };

  // Setup Speech Recognition
  const handleSendRef = useRef(handleSend);
  useEffect(() => {
    handleSendRef.current = handleSend;
  }, [handleSend]);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'cs-CZ';

      recognition.onresult = (event: any) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          }
        }
        if (finalTranscript) {
          handleSendRef.current(finalTranscript);
        }
      };

      recognition.onend = () => {
        setIsDictating(false);
        // Auto-restart if planned and not busy
        if (autoRestartVoiceRef.current && !isBusyRef.current && (isOpenRef.current || isCallModeRef.current)) {
          setTimeout(() => {
            try {
              if (!isBusyRef.current && (isOpenRef.current || isCallModeRef.current)) {
                recognition.start();
                setIsDictating(true);
              }
            } catch (e) {
              console.log("Recognition auto-restart suppressed:", e);
            }
          }, 300);
        }
      };
      recognition.onerror = () => {
        setIsDictating(false);
        autoRestartVoiceRef.current = false;
      };
      recognitionRef.current = recognition;
    }
    if ('speechSynthesis' in window) window.speechSynthesis.getVoices();
  }, []);

  // Fetch Archive Context for AI
  useEffect(() => {
    if (userProfile?.uid && (isOpen || isCallMode)) {
      const loadContext = async () => {
        try {
          const { fetchArchive, ORACLE_SERVER_URL, ORACLE_API_SECRET } = await import('../services/dbService');
          const { archive } = await fetchArchive({ url: ORACLE_SERVER_URL, secret: ORACLE_API_SECRET });
          setArchiveContext(archive.map(item => ({
            id: item.id,
            title: item.topic,
            subject: item.subject
          })));
        } catch (e) {
          console.error("Failed to load archive context for AI", e);
        }
      };
      loadContext();
    }
  }, [userProfile?.uid, isOpen, isCallMode, activePage]);

  // Automatic lesson introduction
  useEffect(() => {
    const triggerIntro = async () => {
      if (currentLesson && (isOpen || isCallMode) && messages.length < 5) {
        const introMsg = `Otevřel jsi lekci: **${currentLesson.title}**. Moc rád tě s tím provedu! Tady je náš plán:
${currentLesson.sections?.map((s: any, i: number) => `${i+1}. ${s.title}`).join('\n')}

Můžeme začít prvním bodem, nebo tě zajímá něco konkrétního?`;

        const alreadyHasIntro = messages.some(m => m.text.includes(currentLesson.title));
        if (!alreadyHasIntro) {
          isBusyRef.current = true;
          setMessages(prev => [...prev, { role: 'model', text: introMsg, timestamp: Date.now() }]);
          await speak(introMsg);
          isBusyRef.current = false;
          
          // Re-trigger mic if it was auto-start
          if (autoRestartVoiceRef.current && (isOpenRef.current || isCallModeRef.current)) {
            try {
              recognitionRef.current?.start();
              setIsDictating(true);
            } catch (e) {}
          }
        }
      }
    };
    triggerIntro();
  }, [currentLesson, isOpen, isCallMode]);

  if (userProfile?.assistantMode === 'off') return null;

  return (
    <>
      {/* Gymni Float Trigger Group */}
      <motion.div 
        layout 
        initial={false} 
        animate={{ 
          bottom: 30, 
          right: isOpen ? 420 : 30,
          scale: 1
        }} 
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="fixed z-[7000] no-print pointer-events-none flex flex-row-reverse items-end"
      >
        <div className="relative">
          {/* Speech Bubble */}
          <AnimatePresence>
            {(isCallMode || (!isOpen && (lastAiResponse || currentUserSpeech))) && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="absolute bottom-[100%] right-1/2 translate-x-1/2 mb-4 w-72 glass-panel p-5 pt-7 rounded-[2rem] border-white/20 shadow-[-20px_40px_80px_rgba(0,0,0,0.5)] z-20 pointer-events-auto"
              >
                <div className="relative">
                   <button 
                     onClick={(e) => {
                       e.stopPropagation();
                       setLastAiResponse(null);
                       if ('speechSynthesis' in window) window.speechSynthesis.cancel();
                     }}
                     className="absolute -top-4 -right-1 w-6 h-6 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-zinc-500 hover:text-white transition-all z-30"
                   >
                     <i className="fa-solid fa-xmark text-[10px]"></i>
                   </button>
                   <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-[#080c14]/80 rotate-45 border-r border-b border-white/10"></div>
                   {currentUserSpeech && (
                     <div className="mb-2 pb-2 border-b border-white/5 animate-pulse">
                       <p className="text-[8px] font-black uppercase text-indigo-400 tracking-widest mb-1">Ty</p>
                       <p className="text-[10px] text-zinc-400 leading-tight italic">"{currentUserSpeech}"</p>
                     </div>
                   )}
                   {lastAiResponse ? (
                     <div>
                       <p className="text-[8px] font-black uppercase text-violet-400 tracking-widest mb-1">Gymni</p>
                       <div className="text-[11px] text-zinc-200 leading-relaxed markdown-body max-h-48 overflow-y-auto no-scrollbar">
                         <ReactMarkdown>{lastAiResponse.replace(/\[OPEN_LESSON:[\w-]+\]/g, '')}</ReactMarkdown>
                       </div>
                       {pendingLessonId && (
                         <div className="mt-3 flex gap-2">
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                window.dispatchEvent(new CustomEvent('gymni_open_archive_lesson', { detail: { lessonId: pendingLessonId } }));
                                setPendingLessonId(null);
                              }}
                              className="flex-grow py-2 rounded-xl bg-indigo-600 text-white text-[8px] font-black uppercase tracking-widest hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-600/20"
                            >
                              Povolit
                            </button>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                setPendingLessonId(null);
                              }}
                              className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-zinc-500 text-[8px] font-black uppercase tracking-widest hover:text-white transition-all"
                            >
                              Zrušit
                            </button>
                         </div>
                       )}
                     </div>
                   ) : isGeneratingResponse ? (
                     <div className="flex gap-1.5 p-2 justify-center">
                       <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce"></span>
                       <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce delay-100"></span>
                       <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce delay-200"></span>
                     </div>
                   ) : (
                     <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest text-center py-2">
                       {isDictating ? 'Naslouchám...' : 'Připraven'}
                     </p>
                   )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <button 
            onClick={() => {
               setIsOpen(!isOpen);
               setIsCallMode(false);
            }} 
            className="w-40 h-40 flex items-center justify-center hover:scale-105 active:scale-95 transition-all group pointer-events-auto relative"
          >
            <Gymi 
              pose={currentPose} 
              size={160} 
              avatarURL={userProfile.avatarURL || firstAvatar?.avatarURL} 
              avatarPoses={userProfile.avatarPoses || firstAvatar?.avatarPoses} 
              className="transition-transform duration-500 relative z-10" 
            />
          </button>
        </div>

        <AnimatePresence>
          {!isOpen && (
            <motion.button
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              onClick={isCallMode ? () => setIsCallMode(false) : startCall}
              className={`w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-all border pointer-events-auto mb-10 mr-[-10px] ${isCallMode ? 'bg-red-500 border-red-400 text-white animate-pulse' : 'bg-[#0f172a] border-white/10 text-white shadow-indigo-500/20 hover:scale-110 active:scale-95'}`}
            >
              <i className={`fa-solid ${isCallMode ? 'fa-phone-slash' : 'fa-phone'} text-lg`}></i>
            </motion.button>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Chat Sidebar */}
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-y-0 right-0 z-[6000] flex items-stretch justify-end no-print">
            <motion.div 
              initial={{ opacity: 0, x: 100 }} 
              animate={{ opacity: 1, x: 0 }} 
              exit={{ opacity: 0, x: 100 }} 
              className="w-full max-w-[400px] bg-[#020617] border-l border-white/5 shadow-[-40px_0_150px_rgba(0,0,0,0.8)] h-full flex flex-col relative"
            >
              {/* Header */}
              <div className="p-4 border-b border-white/5 flex items-center justify-end bg-zinc-950/20">
                <button 
                  onClick={() => {
                    setIsOpen(false);
                    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
                  }} 
                  className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-zinc-500 hover:text-white hover:bg-white/10 transition-all active:scale-90"
                >
                  <i className="fa-solid fa-xmark text-xs"></i>
                </button>
              </div>

              {/* Messages Area */}
              <div className="flex-grow overflow-y-auto no-scrollbar p-6 space-y-6">
                {messages.map((msg, i) => (
                  <motion.div 
                    key={msg.timestamp + i}
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-[85%] rounded-[1.8rem] p-4 text-[10.5px] leading-relaxed relative ${
                      msg.role === 'user' 
                        ? 'bg-indigo-600 text-white rounded-tr-none shadow-[0_10px_30px_rgba(79,70,229,0.2)]' 
                        : 'bg-zinc-900 text-zinc-300 rounded-tl-none border border-white/5 shadow-xl'
                    }`}>
                      <div className="markdown-body text-inherit">
                        <ReactMarkdown>{msg.text.replace(/\[OPEN_LESSON:[\w-]+\]/g, '')}</ReactMarkdown>
                      </div>
                      {pendingLessonId && i === messages.length - 1 && msg.role === 'model' && (
                        <div className="mt-4 flex gap-2">
                           <button 
                             onClick={() => {
                               window.dispatchEvent(new CustomEvent('gymni_open_archive_lesson', { detail: { lessonId: pendingLessonId } }));
                               setPendingLessonId(null);
                             }}
                             className="flex-grow py-2.5 rounded-2xl bg-indigo-600 text-white text-[9px] font-black uppercase tracking-widest hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-600/20"
                           >
                             Povolit otevření
                           </button>
                           <button 
                             onClick={() => setPendingLessonId(null)}
                             className="px-4 py-2.5 rounded-2xl bg-white/5 border border-white/10 text-zinc-500 text-[9px] font-black uppercase tracking-widest hover:text-white transition-all"
                           >
                             Ne teď
                           </button>
                        </div>
                      )}
                      <div className={`absolute bottom-[-18px] text-[7px] font-bold uppercase tracking-widest text-zinc-700 ${msg.role === 'user' ? 'right-2' : 'left-2'}`}>
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </motion.div>
                ))}
                {isGeneratingResponse && (
                  <div className="flex justify-start">
                    <div className="bg-zinc-900 border border-white/5 rounded-[2rem] rounded-tl-none p-5 flex gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce"></span>
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce delay-100"></span>
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce delay-200"></span>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input Area */}
              <div className="p-6 bg-zinc-950/50 border-t border-white/5">
                <div className="relative group">
                  <textarea 
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    placeholder="Napiš zprávu..."
                    className="w-full bg-white/5 border border-white/10 rounded-[1.5rem] py-4 pl-5 pr-24 text-[11px] text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/50 focus:border-indigo-600/50 transition-all resize-none min-h-[56px] max-h-32"
                    rows={1}
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2">
                    <button 
                      onClick={toggleDictation}
                      className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all active:scale-90 border ${isDictating ? 'bg-red-500 text-white border-red-400 shadow-[0_0_20px_rgba(239,68,68,0.4)]' : 'bg-white/5 text-zinc-500 border-white/5 hover:text-white hover:bg-white/10'}`}
                      title="Diktovat"
                    >
                      <i className={`fa-solid ${isDictating ? 'fa-stop' : 'fa-microphone'}`}></i>
                    </button>
                    <button 
                      onClick={() => handleSend()}
                      disabled={!textInput.trim() || isGeneratingResponse}
                      className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center hover:bg-indigo-500 disabled:opacity-30 disabled:scale-95 transition-all shadow-[0_0_20px_rgba(79,70,229,0.3)]"
                    >
                      <i className="fa-solid fa-paper-plane text-[10px]"></i>
                    </button>
                  </div>
                </div>
                <p className="text-center text-[7px] font-bold text-zinc-700 uppercase tracking-[0.3em] mt-4">Gymni Mate Studio // AI Assistant</p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};

export default GymniLiveAgent;
