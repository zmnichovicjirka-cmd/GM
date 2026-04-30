
import React, { useState, useRef, useEffect } from 'react';
import { chatWithVerifiedInfo } from '../services/geminiService';
import { FormattedText } from './StudyOutput';
import { StudyFile, YouTubeVideo, WebPage, VerifiedInfo, UserProfile } from '../types';
import Gymi from './Gymi';
import { motion } from 'motion/react';

interface VerificationPanelProps {
  verifiedInfo: VerifiedInfo | null;
  isVerifying?: boolean;
  selectedSources: string[];
  onSelectSources: (uris: string[]) => void;
  onGenerate: () => void;
  onReset: () => void;
  userProfile: UserProfile;
  firstAvatar?: any;
  
  // Tone
  tone: 'student' | 'expert' | 'creative';
  onSelectTone: (tone: 'student' | 'expert' | 'creative') => void;

  // Provided sources props
  providedSources: {
    images: string[];
    files: StudyFile[];
    ytVideos: YouTubeVideo[];
    webPages: WebPage[];
  };
  selectedFiles: string[];
  onSelectFiles: (names: string[]) => void;
  selectedImages: number[];
  onSelectImages: (indices: number[]) => void;
  selectedYtVideos: string[];
  onSelectYtVideos: (urls: string[]) => void;
  selectedWebPages: string[];
  onSelectWebPages: (urls: string[]) => void;
}

