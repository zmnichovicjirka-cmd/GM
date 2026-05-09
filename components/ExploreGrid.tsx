
import React from 'react';
import { motion } from 'motion/react';
import { SavedCurriculum } from '../types';
import Gymi from './Gymi';
import { Skeleton } from './Skeleton';

interface ExploreGridProps {
  publishedCurricula: SavedCurriculum[];
  filterSubject: string;
  setFilterSubject: (s: string) => void;
  filterGrade: string;
  setFilterGrade: (g: string) => void;
  onExplore: (curriculum: SavedCurriculum) => void;
  avatarURL?: string | null;
  avatarPoses?: { [poseName: string]: string };
  isLoading?: boolean;
}

const ExploreGrid: React.FC<ExploreGridProps> = ({
  publishedCurricula,
  filterSubject,
  setFilterSubject,
  filterGrade,
  setFilterGrade,
  onExplore,
  avatarURL,
  avatarPoses,
  isLoading
}) => {
  const filtered = publishedCurricula.filter(c => {
    const matchSubject = filterSubject === 'all' || c.plan.subject === filterSubject;
    const matchGrade = filterGrade === 'all' || c.plan.grade.toString() === filterGrade;
    return matchSubject && matchGrade;
  });

  if (isLoading) {
    return (
      <div className="space-y-10 animate-fade">
        <div className="flex justify-between items-center border-b border-white/5 pb-10">
          <div className="space-y-4">
            <Skeleton className="w-32 h-2 opacity-50" />
            <Skeleton className="w-64 h-12" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {[1,2,3,4,5,6,7,8].map(i => (
            <div key={i} className="glass-panel rounded-[2rem] bg-zinc-950/40 border-white/5 p-4 space-y-4">
              <Skeleton className="w-full aspect-video rounded-[1.5rem]" />
              <div className="space-y-2">
                <Skeleton className="w-1/3 h-2" />
                <Skeleton className="w-full h-4" />
                <Skeleton className="w-2/3 h-3 opacity-50" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const poses = ['HAPPY', 'LAUGHING', 'THINKING', 'INTENSE', 'EXPLAIN', 'SHOCKED', 'FRIENDLY', 'CASUAL', 'WAITING'];

  return (
    <div className="space-y-10 animate-fade">
      {/* Header & Controls (Refined) */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8 border-b border-white/5 pb-10">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
            <span className="text-[10px] font-mono font-black uppercase text-emerald-500 tracking-[0.4em]">Resource Database // Public</span>
          </div>
          <h2 className="text-5xl font-black uppercase text-white tracking-tighter italic-serif-header">
            Explore <span className="text-emerald-500">Center</span>
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex bg-zinc-950 border border-white/5 rounded-xl p-1">
            <select 
              value={filterSubject}
              onChange={(e) => setFilterSubject(e.target.value)}
              className="bg-transparent px-4 py-2 text-[9px] font-black uppercase tracking-widest text-zinc-500 focus:outline-none appearance-none cursor-pointer hover:text-white transition-colors"
            >
              <option value="all">Všechny Předměty</option>
              {Array.from(new Set(publishedCurricula.map(c => c.plan.subject))).map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <div className="w-[1px] bg-white/5 mx-1" />
            <select 
              value={filterGrade}
              onChange={(e) => setFilterGrade(e.target.value)}
              className="bg-transparent px-4 py-2 text-[9px] font-black uppercase tracking-widest text-zinc-500 focus:outline-none appearance-none cursor-pointer hover:text-white transition-colors"
            >
              <option value="all">Všechny Ročníky</option>
              {Array.from(new Set(publishedCurricula.map(c => c.plan.grade))).sort((a,b) => (a as any)-(b as any)).map(g => (
                <option key={g as any} value={(g as any).toString()}>{(g as any)}. Ročník</option>
              ))}
            </select>
          </div>
          
          <div className="relative group">
            <i className="fa-solid fa-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-zinc-700 group-focus-within:text-emerald-500 transition-colors text-[10px]"></i>
            <input 
              type="text" 
              placeholder="Search..." 
              className="bg-zinc-950 border border-white/5 rounded-xl pl-10 pr-4 py-2.5 text-[10px] font-bold text-white focus:outline-none focus:border-emerald-500/30 w-[180px] transition-all placeholder:text-zinc-800"
            />
          </div>
        </div>
      </div>

      {/* Grid Content: Compact Layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filtered.map((c, idx) => (
          <motion.div 
            key={c.id}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: idx * 0.05 }}
            onClick={() => onExplore(c)}
            className="group cursor-pointer glass-panel rounded-[2rem] bg-zinc-950/40 border-white/5 hover:border-emerald-500/20 transition-all p-3"
          >
            <div className="aspect-video rounded-[1.5rem] bg-black overflow-hidden relative mb-4 flex items-center justify-center">
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
              
              <div className="scale-75 group-hover:scale-90 transition-transform duration-500">
                <Gymi 
                  pose={poses[idx % poses.length] as any} 
                  size={180}
                  avatarURL={avatarURL}
                  avatarPoses={avatarPoses}
                />
              </div>

              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
              
              <div className="absolute bottom-4 left-4 right-4 translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300">
                <p className="text-[8px] font-mono font-black text-emerald-400 uppercase tracking-widest">{c.plan.grade}. ROČNÍK</p>
              </div>
            </div>

            <div className="px-3 pb-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-black text-zinc-600 uppercase tracking-[0.2em]">{c.plan.subject}</span>
                <div className="flex -space-x-1">
                   <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center text-[8px] font-black text-white border border-black italic">
                    {c.authorName?.charAt(0)}
                   </div>
                </div>
              </div>
              
              <h4 className="text-lg font-black text-white uppercase tracking-tight leading-tight group-hover:text-emerald-500 transition-colors">
                {c.plan.topics[0]?.title}
              </h4>
              
              <p className="text-[10px] text-zinc-400 font-bold leading-relaxed line-clamp-2 italic-serif-header opacity-60 group-hover:opacity-100 transition-opacity">
                {c.plan.topics[0]?.summary?.what}
              </p>
              
              <div className="pt-3 border-t border-white/5 flex items-center justify-between">
                <span className="text-[8px] font-mono font-black text-zinc-700 uppercase">Archive_Ref: {c.id.slice(0, 8)}</span>
                <i className="fa-solid fa-arrow-up-right-from-square text-[8px] text-zinc-800 group-hover:text-emerald-500"></i>
              </div>
            </div>
          </motion.div>
        ))}

        {/* Suggestion Placeholders (Technical look) */}
        {[1,2,3,4].map(i => (
          <div key={i} className="glass-panel rounded-[2rem] bg-indigo-600/5 border-white/5 p-6 flex flex-col items-center justify-center text-center space-y-4 opacity-40 hover:opacity-100 transition-opacity cursor-pointer overflow-hidden relative">
            <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle, #4f46e5 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>
            
            <div className="w-24 h-24 flex items-center justify-center relative">
               <div className="absolute inset-0 bg-indigo-500/5 rounded-full blur-xl" />
               <Gymi 
                pose={['HAPPY', 'THINKING', 'INTENSE', 'CASUAL'][i-1] as any}
                size={100}
                avatarURL={avatarURL}
                avatarPoses={avatarPoses}
               />
            </div>

            <div className="space-y-1 relative z-10">
              <p className="text-[10px] font-mono font-black text-indigo-400 uppercase tracking-widest">Contribute</p>
              <p className="text-[9px] font-bold text-zinc-600 uppercase tracking-tight">Sdílej svou lekci</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ExploreGrid;
