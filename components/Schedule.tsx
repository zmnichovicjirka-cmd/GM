
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ScheduleItem } from '../types';

interface ScheduleProps {
  schedule: ScheduleItem[];
  userProfile: any;
  onUpdateSchedule: (items: ScheduleItem[]) => void;
  onAction?: (type: 'lesson' | 'exercise', item: ScheduleItem) => void;
  selectedDate?: string;
  archive?: any[];
}

const DAYS = ['Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek'];
const SLOTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const DEFAULT_SUBJECTS = ['Matematika', 'Fyzika', 'Chemie', 'Biologie', 'Dějepis', 'Informatika', 'Čeština', 'Angličtina', 'Zeměpis', 'Občanská nauka'];

const Schedule: React.FC<ScheduleProps> = ({ schedule, userProfile, onUpdateSchedule, onAction, selectedDate, archive }) => {
  const getDayFromDate = (dateStr?: string) => {
    const date = dateStr ? new Date(dateStr) : new Date();
    const dayIndex = date.getDay();
    if (dayIndex === 0 || dayIndex === 6) return DAYS[0];
    return DAYS[dayIndex - 1];
  };

  const [activeDay, setActiveDay] = useState(getDayFromDate(selectedDate));

  React.useEffect(() => {
    if (selectedDate) {
      setActiveDay(getDayFromDate(selectedDate));
    }
  }, [selectedDate]);
  const [editingSlot, setEditingSlot] = useState<number | null>(null);
  
  const [slotData, setSlotData] = useState({ 
    subject: '', 
    startTime: '', 
    endTime: '',
    notes: '',
    imageURL: ''
  });
  const [isDictating, setIsDictating] = useState(false);

  const formatTimeInput = (value: string) => {
    // Remove any non-digits
    const cleaner = value.replace(/\D/g, '');
    if (cleaner.length <= 2) return cleaner;
    if (cleaner.length <= 4) return `${cleaner.slice(0, 2)}:${cleaner.slice(2)}`;
    return `${cleaner.slice(0, 2)}:${cleaner.slice(2, 4)}`;
  };

  const handleTimeChange = (type: 'start' | 'end', value: string) => {
    const formatted = formatTimeInput(value);
    setSlotData(prev => ({ 
      ...prev, 
      [type === 'start' ? 'startTime' : 'endTime']: formatted 
    }));
  };

  const getSlotItem = (num: number) => {
    // 1. Try to find date-specific item
    if (selectedDate) {
      const dateItem = schedule.find(i => i.date === selectedDate && i.slotNumber === num);
      if (dateItem) return dateItem;
    }
    // 2. Fallback to general weekday item
    return schedule.find(i => i.day === activeDay && !i.date && i.slotNumber === num);
  };
  
  const getSuggestions = () => {
    const profileSubs = (userProfile.subjects || []).map((s: any) => s.name);
    const combined = Array.from(new Set([...profileSubs, ...DEFAULT_SUBJECTS]));
    
    const filtered = combined.filter(s => 
      s.toLowerCase().includes(slotData.subject.toLowerCase()) || slotData.subject === ''
    );
    
    return filtered.slice(0, 6);
  };

  const handleEditSlot = (num: number) => {
    const item = getSlotItem(num);
    setSlotData({
      subject: item?.subject || '',
      startTime: item?.startTime || `${8 + num}:00`,
      endTime: item?.endTime || `${9 + num}:00`,
      notes: item?.notes || '',
      imageURL: item?.imageURL || ''
    });
    setEditingSlot(num);
  };

  const startDictation = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) return;
    setIsDictating(true);
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'cs-CZ';
    recognition.onresult = (event: any) => {
      const text = event.results[0][0].transcript;
      setSlotData(prev => ({ ...prev, notes: prev.notes ? `${prev.notes} ${text}` : text }));
      setIsDictating(false);
    };
    recognition.onerror = () => setIsDictating(false);
    recognition.onend = () => setIsDictating(false);
    recognition.start();
  };

  const saveSlot = () => {
    if (!editingSlot) return;
    let newSchedule = [...schedule];
    
    // Find if we are editing an existing item (either date-specific or template)
    const itemToEdit = getSlotItem(editingSlot);
    
    if (itemToEdit) {
      const existingIdx = newSchedule.findIndex(i => i.id === itemToEdit.id);
      
      // If we are editing a TEMPLATE (no date) but we have a selectedDate, 
      // we should CREATE a new date-specific item instead of modifying the template,
      // UNLESS the user is intentionally editing the template?
      // Actually, user intent often means "I want a note for TODAY".
      
      if (!itemToEdit.date && selectedDate && (slotData.notes !== '' || slotData.subject !== itemToEdit.subject)) {
        // Create new date-specific item
        newSchedule.push({
          id: Math.random().toString(36).substr(2, 9),
          day: activeDay,
          date: selectedDate,
          slotNumber: editingSlot,
          ...slotData,
          completed: false
        });
      } else {
        // Modify existing (either template or date-specific)
        if (slotData.subject.trim() === '' && slotData.notes.trim() === '') {
          newSchedule.splice(existingIdx, 1);
        } else {
          newSchedule[existingIdx] = { ...newSchedule[existingIdx], ...slotData };
        }
      }
    } else if (slotData.subject.trim() !== '' || slotData.notes.trim() !== '') {
      // New item
      newSchedule.push({
        id: Math.random().toString(36).substr(2, 9),
        day: activeDay,
        date: selectedDate, // Save with date if available
        slotNumber: editingSlot,
        ...slotData,
        completed: false
      });
    }
    
    onUpdateSchedule(newSchedule.sort((a, b) => {
      if (a.date && b.date && a.date !== b.date) return a.date.localeCompare(b.date);
      if (a.day !== b.day) return DAYS.indexOf(a.day) - DAYS.indexOf(b.day);
      return (a.slotNumber || 0) - (b.slotNumber || 0);
    }));
  };

  return (
    <div className="relative p-5 lg:p-6 rounded-[1.5rem] bg-zinc-950 border border-white/5 shadow-2xl h-full flex flex-col overflow-hidden">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 relative z-10 mb-6 shrink-0">
        <div className="space-y-0.5">
           <h4 className="text-[9px] font-black uppercase text-indigo-500 tracking-[0.4em]">Struktura</h4>
           <p className="text-xl font-black text-white uppercase tracking-tighter text-shadow-glow">Rozvrh Hodin</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-0.5 p-1 rounded-lg bg-white/[0.02] border border-white/5 mb-5 relative z-10 w-fit shrink-0">
         {DAYS.map(d => (
           <button 
             key={d} 
             onClick={() => setActiveDay(d)}
             className={`px-2.5 h-7 flex items-center justify-center rounded-md text-[8px] font-black uppercase tracking-widest transition-all ${
               activeDay.toLowerCase() === d.toLowerCase() 
                 ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20 scale-105' 
                 : 'text-zinc-700 hover:text-zinc-400 hover:bg-white/5'
             }`}
           >
             {d}
           </button>
         ))}
      </div>

      <div className="relative z-10 flex-grow overflow-y-auto no-scrollbar pb-3 group/grid">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {SLOTS.map(num => {
            const item = getSlotItem(num);
            return (
              <button
                key={num}
                onClick={() => handleEditSlot(num)}
                className={`aspect-square rounded-[2rem] border transition-all duration-500 relative overflow-hidden group/item flex flex-col items-center justify-center ${
                  item 
                  ? item.notes 
                    ? 'bg-purple-500/10 border-purple-500/30 text-white shadow-[0_0_30px_rgba(168,85,247,0.15)] hover:border-purple-500/60 hover:bg-purple-500/20'
                    : 'bg-indigo-500/5 border-indigo-500/20 text-white shadow-[0_0_30px_rgba(79,70,229,0.1)] hover:border-indigo-500/50 hover:bg-indigo-500/10' 
                  : 'bg-white/[0.02] border-white/5 text-zinc-900 hover:border-white/10 hover:bg-white/[0.04]'
                }`}
              >
                {/* Background Glow for active items */}
                {item && <div className={`absolute inset-0 bg-gradient-to-br opacity-50 ${item.notes ? 'from-purple-600/15' : 'from-indigo-600/10'} via-transparent to-transparent`} />}
                
                <div className="relative z-10 flex flex-col items-center gap-1">
                  <span className={`text-[10px] font-black tracking-widest transition-all ${item ? item.notes ? 'text-purple-400' : 'text-indigo-400' : 'opacity-20 group-hover/item:opacity-40'}`}>
                    {num < 10 ? `0${num}` : num}
                  </span>
                  
                  {item ? (
                    <div className="flex flex-col items-center gap-0.5">
                      <p className="text-[10px] font-black uppercase truncate max-w-[80px] text-center tracking-tight leading-none text-white/90">
                        {item.subject}
                      </p>
                      <p className={`text-[7px] font-black uppercase tracking-[0.1em] tabular-nums ${item.notes ? 'text-purple-500/60' : 'text-indigo-500/60'}`}>
                        {item.startTime || '--:--'}
                      </p>
                    </div>
                  ) : (
                    <i className="fa-solid fa-plus text-[8px] opacity-0 group-hover/item:opacity-20 transition-opacity"></i>
                  )}
                </div>

                {item?.completed && (
                  <div className="absolute top-3 right-3 w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <AnimatePresence>
        {editingSlot !== null && (
          <div 
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-8 bg-black/98 backdrop-blur-3xl"
            onClick={() => {
              saveSlot();
              setEditingSlot(null);
            }}
          >
            <motion.div 
              initial={{ opacity: 0, scale: 0.98, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 10 }}
              className="bg-black border border-white/10 rounded-[2rem] w-full max-w-5xl h-[90vh] lg:h-[80vh] shadow-[0_40px_100px_rgba(0,0,0,1)] overflow-hidden relative"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex flex-col lg:grid lg:grid-cols-2 h-full">
                {/* Left Column: Subject & Time */}
                <div className="p-8 lg:p-12 border-b lg:border-b-0 lg:border-r border-white/5 flex flex-col gap-10">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 text-indigo-500 font-bold text-[10px] tracking-[0.3em] uppercase">
                      <span className="w-6 h-[2px] bg-indigo-500/50 rounded-full" />
                      {activeDay} • {editingSlot}. Hodina
                    </div>
                    <button 
                      onClick={() => { saveSlot(); setEditingSlot(null); }}
                      className="lg:hidden w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-zinc-500"
                    >
                      <i className="fa-solid fa-xmark"></i>
                    </button>
                  </div>

                  <div className="space-y-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Název Předmětu</label>
                      <input 
                        autoFocus
                        type="text" 
                        placeholder="Matematika..."
                        value={slotData.subject}
                        onChange={(e) => setSlotData({ ...slotData, subject: e.target.value })}
                        className="w-full bg-transparent border-none p-0 text-4xl font-black text-white placeholder:text-zinc-900 focus:outline-none focus:ring-0 tracking-tighter"
                      />
                    </div>
                    
                    {/* Suggestions */}
                    <div className="flex flex-wrap gap-2 pt-2">
                       {getSuggestions().map((sName) => (
                        <button 
                          key={sName}
                          onClick={() => setSlotData(prev => ({ ...prev, subject: sName }))}
                          className={`px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-all ${
                            slotData.subject.toLowerCase() === sName.toLowerCase()
                            ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30' 
                            : 'bg-white/[0.03] border border-white/5 text-zinc-500 hover:text-white'
                          }`}
                        >
                          {sName}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="mt-auto grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Začátek</label>
                      <input 
                        type="text" 
                        placeholder="00:00"
                        value={slotData.startTime}
                        onChange={(e) => handleTimeChange('start', e.target.value)}
                        className="w-full px-6 py-4 rounded-xl bg-white/[0.02] border border-white/5 text-xl font-black text-white focus:outline-none focus:border-indigo-500/50 transition-all text-center placeholder:text-zinc-900"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Konec</label>
                      <input 
                        type="text" 
                        placeholder="00:00"
                        value={slotData.endTime}
                        onChange={(e) => handleTimeChange('end', e.target.value)}
                        className="w-full px-6 py-4 rounded-xl bg-white/[0.02] border border-white/5 text-xl font-black text-white focus:outline-none focus:border-indigo-500/50 transition-all text-center placeholder:text-zinc-900"
                      />
                    </div>
                  </div>
                </div>

                {/* Right Column: Notes & Action */}
                <div className="p-8 lg:p-12 flex flex-col h-full bg-white/[0.01]">
                  <div className="flex items-center justify-between mb-6 shrink-0">
                    <h5 className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.3em]">Co se probíralo?</h5>
                    <button 
                      onClick={() => { saveSlot(); setEditingSlot(null); }}
                      className="hidden lg:flex w-10 h-10 rounded-xl bg-white/5 border border-white/10 items-center justify-center text-zinc-500 hover:text-white transition-all group/close"
                    >
                      <i className="fa-solid fa-xmark text-lg group-hover/close:rotate-90 transition-transform"></i>
                    </button>
                  </div>

                  <div className="flex-grow relative flex flex-col group">
                    <textarea 
                      value={slotData.notes}
                      onChange={(e) => setSlotData(prev => ({ ...prev, notes: e.target.value }))}
                      placeholder="Sem napiš, o čem ta hodina byla..."
                      className="w-full h-full bg-transparent border-none p-0 text-sm font-medium text-white/70 placeholder:text-zinc-900 focus:outline-none focus:ring-0 resize-none leading-relaxed no-scrollbar"
                    />
                    
                    {/* Bottom Controls */}
                    <div className="mt-6 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2">
                        {slotData.imageURL && (
                          <div className="w-10 h-10 rounded-lg overflow-hidden border border-white/10 shadow-xl relative group/img">
                             <img src={slotData.imageURL} className="w-full h-full object-cover" alt="Thumb" />
                             <button 
                               onClick={() => setSlotData(prev => ({ ...prev, imageURL: '' }))}
                               className="absolute inset-0 bg-black/60 opacity-0 group-hover/img:opacity-100 flex items-center justify-center text-white text-[10px]"
                             >
                               <i className="fa-solid fa-trash-can"></i>
                             </button>
                          </div>
                        )}
                        <div className="p-1 rounded-xl bg-white/[0.03] border border-white/5 flex items-center gap-1">
                          <button 
                            className="w-10 h-10 rounded-lg flex items-center justify-center text-zinc-600 hover:text-white transition-all relative"
                          >
                            <i className="fa-solid fa-camera text-sm"></i>
                            <input 
                              type="file" 
                              className="absolute inset-0 opacity-0 cursor-pointer" 
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  const reader = new FileReader();
                                  reader.onload = (ev) => setSlotData(prev => ({ ...prev, imageURL: ev.target?.result as string }));
                                  reader.readAsDataURL(file);
                                }
                              }}
                            />
                          </button>
                          <button 
                            onClick={startDictation}
                            className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all ${
                              isDictating ? 'bg-red-500 text-white animate-pulse' : 'text-zinc-600 hover:text-white'
                            }`}
                          >
                            <i className={`fa-solid ${isDictating ? 'fa-microphone-lines' : 'fa-microphone text-sm'}`}></i>
                          </button>
                        </div>
                      </div>

                      <button 
                        onClick={() => {
                          const currentItem = getSlotItem(editingSlot);
                          saveSlot();
                          onAction?.('exercise', { ...(currentItem || {}), ...slotData } as any);
                          setEditingSlot(null);
                        }}
                        disabled={!slotData.notes.trim()}
                        className={`px-8 py-3.5 rounded-xl font-black text-[10px] uppercase tracking-[0.3em] transition-all flex items-center gap-3 ${
                          slotData.notes.trim() 
                          ? 'bg-emerald-500 text-black shadow-[0_10px_20px_rgba(16,185,129,0.3)] hover:scale-105 active:scale-95' 
                          : 'bg-white/5 text-zinc-700 cursor-not-allowed'
                        }`}
                      >
                        <i className={`fa-solid ${
                          archive?.some(a => a.subject === slotData.subject && a.topic === slotData.notes.slice(0, 50)) // Rough check
                          || archive?.some(a => a.subject === slotData.subject && slotData.notes.toLowerCase().includes(a.topic.toLowerCase()))
                          ? 'fa-book-open' : 'fa-wand-magic-sparkles'
                        }`}></i>
                        {archive?.some(a => a.subject === slotData.subject && slotData.notes.toLowerCase().includes(a.topic.toLowerCase() || ''))
                         ? 'Otevřít rekapitulaci' : 'Rekapitulace'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 opacity-5 pointer-events-none w-full text-center">
                 <p className="text-[7px] font-black uppercase tracking-[1.5em]">Cosmic Interface v3.4</p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Schedule;