const VerificationPanel: React.FC<VerificationPanelProps> = ({ 
  verifiedInfo, isVerifying, selectedSources, onSelectSources, onGenerate, onReset,
  tone, onSelectTone,
  providedSources, selectedFiles, onSelectFiles, selectedImages, onSelectImages,
  selectedYtVideos, onSelectYtVideos, selectedWebPages, onSelectWebPages,
  userProfile, firstAvatar
}) => {
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState<{role: 'user' | 'model', text: string, time: string}[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatHistory, isChatLoading]);

  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isChatLoading || !verifiedInfo) return;

    const userMsg = chatInput.trim();
    const now = new Date().toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
    setChatInput('');
    setChatHistory(prev => [...prev, { role: 'user', text: userMsg, time: now }]);
    setIsChatLoading(true);

    try {
      const response = await chatWithVerifiedInfo(userMsg, verifiedInfo.summary, chatHistory.map(h => ({ role: h.role, text: h.text })));
      setChatHistory(prev => [...prev, { role: 'model', text: response, time: new Date().toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' }) }]);
    } catch (error) {
      setChatHistory(prev => [...prev, { role: 'model', text: 'Omlouvám se, ale nepodařilo se mi odpovědět. Zkuste to prosím znovu.', time: now }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const toggleFile = (name: string) => {
    onSelectFiles(selectedFiles.includes(name) ? selectedFiles.filter(n => n !== name) : [...selectedFiles, name]);
  };

  const toggleImage = (idx: number) => {
    onSelectImages(selectedImages.includes(idx) ? selectedImages.filter(i => i !== idx) : [...selectedImages, idx]);
  };

  const toggleYt = (url: string) => {
    onSelectYtVideos(selectedYtVideos.includes(url) ? selectedYtVideos.filter(u => u !== url) : [...selectedYtVideos, url]);
  };

  const toggleWeb = (url: string) => {
    onSelectWebPages(selectedWebPages.includes(url) ? selectedWebPages.filter(u => u !== url) : [...selectedWebPages, url]);
  };

  const toggleVerified = (uri: string) => {
    onSelectSources(selectedSources.includes(uri) ? selectedSources.filter(u => u !== uri) : [...selectedSources, uri]);
  };

  return (
    <div className="w-full max-w-[1240px] mx-auto animate-fade">
      <div className="bg-zinc-950 border border-white/10 rounded-[2.5rem] shadow-[0_50px_150px_rgba(0,0,0,1)] overflow-hidden flex flex-col lg:flex-row h-[720px] relative">
        {/* Left Column: Assistant & Stats */}
        <div className="lg:w-[35%] bg-transparent p-10 flex flex-col items-center justify-between border-b lg:border-b-0 lg:border-r border-white/5 relative shrink-0">
          <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent pointer-events-none" />
          
          <div className="flex-grow flex flex-col items-center justify-center gap-8 relative z-10 w-full">
            <div className="relative group -mt-16">
              <div className="absolute inset-0 bg-indigo-500/10 blur-[80px] rounded-full scale-125 group-hover:scale-150 transition-all duration-1000"></div>
              <Gymi 
                pose={isVerifying ? 'THINKING' : 'FRIENDLY'} 
                size={400} 
                className="relative z-10 drop-shadow-[0_20px_50px_rgba(0,0,0,0.8)] -ml-4"
                avatarURL={userProfile.avatarURL || firstAvatar?.avatarURL} 
                avatarPoses={userProfile.avatarPoses || firstAvatar?.avatarPoses} 
              />
            </div>
            
            <div className="text-center space-y-4 w-full">
              <p className="hidden text-[10px] font-mono font-black uppercase text-indigo-400 tracking-[0.4em]">Neural Analyst Phase</p>
              <h3 className="text-3xl font-black text-white uppercase tracking-tighter italic leading-none">{isVerifying ? 'Verifikace...' : 'Data Vytěžena'}</h3>
              
              <div className="space-y-4 bg-white/5 border border-white/5 p-6 rounded-[2rem] text-left">
                <div className="flex items-center justify-between">
                   <span className="text-[9px] font-mono uppercase text-zinc-500 tracking-widest">Extrakce kontextu</span>
                   <span className={`text-[9px] font-mono ${isVerifying ? 'text-indigo-400 animate-pulse' : 'text-emerald-400'}`}>{isVerifying ? 'BĚŽÍ' : 'DOKONČENO'}</span>
                </div>
                <div className="flex items-center justify-between">
                   <span className="text-[9px] font-mono uppercase text-zinc-500 tracking-widest">Identifikované zdroje</span>
                   <span className="text-[9px] font-mono text-white">{(providedSources.files.length + providedSources.images.length + providedSources.ytVideos.length + providedSources.webPages.length)}</span>
                </div>
                <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden mt-4">
                   <motion.div 
                     initial={{ width: 0 }}
                     animate={{ width: isVerifying ? '65%' : '100%' }}
                     className="h-full bg-indigo-600 shadow-[0_0_10px_rgba(79,70,229,0.5)]"
                   />
                </div>
              </div>
            </div>
          </div>

          <div className="relative z-10 w-full pt-8 border-t border-white/5">
             <button 
               onClick={onReset}
               className="w-full flex items-center justify-center gap-3 py-4 text-zinc-500 hover:text-white transition-colors text-[10px] font-black uppercase tracking-widest active:scale-95"
             >
               <i className="fa-solid fa-arrow-left"></i>
               Změnit zdroje dat
             </button>
          </div>
        </div>

        {/* Center: Data Sources & Results */}
        <div className="flex-grow flex flex-col min-w-0 bg-zinc-950/40 backdrop-blur-xl border-r border-white/5">
          <div className="p-8 border-b border-white/5 flex items-center justify-between shrink-0 bg-zinc-950/40">
             <div>
                <h4 className="text-[10px] font-black uppercase tracking-[0.4em] text-indigo-500 mb-1">Knowledge Core Output</h4>
                <p className="text-2xl font-black text-white uppercase tracking-tighter italic">Vytěžená data</p>
             </div>
             <div className="flex gap-2">
                {['student', 'expert', 'creative'].map((t) => (
                   <button
                     key={t}
                     onClick={() => onSelectTone(t as any)}
                     className={`px-5 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${tone === t ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'bg-white/5 text-zinc-500 hover:text-white hover:bg-white/10'}`}
                   >
                     {t === 'student' ? 'Student' : t === 'expert' ? 'Expert' : 'Kreativec'}
                   </button>
                ))}
             </div>
          </div>
          
          <div className="flex-grow overflow-y-auto p-10 no-scrollbar">
            {isVerifying ? (
               <div className="h-full flex flex-col items-center justify-center space-y-10">
                  <div className="relative">
                    <div className="w-24 h-24 border-2 border-indigo-500/10 border-t-indigo-500 rounded-full animate-spin"></div>
                    <div className="absolute inset-0 flex items-center justify-center">
                       <Gymi 
                         pose="THINKING" 
                         size={80} 
                         avatarURL={userProfile?.avatarURL || firstAvatar?.avatarURL} 
                         avatarPoses={userProfile?.avatarPoses || firstAvatar?.avatarPoses} 
                       />
                    </div>
                  </div>
                  <div className="text-center space-y-3">
                     <p className="text-[11px] font-mono font-black uppercase tracking-[0.5em] text-indigo-400">Synchronizace neurální sítě</p>
                     <p className="text-base font-bold text-zinc-500 italic max-w-xs mx-auto">Vytěžuji fakta a sestavuji optimální studijní model...</p>
                  </div>
               </div>
            ) : verifiedInfo ? (
              <div className="space-y-12 max-w-2xl mx-auto">
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h5 className="text-[10px] font-black uppercase tracking-[0.4em] text-zinc-600">Souhrn tématu</h5>
                    <div className="h-px flex-grow mx-6 bg-white/5"></div>
                  </div>
                  <div className="p-10 rounded-[3rem] bg-indigo-600/5 border border-indigo-500/10 text-white leading-relaxed italic italic-serif-header text-xl shadow-inner">
                    <p>{verifiedInfo.summary}</p>
                  </div>
                </div>

                <div className="space-y-8 pb-10">
                  <div className="flex items-center justify-between">
                    <h5 className="text-[10px] font-black uppercase tracking-[0.4em] text-zinc-600">Extrahovaná fakta</h5>
                    <div className="h-px flex-grow mx-6 bg-white/5"></div>
                  </div>
                  <div className="grid gap-6">
                     {verifiedInfo.facts.map((fact, i) => (
                       <div key={i} className="group p-8 rounded-[2.5rem] bg-white/5 border border-white/5 hover:border-indigo-500/30 hover:bg-white/[0.08] transition-all flex items-start gap-6 shadow-sm">
                          <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shrink-0 text-sm font-black shadow-lg shadow-indigo-500/20 group-hover:scale-110 transition-transform">{i+1}</div>
                          <p className="text-sm md:text-base text-zinc-300 font-bold leading-relaxed">{fact}</p>
                       </div>
                     ))}
                  </div>
                </div>
              </div>
            ) : (
               <div className="h-full flex flex-col items-center justify-center text-center space-y-6">
                  <div className="w-24 h-24 flex items-center justify-center relative">
                     <div className="absolute inset-0 bg-indigo-500/5 blur-2xl rounded-full" />
                     <Gymi 
                        pose="WAITING" 
                        size={120} 
                        avatarURL={userProfile?.avatarURL || firstAvatar?.avatarURL} 
                        avatarPoses={userProfile?.avatarPoses || firstAvatar?.avatarPoses} 
                     />
                  </div>
                  <div className="space-y-2">
                    <p className="text-xl font-black text-white uppercase tracking-tighter italic">Systém čeká na vstup</p>
                    <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Nahrajte zdroje a začněte proces extrakce.</p>
                  </div>
               </div>
            )}
          </div>

          <div className="p-10 border-t border-white/10 bg-zinc-950/60 backdrop-blur-3xl shrink-0">
             <button 
               onClick={onGenerate}
               disabled={isVerifying || !verifiedInfo}
               className="w-full py-7 rounded-[2.5rem] bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-[11px] font-black uppercase tracking-[0.4em] shadow-[0_20px_50px_rgba(79,70,229,0.4)] hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-6 group"
             >
               Generovat studijní vesmír
               <i className="fa-solid fa-bolt-lightning group-hover:animate-bounce"></i>
             </button>
          </div>
        </div>

        {/* Right Column: Chatbot */}
        <div className="lg:w-[350px] flex flex-col overflow-hidden bg-black/40 relative shrink-0">
          <div className="p-8 border-b border-white/5 bg-zinc-950/20 flex items-center gap-5 backdrop-blur-3xl shrink-0">
            <div className="w-16 h-16 rounded-3xl bg-transparent border border-white/10 flex items-center justify-center overflow-hidden shadow-2xl relative group cursor-pointer">
              <div className="absolute inset-0 bg-indigo-500/20 opacity-0 group-hover:opacity-100 transition-opacity"></div>
              <Gymi 
                pose="FRIENDLY" 
                size={90} 
                className="scale-110"
                avatarURL={userProfile.avatarURL || firstAvatar?.avatarURL} 
                avatarPoses={userProfile.avatarPoses || firstAvatar?.avatarPoses} 
              />
              <span className="absolute top-2 right-2 w-3 h-3 bg-emerald-500 rounded-full border-2 border-zinc-950 animate-pulse z-20"></span>
            </div>
            <div>
              <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-white">Neural Mentor</h4>
              <p className="text-[8px] font-black uppercase tracking-widest text-indigo-400 mt-1">Status: Online</p>
            </div>
          </div>

          <div className="flex-grow overflow-y-auto p-8 space-y-6 no-scrollbar bg-black/20">
            {chatHistory.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center px-4 gap-6 opacity-30">
                <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
                   <i className="fa-solid fa-comments text-2xl text-indigo-500"></i>
                </div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] leading-relaxed text-zinc-500 text-center">Máš otázky k analýze?<br/>Zeptej se svého mentora.</p>
              </div>
            )}
            
            <div className="flex flex-col gap-6">
              {chatHistory.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} items-end gap-3 animate-fade`}>
                  <div className={`flex flex-col gap-2 max-w-[90%] ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                    <div className={`p-6 rounded-[2rem] text-sm leading-relaxed font-bold ${m.role === 'user' ? 'bg-indigo-600 text-white rounded-br-none shadow-lg shadow-indigo-500/20' : 'bg-zinc-900/80 text-zinc-300 rounded-bl-none border border-white/10'}`}>
                      {m.role === 'model' ? <FormattedText text={m.text} /> : m.text}
                    </div>
                    <span className="text-[8px] font-mono font-black uppercase tracking-widest text-zinc-600 px-2">{m.time}</span>
                  </div>
                </div>
              ))}
            </div>

            {isChatLoading && (
              <div className="flex items-start gap-2 animate-fade opacity-50">
                <div className="bg-zinc-900 p-4 rounded-2xl rounded-tl-none border border-white/5 flex gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce"></span>
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce [animation-delay:0.2s]"></span>
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce [animation-delay:0.4s]"></span>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="p-8 bg-zinc-950/60 border-t border-white/5 flex gap-3 backdrop-blur-3xl shrink-0">
            <input 
              className="flex-grow bg-white/5 border border-white/10 p-4 rounded-2xl text-xs text-white focus:outline-none focus:border-indigo-500/50 transition-all placeholder:text-zinc-700 font-bold" 
              placeholder="Zeptej se mentora..."
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleChatSubmit(e)}
              disabled={isVerifying}
            />
            <button 
              onClick={handleChatSubmit} 
              disabled={!chatInput.trim() || isChatLoading || isVerifying}
              className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center text-white hover:bg-indigo-500 shadow-xl transition-all active:scale-90 disabled:opacity-20"
            >
              <i className="fa-solid fa-paper-plane text-sm"></i>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const SourceItem: React.FC<{ title: string, isSelected: boolean, onToggle: () => void, icon: string, isVerified?: boolean }> = ({ title, isSelected, onToggle, icon, isVerified }) => (
  <div 
    onClick={onToggle}
    className={`group flex items-center gap-3 p-3 rounded-2xl border cursor-pointer transition-all duration-300 \${isSelected ? 'bg-indigo-600/10 border-indigo-500/30' : 'bg-white/5 border-white/5 opacity-40 hover:opacity-100'}`}
  >
    <div className={`w-5 h-5 rounded-md flex items-center justify-center border transition-all \${isSelected ? 'bg-indigo-500 border-indigo-400 text-white' : 'border-zinc-700 text-transparent'}`}>
      <i className="fa-solid fa-check text-[8px]"></i>
    </div>
    <div className="flex-grow min-w-0">
      <p className={`text-[9px] font-black uppercase tracking-tight truncate \${isSelected ? 'text-white' : 'text-zinc-500'}`}>{title}</p>
    </div>
    <i className={`fa-solid \${icon} text-[8px] \${isVerified ? 'text-indigo-500' : 'text-zinc-700'}`}></i>
  </div>
);

export default VerificationPanel;
