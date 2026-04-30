import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { StudyResult, SummaryParagraph, DbConfig, QuizSet, MindMapNode, Subject, Flashcard, Slide } from '../types';
import katex from 'katex';
import 'katex/dist/katex.min.css';

// Fix for mhchem extension in ESM: it expects global katex
if (typeof window !== 'undefined') {
  (window as any).katex = katex;
}
// @ts-ignore
import 'katex/dist/contrib/mhchem.min.js';

import { refineStudy, searchAdditionalSources } from '../services/geminiService';

interface StudyOutputProps {
  result: StudyResult | null;
  onReset: () => void;
  onUpdateResult: (newResult: StudyResult) => void;
  onGenerateTopic: (topic: string) => void;
  isLoadingExtra: boolean;
  isLoadingInitial: boolean;
  isGeneratingImage?: boolean;
  isGeneratingAudio?: boolean;
  dbConfig: DbConfig;
  originalImage: string | null;
  originalText: string;
  activeSubject: Subject;
  onGenerateImage?: () => void;
  onGenerateExtra?: () => void;
  activeTab: 'summary' | 'visuals' | 'slides' | 'cheat' | 'flashcards' | 'mindmap' | 'image' | 'videos';
  onSetLearningTab: (tab: any) => void;
  highlightIndex: number | null;
  currentAnnotation?: any;
  onClearAnnotation?: () => void;
  isAgentOpen?: boolean;
}

type MainMode = 'learning' | 'testing';
type LearningTab = 'summary' | 'visuals' | 'slides' | 'cheat' | 'flashcards' | 'mindmap' | 'image' | 'videos';

const ALL_METHODS: { id: LearningTab; label: string; icon: string; description: string }[] = [
  { id: 'summary', label: 'Rozbor', icon: 'fa-file-lines', description: 'Hloubková analýza a vysvětlení látky' },
  { id: 'visuals', label: 'Vizuály', icon: 'fa-images', description: 'Ověřené obrázky a schémata' },
  { id: 'slides', label: 'Slajdy', icon: 'fa-chalkboard', description: 'Vizuální prezentace klíčových bodů' },
  { id: 'cheat', label: 'Tahák', icon: 'fa-bolt', description: 'Stručný přehled všeho důležitého' },
  { id: 'flashcards', label: 'Kartičky', icon: 'fa-clone', description: 'Interaktivní procvičování pojmů' },
  { id: 'image', label: 'Generátor', icon: 'fa-wand-sparkles', description: 'AI generování ilustrací' },
  { id: 'mindmap', label: 'Struktura', icon: 'fa-circle-nodes', description: 'Logické propojení informací' },
  { id: 'videos', label: 'Videa', icon: 'fa-brands fa-youtube', description: 'Doporučená vzdělávací videa' },
];

const Skeleton: React.FC<{ className?: string }> = ({ className }) => (
  <div className={`bg-white/5 animate-pulse rounded-2xl ${className}`}></div>
);

const Formula: React.FC<{ math: string; displayMode?: boolean }> = ({ math, displayMode }) => {
  const [html, setHtml] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      let cleanMath = math.trim();
      if (cleanMath.startsWith('$$') && cleanMath.endsWith('$$')) cleanMath = cleanMath.slice(2, -2);
      else if (cleanMath.startsWith('$') && cleanMath.endsWith('$')) cleanMath = cleanMath.slice(1, -1);
      else if (cleanMath.startsWith('\\[')) cleanMath = cleanMath.slice(2, -2);
      else if (cleanMath.startsWith('\\(')) cleanMath = cleanMath.slice(2, -2);

      const rendered = katex.renderToString(cleanMath.trim(), { 
        throwOnError: false, 
        displayMode,
        trust: true,
        strict: false
      });
      setHtml(rendered);
      setError(null);
    } catch (e: any) {
      console.error("KaTeX render error:", e);
      setError(e.message);
    }
  }, [math, displayMode]);

  if (error) {
    return (
      <span className="text-red-400 font-mono text-[10px] p-2 bg-red-500/5 rounded-lg border border-red-500/10 inline-block">
        <i className="fa-solid fa-triangle-exclamation mr-1"></i> {math}
      </span>
    );
  }

  return (
    <span 
      dangerouslySetInnerHTML={{ __html: html }}
      className={`${displayMode ? 'block my-6 py-8 px-8 bg-indigo-500/5 rounded-[2rem] border border-indigo-500/10 text-center shadow-inner overflow-x-auto no-scrollbar' : 'inline-block mx-0.5 text-indigo-300 font-bold'}`} 
    />
  );
};

export const parseContent = (content: string, highlightBlue?: boolean) => {
  // Improved regex to handle formulas better, including \ce with nested braces or parentheses
  // We also try to catch \ce even if it's not wrapped in $
  // The regex now optionally matches \ce followed by non-whitespace if no braces are present
  const parts = content.split(/(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\$(?!\s)[^$]+?(?<!\s)\$|\\\(.*?\\\)|\s*\\ce\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}|\s*\\ce\([^()]*\)|\s*\\ce\s*[a-zA-Z0-9^{}_+-]+)|(\*\*[^*]+?\*\*)/g);
  return parts.map((part, i) => {
    if (!part) return null;
    const trimmedPart = part.trim();
    if (trimmedPart.startsWith('$$') || trimmedPart.startsWith('\\[')) return <Formula key={i} math={trimmedPart} displayMode={true} />;
    
    // Check for \ce pattern
    if (trimmedPart.startsWith('\\ce')) {
      let mathToRender = trimmedPart;
      
      // Check for \ce with braces \ce{...}, parentheses \ce(...), or flat \ce KCN
      const flatMatch = trimmedPart.match(/^\\ce\s*([^{}(\s][\s\S]*)$/);
      const braceMatch = trimmedPart.match(/^\\ce\{([\s\S]*)\}$/);
      const parenMatch = trimmedPart.match(/^\\ce\(([\s\S]*)\)$/);

      if (braceMatch) {
         mathToRender = `$${trimmedPart}$`;
      } else if (parenMatch) {
         mathToRender = `$${trimmedPart}$`;
      } else if (flatMatch) {
         // Transform \ce KCN to \ce{KCN}
         const content = flatMatch[1].trim();
         mathToRender = `$\\ce{${content}}$`;
      } else {
         // Generic fallback
         const content = trimmedPart.substring(3).trim();
         mathToRender = `$\\ce{${content || ''}}$`;
      }
      return <Formula key={i} math={mathToRender} displayMode={false} />;
    }

    if (trimmedPart.startsWith('$') || trimmedPart.startsWith('\\(')) {
      return <Formula key={i} math={trimmedPart} displayMode={false} />;
    }

    if (trimmedPart.startsWith('**') && trimmedPart.endsWith('**')) return <strong key={i} className={`font-black ${highlightBlue ? 'text-indigo-400' : 'text-white'}`}>{trimmedPart.slice(2, -2)}</strong>;
    return <span key={i}>{part}</span>;
  });
};

export const FormattedInline: React.FC<{ text: string; className?: string }> = ({ text, className }) => {
  return <span className={className}>{parseContent(text)}</span>;
};

