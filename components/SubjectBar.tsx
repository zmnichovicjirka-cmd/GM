
import React, { useRef, useEffect, useState } from 'react';
import { Subject } from '../types';

export const SUBJECTS: Subject[] = [
  { id: 'math', name: 'Matematika', icon: 'fa-calculator', color: 'bg-blue-500' },
  { id: 'phys', name: 'Fyzika', icon: 'fa-atom', color: 'bg-cyan-500' },
  { id: 'chem', name: 'Chemie', icon: 'fa-flask-vial', color: 'bg-emerald-500' },
  { id: 'bio', name: 'Biologie', icon: 'fa-dna', color: 'bg-green-500' },
  { id: 'hist', name: 'Dějepis', icon: 'fa-landmark', color: 'bg-amber-600' },
  { id: 'info', name: 'Informatika', icon: 'fa-microchip', color: 'bg-purple-500' },
  { id: 'geo', name: 'Zeměpis', icon: 'fa-earth-europe', color: 'bg-orange-500' },
  { id: 'lit', name: 'Čeština', icon: 'fa-book', color: 'bg-red-500' },
];

interface SubjectBarProps {
  activeSubjectId: string;
  onSelect: (subject: Subject) => void;
  isOpen: boolean;
  onClose: () => void;
  userSubjects: Subject[];
  onOpenAddSubject: () => void;
}

const SubjectBar: React.FC<SubjectBarProps> = ({ activeSubjectId, onSelect, isOpen, onClose, userSubjects, onOpenAddSubject }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(true);

  const checkScroll = () => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
      setShowLeftArrow(scrollLeft > 10);
      setShowRightArrow(scrollLeft < scrollWidth - clientWidth - 10);
    }
  };

  useEffect(() => {
    checkScroll();
    window.addEventListener('resize', checkScroll);
    return () => window.removeEventListener('resize', checkScroll);
  }, [isOpen]);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollAmount = 300;
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft += e.deltaY;
    }
  };

  return (
    <div 
      className={`fixed bottom-0 left-0 lg:left-72 right-0 z-[120] transition-all duration-500 ease-out transform ${
        isOpen ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0 pointer-events-none'
      }`}
    >
      <div className="mx-auto max-w-6xl mb-8 px-6">
        <div className="glass-panel rounded-[2.5rem] p-3 border-white/10 shadow-[0_25px_70px_rgba(0,0,0,0.6)] flex items-center gap-1 overflow-hidden relative group">
          
          {/* Section Label */}
          <div className="flex items-center gap-3 px-5 py-2 border-r border-white/10 shrink-0 relative z-10 bg-zinc-950/20 rounded-l-[2rem]">
            <div className="w-8 h-8 rounded-full bg-zinc-900 flex items-center justify-center border border-white/5">
              <i className="fa-solid fa-layer-group text-indigo-500 text-[10px]"></i>
            </div>
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400 hidden sm:block">Předměty</span>
          </div>

          {/* Navigation Arrows */}
          {showLeftArrow && (
            <button 
              onClick={() => scroll('left')}
              className="absolute left-32 z-20 w-8 h-8 rounded-full bg-zinc-900/90 border border-white/10 text-white flex items-center justify-center hover:bg-indigo-600 transition-all shadow-lg animate-fade"
            >
              <i className="fa-solid fa-chevron-left text-[10px]"></i>
            </button>
          )}

          <div 
            ref={scrollRef}
            onScroll={checkScroll}
            onWheel={handleWheel}
            className="flex items-center gap-2 overflow-x-auto no-scrollbar scroll-smooth px-4 relative z-10 flex-grow"
          >
            <button 
              onClick={() => { onOpenAddSubject(); onClose(); }}
              className="flex items-center gap-3 px-6 py-3 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 hover:bg-indigo-600 hover:text-white transition-all shrink-0 group/add shadow-lg"
            >
              <div className="w-9 h-9 rounded-xl bg-indigo-500 flex items-center justify-center text-white shrink-0 group-hover/add:scale-110 transition-transform">
                <i className="fa-solid fa-plus text-xs"></i>
              </div>
              <span className="text-[11px] font-black uppercase tracking-widest whitespace-nowrap">Přidat</span>
            </button>

            {userSubjects.map((s) => (
              <button
                key={s.id}
                onClick={() => { onSelect(s); onClose(); }}
                className={`flex items-center gap-3 px-5 py-3 rounded-2xl transition-all shrink-0 group/item ${
                  activeSubjectId === s.id 
                    ? 'bg-white/10 ring-1 ring-white/20 shadow-lg' 
                    : 'hover:bg-white/5 border border-transparent'
                }`}
              >
                <div className={`w-9 h-9 rounded-xl ${s.color} flex items-center justify-center text-white shadow-lg shadow-black/30 group-hover/item:scale-110 group-hover/item:rotate-3 transition-all duration-300`}>
                  <i className={`fa-solid ${s.icon} text-xs`}></i>
                </div>
                <div className="text-left">
                  <span className={`block text-[11px] font-black uppercase tracking-widest leading-none ${activeSubjectId === s.id ? 'text-white' : 'text-zinc-500 group-hover/item:text-zinc-300'}`}>
                    {s.name}
                  </span>
                </div>
              </button>
            ))}
          </div>

          {showRightArrow && (
            <button 
              onClick={() => scroll('right')}
              className="absolute right-20 z-20 w-8 h-8 rounded-full bg-zinc-900/90 border border-white/10 text-white flex items-center justify-center hover:bg-indigo-600 transition-all shadow-lg animate-fade"
            >
              <i className="fa-solid fa-chevron-right text-[10px]"></i>
            </button>
          )}

          {/* Close Button */}
          <button 
            onClick={onClose}
            className="ml-2 w-12 h-12 rounded-2xl bg-zinc-900/80 hover:bg-zinc-800 flex items-center justify-center text-zinc-500 hover:text-white transition-all shrink-0 relative z-10 border border-white/5 group/close"
          >
            <i className="fa-solid fa-xmark text-xs group-hover:rotate-90 transition-transform duration-300"></i>
          </button>
        </div>
      </div>
    </div>
  );
};

export default SubjectBar;
