
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ScheduleItem } from '../types';

interface ScheduleProps {
  schedule: ScheduleItem[];
  onUpdateSchedule: (items: ScheduleItem[]) => void;
}

const Schedule: React.FC<ScheduleProps> = ({ schedule, onUpdateSchedule }) => {
  const days = ['Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota', 'Neděle'];
  const [activeDay, setActiveDay] = useState(new Date().toLocaleDateString('cs-CZ', { weekday: 'long' }));
  const [isEditing, setIsEditing] = useState(false);
  const [newItem, setNewItem] = useState({ startTime: '', endTime: '', subject: '', topic: '' });

  const filteredSchedule = schedule.filter(item => item.day.toLowerCase() === activeDay.toLowerCase());

  const addItem = () => {
    if (!newItem.startTime || !newItem.subject) return;
    const item: ScheduleItem = {
      id: Math.random().toString(36).substr(2, 9),
      day: activeDay,
      ...newItem,
      completed: false
    };
    onUpdateSchedule([...schedule, item].sort((a, b) => a.startTime.localeCompare(b.startTime)));
    setNewItem({ startTime: '', endTime: '', subject: '', topic: '' });
  };

  const removeItem = (id: string) => {
    onUpdateSchedule(schedule.filter(i => i.id !== id));
  };

  const toggleComplete = (id: string) => {
    onUpdateSchedule(schedule.map(i => i.id === id ? { ...i, completed: !i.completed } : i));
  };

  return (
    <div className="relative p-6 lg:p-8 rounded-[2rem] bg-zinc-950 border border-white/5 shadow-2x h-full">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10 mb-8">
        <div className="space-y-1">
           <h4 className="text-[10px] font-black uppercase text-indigo-500 tracking-[0.4em]">Rozvrh</h4>
           <p className="text-2xl font-black text-white uppercase tracking-tighter italic-serif-header">Plánování</p>
        </div>
        <button 
          onClick={() => setIsEditing(!isEditing)}
          className={`px-8 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all ${
            isEditing 
            ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-600/20' 
            : 'bg-white/5 border border-white/10 text-zinc-500 hover:text-white hover:border-white/20'
          }`}
        >
          {isEditing ? 'Hotovo' : 'Upravit rozvrh'}
        </button>
      </div>

      {/* Day Selector */}
      <div className="flex items-center gap-2 p-2 rounded-[2rem] bg-white/5 border border-white/5 overflow-x-auto no-scrollbar relative z-10">
         {days.map(d => (
           <button 
             key={d} 
             onClick={() => setActiveDay(d)}
             className={`px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${
               activeDay.toLowerCase() === d.toLowerCase() 
                 ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' 
                 : 'text-zinc-600 hover:text-zinc-400 hover:bg-white/5'
             }`}
           >
             {d}
           </button>
         ))}
      </div>

      <div className="relative z-10 min-h-[300px]">
        {isEditing && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-10 p-8 rounded-[2.5rem] bg-indigo-500/5 border border-indigo-500/10 grid grid-cols-1 md:grid-cols-4 gap-4 items-end"
          >
            <div className="space-y-2">
              <label className="text-[9px] font-black uppercase text-zinc-600 tracking-widest ml-1">Od</label>
              <input 
                type="time" 
                value={newItem.startTime}
                onChange={e => setNewItem({...newItem, startTime: e.target.value})}
                className="w-full bg-zinc-900/50 border border-white/5 rounded-xl p-4 text-white text-xs focus:outline-none focus:border-indigo-500 transition-all"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[9px] font-black uppercase text-zinc-600 tracking-widest ml-1">Do</label>
              <input 
                type="time" 
                value={newItem.endTime}
                onChange={e => setNewItem({...newItem, endTime: e.target.value})}
                className="w-full bg-zinc-900/50 border border-white/5 rounded-xl p-4 text-white text-xs focus:outline-none focus:border-indigo-500 transition-all"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[9px] font-black uppercase text-zinc-600 tracking-widest ml-1">Předmět</label>
              <input 
                type="text" 
                placeholder="Matematika..."
                value={newItem.subject}
                onChange={e => setNewItem({...newItem, subject: e.target.value})}
                className="w-full bg-zinc-900/50 border border-white/5 rounded-xl p-4 text-white text-xs focus:outline-none focus:border-indigo-500 transition-all placeholder:text-zinc-800"
              />
            </div>
            <button 
              onClick={addItem}
              className="h-[52px] bg-white text-black rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-zinc-200 transition-all"
            >
              Přidat
            </button>
          </motion.div>
        )}

        <div className="space-y-4">
          <AnimatePresence mode="popLayout">
            {filteredSchedule.length > 0 ? filteredSchedule.map((item, idx) => (
              <motion.div 
                layout
                key={item.id} 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className={`group flex items-center gap-8 p-6 rounded-[2.5rem] border transition-all ${
                  item.completed 
                    ? 'bg-emerald-600/[0.02] border-emerald-500/10 opacity-40 shadow-none scale-[0.98]' 
                    : 'bg-white/[0.02] border-white/5 hover:border-indigo-500/30 hover:bg-white/[0.04] shadow-xl'
                }`}
              >
                <div className="flex flex-col items-center gap-1 shrink-0">
                   <div className="text-[11px] font-black text-indigo-400 tabular-nums">{item.startTime}</div>
                   <div className="w-[1px] h-3 bg-zinc-800"></div>
                   <div className="text-[10px] font-black text-zinc-600 tabular-nums">{item.endTime || '--:--'}</div>
                </div>

                <div className="flex-grow">
                   <p className={`text-lg font-black uppercase tracking-tight ${item.completed ? 'text-zinc-600 line-through' : 'text-zinc-100'}`}>
                      {item.subject}
                   </p>
                   {item.topic && <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest mt-1 opacity-60">{item.topic}</p>}
                </div>

                <div className="flex items-center gap-4">
                   {isEditing ? (
                      <button onClick={() => removeItem(item.id)} className="w-12 h-12 rounded-2xl bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white transition-all flex items-center justify-center">
                        <i className="fa-solid fa-trash-can text-sm"></i>
                      </button>
                   ) : (
                      <button 
                        onClick={() => toggleComplete(item.id)}
                        className={`w-12 h-12 rounded-2xl border flex items-center justify-center transition-all ${
                          item.completed ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-white/10 bg-black/40 hover:border-indigo-500'
                        }`}
                      >
                         <i className={`fa-solid ${item.completed ? 'fa-check' : 'fa-check opacity-0 group-hover:opacity-100'} text-sm`}></i>
                      </button>
                   )}
                </div>
              </motion.div>
            )) : (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center py-20 space-y-6 opacity-20"
              >
                <div className="w-20 h-20 rounded-full border-2 border-dashed border-zinc-700 flex items-center justify-center">
                   <i className="fa-solid fa-calendar-plus text-3xl"></i>
                </div>
                <div className="text-center space-y-2">
                   <p className="text-xs font-black uppercase tracking-[0.4em]">Žádné lekce na {activeDay}</p>
                   <p className="text-[10px] font-bold text-zinc-500 italic">Klikni na upravit a sestav si svůj ideální den</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default Schedule;