export const FormattedText: React.FC<{ text: string; className?: string; highlightBlue?: boolean }> = ({ text, className, highlightBlue }) => {
  const elements = useMemo(() => {
    if (!text) return null;
    const lines = text.split('\n');
    return lines.map((line, lineIdx) => {
      const trimmedLine = line.trim();
      if (trimmedLine.startsWith('###')) {
        const headerText = trimmedLine.replace('###', '').trim();
        return <h3 key={lineIdx} className="text-lg font-black text-indigo-400 mt-6 mb-3 uppercase tracking-tight">{parseContent(headerText, highlightBlue)}</h3>;
      }
      if (trimmedLine.startsWith('##')) {
        const headerText = trimmedLine.replace('##', '').trim();
        return <h2 key={lineIdx} className="text-2xl font-black text-white mt-8 mb-4 uppercase tracking-tight leading-tight">{parseContent(headerText, highlightBlue)}</h2>;
      }
      if (trimmedLine.startsWith('#')) {
        const headerText = trimmedLine.replace('#', '').trim();
        return <h1 key={lineIdx} className="text-4xl font-black text-white mt-10 mb-6 uppercase tracking-tight leading-tight">{parseContent(headerText, highlightBlue)}</h1>;
      }
      const isBullet = trimmedLine.startsWith('* ') || trimmedLine.startsWith('- ');
      const isTable = trimmedLine.startsWith('|');
      
      if (isTable) {
        const cells = trimmedLine.split('|').filter(c => c.trim() !== '' || (trimmedLine.startsWith('|') && trimmedLine.endsWith('|')));
        // Simple heuristic for header vs body
        const isHeader = lines[lineIdx + 1]?.includes('---');
        const isDivider = trimmedLine.includes('---');
        if (isDivider) return null;
        
        return (
          <div 
            key={lineIdx} 
            className={`grid border-b border-white/5 py-3 px-4 ${isHeader ? 'bg-emerald-600/20 text-emerald-400 font-black uppercase text-[10px] tracking-widest rounded-t-xl' : 'text-zinc-300'}`}
            style={{ gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))` }}
          >
            {cells.map((cell, cellIdx) => (
              <div key={cellIdx} className="px-2">{parseContent(cell.trim(), highlightBlue)}</div>
            ))}
          </div>
        );
      }

      const cleanLine = isBullet ? trimmedLine.substring(2) : line;
      const content = parseContent(cleanLine, highlightBlue);
      if (isBullet) return <div key={lineIdx} className="flex gap-3 items-start mb-2 pl-4"><span className="text-indigo-500 font-black mt-2 text-[6px]">●</span><div className="flex-grow">{content}</div></div>;
      return <p key={lineIdx} className={`mb-3 leading-relaxed transition-colors duration-700 ${highlightBlue ? 'text-white' : 'text-zinc-300'}`}>{content}</p>;
    });
  }, [text, highlightBlue]);
  return <div className={`transition-colors duration-700 ${highlightBlue ? 'text-white' : 'text-zinc-300'} ${className}`}>{elements}</div>;
};

const LessonChapterSidebar: React.FC<{
  sections: any[];
  activeIndex: number;
  onSelect: (index: number) => void;
  isOpen: boolean;
  onToggle: (open: boolean) => void;
}> = ({ sections, activeIndex, onSelect, isOpen, onToggle }) => {
  return (
    <>
      {/* Sidebar Toggle Button - Floating on the left */}
      <div className={`fixed left-0 top-1/2 -translate-y-1/2 z-[200] transition-all duration-500 pointer-events-none ${isOpen ? 'translate-x-[280px]' : 'translate-x-0'}`}>
        <button 
          onClick={() => onToggle(!isOpen)}
          className="w-10 h-32 bg-[#020617] border border-white/10 border-l-0 rounded-r-3xl flex flex-col items-center justify-center gap-6 text-zinc-500 hover:text-white transition-all shadow-[10px_0_30px_rgba(0,0,0,0.3)] group pointer-events-auto active:scale-95"
        >
          <div className="flex flex-col items-center gap-1">
             {isOpen ? <i className="fa-solid fa-chevron-left text-[8px] mb-1"></i> : <i className="fa-solid fa-list-ul text-[10px]"></i>}
             <div className="[writing-mode:vertical-lr] text-[8px] font-black uppercase tracking-[0.5em] rotate-180 mb-1">Obsah</div>
             {!isOpen && <i className="fa-solid fa-chevron-right text-[8px]"></i>}
          </div>
        </button>
      </div>

      {/* Sidebar Content */}
      <motion.div 
        initial={false}
        animate={{ width: isOpen ? 280 : 0, opacity: isOpen ? 1 : 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="fixed lg:static inset-y-0 left-0 bg-[#020617] border-r border-white/5 z-[150] shadow-[20px_0_60px_rgba(0,0,0,0.5)] flex flex-col no-print overflow-hidden"
      >
        <div className="p-8 border-b border-white/5 bg-zinc-950/20">
          <div className="flex items-center gap-4 mb-2">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/10 border border-indigo-600/20 flex items-center justify-center text-indigo-500">
              <i className="fa-solid fa-list-ul text-xs"></i>
            </div>
            <div>
              <h3 className="text-sm font-black uppercase tracking-tight text-white leading-none">Obsah lekce</h3>
              <p className="text-[9px] font-black uppercase tracking-widest text-zinc-600 mt-1">Struktura učiva</p>
            </div>
          </div>
        </div>

        <div className="flex-grow overflow-y-auto no-scrollbar p-3 space-y-1">
          {sections.map((s, idx) => (
            <button
              key={idx}
              onClick={() => { onSelect(idx); if (window.innerWidth < 1024) onToggle(false); }}
              className={`w-full text-left flex items-center gap-4 px-4 py-3.5 rounded-xl transition-all group/item relative ${
                activeIndex === idx 
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' 
                  : 'text-zinc-500 hover:bg-white/5 hover:text-zinc-200'
              }`}
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[9px] font-black transition-all ${
                activeIndex === idx ? 'bg-white/20 text-white' : 'bg-zinc-900 text-zinc-600 group-hover/item:text-zinc-400'
              }`}>
                {String(idx + 1).padStart(2, '0')}
              </div>
              <div className="flex-grow min-w-0">
                <span className="block text-[10px] font-black uppercase tracking-widest truncate">
                  <FormattedInline text={s.heading} />
                </span>
              </div>
              {activeIndex === idx && (
                <div className="absolute right-3 w-1.5 h-1.5 rounded-full bg-white shadow-[0_0_10px_white]"></div>
              )}
            </button>
          ))}
        </div>

        <div className="p-6 border-t border-white/5 text-center mt-auto">
          <p className="text-[7px] font-black uppercase tracking-[0.4em] text-zinc-700">Gymni Mate Studio</p>
        </div>
      </motion.div>
      
      {/* Mobile Overlay */}
      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => onToggle(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[140] lg:hidden"
          />
        )}
      </AnimatePresence>
    </>
  );
};

