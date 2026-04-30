
import React from 'react';

interface HeaderProps {
  onOpenSettings: () => void;
}

const Header: React.FC<HeaderProps> = ({ onOpenSettings }) => {
  return (
    <header className="py-5 px-8 md:px-16 flex items-center justify-between border-b border-white/5 bg-[#030712]/50 backdrop-blur-xl sticky top-0 z-50">
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
          <i className="fa-solid fa-bolt-lightning text-white text-lg"></i>
        </div>
        <h1 className="logo-font text-xl tracking-tighter">
          GYMNI<span className="text-indigo-500">MATE</span>
        </h1>
      </div>
      
      <div className="hidden lg:flex items-center gap-12 text-[10px] font-bold tracking-[0.2em] text-zinc-500 uppercase">
        <a href="#" className="hover:text-indigo-400 transition-colors">Workspace</a>
        <a href="#" className="hover:text-indigo-400 transition-colors">Knihovna</a>
        <a href="#" className="hover:text-indigo-400 transition-colors">Archiv</a>
      </div>

      <div className="flex items-center gap-4">
        <button 
          onClick={onOpenSettings}
          className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-zinc-500 hover:text-indigo-400 transition-all"
        >
          <i className="fa-solid fa-cog"></i>
        </button>
      </div>
    </header>
  );
};

export default Header;
