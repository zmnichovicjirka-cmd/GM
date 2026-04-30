
import React, { useEffect, useState } from 'react';
import { DbConfig, StudyResult, EnhancedArchiveItem } from '../types';
import { fetchArchive } from '../services/dbService';

interface RecentLessonsSidebarProps {
  config: DbConfig;
  onOpenItem: (result: StudyResult) => void;
  isOpen: boolean;
  onToggle: () => void;
}

const RecentLessonsSidebar: React.FC<RecentLessonsSidebarProps> = ({ config, onOpenItem, isOpen, onToggle }) => {
  const [items, setItems] = useState<EnhancedArchiveItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchArchive(config);
      setItems(data.archive || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) loadData();
  }, [isOpen, config]);

  return (
    <aside 
      className={`fixed lg:static inset-y-0 right-0 z-50 transition-all duration-700 ease-in-out bg-[#020617] border-l border-white/5 flex flex-col py-10 shadow-[-20px_0_50px_rgba(0,0,0,0.5)] ${
        isOpen ? 'w-80 translate-x-0' : 'w-0 translate-x-full lg:w-20 lg:translate-x-0'
      }`}
    >
      <div className={`px-6 mb-12 flex items-center justify-between ${!isOpen && 'lg:justify-center'}`}>
        {isOpen && (
          <div className="animate-fade">
            <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-indigo-500">Pracovní prostor</h3>
            <p className="text-sm text-white font-black uppercase tracking-tight mt-1">Uložené lekce</p>
          </div>
        )}
        <button 
          onClick={onToggle} 
          className="w-12 h-12 rounded-2xl bg-zinc-950 border border-white/10 text-zinc-500 hover:text-indigo-400 flex items-center justify-center transition-all"
        >
          <i className={`fa-solid ${isOpen ? 'fa-chevron-right' : 'fa-folder-tree text-lg'}`}></i>
        </button>
      </div>

      <div className={`flex-grow overflow-y-auto no-scrollbar px-5 space-y-3 ${!isOpen && 'hidden lg:block'}`}>
        {loading ? (
          <div className="text-center py-10 opacity-30"><i className="fa-solid fa-circle-notch fa-spin"></i></div>
        ) : (
          items.map(item => (
            <button
              key={item.id}
              onClick={() => onOpenItem(item.study_json)}
              className={`w-full text-left p-5 rounded-[2rem] bg-zinc-950/40 border border-white/5 hover:border-indigo-500/50 hover:bg-indigo-600/5 transition-all group relative overflow-hidden shadow-lg animate-fade ${!isOpen && 'w-12 h-12 p-0 flex items-center justify-center rounded-xl mb-3'}`}
            >
              {isOpen ? (
                <>
                  <div className="flex items-center justify-between mb-2.5">
                    <div className="flex items-center gap-2">
                       <div className={`w-1.5 h-1.5 rounded-full ${item.storageSource === 'cloud' ? 'bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]' : 'bg-zinc-600'}`}></div>
                       <p className="text-[8px] text-zinc-600 font-black uppercase tracking-widest">{new Date(item.created_at).toLocaleDateString()}</p>
                    </div>
                    {item.storageSource === 'cloud' && <i className="fa-solid fa-cloud text-[8px] text-indigo-500/40"></i>}
                  </div>
                  <p className="text-[10px] font-black text-zinc-200 uppercase tracking-tight line-clamp-2 leading-tight group-hover:text-white transition-colors">{item.topic}</p>
                </>
              ) : (
                <div className={`w-2 h-2 rounded-full ${item.storageSource === 'cloud' ? 'bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]' : 'bg-zinc-800'}`}></div>
              )}
            </button>
          ))
        )}
      </div>
    </aside>
  );
};

export default RecentLessonsSidebar;
