
import React, { useEffect, useRef } from 'react';

interface RecordingOverlayProps {
  transcript: string;
  onStop: () => void;
}

const RecordingOverlay: React.FC<RecordingOverlayProps> = ({ transcript, onStop }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcript]);

  return (
    <div className="fixed inset-0 z-[2000] bg-[#020617] flex flex-col items-center justify-center p-4 md:p-8 lg:p-16 animate-fade">
      {/* Background Ambience */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-indigo-600/5 rounded-full blur-[120px] animate-pulse"></div>
        <div className="absolute top-0 left-0 w-full h-full opacity-20 bg-[radial-gradient(#1e1b4b_1px,transparent_1px)] [background-size:40px_40px]"></div>
      </div>

      <div className="relative w-full max-w-7xl h-full flex flex-col gap-6">
        <div className="flex items-center justify-between bg-zinc-950/50 p-5 rounded-[2rem] border border-white/5 backdrop-blur-3xl shadow-2xl shrink-0">
          <div className="flex items-center gap-5">
            <div className="relative">
               <div className="absolute -inset-4 bg-red-600/20 rounded-full blur-xl animate-pulse"></div>
               <div className="w-10 h-10 rounded-xl bg-red-600 flex items-center justify-center text-white relative z-10 shadow-lg">
                 <i className="fa-solid fa-microphone text-lg"></i>
               </div>
            </div>
            <div>
              <h2 className="text-lg font-black uppercase tracking-tighter text-white">Chytrý záznam</h2>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="flex h-1 w-1 rounded-full bg-red-500 animate-ping"></span>
                <p className="text-zinc-500 font-bold uppercase tracking-[0.2em] text-[8px]">Zesílení +300% aktivní • Filtrace šumu zapnuta</p>
              </div>
            </div>
          </div>
          <button 
            onClick={(e) => {
              e.preventDefault();
              onStop();
            }}
            className="px-6 py-3.5 rounded-2xl bg-zinc-900 border border-white/10 text-white font-black uppercase tracking-widest hover:bg-red-600 hover:border-red-500 transition-all shadow-2xl active:scale-95 group text-[10px]"
          >
            <i className="fa-solid fa-stop-circle mr-2 group-hover:scale-110 transition-transform"></i>
            Dokončit zápis
          </button>
        </div>

        <div 
          ref={scrollRef}
          className="flex-grow overflow-y-auto no-scrollbar bg-black/60 border border-white/5 rounded-[2.5rem] p-8 md:p-12 shadow-inner relative group font-mono"
        >
          {transcript ? (
            <div className="space-y-4 max-w-5xl mx-auto">
               <p className="text-xs md:text-sm lg:text-base font-medium text-zinc-300 leading-relaxed animate-fade transition-all whitespace-pre-wrap">
                {transcript}
                <span className="inline-block w-1 h-4 bg-indigo-500 ml-1 animate-pulse rounded-full align-middle"></span>
              </p>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center opacity-20 gap-4">
              <div className="flex gap-1 items-end h-8">
                 <div className="w-1 bg-indigo-500 animate-[bounce_1s_infinite_0s] h-1/2 rounded-full"></div>
                 <div className="w-1 bg-indigo-500 animate-[bounce_1s_infinite_0.2s] h-full rounded-full"></div>
                 <div className="w-1 bg-indigo-500 animate-[bounce_1s_infinite_0.4s] h-2/3 rounded-full"></div>
                 <div className="w-1 bg-indigo-500 animate-[bounce_1s_infinite_0.1s] h-full rounded-full"></div>
              </div>
              <p className="text-sm font-black uppercase tracking-[0.4em]">Zesiluji vstup...</p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-6 py-3 bg-zinc-950/50 rounded-2xl border border-white/5">
          <p className="text-zinc-600 text-[8px] font-black uppercase tracking-[0.5em]">Zmenšené písmo pro maximum informací</p>
          <div className="flex gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RecordingOverlay;
