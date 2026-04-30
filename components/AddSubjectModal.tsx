
import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Subject } from '../types';
import { DEFAULT_SUBJECTS } from '../src/constants';

interface AddSubjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (subject: Subject) => void;
  existingSubjects: Subject[];
}

const EXTENDED_SUGGESTIONS: Subject[] = [
  ...DEFAULT_SUBJECTS,
  { id: 'en', name: 'Angličtina', icon: 'fa-language', color: 'bg-indigo-500', description: 'Světový jazyk a komunikace.' },
  { id: 'de', name: 'Němčina', icon: 'fa-kaaba', color: 'bg-yellow-600', description: 'Německý jazyk a kultura.' },
  { id: 'psych', name: 'Psychologie', icon: 'fa-brain', color: 'bg-pink-500', description: 'Lidská mysl a chování.' },
  { id: 'soc', name: 'Sociologie', icon: 'fa-users', color: 'bg-teal-500', description: 'Společnost a sociální vztahy.' },
  { id: 'phil', name: 'Filozofie', icon: 'fa-masks-theater', color: 'bg-zinc-600', description: 'Myšlení a podstata bytí.' },
  { id: 'econ', name: 'Ekonomie', icon: 'fa-chart-line', color: 'bg-lime-600', description: 'Trhy, peníze a hospodářství.' },
  { id: 'law', name: 'Právo', icon: 'fa-gavel', color: 'bg-slate-700', description: 'Zákony a právní systém.' },
  { id: 'civics', name: 'Občanská nauka', icon: 'fa-flag', color: 'bg-sky-600', description: 'Stát, společnost a občan.' },
  { id: 'art', name: 'Výtvarná výchova', icon: 'fa-palette', color: 'bg-fuchsia-500', description: 'Umění a kreativní tvorba.' },
  { id: 'music', name: 'Hudební výchova', icon: 'fa-music', color: 'bg-rose-500', description: 'Teorie a praxe hudby.' },
];

