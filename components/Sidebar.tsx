
import React, { useState } from 'react';
import { UserProfile, Subject } from '../types';

export type PageId = 'home' | 'learn' | 'curriculum' | 'archive' | 'chat' | 'profile';

interface SidebarProps {
  activePage: PageId;
  onPageChange: (page: PageId) => void;
  hasResult: boolean;
  userProfile: UserProfile;
  onUpdateProfile: (profile: UserProfile) => void;
  onOpenLogin: () => void;
  onLogout: () => void;
  onOpenProfile: () => void;
  activeSubject: Subject;
  onOpenSettings: () => void;
  isOpen: boolean;
  onToggle: () => void;
  onToggleSubjectBar: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ 
  activePage, 
  onPageChange, 
  userProfile, 
  onUpdateProfile,
  onOpenLogin,
  onLogout,
  onOpenProfile,
  activeSubject,
  onOpenSettings,
  isOpen,
  onToggle,
  onToggleSubjectBar
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const menuItems = [
    { id: 'home', label: 'Dashboard', icon: 'fa-house' },
    { id: 'curriculum', label: 'Průvodce', icon: 'fa-map' },
    { id: 'learn', label: 'Studium', icon: 'fa-graduation-cap' },
    { id: 'archive', label: 'Historie', icon: 'fa-box-archive' },
    { id: 'chat', label: 'Chat', icon: 'fa-comments' },
    { id: 'profile', label: 'Profil', icon: 'fa-user-gear' },
  ];

  const handleLogoutClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onLogout();
  };
  
  const actualOpen = isOpen || isHovered;

  return (
    <aside 
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`fixed lg:static inset-y-0 left-0 z-50 transition-all duration-300 ease-in-out bg-[#020617] border-r border-white/5 flex flex-col py-8 ${
        actualOpen ? 'w-64 translate-x-0 shadow-[20px_0_60px_rgba(0,0,0,0.5)]' : 'w-0 -translate-x-full lg:w-20 lg:translate-x-0'
      }`}
    >
      <div className={`px-5 mb-10 flex items-center justify-between ${!actualOpen && 'lg:justify-center'}`}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg bg-indigo-600 shrink-0">
            <i className="fa-solid fa-bolt-lightning text-white text-base"></i>
          </div>
          {actualOpen && <span className="logo-font text-lg tracking-tighter text-white uppercase font-black">GYMNI<span className="text-indigo-500">MATE</span></span>}
        </div>
      </div>

      <nav className="flex-grow space-y-1.5 px-3">
        {menuItems.map((item) => (
          <button
            key={item.id}
            id={`sidebar-${item.id}`}
            onClick={() => onPageChange(item.id as PageId)}
            className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-xl transition-all ${
              activePage === item.id 
                ? `bg-indigo-600 text-white shadow-lg shadow-indigo-500/20`
                : 'text-zinc-500 hover:bg-white/5 hover:text-zinc-200'
            } ${!actualOpen && 'lg:justify-center'}`}
          >
            <i className={`fa-solid ${item.icon} text-base w-5 shrink-0`}></i>
            {actualOpen && <span className="font-black text-[9px] uppercase tracking-widest whitespace-nowrap">{item.label}</span>}
          </button>
        ))}

        <div className="h-px bg-white/5 my-4 mx-2"></div>

        <button
          onClick={onToggleSubjectBar}
          className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-xl transition-all text-zinc-500 hover:bg-white/5 hover:text-indigo-400 ${!actualOpen && 'lg:justify-center'}`}
        >
          <i className="fa-solid fa-layer-group text-base w-5 shrink-0"></i>
          {actualOpen && (
            <div className="flex flex-col items-start min-w-0">
              <span className="font-black text-[9px] uppercase tracking-widest whitespace-nowrap">Předměty</span>
              <span className="font-mono text-[7px] opacity-40 uppercase tracking-tighter truncate w-full">{activeSubject?.name || 'Nenalezeno'}</span>
            </div>
          )}
        </button>
      </nav>

      <div className="px-3 mt-auto space-y-4">

        <div className={`pt-4 border-t border-white/5 ${!actualOpen && 'flex flex-col items-center gap-3'}`}>
          {userProfile.isLoggedIn ? (
            <div className={`flex items-center gap-3 p-2 rounded-xl bg-white/5 border border-white/5 ${!actualOpen && 'flex-col'}`}>
              <button 
                onClick={onOpenProfile}
                className="w-8 h-8 rounded-full bg-transparent flex items-center justify-center shrink-0 overflow-hidden hover:ring-2 hover:ring-indigo-500 transition-all"
              >
                {userProfile.photoURL ? (
                  <img src={userProfile.photoURL} alt={userProfile.displayName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <i className="fa-solid fa-user text-[10px] text-zinc-500"></i>
                )}
              </button>
              {actualOpen && (
                <button 
                  onClick={onOpenProfile}
                  className="text-[9px] font-black uppercase text-zinc-400 truncate flex-grow text-left hover:text-white transition-all"
                >
                  {userProfile.displayName || userProfile.email.split('@')[0]}
                </button>
              )}
              <button onClick={handleLogoutClick} className="w-8 h-8 rounded-lg hover:bg-red-500/10 text-zinc-600 hover:text-red-500 transition-all flex items-center justify-center"><i className="fa-solid fa-power-off text-[10px]"></i></button>
            </div>
          ) : (
            <button onClick={onOpenLogin} className={`w-full flex items-center gap-4 px-4 py-3 text-zinc-500 hover:text-white transition-all ${!actualOpen && 'justify-center'}`}>
              <i className="fa-solid fa-lock text-sm"></i>
              {actualOpen && <span className="text-[9px] font-black uppercase tracking-widest">Login</span>}
            </button>
          )}
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
