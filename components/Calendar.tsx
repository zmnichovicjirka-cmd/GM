
import React, { useState, useEffect } from 'react';
import { UserRole, ScheduleItem } from '../types';
import { motion, AnimatePresence } from 'motion/react';

interface CalendarProps {
  role: UserRole;
  events: Record<string, string>;
  onAddEvent: (date: string, text: string) => void;
  selectedDate?: string | null;
  onDayClick?: (date: string) => void;
}

const Calendar: React.FC<CalendarProps> = ({ role, events, onAddEvent, selectedDate, onDayClick }) => {
  const days = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'];
  const now = new Date();
  const [currentDate, setCurrentDate] = useState(new Date());
  const today = now.getDate();
  const isCurrentMonth = currentDate.getMonth() === now.getMonth() && currentDate.getFullYear() === now.getFullYear();
  
  const monthName = currentDate.toLocaleString('cs-CZ', { month: 'long' });
  const year = currentDate.getFullYear();

  const [isAdding, setIsAdding] = useState(false);
  const [selectedDateStr, setSelectedDateStr] = useState<string | null>(null);
  const [newEventText, setNewEventText] = useState('');

  const getDaysInMonth = (month: number, year: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (month: number, year: number) => {
    const day = new Date(year, month, 1).getDay();
    return day === 0 ? 6 : day - 1; // Adjust for Monday start
  };

  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const daysInMonth = getDaysInMonth(currentDate.getMonth(), currentDate.getFullYear());
  const firstDay = getFirstDayOfMonth(currentDate.getMonth(), currentDate.getFullYear());

  const accentColor = role === 'teacher' ? 'bg-emerald-500' : 'bg-indigo-500';
  const accentBorder = role === 'teacher' ? 'border-emerald-500/30' : 'border-indigo-500/30';

  return (
    <div className="relative p-5 rounded-[2rem] bg-zinc-950 border border-white/5 shadow-xl min-h-[400px]">
      <div className="flex items-center justify-between mb-6 relative z-10 px-1">
        <div>
          <h3 className="text-lg font-black capitalize tracking-tight text-white">{monthName}</h3>
          <div className="flex items-center gap-2 mt-1">
             <div className={`w-1 h-1 rounded-full ${accentColor}`}></div>
             <p className="text-[7px] font-black uppercase tracking-[0.3em] text-zinc-600">{year}</p>
          </div>
        </div>
        <div className="flex gap-1.5">
          <button 
            onClick={handlePrevMonth}
            className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center hover:bg-zinc-800 transition-all border border-white/5 group"
          >
            <i className="fa-solid fa-chevron-left text-[9px] group-hover:-translate-x-0.5 transition-transform"></i>
          </button>
          <button 
            onClick={handleNextMonth}
            className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center hover:bg-zinc-800 transition-all border border-white/5 group"
          >
            <i className="fa-solid fa-chevron-right text-[9px] group-hover:translate-x-0.5 transition-transform"></i>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1.5 relative z-10">
        {days.map(d => (
          <div key={d} className="text-center text-[9px] font-black uppercase text-zinc-700 pb-3">{d}</div>
        ))}
        
        {Array.from({ length: firstDay }).map((_, i) => (
          <div key={`empty-${i}`} className="aspect-square opacity-20"></div>
        ))}

        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const isToday = isCurrentMonth && day === today;
          const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const hasEvent = events[dateStr];
          
          const isSelected = selectedDate === dateStr;
          
          return (
            <motion.div 
              key={day} 
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              className="aspect-square relative flex flex-col items-center justify-center group cursor-pointer"
              onClick={() => {
                if (onDayClick) {
                  // If clicking the same day, open edit modal
                  if (selectedDate === dateStr) {
                    setSelectedDateStr(dateStr);
                    setIsAdding(true);
                    setNewEventText(events[dateStr] || '');
                  }
                  onDayClick(dateStr);
                } else {
                  setSelectedDateStr(dateStr);
                  setIsAdding(true);
                  setNewEventText(events[dateStr] || '');
                }
              }}
            >
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-[13px] font-black transition-all duration-300
                ${isToday ? `${accentColor} text-white shadow-xl shadow-indigo-500/30` : isSelected ? 'bg-zinc-800 text-white border border-indigo-500/50' : 'hover:bg-white/10 text-zinc-500 hover:text-white'}
                ${hasEvent && !isToday && !isSelected ? `border ${accentBorder} text-white bg-indigo-500/5` : ''}
              `}>
                {day}
              </div>
              {hasEvent && !isToday && (
                <div className={`w-1 h-1 rounded-full absolute bottom-2 ${accentColor}`}></div>
              )}
            </motion.div>
          );
        })}
      </div>

      <AnimatePresence>
        {isAdding && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="w-full max-w-xs glass-panel p-10 rounded-[3rem] border-white/10 shadow-[0_40px_80px_rgba(0,0,0,0.8)] space-y-8"
            >
              <div className="flex justify-between items-center">
                <div className="space-y-1">
                  <h4 className="text-[10px] font-black uppercase tracking-[0.4em] text-indigo-400">Událost</h4>
                  <p className="text-xl font-black text-white tracking-tighter">
                    {selectedDateStr?.split('-').reverse().join('. ')}
                  </p>
                </div>
                <button onClick={() => setIsAdding(false)} className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-zinc-500 hover:text-white transition-colors">
                  <i className="fa-solid fa-xmark"></i>
                </button>
              </div>
              
              <div className="space-y-4">
                 <textarea 
                   autoFocus
                   rows={3}
                   value={newEventText}
                   onChange={(e) => setNewEventText(e.target.value)}
                   placeholder="Co tě čeká? (úkol, test, lekce...)"
                   className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-all placeholder:text-zinc-700 resize-none"
                 />
              </div>

              <button 
                onClick={() => {
                  if (selectedDateStr) {
                    onAddEvent(selectedDateStr, newEventText);
                    setIsAdding(false);
                  }
                }}
                className="w-full py-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl text-[11px] font-black uppercase tracking-[0.3em] transition-all shadow-xl shadow-indigo-600/20 active:scale-95"
              >
                Potvrdit
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Calendar;
