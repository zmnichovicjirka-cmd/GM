
import React from 'react';
import { motion } from 'motion/react';
import { UserProfile, ScheduleItem, EnhancedArchiveItem } from '../types';
import Calendar from './Calendar';
import Gymi from './Gymi';
import Schedule from './Schedule';

interface DashboardOverviewProps {
  userProfile: UserProfile;
  calendarEvents: Record<string, string>;
  onAddCalendarEvent: (date: string, text: string) => void;
  userSchedule: ScheduleItem[];
  onUpdateSchedule: (schedule: ScheduleItem[]) => void;
  archive: EnhancedArchiveItem[];
  firstAvatar: any;
  onNavigate: (page: string) => void;
  onOpenLesson: (lesson: EnhancedArchiveItem) => void;
}

const DashboardOverview: React.FC<DashboardOverviewProps> = ({
  userProfile,
  calendarEvents,
  onAddCalendarEvent,
  userSchedule,
  onUpdateSchedule,
  archive,
  firstAvatar,
  onNavigate,
  onOpenLesson
}) => {
  const [selectedDate, setSelectedDate] = React.useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  });

  const selectedEvent = calendarEvents[selectedDate];
  const isToday = selectedDate === new Date().toISOString().split('T')[0];

  return (
    <div className="space-y-4 animate-fade h-full">
      {/* Top Section: Information Density */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        
        {/* Left: Quick Stats & Tasks */}
        <div className="lg:col-span-3 h-full">
          <div className="glass-panel rounded-[2rem] bg-zinc-950/40 border-white/5 p-6 flex flex-col justify-between h-full overflow-hidden relative">
            <div className="space-y-6 relative z-10 w-full">
              <div className="flex items-center gap-2">
                <div className={`w-1.5 h-1.5 rounded-full ${isToday ? 'bg-indigo-500 animate-pulse' : 'bg-emerald-500'}`}></div>
                <span className="text-[10px] font-mono font-black uppercase text-zinc-500 tracking-[0.4em]">
                  {isToday ? 'Dnešní Agenta' : 'Cílový den'}
                </span>
              </div>
              
              <div className="space-y-4">
                {selectedEvent ? (
                  <motion.div 
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="p-5 rounded-2xl bg-indigo-600/10 border border-indigo-500/20 space-y-3 group cursor-pointer hover:bg-indigo-600/15 transition-all"
                  >
                    <p className="text-xs font-bold text-indigo-300 uppercase tracking-widest">Aktivita</p>
                    <p className="text-sm font-black text-white leading-relaxed">{selectedEvent}</p>
                  </motion.div>
                ) : (
                  <div className="py-12 text-center border border-dashed border-white/5 rounded-2xl opacity-30">
                    <i className="fa-solid fa-calendar-day mb-3 text-lg"></i>
                    <p className="text-[9px] font-black uppercase tracking-[0.2em]">Žádné plány</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Middle: Technical Calendar & Recent Lessons */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          <div className="glass-panel rounded-[2rem] bg-zinc-950/40 border-white/5 overflow-hidden">
            <Calendar 
              role={userProfile.role} 
              events={calendarEvents} 
              onAddEvent={onAddCalendarEvent} 
              selectedDate={selectedDate}
              onDayClick={(date) => setSelectedDate(date)}
            />
          </div>

          {/* Recent Lessons (Technical List style) */}
          <div className="space-y-3 opacity-60 hover:opacity-100 transition-all">
            <div className="flex items-center gap-3 px-2">
              <div className="w-0.5 h-2 bg-emerald-500 rounded-full"></div>
              <h3 className="text-[8px] font-mono font-black uppercase tracking-[0.5em] text-zinc-600">Nedávné lekce</h3>
            </div>
            
            <div className="flex flex-col gap-2">
              {archive.slice(0, 2).map((item, idx) => (
                <motion.div 
                  whileHover={{ x: 4, background: 'rgba(255,255,255,0.02)' }}
                  key={item.id || idx} 
                  onClick={() => onOpenLesson(item)}
                  className="flex items-center gap-3 p-3 rounded-2xl bg-zinc-950/20 border border-white/5 hover:border-white/10 transition-all cursor-pointer group h-14"
                >
                  <div className="w-8 h-8 rounded-lg bg-zinc-900/50 flex items-center justify-center text-zinc-600 group-hover:bg-indigo-600/50 group-hover:text-white transition-all shrink-0">
                    <i className={`fa-solid ${item.icon || 'fa-book'} text-[10px]`}></i>
                  </div>
                  <div className="flex-grow min-w-0">
                    <p className="text-[7px] font-mono font-black uppercase text-indigo-500/40 tracking-[0.2em] mb-0.5">{item.subject}</p>
                    <p className="text-[9px] font-black text-white uppercase tracking-tight truncate">{item.topic}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Schedule */}
        <div className="lg:col-span-5 h-full">
           <Schedule schedule={userSchedule} onUpdateSchedule={onUpdateSchedule} />
        </div>
      </div>
    </div>
  );
};

export default DashboardOverview;