const StudyOutput: React.FC<StudyOutputProps> = ({ 
  result, onReset, onUpdateResult, isLoadingExtra, isLoadingInitial, isGeneratingImage, isGeneratingAudio, activeSubject, dbConfig, originalImage, originalText, onGenerateImage, onGenerateExtra,
  activeTab, onSetLearningTab, highlightIndex, currentAnnotation, onClearAnnotation, isAgentOpen
}) => {
  const [mainMode, setMainMode] = useState<MainMode>('learning');
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [isSourcesPanelOpen, setIsSourcesPanelOpen] = useState(false);
  const [isMethodsPanelOpen, setIsMethodsPanelOpen] = useState(false);
  const [enabledTabs, setEnabledTabs] = useState<LearningTab[]>(['summary', 'visuals']);
  const [sourceSearchQuery, setSourceSearchQuery] = useState('');
  const [methodSearchQuery, setMethodSearchQuery] = useState('');
  const [foundSources, setFoundSources] = useState<{uri: string, title: string}[]>([]);
  const [isSearchingSources, setIsSearchingSources] = useState(false);
  const [activeSummaryIndex, setActiveSummaryIndex] = useState(-1);

  const [isChapterSidebarOpen, setIsChapterSidebarOpen] = useState(false);

  // Sync activeTab if it's not in enabledTabs (e.g. initial load)
  useEffect(() => {
    if (activeTab && !enabledTabs.includes(activeTab)) {
      setEnabledTabs(prev => [...prev, activeTab]);
    }
  }, [activeTab]);

  const toggleMethod = (tabId: LearningTab) => {
    if (enabledTabs.includes(tabId)) {
      if (tabId === 'summary') return; // Cannot remove summary
      setEnabledTabs(prev => prev.filter(t => t !== tabId));
      if (activeTab === tabId) onSetLearningTab('summary');
    } else {
      setEnabledTabs(prev => [...prev, tabId]);
      onSetLearningTab(tabId);
      setIsMethodsPanelOpen(false);
    }
  };

  const filteredMethods = ALL_METHODS.filter(m => 
    m.label.toLowerCase().includes(methodSearchQuery.toLowerCase()) || 
    m.description.toLowerCase().includes(methodSearchQuery.toLowerCase())
  );

  useEffect(() => {
    if (result?.lessonIntro) {
      setActiveSummaryIndex(-1);
    } else {
      setActiveSummaryIndex(0);
    }
  }, [result]);

  useEffect(() => {
    if (highlightIndex !== null && highlightIndex >= 0 && highlightIndex < (result?.fullSummary.length || 0)) {
      setActiveSummaryIndex(highlightIndex);
    }
  }, [highlightIndex, result]);

  useEffect(() => {
    if (isSourcesPanelOpen && !sourceSearchQuery && result?.title) {
      setSourceSearchQuery(result.title);
    }
  }, [isSourcesPanelOpen, result?.title]);

  const audioContextRef = useRef<AudioContext | null>(null);
  const currentAudioSourceRef = useRef<AudioBufferSourceNode | null>(null);

  const handlePlayMainAudio = async () => {
    if (!result?.mainAudio) return;
    if (isAudioPlaying) { currentAudioSourceRef.current?.stop(); setIsAudioPlaying(false); return; }
    if (!audioContextRef.current) audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    const ctx = audioContextRef.current;
    if (ctx.state === 'suspended') await ctx.resume();
    const buffer = await decodeAudioData(decodeBase64(result.mainAudio), ctx, 24000, 1);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.onended = () => setIsAudioPlaying(false);
    source.start();
    currentAudioSourceRef.current = source;
    setIsAudioPlaying(true);
  };

  const applyEnhancement = async (suggestion: string) => {
    if (isRefining) return;
    setIsRefining(true);
    try {
      const updated = await refineStudy(result!, `Rozšiř o: ${suggestion}`);
      onUpdateResult(updated);
    } catch (e) {} finally { setIsRefining(false); }
  };

  const handleSearchSources = async () => {
    if (!sourceSearchQuery.trim()) return;
    setIsSearchingSources(true);
    try {
      const sources = await searchAdditionalSources(sourceSearchQuery);
      setFoundSources(sources);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSearchingSources(false);
    }
  };

  const addSource = (source: {uri: string, title: string}) => {
    if (!result) return;
    const exists = result.sources?.some(s => s.uri === source.uri);
    if (exists) return;
    
    const updated: StudyResult = {
      ...result,
      sources: [...(result.sources || []), source]
    };
    onUpdateResult(updated);
  };

  return (
    <div className="w-full space-y-8 animate-fade pb-20 bg-[#020617] min-h-screen relative z-10">
      {/* Methods Search Panel */}
      {isMethodsPanelOpen && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 animate-fade">
           <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={() => setIsMethodsPanelOpen(false)}></div>
           <div className="relative w-full max-w-5xl bg-[#09090b] rounded-[2.5rem] border border-white/5 shadow-[0_50px_100px_rgba(0,0,0,0.8)] flex flex-col max-h-[85vh] overflow-hidden">
              <div className="flex items-center justify-between p-10 pb-0">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-zinc-400">
                    <i className="fa-solid fa-grid-2 text-sm"></i>
                  </div>
                  <div>
                    <h3 className="text-lg font-black uppercase tracking-tight text-white leading-none">Učební metody</h3>
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-600 mt-1.5">Personalizuj si svůj studijní plán</p>
                  </div>
                </div>
                <button onClick={() => setIsMethodsPanelOpen(false)} className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 text-zinc-500 hover:text-white transition-all flex items-center justify-center hover:bg-white/10">
                  <i className="fa-solid fa-xmark text-sm"></i>
                </button>
              </div>

              <div className="px-8 mt-6">
                <div className="relative group">
                  <input 
                    type="text" 
                    placeholder="Hledat..."
                    className="w-full bg-[#121214] border border-white/5 rounded-2xl px-6 py-3.5 text-xs text-white focus:outline-none focus:border-indigo-500/50 transition-all placeholder:text-zinc-700 font-bold uppercase tracking-wider"
                    value={methodSearchQuery}
                    onChange={(e) => setMethodSearchQuery(e.target.value)}
                  />
                  <div className="absolute right-5 top-1/2 -translate-y-1/2 text-zinc-600">
                    <i className="fa-solid fa-search text-xs"></i>
                  </div>
                </div>
              </div>

              <div className="px-8 mt-8 pb-8 flex-grow overflow-y-auto no-scrollbar">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {filteredMethods.map((method, i) => {
                    const isActive = enabledTabs.includes(method.id);
                    return (
                      <button 
                        key={method.id}
                        onClick={() => toggleMethod(method.id)}
                        className={`relative aspect-square flex flex-col items-center justify-center p-4 rounded-3xl border transition-all text-center group animate-fade-up overflow-hidden ${
                          isActive 
                            ? 'bg-indigo-600/10 border-indigo-500/40 ring-1 ring-indigo-500/20' 
                            : 'bg-white/2 border-white/5 hover:border-white/20 hover:bg-white/5'
                        }`}
                        style={{ animationDelay: `${i * 40}ms` }}
                      >
                        <div className={`mb-3 w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                          isActive ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/40' : 'bg-white/5 text-zinc-500 group-hover:text-white'
                        }`}>
                          <i className={`fa-solid ${method.icon} text-sm`}></i>
                        </div>
                        
                        <h4 className="text-[10px] font-black uppercase tracking-tight text-white mb-1.5">{method.label}</h4>
                        <p className="text-[8px] font-bold text-zinc-600 leading-tight uppercase tracking-widest px-1">
                          {method.description}
                        </p>

                        {isActive && (
                          <div className="absolute top-3 right-3 text-indigo-500">
                            <i className="fa-solid fa-circle-check text-[10px]"></i>
                          </div>
                        )}
                        
                        {/* Hover effect light */}
                        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 bg-gradient-to-tr from-indigo-500/10 to-transparent transition-opacity pointer-events-none" />
                      </button>
                    );
                  })}
                </div>
              </div>
           </div>
        </div>
      )}

      {/* Sources Panel */}
      {isSourcesPanelOpen && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 md:p-10 animate-fade">
           <div className="absolute inset-0 bg-black/80 backdrop-blur-xl" onClick={() => setIsSourcesPanelOpen(false)}></div>
           <div className="relative w-full max-w-6xl glass-panel rounded-[3rem] p-8 md:p-12 border-white/10 shadow-[0_50px_100px_rgba(0,0,0,0.8)] flex flex-col max-h-[90vh] overflow-hidden bg-zinc-950/40">
              <div className="flex items-center justify-between mb-10">
                <div className="flex items-center gap-5">
                  <div className="w-16 h-16 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-2xl shadow-indigo-500/40">
                    <i className="fa-solid fa-graduation-cap text-2xl"></i>
                  </div>
                  <div>
                    <h3 className="text-3xl font-black uppercase tracking-tight text-white mb-1">Zdroje & Strategie</h3>
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-500">Ověřené podklady a metodika výuky</p>
                  </div>
                </div>
                <button onClick={() => setIsSourcesPanelOpen(false)} className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 text-zinc-500 hover:text-white transition-all flex items-center justify-center hover:bg-white/10">
                  <i className="fa-solid fa-xmark text-xl"></i>
                </button>
              </div>

              <div className="space-y-8 flex-grow flex flex-col min-h-0 overflow-y-auto no-scrollbar pb-8">
                {/* Strategie výuky section */}
                {result?.lessonIntro && (
                  <div className="p-8 rounded-3xl bg-indigo-500/5 border border-indigo-500/20 space-y-6">
                    <div className="flex items-center gap-3">
                      <i className="fa-solid fa-star text-indigo-500 text-[10px]"></i>
                      <h4 className="text-[11px] font-black uppercase tracking-widest text-indigo-300">Strategie výuky: {result.lessonIntro.title}</h4>
                    </div>
                    <p className="text-sm text-zinc-400 leading-relaxed font-medium italic">"{result.lessonIntro.description}"</p>
                {result?.lessonIntro?.objectives && (
                      <div className="flex flex-wrap gap-2 pt-2">
                        {result.lessonIntro.objectives.map((obj, i) => (
                          <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/5 text-[10px] font-bold text-zinc-400 uppercase">
                             <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                             {obj}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Už použité zdroje */}
                {result?.sources && result.sources.length > 0 && (
                  <div className="space-y-4">
                    <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-400 border-l-2 border-indigo-500 pl-4 mb-4">Zdroje použité v této lekci</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-48 overflow-y-auto no-scrollbar pr-2">
                      {result.sources?.map((s, i) => (
                        <a 
                          key={i} 
                          href={s.uri} 
                          target="_blank" 
                          referrerPolicy="no-referrer"
                          className="flex items-center gap-4 p-4 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 transition-all group"
                        >
                          <div className="w-10 h-10 rounded-xl bg-indigo-600/20 flex items-center justify-center text-indigo-400 group-hover:bg-indigo-600 group-hover:text-white transition-all">
                            <i className="fa-solid fa-link text-xs"></i>
                          </div>
                          <div className="min-w-0 flex-grow">
                            <p className="text-[11px] font-black text-white truncate uppercase tracking-tight">{s.title || 'Zroj bez názvu'}</p>
                            <p className="text-[9px] text-zinc-500 truncate">{s.uri}</p>
                          </div>
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-4 pt-4 border-t border-white/5">
                  <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-500 border-l-2 border-zinc-700 pl-4 mb-4">Vyhledat další materiály</h4>
                  <div className="flex gap-4">
                    <div className="flex-grow relative">
                      <input 
                        type="text" 
                        placeholder="Zadej téma pro vyhledání dalších zdrojů..."
                        className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-5 text-sm text-white focus:outline-none focus:border-indigo-500/50 transition-all placeholder:text-zinc-700 font-medium"
                        value={sourceSearchQuery}
                        onChange={(e) => setSourceSearchQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSearchSources()}
                      />
                      {isSearchingSources && (
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 text-indigo-500">
                          <i className="fa-solid fa-circle-notch fa-spin"></i>
                        </div>
                      )}
                    </div>
                    <button 
                      onClick={handleSearchSources}
                      disabled={isSearchingSources || !sourceSearchQuery.trim()}
                      className="px-10 py-5 bg-indigo-600 rounded-2xl text-[10px] font-black uppercase tracking-[0.3em] text-white hover:bg-indigo-500 transition-all disabled:opacity-20 shadow-xl shadow-indigo-500/20"
                    >
                      Hledat
                    </button>
                  </div>
                </div>

                <div className="flex-grow overflow-y-auto no-scrollbar space-y-4 pr-2">
                  {isSearchingSources ? (
                    <div className="space-y-4 py-4">
                      {[1,2,3,4].map(i => (
                        <div key={i} className="w-full h-24 rounded-3xl bg-white/5 animate-pulse border border-white/5"></div>
                      ))}
                    </div>
                  ) : foundSources.length > 0 ? (
                    <div className="grid grid-cols-1 gap-4 py-2">
                      {foundSources.map((s, i) => {
                        const isAdded = result?.sources?.some(rs => rs.uri === s.uri);
                        return (
                          <div key={i} className={`flex items-center justify-between p-6 rounded-[2rem] border transition-all group animate-fade-up`} style={{ animationDelay: `${i * 100}ms` }}>
                            <div className="flex flex-col min-w-0 pr-6">
                              <span className="text-sm font-black uppercase tracking-tight text-white truncate mb-1">{s.title || 'Bez názvu'}</span>
                              <span className="text-[9px] font-bold text-zinc-500 truncate tracking-widest">{s.uri}</span>
                            </div>
                            <button 
                              onClick={() => addSource(s)}
                              disabled={isAdded}
                              className={`shrink-0 px-8 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${isAdded ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-white/5 text-white border border-white/10 hover:bg-indigo-600 hover:border-indigo-500 shadow-inner'}`}
                            >
                              {isAdded ? <><i className="fa-solid fa-check mr-2"></i> Přidáno</> : 'Přidat'}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : sourceSearchQuery && !isSearchingSources ? (
                    <div className="h-full flex flex-col items-center justify-center text-center py-20 gap-6 opacity-40">
                      <div className="w-20 h-20 rounded-[2rem] bg-white/5 flex items-center justify-center text-zinc-600 text-3xl">
                        <i className="fa-solid fa-magnifying-glass"></i>
                      </div>
                      <p className="text-[10px] font-black uppercase tracking-[0.4em] text-zinc-500">Žádné zdroje nenalezeny</p>
                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center py-20 gap-6 opacity-40">
                      <div className="w-20 h-20 rounded-[2rem] bg-white/5 flex items-center justify-center text-zinc-600 text-3xl">
                        <i className="fa-solid fa-search"></i>
                      </div>
                      <p className="text-[10px] font-black uppercase tracking-[0.4em] text-zinc-500">Zadej téma pro vyhledání zdrojů</p>
                    </div>
                  )}
                </div>
              </div>
           </div>
        </div>
      )}

      {/* Lightbox Overlay */}
      {isLightboxOpen && result?.generatedImage && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 md:p-10 animate-fade">
           <div className="absolute inset-0 bg-black/95 backdrop-blur-2xl" onClick={() => setIsLightboxOpen(false)}></div>
           <div className="relative max-w-7xl max-h-full aspect-square overflow-hidden rounded-[4rem] shadow-[0_50px_100px_rgba(0,0,0,0.8)] border border-white/10">
              <img 
                src={result.generatedImage.startsWith('data:image') ? result.generatedImage : `data:image/png;base64,${result.generatedImage}`} 
                className="w-full h-full object-contain" 
                alt="Context Full" 
              />
              <button onClick={() => setIsLightboxOpen(false)} className="absolute top-8 right-8 w-14 h-14 rounded-full bg-black/50 backdrop-blur-xl border border-white/10 text-white flex items-center justify-center hover:bg-indigo-600 transition-all">
                <i className="fa-solid fa-xmark text-xl"></i>
              </button>
           </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 px-4 no-print">
        <div className="flex items-center gap-5">
          <button onClick={onReset} className="w-10 h-10 rounded-2xl bg-zinc-950 border border-white/5 flex items-center justify-center text-zinc-500 hover:text-white transition-all"><i className="fa-solid fa-arrow-left text-xs"></i></button>
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.3em] text-indigo-500">{activeSubject.name}</p>
            <h2 className="text-2xl font-black uppercase tracking-tight text-white">
              {result?.title ? <FormattedInline text={result.title} /> : <Skeleton className="w-48 h-6 mt-1" />}
            </h2>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {result?.mainAudio && (
            <button onClick={handlePlayMainAudio} className={`px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all ${isAudioPlaying ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-white/5 border-white/10 text-zinc-300 hover:bg-white/10'}`}>
              <i className={`fa-solid ${isAudioPlaying ? 'fa-pause' : 'fa-play'} mr-2`}></i> {isAudioPlaying ? 'Pauza' : 'Přehrát výklad'}
            </button>
          )}
          <div className="flex items-center gap-1 bg-zinc-950/80 p-1.5 rounded-2xl border border-white/5">
            <button 
              onClick={() => window.print()} 
              className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 text-zinc-500 hover:text-white flex items-center justify-center transition-all"
              title="Vytisknout"
            >
              <i className="fa-solid fa-print text-[10px]"></i>
            </button>
            <button onClick={() => setIsSourcesPanelOpen(true)} className="px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-zinc-500 hover:text-white transition-all flex items-center gap-2">
              <i className="fa-solid fa-plus"></i> Zdroje
            </button>
            <div className="w-px h-4 bg-white/10 mx-1"></div>
            <button onClick={() => setMainMode('learning')} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${mainMode === 'learning' ? 'bg-indigo-600 text-white' : 'text-zinc-500'}`}>Studium</button>
            <button onClick={() => setMainMode('testing')} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${mainMode === 'testing' ? 'bg-indigo-600 text-white' : 'text-zinc-500'}`}>Test</button>
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8 px-4 relative min-h-[60vh]">
        {/* Chapters Sidebar Triggered Layout */}
        {(activeTab === 'summary' && result) && (
          <div className="shrink-0">
            <LessonChapterSidebar 
              sections={result?.lessonContent || result?.fullSummary.map(s => ({ heading: s.question })) || []}
              activeIndex={activeSummaryIndex}
              onSelect={(idx) => setActiveSummaryIndex(idx)}
              isOpen={isChapterSidebarOpen}
              onToggle={(open) => setIsChapterSidebarOpen(open)}
            />
          </div>
        )}

        <div className="flex-grow space-y-10 min-w-0">
          {mainMode === 'learning' ? (
            <>
              <div className="flex items-center overflow-x-auto no-scrollbar gap-2 pb-1 no-print">
                {ALL_METHODS.filter(m => enabledTabs.includes(m.id)).map(m => (
                   <TabBtn 
                    key={m.id}
                    active={activeTab === m.id} 
                    onClick={() => onSetLearningTab(m.id)} 
                    label={m.label} 
                    icon={m.icon} 
                  />
                ))}
                <button 
                  onClick={() => setIsMethodsPanelOpen(true)}
                  className="flex items-center gap-2 px-6 py-3.5 rounded-2xl transition-all text-[10px] font-black uppercase tracking-widest border border-white/5 text-zinc-500 hover:text-white bg-zinc-950/50 hover:bg-zinc-900 border-dashed"
                >
                  <i className="fa-solid fa-plus"></i>
                </button>
              </div>

              {activeTab === 'summary' && (
                <div className="animate-fade space-y-10">
                  <div className={`flex flex-col lg:flex-row gap-10`}>
                    {/* Content */}
                    <div className="flex-grow space-y-10">
                      {result ? (
                        activeSummaryIndex === -1 ? (
                          <LessonIntroSection intro={result.lessonIntro} onStart={() => setActiveSummaryIndex(0)} />
                        ) : (
                          <ParagraphSection 
                            key={activeSummaryIndex} 
                            p={result.fullSummary[activeSummaryIndex]} 
                            idx={activeSummaryIndex} 
                            isHighlighted={highlightIndex === activeSummaryIndex}
                          />
                        )
                      ) : [1].map(i => <Skeleton key={i} className="w-full h-96 rounded-[2rem]" />)}

                      {/* Navigation buttons */}
                      <div className="flex justify-between items-center pt-10 border-t border-white/5 no-print">
                        <button 
                          disabled={activeSummaryIndex === (result?.lessonIntro ? -1 : 0)}
                          onClick={() => setActiveSummaryIndex(prev => prev - 1)}
                          className="px-8 py-4 rounded-2xl bg-white/5 border border-white/10 text-zinc-400 hover:text-white disabled:opacity-20 transition-all flex items-center gap-3 text-[10px] font-black uppercase tracking-widest"
                        >
                          <i className="fa-solid fa-arrow-left"></i> Předchozí
                        </button>
                        <button 
                          disabled={!result || activeSummaryIndex === result.fullSummary.length - 1}
                          onClick={() => setActiveSummaryIndex(prev => prev + 1)}
                          className="px-8 py-4 rounded-2xl bg-indigo-600 text-white shadow-xl shadow-indigo-600/20 hover:bg-indigo-500 disabled:opacity-20 transition-all flex items-center gap-3 text-[10px] font-black uppercase tracking-widest"
                        >
                          Další <i className="fa-solid fa-arrow-right"></i>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {activeTab === 'visuals' && (
                <div className="animate-fade">
                   <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {result?.sources && result.sources.filter(s => s.uri.match(/\.(jpg|jpeg|png|webp|svg)/i)).map((v, i) => (
                        <div key={i} className="group relative aspect-square rounded-[2rem] bg-zinc-900 border border-white/5 overflow-hidden flex items-center justify-center">
                           <img 
                              src={v.uri} 
                              alt={v.title} 
                              className="w-full h-full object-cover opacity-70 group-hover:opacity-100 transition-all duration-500"
                              referrerPolicy="no-referrer"
                           />
                           <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-6">
                              <p className="text-[10px] font-black uppercase tracking-tight text-white mb-1">{v.title}</p>
                              <a href={v.uri} target="_blank" referrerPolicy="no-referrer" className="text-[8px] font-bold text-indigo-400 uppercase tracking-widest hover:text-white transition-colors">Otevřít zdroj</a>
                           </div>
                        </div>
                      ))}
                      
                      {/* Fallback search for visuals */}
                      <div className="col-span-full py-12 px-8 rounded-[3rem] border border-white/5 bg-white/2 border-dashed flex flex-col items-center justify-center text-center space-y-6">
                         <div className="w-24 h-24 rounded-3xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                            <i className="fa-solid fa-images text-3xl"></i>
                         </div>
                         <div>
                            <h3 className="text-xl font-black uppercase tracking-tight text-white mb-2">Ověřené Vizuály</h3>
                            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest max-w-sm mx-auto leading-relaxed">
                               Vyhledáváme relevantní schémata, grafy a vědecké ilustrace z prověřených akademických zdrojů.
                            </p>
                         </div>
                         <button onClick={() => setIsSourcesPanelOpen(true)} className="px-8 py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-black uppercase tracking-widest transition-all shadow-xl shadow-indigo-600/20">
                            Prohledat zdroje vizuálů
                         </button>
                      </div>
                   </div>
                </div>
              )}
              {activeTab === 'slides' && <div className="animate-fade">{result?.slides && result.slides.length > 0 ? <SlideViewer slides={result.slides} currentAnnotation={currentAnnotation} onClearAnnotation={onClearAnnotation} /> : <EmptyTab icon="fa-chalkboard" label="Prezentace" onClick={() => onSetLearningTab('summary')} isLoading={isLoadingExtra} />}</div>}
              {activeTab === 'mindmap' && <div className="animate-fade">{result?.mindMap && result.mindMap.length > 0 ? <MindMap nodes={result.mindMap} title={result.title} /> : <EmptyTab icon="fa-circle-nodes" label="Struktura" onClick={() => onGenerateExtra?.()} isLoading={isLoadingExtra} />}</div>}
              {activeTab === 'flashcards' && <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fade">{result?.flashcards && result.flashcards.length > 0 ? result.flashcards.map((card, i) => <FlashcardComp key={i} card={card} />) : <div className="col-span-full"><EmptyTab icon="fa-clone" label="Kartičky" onClick={() => onGenerateExtra?.()} isLoading={isLoadingExtra} /></div>}</div>}
              {activeTab === 'cheat' && (
                <div className="max-w-4xl mx-auto space-y-6 animate-fade">
                  {result?.cheatSheet && result.cheatSheet.length > 0 ? (
                    <div className="bg-zinc-950 border border-white/10 rounded-[3rem] p-10 md:p-16 shadow-2xl relative overflow-hidden">
                      <h3 className="text-2xl font-black uppercase text-white mb-10 logo-font flex items-center gap-4"><i className="fa-solid fa-bolt text-indigo-500"></i> Rychlý tahák</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">{result.cheatSheet?.map((item, i) => (<div key={i} className="flex gap-4 items-start group"><div className="w-6 h-6 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-500 shrink-0 mt-1"><i className="fa-solid fa-check text-[10px]"></i></div><FormattedText text={item} className="text-sm font-bold text-zinc-300" /></div>))}</div>
                    </div>
                  ) : (
                    <EmptyTab icon="fa-bolt" label="Tahák" onClick={() => onGenerateExtra?.()} isLoading={isLoadingExtra} />
                  )}
                </div>
              )}
              {activeTab === 'image' && (
                <div className="animate-fade min-h-[500px]">
                  {isGeneratingImage ? (
                    <div className="flex flex-col items-center justify-center h-full gap-6 bg-zinc-950/40 rounded-[3rem] border border-white/5 p-20">
                      <div className="w-16 h-16 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"></div>
                      <p className="text-sm font-black uppercase tracking-widest text-indigo-400">Vyhledávám vizuální materiály...</p>
                    </div>
                  ) : result?.visuals && result.visuals.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                       {result.visuals.map((url, idx) => (
                         <div key={idx} className="relative group aspect-video rounded-[2rem] overflow-hidden shadow-2xl border border-white/10 cursor-zoom-in bg-zinc-900" onClick={() => { /* Opravíme lightbox */ }}>
                            <img 
                              src={url} 
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" 
                              alt={`Visual ${idx}`}
                              referrerPolicy="no-referrer"
                            />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <i className="fa-solid fa-expand text-2xl text-white"></i>
                            </div>
                         </div>
                       ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full gap-6 bg-zinc-950/40 rounded-[3rem] border border-white/5 p-20">
                      <div className="opacity-20 flex flex-col items-center gap-6">
                        <i className="fa-solid fa-image text-8xl text-zinc-800"></i>
                        <p className="text-sm font-black uppercase tracking-widest text-zinc-500">Žádné vizuály k dispozici</p>
                      </div>
                      {onGenerateImage && (
                        <button 
                          onClick={onGenerateImage}
                          className="px-10 py-5 bg-indigo-600 rounded-3xl text-[10px] font-black uppercase tracking-[0.3em] text-white hover:bg-indigo-500 transition-all shadow-xl shadow-indigo-600/20 flex items-center gap-4"
                        >
                          <i className="fa-solid fa-search"></i> Najít vzdělávací materiály
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
              {activeTab === 'videos' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-fade">
                  {result?.youtubeVideos && result.youtubeVideos.length > 0 ? (
                    result.youtubeVideos.map((video, idx) => {
                      const id = video.url.includes('v=') ? video.url.split('v=')[1]?.split('&')[0] : video.url.split('/').pop();
                      return (
                        <div key={idx} className="bg-zinc-950 border border-white/10 rounded-[3rem] p-8 space-y-6 shadow-2xl">
                          <div className="aspect-video w-full rounded-2xl overflow-hidden bg-black border border-white/5">
                            <iframe 
                              className="w-full h-full"
                              src={`https://www.youtube.com/embed/${id}`}
                              title={video.title || "YouTube video player"}
                              frameBorder="0"
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                              allowFullScreen
                            ></iframe>
                          </div>
                          <div>
                            <h4 className="text-lg font-black uppercase text-white tracking-tight leading-tight line-clamp-2">
                              {video.title || "Vzdělávací video"}
                            </h4>
                            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mt-2">{video.url}</p>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="col-span-full h-96 bg-zinc-950/40 rounded-[3rem] border border-white/5 flex flex-col items-center justify-center text-center gap-6 opacity-30 italic">
                      <i className="fa-brands fa-youtube text-6xl"></i>
                      <p className="text-sm font-black uppercase tracking-widest">Zatím nebyla nalezena žádná videa</p>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="space-y-8 animate-fade pb-20">
               <h3 className="text-lg font-black uppercase tracking-widest text-white">Ověření znalostí</h3>
               {result?.quizzes?.map((quiz, i) => <InteractiveTest key={i} quiz={quiz} />) || <Skeleton className="w-full h-96 rounded-[2rem]" />}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const ParagraphSection: React.FC<{ 
  p: SummaryParagraph; 
  idx: number; 
  isHighlighted?: boolean;
}> = ({ p, idx, isHighlighted }) => {
  return (
    <div 
      className={`p-8 rounded-[2.5rem] border transition-all duration-700 relative group animate-fade ${
        isHighlighted 
          ? 'bg-indigo-600/20 border-indigo-500 shadow-[0_0_50px_rgba(79,70,229,0.3)] ring-4 ring-indigo-500/10' 
          : 'bg-white/5 border-transparent hover:border-white/10'
      }`}
    >
      <div className="flex flex-col gap-6 mb-10">
        <div className="flex items-center gap-4">
          <span className={`w-12 h-12 rounded-2xl border flex items-center justify-center text-xs font-black shadow-inner transition-colors duration-700 ${
            isHighlighted ? 'bg-indigo-500 border-indigo-400 text-white' : 'bg-zinc-950 border-white/5 text-emerald-500'
          }`}>
            {idx + 1}
          </span>
          <h4 className="text-3xl font-black uppercase tracking-tight text-white leading-tight">
            <FormattedInline text={p.question.replace('?', '')} />
          </h4>
        </div>
        <div className={`h-1 w-24 rounded-full transition-colors duration-700 ${isHighlighted ? 'bg-white' : 'bg-emerald-600'}`}></div>
      </div>
      <div className="relative">
        <FormattedText text={p.text} highlightBlue={isHighlighted} className="text-xl font-medium leading-relaxed text-zinc-200" />
      </div>
    </div>
  );
};

const EmptyTab: React.FC<{ icon: string, label: string, onClick: () => void, isLoading?: boolean }> = ({ icon, label, onClick, isLoading }) => (
  <div className="animate-fade flex flex-col items-center justify-center min-h-[400px] bg-zinc-950/40 rounded-[3rem] border border-white/5 p-10 text-center space-y-8">
     <div className="w-24 h-24 rounded-3xl bg-white/5 flex items-center justify-center text-zinc-700">
        <i className={`fa-solid ${icon} text-4xl`}></i>
     </div>
     <div className="space-y-2">
        <h4 className="text-xl font-black text-white uppercase tracking-tight italic-serif-header">{label} není vygenerován</h4>
        <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest max-w-xs mx-auto leading-relaxed">
           K vytvoření této sekce potřebuji zapojit neural engine a analyzovat data.
        </p>
     </div>
     <button 
        onClick={onClick}
        disabled={isLoading}
        className="px-12 py-5 bg-indigo-600 rounded-[2rem] text-[10px] font-black uppercase tracking-[0.4em] text-white hover:bg-indigo-500 disabled:opacity-50 transition-all shadow-2xl shadow-indigo-600/40 hover:scale-105 active:scale-95 flex items-center gap-4"
     >
        {isLoading ? (
          <>
            <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
            Generuji...
          </>
        ) : (
          <>
            <i className="fa-solid fa-plus"></i> Vygenerovat nyní
          </>
        )}
     </button>
  </div>
);

const LessonIntroSection: React.FC<{ intro: StudyResult['lessonIntro'], onStart: () => void }> = ({ intro, onStart }) => {
  if (!intro) return null;
  return (
    <div className="animate-fade p-10 md:p-16 rounded-[3rem] bg-white/5 border border-white/10 min-h-[500px] flex flex-col justify-center">
      <div className="space-y-12">
        <div className="space-y-6">
          <div className="flex flex-col gap-4">
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-500">Strategie výuky</p>
            <h3 className="text-4xl font-black text-white uppercase tracking-tighter leading-tight">
              Metodika a <span className="text-indigo-500">cíl lekce</span>
            </h3>
          </div>
          <div className="h-1 w-24 bg-indigo-500 rounded-full"></div>
        </div>

        <div className="space-y-8">
          <div className="space-y-4">
             <h4 className="text-xs font-black uppercase tracking-widest text-zinc-500">Jak se budeme učit</h4>
             <p className="text-xl font-medium leading-relaxed text-zinc-200">{intro.methodology}</p>
          </div>
          
          <div className="space-y-4">
             <h4 className="text-xs font-black uppercase tracking-widest text-zinc-500">Očekávaný výsledek</h4>
             <p className="text-xl font-medium leading-relaxed text-zinc-200">{intro.expectations}</p>
          </div>

          <div className="space-y-4 pt-6 border-t border-white/5">
             <h4 className="text-xs font-black uppercase tracking-widest text-zinc-500">Plán cesty ({intro.totalDuration})</h4>
             <p className="text-lg font-medium text-zinc-300 leading-relaxed">
                {intro.teachingPlan.map((step, idx) => (
                  <span key={idx}>
                    <span className="text-white font-bold uppercase tracking-tight italic">{step.step}</span>
                    <span className="text-zinc-500 italic ml-2 mr-3 opacity-60">({step.duration})</span>
                    {idx < intro.teachingPlan.length - 1 ? " • " : ""}
                  </span>
                ))}
             </p>
          </div>
        </div>

        <div className="pt-10 flex justify-center">
          <button 
            onClick={onStart}
            className="px-12 py-5 bg-indigo-600 text-white rounded-[2rem] text-[10px] font-black uppercase tracking-[0.4em] hover:bg-indigo-500 transition-all shadow-2xl shadow-indigo-600/20 active:scale-95 flex items-center gap-4"
          >
            Spustit lekci <i className="fa-solid fa-arrow-right"></i>
          </button>
        </div>
      </div>
    </div>
  );
};

const TabBtn: React.FC<{ active: boolean, onClick: () => void, label: string, icon: string }> = ({ active, onClick, label, icon }) => (
  <button onClick={onClick} className={`flex items-center gap-3 px-6 py-3.5 rounded-2xl transition-all text-[10px] font-black uppercase tracking-widest border ${active ? 'bg-indigo-600 text-white border-indigo-500 shadow-xl shadow-indigo-500/20' : 'text-zinc-500 border-white/5 hover:text-white bg-zinc-950/50 hover:bg-zinc-900'}`}>
    <i className={`fa-solid ${icon} text-[10px]`}></i> {label}
  </button>
);

const SlideViewer: React.FC<{ slides: Slide[]; currentAnnotation?: any; onClearAnnotation?: () => void }> = ({ slides, currentAnnotation, onClearAnnotation }) => {
  const [current, setCurrent] = useState(0);
  const [isFullScreen, setIsFullScreen] = useState(false);
  
  if (!slides || slides.length === 0) return null;

  const content = (
    <div 
      id="main-presentation-area"
      className={`relative flex flex-col justify-center shadow-2xl overflow-hidden transition-all duration-700
      ${isFullScreen 
        ? 'fixed inset-0 z-[6500] bg-black p-10 md:p-32 rounded-0 border-0' 
        : 'aspect-video bg-zinc-950 rounded-[3rem] border border-white/10 p-10 md:p-16'
      }`}
    >
      {/* Visual Annotation Overlay */}
      <AnimatePresence>
        {currentAnnotation && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.5 }}
            className="absolute inset-0 z-[110] pointer-events-none"
          >
            <svg className="w-full h-full">
              {currentAnnotation.type === 'circle' && (
                <motion.ellipse 
                  cx={`${currentAnnotation.x}%`} 
                  cy={`${currentAnnotation.y}%`} 
                  rx={`${currentAnnotation.rx}%`} 
                  ry={`${currentAnnotation.ry}%`}
                  fill="none"
                  stroke="rgba(99, 102, 241, 0.6)"
                  strokeWidth="8"
                  strokeDasharray="20 10"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 1.5, repeat: Infinity, repeatType: 'loop' }}
                />
              )}
              {currentAnnotation.type === 'arrow' && (
                 <motion.path
                   d={`M ${currentAnnotation.x - 10} ${currentAnnotation.y - 10} L ${currentAnnotation.x} ${currentAnnotation.y} L ${currentAnnotation.x - 10} ${currentAnnotation.y + 10}`}
                   fill="none"
                   stroke="rgba(244, 63, 94, 0.8)"
                   strokeWidth="10"
                   initial={{ pathLength: 0 }}
                   animate={{ pathLength: 1 }}
                 />
              )}
            </svg>
            {currentAnnotation.label && (
              <div 
                className="absolute bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-xl shadow-2xl"
                style={{ left: `${currentAnnotation.x}%`, top: `${currentAnnotation.y + 15}%` }}
              >
                {currentAnnotation.label}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Background decoration for full screen */}
      {isFullScreen && (
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-0 w-full h-1/2 bg-gradient-to-b from-indigo-500/10 to-transparent"></div>
          <div className="absolute bottom-0 left-0 w-full h-1/2 bg-gradient-to-t from-black to-transparent"></div>
        </div>
      )}

      {/* Progressive Page Indicator (Top) */}
      <div className={`absolute top-0 left-0 w-full h-1.5 transition-opacity duration-700 ${isFullScreen ? 'bg-white/10' : 'bg-white/5'}`}>
        <div 
          className="h-full bg-indigo-500 shadow-[0_0_20px_rgba(99,102,241,1)] transition-all duration-700" 
          style={{ width: `${((current + 1) / slides.length) * 100}%` }}
        ></div>
      </div>

      {/* Fullscreen Toggle / Close */}
      <div className="absolute top-10 right-10 flex gap-4 z-[100]">
        <button 
          onClick={() => setIsFullScreen(!isFullScreen)}
          className="w-14 h-14 rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 text-white flex items-center justify-center hover:bg-white/10 transition-all shadow-2xl"
          title={isFullScreen ? "Zmenšit" : "Na celou obrazovku"}
        >
          <i className={`fa-solid ${isFullScreen ? 'fa-compress' : 'fa-expand'}`}></i>
        </button>
      </div>

      <div className="relative z-10 max-w-5xl mx-auto w-full">
        <motion.div 
          key={`title-${current}`}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-12"
        >
          <p className="text-[10px] font-black uppercase tracking-[0.5em] text-indigo-500 mb-6 drop-shadow-lg">Slide Overview // {current + 1} z {slides.length}</p>
          <FormattedText text={`# ${slides[current].title}`} className="!mt-0 !mb-0 transition-all duration-700" />
        </motion.div>

        <div className="space-y-6">
          {slides[current].content.map((item, i) => (
            <motion.div 
              key={`item-${current}-${i}`}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
              className="flex items-start gap-8 group"
            >
              <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 mt-3 shrink-0 shadow-[0_0_15px_rgba(99,102,241,0.5)] group-hover:scale-150 transition-transform duration-500"></div>
              <FormattedText text={item} className={`transition-all duration-700 ${isFullScreen ? 'text-2xl md:text-3xl font-bold leading-snug text-white/90' : 'text-lg md:text-xl font-medium leading-tight'}`} />
            </motion.div>
          ))}
        </div>
      </div>

      {/* Floating Controls (Bottom) */}
      <div className={`absolute bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-6 px-10 py-6 rounded-[2.5rem] backdrop-blur-2xl border transition-all duration-700 z-[100]
        ${isFullScreen ? 'bg-white/5 border-white/10 shadow-2xl' : 'bg-black/40 border-white/5 shadow-xl'}
      `}>
        <button 
          onClick={() => {
            setCurrent(c => Math.max(0, c-1));
            onClearAnnotation?.();
          }} 
          disabled={current === 0}
          className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center text-white hover:bg-indigo-600 transition-all border border-white/10 disabled:opacity-20 active:scale-90"
        >
          <i className="fa-solid fa-chevron-left text-xl"></i>
        </button>

        <div className="flex flex-col items-center min-w-[120px]">
          <span className="text-[10px] font-black uppercase tracking-[0.4em] text-zinc-500">Sekvence</span>
          <span className="text-xl font-black text-white tabular-nums tracking-tighter">{current + 1} / {slides.length}</span>
        </div>

        <button 
          onClick={() => {
            setCurrent(c => Math.min(slides.length-1, c+1));
            onClearAnnotation?.();
          }} 
          disabled={current === slides.length-1}
          className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center text-white hover:bg-indigo-600 transition-all border border-white/10 disabled:opacity-20 active:scale-90"
        >
          <i className="fa-solid fa-chevron-right text-xl"></i>
        </button>
      </div>

      {/* Global Navigation Hint */}
      {isFullScreen && (
        <div className="absolute bottom-10 left-10 text-[9px] font-black uppercase tracking-[0.5em] text-zinc-600">
          Gymni Presentation Engine // 0.4.1
        </div>
      )}
    </div>
  );

  return content;
};

const MindMap: React.FC<{ nodes: MindMapNode[], title: string }> = ({ nodes, title }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<{ x1: number, y1: number, x2: number, y2: number }[]>([]);

  useEffect(() => {
    const updateLines = () => {
      if (!containerRef.current) return;
      const centerNode = containerRef.current.querySelector('.center-node');
      const subNodes = containerRef.current.querySelectorAll('.sub-node');
      if (!centerNode) return;

      const centerRect = centerNode.getBoundingClientRect();
      const containerRect = containerRef.current.getBoundingClientRect();

      const cx = centerRect.left + centerRect.width / 2 - containerRect.left;
      const cy = centerRect.top + centerRect.height / 2 - containerRect.top;

      const newLines = Array.from(subNodes).map(node => {
        const nodeRect = node.getBoundingClientRect();
        return {
          x1: cx,
          y1: cy,
          x2: nodeRect.left + nodeRect.width / 2 - containerRect.left,
          y2: nodeRect.top + nodeRect.height / 2 - containerRect.top
        };
      });
      setLines(newLines);
    };

    // Initial update
    setTimeout(updateLines, 100);
    
    window.addEventListener('resize', updateLines);
    return () => window.removeEventListener('resize', updateLines);
  }, [nodes]);

  return (
    <div ref={containerRef} className="p-8 md:p-12 bg-zinc-950/40 rounded-2xl border border-white/5 text-center min-h-[500px] flex flex-col items-center justify-center relative overflow-hidden animate-fade">
      <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-20">
        {lines.map((line, i) => (
          <line key={i} x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} stroke="white" strokeWidth="1" strokeDasharray="4 4" />
        ))}
      </svg>
      <div className="center-node relative z-10 inline-block p-6 bg-indigo-600 rounded-2xl mb-12 shadow-2xl">
        <h2 className="text-lg font-black uppercase tracking-tighter logo-font text-white"><FormattedInline text={title} /></h2>
      </div>
      <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full">
        {nodes.map((node, i) => (
          <div key={i} className="sub-node p-5 bg-zinc-900/80 backdrop-blur-xl rounded-xl border border-white/10 shadow-xl hover:border-indigo-500/30 transition-all">
            <h4 className="font-black uppercase text-[10px] text-indigo-400 mb-3 tracking-tight"><FormattedInline text={node.topic} /></h4>
            <div className="space-y-1">
              {node.details.map((d, j) => <p key={j} className="text-[8px] text-zinc-500 font-bold uppercase tracking-widest leading-relaxed"><FormattedInline text={d} /></p>)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const FlashcardComp: React.FC<{ card: Flashcard }> = ({ card }) => {
  const [flipped, setFlipped] = useState(false);
  return (
    <div className={`flip-card h-72 w-full cursor-pointer transition-transform hover:scale-[1.02] ${flipped ? 'flipped' : ''}`} onClick={() => setFlipped(!flipped)}>
      <div className="flip-card-inner h-full w-full relative"><div className="flip-card-front absolute inset-0 w-full h-full bg-zinc-950 border border-white/10 flex flex-col items-center justify-center p-8 text-center shadow-2xl rounded-[2.5rem] overflow-hidden"><div className="absolute top-6 left-8 text-[8px] font-black text-zinc-700 uppercase tracking-widest">Koncept</div><FormattedText text={card.front} className="font-black text-lg text-white leading-tight uppercase tracking-tight logo-font" /></div><div className="flip-card-back absolute inset-0 w-full h-full bg-indigo-600 border border-white/10 flex flex-col items-center justify-center p-8 text-center shadow-2xl rounded-[2.5rem]"><div className="absolute top-6 left-8 text-[8px] font-black text-indigo-300 uppercase tracking-widest">Vysvětlení</div><FormattedText text={card.back} className="font-bold text-sm text-white leading-relaxed" /></div></div>
    </div>
  );
};

const InteractiveTest: React.FC<{ quiz: QuizSet }> = ({ quiz }) => {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const handleSelect = (idx: number) => { if (selectedIdx !== null) return; setSelectedIdx(idx); if (idx === quiz.questions[currentIdx].correctIndex) setScore(s => s + 1); };
  const next = () => { if (currentIdx < quiz.questions.length - 1) { setCurrentIdx(c => c + 1); setSelectedIdx(null); } else { setFinished(true); } };
  if (finished) return <div className="p-8 text-center bg-zinc-950/50 rounded-2xl border border-white/5"><h4 className="text-2xl font-black text-indigo-500 mb-1">{Math.round((score/quiz.questions.length)*100)}%</h4><p className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Test dokončen</p></div>;
  const q = quiz.questions[currentIdx];
  return (
    <div className="p-8 bg-zinc-950/80 border border-white/5 rounded-2xl animate-fade"><p className="text-lg font-bold text-white mb-6"><FormattedInline text={q.question} /></p><div className="grid grid-cols-1 md:grid-cols-2 gap-3">{q.options.map((opt, i) => (<button key={i} onClick={() => handleSelect(i)} className={`p-4 rounded-xl text-left text-[13px] font-bold border transition-all ${selectedIdx === null ? 'bg-white/5 border-white/10' : i === q.correctIndex ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : selectedIdx === i ? 'bg-red-500/20 border-red-500 text-red-400' : 'opacity-20 border-white/10'}`}><FormattedInline text={opt} /></button>))}</div>{selectedIdx !== null && <button onClick={next} className="w-full mt-6 py-3 bg-indigo-600 rounded-xl text-[9px] font-black uppercase tracking-widest text-white">Pokračovat</button>}</div>
  );
};

function decodeBase64(base64: string) { const binaryString = atob(base64); const len = binaryString.length; const bytes = new Uint8Array(len); for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i); return bytes; }
async function decodeAudioData(data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number): Promise<AudioBuffer> { const dataInt16 = new Int16Array(data.buffer); const frameCount = dataInt16.length / numChannels; const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate); for (let channel = 0; channel < numChannels; channel++) { const channelData = buffer.getChannelData(channel); for (let i = 0; i < frameCount; i++) channelData[i] = dataInt16[i * numChannels + channel] / 32768.0; } return buffer; }

export default StudyOutput;