const AddSubjectModal: React.FC<AddSubjectModalProps> = ({ isOpen, onClose, onAdd, existingSubjects }) => {
  const [query, setQuery] = useState('');

  const filteredSuggestions = useMemo(() => {
    if (!query.trim()) return [];
    const normalizedQuery = query.toLowerCase().trim();
    return EXTENDED_SUGGESTIONS.filter(s => 
      s.name.toLowerCase().includes(normalizedQuery) && 
      !existingSubjects.some(existing => existing.name.toLowerCase() === s.name.toLowerCase())
    ).slice(0, 5);
  }, [query, existingSubjects]);

  const topSuggestions = useMemo(() => {
    return EXTENDED_SUGGESTIONS
      .filter(s => !existingSubjects.some(existing => existing.name.toLowerCase() === s.name.toLowerCase()))
      .slice(0, 6);
  }, [existingSubjects]);

  const handleSelect = (s: Subject) => {
    onAdd(s);
    setQuery('');
  };

  const handleCustomAdd = () => {
    if (!query.trim()) return;
    
    // Check if it matches an existing suggestion first
    const matched = EXTENDED_SUGGESTIONS.find(s => s.name.toLowerCase() === query.trim().toLowerCase());
    if (matched) {
      handleSelect(matched);
      return;
    }

    const newSub: Subject = {
      id: `custom_${Date.now()}`,
      name: query.trim(),
      icon: 'fa-star',
      color: 'bg-indigo-600',
      isCustom: true,
      description: `Vlastní předmět: ${query.trim()}`
    };
    onAdd(newSub);
    setQuery('');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[5000] flex items-center justify-center p-4 md:p-6 bg-black/60 backdrop-blur-md animate-fade">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="w-full max-w-lg bg-[#020617] border border-white/10 rounded-[2.5rem] p-6 md:p-8 shadow-[0_40px_100px_rgba(0,0,0,0.8)] relative overflow-hidden flex flex-col max-h-[85vh]"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 via-transparent to-transparent pointer-events-none" />
        
        <button onClick={onClose} className="absolute top-6 right-6 w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center transition-all z-20">
          <i className="fa-solid fa-xmark text-zinc-500 text-xs"></i>
        </button>

        <div className="relative z-10 space-y-6 flex flex-col h-full overflow-hidden">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-xl shadow-indigo-500/20">
              <i className="fa-solid fa-plus text-base"></i>
            </div>
            <div className="space-y-0.5">
              <h3 className="text-xl font-black uppercase text-white tracking-tighter italic-serif-header leading-tight">Nový <span className="text-indigo-500">předmět</span></h3>
              <p className="text-zinc-500 font-bold text-[8px] uppercase tracking-[0.2em]">Rozšiř svůj studijní horizont</p>
            </div>
          </div>

          <div className="space-y-5 flex flex-col flex-grow overflow-hidden">
            <div className="relative group">
              <div className="absolute inset-y-0 left-4 flex items-center text-zinc-500 group-focus-within:text-indigo-400 transition-colors">
                <i className="fa-solid fa-magnifying-glass text-xs"></i>
              </div>
              <input 
                type="text" 
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCustomAdd()}
                placeholder="Zadej název (např. Psychologie...)"
                className="w-full bg-white/5 border border-white/5 rounded-xl py-4 pl-12 pr-20 text-white focus:border-indigo-500/50 focus:bg-white/[0.07] outline-none transition-all font-black uppercase tracking-tight text-base placeholder:text-zinc-700"
              />
              <button 
                onClick={handleCustomAdd}
                disabled={!query.trim()}
                className="absolute right-2 top-2 bottom-2 px-4 rounded-lg bg-indigo-600 text-white text-[9px] font-black uppercase tracking-widest shadow-md hover:bg-indigo-500 disabled:opacity-20 disabled:grayscale transition-all active:scale-95"
              >
                Přidat
              </button>
            </div>

            <div className="flex-grow overflow-y-auto no-scrollbar space-y-6 py-1">
              {filteredSuggestions.length > 0 && (
                <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                  <h4 className="text-[9px] font-mono font-black uppercase tracking-[0.3em] text-indigo-500/70 ml-1">Nalezené navrhy</h4>
                  <div className="grid grid-cols-1 gap-2">
                    {filteredSuggestions.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => handleSelect(s)}
                        className="w-full group p-3 rounded-xl bg-white/5 border border-white/5 hover:border-indigo-500/30 hover:bg-white/10 transition-all flex items-center gap-4 text-left"
                      >
                         <div className={`w-10 h-10 rounded-lg ${s.color} flex items-center justify-center text-white shadow-lg shrink-0 group-hover:scale-105 transition-transform duration-300`}>
                           <i className={`fa-solid ${s.icon} text-sm`}></i>
                         </div>
                         <div className="flex-grow min-w-0">
                            <h5 className="text-[11px] font-black text-white uppercase tracking-tight mb-0.5 truncate">{s.name}</h5>
                            <p className="text-[8px] font-medium text-zinc-500 uppercase tracking-widest line-clamp-1">{s.description}</p>
                         </div>
                         <i className="fa-solid fa-plus text-white/20 group-hover:text-white group-hover:translate-x-1 transition-all text-[8px] mr-2"></i>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <h4 className="text-[9px] font-mono font-black uppercase tracking-[0.3em] text-zinc-600 ml-1">Nejpoužívanější</h4>
                <div className="grid grid-cols-2 gap-3">
                  {topSuggestions.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => handleSelect(s)}
                      className="group p-3 rounded-xl bg-white/5 border border-white/5 hover:border-indigo-500/30 hover:bg-white/10 transition-all flex items-center gap-3 text-left"
                    >
                       <div className={`w-8 h-8 rounded-lg ${s.color} flex items-center justify-center text-white shadow-sm shrink-0 group-hover:scale-110 transition-transform`}>
                         <i className={`fa-solid ${s.icon} text-xs`}></i>
                       </div>
                       <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest group-hover:text-white transition-colors truncate">{s.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default AddSubjectModal;
