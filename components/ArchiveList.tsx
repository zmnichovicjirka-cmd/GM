
import React, { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { DbConfig, StudyResult, EnhancedArchiveItem, UserProfile, Subject, StudyFile } from '../types';
import { fetchArchive, deleteArchiveItem, updateArchiveItem, handleFirestoreError, OperationType } from '../services/dbService';
import { collection, addDoc, serverTimestamp, getDocs, query, limit as firestoreLimit } from 'firebase/firestore';
import { db } from '../firebase';
import { SUBJECTS } from './SubjectBar';
import Gymi, { GymiPose } from './Gymi';
import { FormattedInline } from './StudyOutput';

interface ArchiveListProps {
  config: DbConfig;
  currentUser: UserProfile;
  onOpenItem: (item: EnhancedArchiveItem) => void;
  limit?: number;
  firstAvatar?: any;
}

const ARCHIVE_POSES: GymiPose[] = [
  'HAPPY', 'LAUGHING', 'THINKING', 'INTENSE', 'SPEAKING', 'SHOCKED', 'FRIENDLY', 'CASUAL', 'WAITING'
];

const ArchiveList: React.FC<ArchiveListProps> = ({ config, currentUser, onOpenItem, limit, firstAvatar }) => {
  const [items, setItems] = useState<EnhancedArchiveItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [previewItem, setPreviewItem] = useState<EnhancedArchiveItem | null>(null);
  const [isChaptersOpen, setIsChaptersOpen] = useState(false);
  const [activeChapterIndex, setActiveChapterIndex] = useState(0);
  const [isIconSelectorOpen, setIsIconSelectorOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [sharing, setSharing] = useState(false);
  const [shareSuccess, setShareSuccess] = useState(false);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('all');
  const [viewingFile, setViewingFile] = useState<{name: string, type: string, data: string, allFiles?: any[], currentIndex?: number} | null>(null);

  const [isFetchingFull, setIsFetchingFull] = useState(false);

  const handleSetPreviewItem = async (item: EnhancedArchiveItem) => {
    if (item.isLarge && item.id) {
       setIsFetchingFull(true);
       try {
         const { fetchLessonContent } = await import('../services/dbService');
         const fullContent = await fetchLessonContent(item.id);
         if (fullContent) {
           setPreviewItem({ ...item, study_json: fullContent });
         } else {
           setPreviewItem(item);
         }
       } catch (e) {
         console.error("Failed to fetch full lesson content for preview", e);
         setPreviewItem(item);
       } finally {
         setIsFetchingFull(false);
       }
    } else {
      setPreviewItem(item);
    }
  };

  const handleNextPage = () => {
    if (!viewingFile?.allFiles || viewingFile.currentIndex === undefined) return;
    const nextIdx = (viewingFile.currentIndex + 1) % viewingFile.allFiles.length;
    const nextFile = viewingFile.allFiles[nextIdx];
    setViewingFile({
      name: nextFile.name,
      type: nextFile.mimeType || nextFile.type,
      data: nextFile.data,
      allFiles: viewingFile.allFiles,
      currentIndex: nextIdx
    });
  };

  const handlePrevPage = () => {
    if (!viewingFile?.allFiles || viewingFile.currentIndex === undefined) return;
    const prevIdx = (viewingFile.currentIndex - 1 + viewingFile.allFiles.length) % viewingFile.allFiles.length;
    const nextFile = viewingFile.allFiles[prevIdx];
    setViewingFile({
      name: nextFile.name,
      type: nextFile.mimeType || nextFile.type,
      data: nextFile.data,
      allFiles: viewingFile.allFiles,
      currentIndex: prevIdx
    });
  };

  const load = async () => {
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

  useEffect(() => { load(); }, [config]);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (deletingId !== id) {
      setDeletingId(id);
      setTimeout(() => setDeletingId(null), 3000);
      return;
    }
    
    try {
      await deleteArchiveItem(config, id);
      setItems(prev => prev.filter(i => i.id !== id));
      setDeletingId(null);
    } catch (e: any) {
      console.error("Chyba při mazání:", e);
    }
  };

  const filteredItems = useMemo(() => {
    let filtered = items;
    if (selectedSubjectId !== 'all') {
      const targetSubject = SUBJECTS.find(s => s.id === selectedSubjectId);
      filtered = items.filter(item => 
        item.subject === targetSubject?.name || 
        item.subject === targetSubject?.id ||
        item.subject?.toLowerCase() === selectedSubjectId.toLowerCase()
      );
    }
    return limit ? filtered.slice(0, limit) : filtered;
  }, [items, selectedSubjectId, limit]);

  const curriculumSummary = useMemo(() => {
    if (selectedSubjectId === 'all') return null;
    const saved = localStorage.getItem(`gymni_mate_curricula_${selectedSubjectId}`);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.length > 0) return parsed[0];
    }
    return null;
  }, [selectedSubjectId]);

  const groupedItems = useMemo(() => {
    const curricula = filteredItems.filter(i => i.type === 'curriculum');
    const allLessons = filteredItems.filter(i => i.type === 'lesson');
    
    const groups = curricula.map(cur => ({
      curriculum: cur,
      lessons: allLessons.filter(l => l.parentId === cur.id)
    }));

    const orphanLessons = allLessons.filter(l => !l.parentId || !curricula.some(c => c.id === l.parentId));
    
    return { groups, orphanLessons };
  }, [filteredItems]);

  const handleIconChange = async (icon: string) => {
    if (!previewItem) return;
    try {
      await updateArchiveItem(config, previewItem.id, { icon });
      setItems(prev => prev.map(i => i.id === previewItem.id ? { ...i, icon } : i));
      setPreviewItem(prev => prev ? { ...prev, icon } : null);
      setIsIconSelectorOpen(false);
    } catch (e) {
      console.error("Chyba při změně ikonky:", e);
    }
  };

  const handleShare = async (receiver: UserProfile) => {
    if (!previewItem || !currentUser.isLoggedIn) return;
    setSharing(true);
    const messagesPath = 'messages';
    try {
      const shareText = `Sdílím s tebou ${previewItem.type === 'curriculum' ? 'osnovu' : 'lekci'}: **${previewItem.topic}**\n\n${previewItem.type === 'curriculum' ? 'Prohlédni si studijní plán v Průvodci.' : (previewItem.study_json?.shortSummary || previewItem.study_json?.fullSummary[0]?.text.substring(0, 100) + '...')}`;
      
      await addDoc(collection(db, messagesPath), {
        senderId: currentUser.uid,
        receiverId: receiver.uid,
        text: shareText,
        timestamp: serverTimestamp(),
        sharedLessonId: previewItem.id // Optional: for rich preview in chat
      });
      
      setShareSuccess(true);
      setTimeout(() => {
        setShareSuccess(false);
        setIsShareModalOpen(false);
      }, 2000);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, messagesPath);
      console.error("Chyba při sdílení:", e);
    } finally {
      setSharing(false);
    }
  };

  const openShareModal = async () => {
    setIsShareModalOpen(true);
    const usersPath = 'users';
    try {
      const q = query(collection(db, usersPath), firestoreLimit(20));
      const snap = await getDocs(q);
      setUsers(snap.docs.map(d => d.data() as UserProfile).filter(u => u.uid !== currentUser.uid));
    } catch (e) {
      handleFirestoreError(e, OperationType.LIST, usersPath);
      console.error("Chyba při načítání uživatelů:", e);
    }
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-32 gap-6 opacity-40">
      <div className="w-12 h-12 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"></div>
      <p className="text-[10px] font-black uppercase tracking-[0.4em] text-indigo-400">Načítám archivy...</p>
    </div>
  );

  if (error) return (
    <div className="p-20 text-center glass-panel rounded-[3rem] border-red-500/20 max-w-2xl mx-auto">
      <h3 className="text-xl font-black uppercase tracking-tight mb-2">Chyba synchronizace</h3>
      <p className="text-zinc-500 text-xs mb-8">{error}</p>
      <button onClick={load} className="px-10 py-4 bg-zinc-900 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-zinc-800 transition-all">Zkusit znovu</button>
    </div>
  );

  return (
    <div className="space-y-12 pb-20 animate-fade">
      {/* Curriculum Summary Card */}
      {curriculumSummary && (
        <div className="p-10 rounded-[3.5rem] bg-indigo-600/5 border border-indigo-500/10 animate-fade group overflow-hidden relative">
          <div className="absolute -top-20 -right-20 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl group-hover:bg-indigo-500/20 transition-all"></div>
          <div className="relative z-10">
            <div className="flex justify-between items-start mb-8">
              <div>
                <p className="text-[10px] font-black uppercase text-indigo-500 tracking-[0.4em] mb-2">Aktivní osnova</p>
                <h3 className="text-3xl font-black text-white uppercase tracking-tighter">{curriculumSummary.plan.grade}. ročník • {curriculumSummary.level === 'elementary' ? 'ZŠ' : 'SŠ'}</h3>
              </div>
              <div className="w-14 h-14 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-xl shadow-indigo-500/20">
                <i className="fa-solid fa-graduation-cap text-xl"></i>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {curriculumSummary.plan.topics.slice(0, 3).map((t: any, idx: number) => (
                <div key={idx} className="p-5 rounded-2xl bg-black/40 border border-white/5">
                  <p className="text-[8px] font-black uppercase text-zinc-600 tracking-widest mb-1">Téma {idx + 1}</p>
                  <p className="text-xs font-black text-white uppercase tracking-tight truncate">{t.title}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {filteredItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 opacity-20">
          <i className="fa-solid fa-box-open text-7xl mb-6"></i>
          <p className="text-xs font-black uppercase tracking-[0.3em]">V této kategorii nemáš žádné lekce</p>
        </div>
      ) : (
        <div className="space-y-16">
          {/* Subject Filter Bar */}
          <div className="flex items-center gap-3 overflow-x-auto no-scrollbar pb-4 -mx-2 px-2 sticky top-0 z-50 bg-black/40 backdrop-blur-md rounded-2xl py-2">
             <button 
               onClick={() => setSelectedSubjectId('all')}
               className={`px-6 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all whitespace-nowrap border ${selectedSubjectId === 'all' ? 'bg-white text-black border-white shadow-xl' : 'bg-transparent text-zinc-500 border-white/5 hover:border-white/20'}`}
             >
               Všechno
             </button>
             {SUBJECTS.map(sub => (
               <button 
                 key={sub.id}
                 onClick={() => setSelectedSubjectId(sub.id)}
                 className={`px-6 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all whitespace-nowrap border flex items-center gap-2 ${selectedSubjectId === sub.id ? 'bg-indigo-600 text-white border-indigo-500 shadow-xl shadow-indigo-500/20' : 'bg-transparent text-zinc-500 border-white/5 hover:border-white/20'}`}
               >
                 <i className={`fa-solid ${sub.icon} text-[10px]`}></i>
                 {sub.name}
               </button>
             ))}
          </div>

          {/* Grouped Curricula Panels */}
          {groupedItems.groups.map((group) => (
            <div key={group.curriculum.id} className="space-y-8">
              <div 
                onClick={() => handleSetPreviewItem(group.curriculum)}
                className="p-10 rounded-[3.5rem] bg-zinc-950 border border-indigo-500/20 group hover:border-indigo-500/40 transition-all cursor-pointer relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 p-10 opacity-5 group-hover:opacity-10 transition-opacity">
                  <i className="fa-solid fa-map text-9xl"></i>
                </div>
                
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-8 relative z-10">
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
                        <i className="fa-solid fa-map text-sm"></i>
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-[0.4em] text-indigo-500">Studijní Plán</span>
                    </div>
                    <h3 className="text-4xl font-black text-white uppercase tracking-tighter leading-none">{group.curriculum.topic}</h3>
                    <div className="flex items-center gap-6">
                      <div className="flex items-center gap-2">
                        <i className="fa-solid fa-calendar text-[10px] text-zinc-600"></i>
                        <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                          Vytvořeno: {new Date(group.curriculum.created_at).toLocaleDateString('cs-CZ')}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <i className="fa-solid fa-graduation-cap text-[10px] text-zinc-600"></i>
                        <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                          {group.lessons.length} Absolvovaných lekcí
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
                     <button 
                       onClick={(e) => { e.stopPropagation(); onOpenItem(group.curriculum); }}
                       className="px-10 py-5 bg-white text-black rounded-2xl text-[10px] font-black uppercase tracking-[0.3em] hover:scale-105 active:scale-95 transition-all shadow-xl"
                     >
                       Otevřít Průvodce
                     </button>
                     <button 
                       onClick={(e) => handleDelete(e, group.curriculum.id)}
                       className={`w-14 h-14 rounded-2xl flex items-center justify-center border transition-all ${
                         deletingId === group.curriculum.id 
                           ? "bg-red-500 border-red-400 text-white animate-pulse" 
                           : "bg-white/5 border-white/5 text-zinc-600 hover:text-red-500 hover:border-red-500/20"
                       }`}
                     >
                       <i className={`fa-solid ${deletingId === group.curriculum.id ? 'fa-triangle-exclamation' : 'fa-trash-can'}`}></i>
                     </button>
                  </div>
                </div>
              </div>

              {/* Nested Lessons Horizontal Scroller / Grid */}
              {group.lessons.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pl-10 md:pl-20 relative">
                   <div className="absolute left-6 md:left-10 top-0 bottom-0 w-px bg-gradient-to-b from-indigo-500/40 via-indigo-500/10 to-transparent"></div>
                   {group.lessons.map((lesson) => (
                     <div 
                       key={lesson.id}
                       onClick={() => handleSetPreviewItem(lesson)}
                       className="group bg-zinc-950/40 border border-white/5 rounded-3xl p-6 hover:border-indigo-500/30 transition-all cursor-pointer relative"
                     >
                       <div className="absolute -left-10 md:-left-[41px] top-8 w-10 md:w-10 h-px bg-indigo-500/40"></div>
                       <div className="flex flex-col gap-4">
                         <div className="flex justify-between items-start">
                           <div className="w-10 h-10 rounded-[1rem] bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center overflow-hidden">
                              <Gymi 
                                pose={(lesson.icon?.toUpperCase() as any) || 'HAPPY'} 
                                size={60} 
                                avatarURL={currentUser?.avatarURL || firstAvatar?.avatarURL} 
                                avatarPoses={currentUser?.avatarPoses || firstAvatar?.avatarPoses} 
                                className="scale-150"
                              />
                           </div>
                           <button onClick={(e) => handleDelete(e, lesson.id)} className="text-zinc-700 hover:text-red-500 transition-colors p-1"><i className="fa-solid fa-trash-can text-[10px]"></i></button>
                         </div>
                         <div>
                           <h4 className="text-sm font-black text-white uppercase tracking-tight line-clamp-2 leading-tight group-hover:text-indigo-400 transition-colors">{lesson.topic}</h4>
                           <p className="text-[8px] font-black uppercase text-zinc-600 tracking-widest mt-2">{new Date(lesson.created_at).toLocaleDateString('cs-CZ')}</p>
                         </div>
                       </div>
                     </div>
                   ))}
                </div>
              )}
            </div>
          ))}

          {/* Individual Lessons Section */}
          {groupedItems.orphanLessons.length > 0 && (
            <div className="space-y-8">
              <div className="flex items-center gap-4 px-2">
                <i className="fa-solid fa-box-archive text-zinc-600 text-sm"></i>
                <h3 className="text-xl font-black text-white uppercase tracking-widest">Ostatní Materiály</h3>
                <div className="h-px flex-grow bg-white/5"></div>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {groupedItems.orphanLessons.map((item) => (
                  <div 
                    key={item.id} 
                    onClick={() => handleSetPreviewItem(item)}
                    className="group relative flex flex-col bg-zinc-950/40 border border-white/5 rounded-2xl hover:border-indigo-500/30 transition-all cursor-pointer shadow-xl overflow-hidden active:scale-[0.98]"
                  >
                    {/* Thumbnail Area - Compact */}
                    <div className="h-40 relative overflow-hidden bg-zinc-900 flex items-center justify-center group/card">
                      {item.image_url ? (
                        <img src={item.image_url} className="w-full h-full object-cover opacity-60 group-hover:scale-110 group-hover:opacity-100 transition-all duration-1000" alt={item.topic} />
                      ) : (
                        <div className="opacity-40 scale-75 group-hover:scale-95 transition-transform duration-500">
                           <Gymi 
                             pose={(item.icon?.toUpperCase() as any) || 'HAPPY'} 
                             size={160} 
                             avatarURL={currentUser?.avatarURL || firstAvatar?.avatarURL} 
                             avatarPoses={currentUser?.avatarPoses || firstAvatar?.avatarPoses} 
                           />
                        </div>
                      )}
                      
                      {/* Subject Badge */}
                      <div className="absolute top-3 left-3">
                        <div className="px-2 py-1 rounded-md bg-black/60 backdrop-blur-md border border-white/10 text-[7px] font-black uppercase tracking-widest text-indigo-400">
                          {item.subject}
                        </div>
                      </div>

                      {/* Controls Area */}
                      <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                         <button 
                            onClick={(e) => handleDelete(e, item.id)}
                            className={`w-7 h-7 rounded-lg flex items-center justify-center border backdrop-blur-md transition-all ${deletingId === item.id ? "bg-red-500 text-white border-red-400 animate-pulse" : "bg-black/40 text-red-500/60 hover:bg-red-500 hover:text-white border-white/5"}`}
                          >
                            <i className={`fa-solid ${deletingId === item.id ? "fa-triangle-exclamation" : "fa-trash-can"} text-[8px]`}></i>
                         </button>
                      </div>
                    </div>
      
                    {/* Compact Content */}
                    <div className="p-4 space-y-2">
                       <div className="flex items-center gap-1.5 opacity-40">
                          <i className="fa-solid fa-graduation-cap text-[8px]"></i>
                          <span className="text-[7px] font-black uppercase tracking-widest">Lekce</span>
                       </div>
                       <h3 className="font-black text-[13px] text-white uppercase tracking-tight leading-tight group-hover:text-indigo-400 transition-colors line-clamp-2">{item.topic}</h3>
                       <p className="text-[8px] font-black uppercase text-zinc-600 tracking-widest pt-2 border-t border-white/5">
                        {new Date(item.created_at).toLocaleDateString('cs-CZ')}
                       </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Loading Overlay for large items */}
      {isFetchingFull && (
        <div className="fixed inset-0 z-[2000000] bg-black/80 backdrop-blur-md flex flex-col items-center justify-center gap-6">
           <div className="w-16 h-16 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"></div>
           <p className="text-sm font-black uppercase tracking-[0.4em] text-white">Stahuji plný obsah...</p>
        </div>
      )}

      {/* Immersive Detail View - Studio Mode */}
      {previewItem && (
        <div 
          className="fixed inset-0 w-screen h-screen z-[999999] bg-black flex animate-in fade-in zoom-in-95 duration-500 overflow-hidden no-print"
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, width: '100vw', height: '100vh', zIndex: 999999 }}
        >
          <div className="absolute inset-0 bg-[#020617] z-[-1]"></div>
          <div className="absolute inset-0 bg-gradient-to-br from-[#020617] via-[#07070c] to-[#010110] opacity-100 z-[-1]"></div>
          
          <button 
            onClick={() => setPreviewItem(null)}
            className="absolute top-6 right-6 w-10 h-10 rounded-full bg-white/10 border border-white/20 text-white flex items-center justify-center hover:bg-white/20 hover:rotate-90 transition-all z-[1000000] active:scale-90 shadow-2xl"
          >
            <i className="fa-solid fa-xmark"></i>
          </button>

          <div className="relative w-full h-full flex flex-col lg:flex-row items-stretch">
            {/* Chapters Sidebar */}
            <motion.div 
              initial={false}
              animate={{ width: isChaptersOpen ? 280 : 0, opacity: isChaptersOpen ? 1 : 0 }}
              className="hidden lg:flex flex-col bg-[#020617] border-r border-white/5 overflow-hidden no-print"
            >
              <div className="p-8 border-b border-white/5 bg-zinc-950/20">
                <p className="text-[7px] font-black uppercase tracking-[0.4em] text-zinc-600 mb-2">Obsah lekce</p>
                <h3 className="text-xs font-black uppercase tracking-tight text-white leading-none">Struktura učiva</h3>
              </div>
              <div className="flex-grow overflow-y-auto no-scrollbar p-3 space-y-1">
                {previewItem.study_json?.fullSummary?.map((p: any, idx: number) => (
                  <button 
                    key={idx}
                    onClick={() => setActiveChapterIndex(idx)}
                    className={`w-full text-left flex items-center gap-4 px-4 py-3.5 rounded-xl transition-all group/item relative ${activeChapterIndex === idx ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'}`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[9px] font-black transition-all ${activeChapterIndex === idx ? 'bg-white/20 text-white' : 'bg-zinc-900 text-zinc-600 group-hover/item:text-zinc-400'}`}>
                      {String(idx+1).padStart(2, '0')}
                    </div>
                    <div className="flex-grow min-w-0">
                      <span className="block text-[10px] font-black uppercase tracking-widest truncate">{p.question}</span>
                    </div>
                    {activeChapterIndex === idx && <div className="absolute right-3 w-1.5 h-1.5 rounded-full bg-white shadow-[0_0_10px_white]"></div>}
                  </button>
                ))}
              </div>
              <div className="p-4 border-t border-white/5 text-center mt-auto">
                <p className="text-[7px] font-black uppercase tracking-[0.4em] text-zinc-700">Gymni Mate Studio</p>
              </div>
            </motion.div>

            {/* Sidebar Toggle */}
            <div className={`hidden lg:flex absolute left-0 top-1/2 -translate-y-1/2 z-[100] transition-all duration-500 ${isChaptersOpen ? 'translate-x-[280px]' : 'translate-x-0'}`}>
              <button 
                onClick={() => setIsChaptersOpen(!isChaptersOpen)}
                className="w-10 h-32 bg-[#020617] border border-white/10 border-l-0 rounded-r-3xl flex flex-col items-center justify-center gap-6 text-zinc-500 hover:text-white transition-all shadow-[10px_0_30px_rgba(0,0,0,0.3)] group pointer-events-auto active:scale-95"
              >
                <div className="flex flex-col items-center gap-1">
                  {isChaptersOpen ? <i className="fa-solid fa-chevron-left text-[8px] mb-1"></i> : <i className="fa-solid fa-list-ul text-[10px]"></i>}
                  <div className="[writing-mode:vertical-lr] text-[8px] font-black uppercase tracking-[0.5em] rotate-180 mb-1">Obsah</div>
                  {!isChaptersOpen && <i className="fa-solid fa-chevron-right text-[8px]"></i>}
                </div>
              </button>
            </div>

            {/* Visual Side */}
            <div className="flex-1 h-[45vh] lg:h-full relative overflow-hidden bg-transparent flex items-center justify-center border-r border-white/5">
              <div className="absolute inset-0 bg-[#07070c]"></div>
              
              {previewItem.image_url ? (
                <div className="absolute inset-0 w-full h-full overflow-hidden">
                  <img src={previewItem.image_url} className="w-full h-full object-cover opacity-30 hover:opacity-50 transition-opacity duration-1000" alt="Lesson" />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#07070c] via-transparent to-transparent"></div>
                  <div className="absolute inset-0 bg-gradient-to-r from-[#020617] via-indigo-600/5 to-transparent"></div>
                </div>
              ) : (
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-indigo-600/5 rounded-full blur-[120px] pointer-events-none"></div>
              )}
              
              <div className="absolute top-0 left-0 w-full p-10 flex justify-between items-start z-10 opacity-20">
                <div className="text-[10px] font-black uppercase tracking-[0.6em] text-zinc-500">Neural Architecture Analysis</div>
                <div className="text-[10px] font-black uppercase tracking-[0.4em] text-zinc-500">Archive Link // {previewItem.id.slice(0,8)}</div>
              </div>

              <div className="relative z-10 scale-100 lg:scale-[1.2] hover:scale-[1.3] transition-transform duration-1000 mt-[-10vh]">
                <Gymi 
                  pose={(previewItem.icon?.toUpperCase() as any) || 'HAPPY'} 
                  size={420} 
                  avatarURL={currentUser?.avatarURL || firstAvatar?.avatarURL} 
                  avatarPoses={currentUser?.avatarPoses || firstAvatar?.avatarPoses} 
                />
              </div>

              <div className="absolute bottom-24 lg:bottom-40 left-0 w-full p-8 lg:p-12 z-10">
                 <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-3 text-[8px] font-black uppercase tracking-[0.5em] text-zinc-600 mb-1">
                       <span>Neural Analyst</span>
                       <div className="w-6 h-px bg-white/10"></div>
                       <span>Archive Record</span>
                    </div>
                    <h2 className="text-xl lg:text-3xl font-black uppercase text-white tracking-tighter leading-[0.9] drop-shadow-2xl">
                       {previewItem.topic.split(' ').slice(0, 3).join(' ')}<br/>
                       <span className="text-indigo-600">{previewItem.topic.split(' ').slice(3).join(' ')}</span>
                    </h2>
                 </div>
              </div>
            </div>

            {/* Info Side */}
            <div className="flex-1 h-full overflow-y-auto no-scrollbar p-6 lg:p-16 space-y-12 bg-[#07070c]">
              {/* Header Meta */}
              <div className="flex items-center justify-between animate-in slide-in-from-right duration-500">
                 <div className="flex items-center gap-3">
                   <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-600/20 flex items-center justify-center text-indigo-400">
                     <i className={`fa-solid ${(previewItem.icon as any) ? 'fa-user-astronaut' : 'fa-graduation-cap'}`}></i>
                   </div>
                   <div>
                     <p className="text-[8px] font-black uppercase tracking-widest text-zinc-500">Předmět</p>
                     <p className="text-[11px] font-black uppercase text-white tracking-widest">{previewItem.subject}</p>
                   </div>
                 </div>
                 <div className="text-right">
                   <p className="text-[8px] font-black uppercase tracking-widest text-zinc-500">Uloženo</p>
                   <p className="text-[11px] font-black uppercase text-white tracking-widest">{new Date(previewItem.created_at).toLocaleDateString('cs-CZ')}</p>
                 </div>
              </div>

              {/* Introduction - Same as intro slide summary */}
              <div className="space-y-6 animate-in slide-in-from-right duration-700 delay-100">
                <div className="flex items-center gap-4">
                  <span className="text-[9px] font-black uppercase tracking-[0.6em] text-indigo-500">O čem to je?</span>
                  <div className="h-px flex-grow bg-indigo-500/10"></div>
                </div>
                <div className="p-8 rounded-[2rem] bg-white/[0.02] border border-white/5 relative overflow-hidden group">
                  <div className="absolute top-0 left-0 w-1 h-full bg-indigo-600"></div>
                  <p className="text-lg lg:text-xl font-bold text-zinc-300 leading-relaxed italic">
                    {previewItem.study_json?.topicIntro?.why || previewItem.study_json?.shortSummary || "Tato lekce rozebírá klíčové aspekty tématu a pomůže ti v jeho rychlém osvojení."}
                  </p>
                </div>
              </div>

              {/* Key Concept Extract */}
              <div className="space-y-6 animate-in slide-in-from-right duration-700 delay-200">
                <div className="flex items-center gap-4">
                  <span className="text-[9px] font-black uppercase tracking-[0.6em] text-zinc-600">
                    {previewItem.study_json?.fullSummary ? `Kapitola ${activeChapterIndex + 1} z ${previewItem.study_json.fullSummary.length}` : 'Klíčové koncepty'}
                  </span>
                  <div className="h-px flex-grow bg-white/5"></div>
                </div>
                <div className="grid grid-cols-1 gap-3">
                   {previewItem.study_json?.fullSummary ? (
                     <div className="flex flex-col gap-6 p-10 rounded-[2.5rem] bg-indigo-600/5 border border-indigo-500/20 shadow-2xl relative overflow-hidden group animate-fade">
                        <div className="absolute top-0 left-0 w-1 h-full bg-indigo-600"></div>
                        <h4 className="text-2xl font-black uppercase tracking-tight text-white leading-tight">
                           <FormattedInline text={previewItem.study_json.fullSummary[activeChapterIndex].question} />
                        </h4>
                        <div className="h-px w-20 bg-white/10"></div>
                        <p className="text-lg text-zinc-400 leading-relaxed font-bold">
                           <FormattedInline text={previewItem.study_json.fullSummary[activeChapterIndex].text} />
                        </p>
                        
                        {/* Navigation within chapters */}
                        <div className="flex gap-3 mt-4">
                           <button 
                             disabled={activeChapterIndex === 0}
                             onClick={() => setActiveChapterIndex(prev => prev - 1)}
                             className="px-4 py-2.5 rounded-xl bg-white/5 border border-white/5 text-[8px] font-black uppercase tracking-widest text-zinc-500 hover:text-white disabled:opacity-20 transition-all"
                           >
                             <i className="fa-solid fa-arrow-left mr-2"></i> Zpět
                           </button>
                           <button 
                             disabled={activeChapterIndex === previewItem.study_json.fullSummary.length - 1}
                             onClick={() => setActiveChapterIndex(prev => prev + 1)}
                             className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-[8px] font-black uppercase tracking-widest hover:bg-indigo-500 disabled:opacity-20 transition-all shadow-lg"
                           >
                             Další <i className="fa-solid fa-arrow-right ml-2"></i>
                           </button>
                        </div>
                     </div>
                   ) : (
                     previewItem.study_json?.fullSummary?.slice(0, 4).map((p: any, i: number) => (
                       <div key={i} className="flex gap-6 p-6 rounded-3xl bg-white/[0.03] border border-white/5 hover:border-indigo-500/30 transition-all group">
                          <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-white/5 flex items-center justify-center text-xs font-black text-zinc-500 group-hover:text-indigo-400 group-hover:bg-indigo-600/10 transition-all shrink-0">0{i+1}</div>
                          <p className="text-sm text-zinc-400 leading-relaxed font-medium"><FormattedInline text={p.text} /></p>
                       </div>
                     ))
                   )}
                </div>
              </div>

              {/* Material Availability Section */}
              <div className="space-y-6 animate-in slide-in-from-right duration-700 delay-300">
                <div className="flex items-center gap-4">
                  <span className="text-[9px] font-black uppercase tracking-[0.6em] text-emerald-500">Dostupné metody učení</span>
                  <div className="h-px flex-grow bg-emerald-500/10"></div>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                   {[
                     { label: 'Souhrn', icon: 'fa-align-left', active: !!previewItem.study_json?.fullSummary, detail: 'Hloubkový text' },
                     { label: 'Mapa', icon: 'fa-circle-dot', active: !!previewItem.study_json?.mindMap?.length, detail: 'Vizuální schéma' },
                     { label: 'Tahák', icon: 'fa-note-sticky', active: !!previewItem.study_json?.cheatSheet?.length, detail: 'Klíčová fakta' },
                     { label: 'Slajdy', icon: 'fa-pager', active: !!previewItem.study_json?.slides?.length, detail: 'Prezentace' },
                     { label: 'Kartičky', icon: 'fa-clone', active: !!previewItem.study_json?.flashcards?.length, detail: 'Opakování' },
                     { label: 'Testy', icon: 'fa-check-double', active: !!previewItem.study_json?.quizzes?.length, detail: 'Ověření' },
                   ].map((m, i) => (
                     <div key={i} className={`p-4 rounded-2xl flex flex-col gap-3 border transition-all ${m.active ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-white/5 border-white/5 opacity-20 grayscale'}`}>
                        <div className="flex items-center justify-between">
                          <i className={`fa-solid ${m.icon} ${m.active ? 'text-emerald-400' : 'text-zinc-600'}`}></i>
                          {m.active && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>}
                        </div>
                        <div>
                          <p className={`text-[10px] font-black uppercase tracking-widest ${m.active ? 'text-white' : 'text-zinc-500'}`}>{m.label}</p>
                          <p className="text-[8px] font-black uppercase tracking-widest text-zinc-600">{m.detail}</p>
                        </div>
                     </div>
                   ))}
                </div>
              </div>

              {(previewItem.files?.length || previewItem.images?.length) ? (
                <div className="space-y-6 animate-in slide-in-from-right duration-700 delay-200">
                  <div className="flex items-center gap-4">
                    <span className="text-[8px] font-black uppercase tracking-[0.6em] text-zinc-600">Archiv podkladů</span>
                    <div className="h-px w-20 bg-white/5"></div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {previewItem.images?.map((img, idx) => (
                      <div 
                        key={idx} 
                        onClick={() => {
                          const allAssets = [
                            ...(previewItem.images?.map((im, i) => ({ name: `Obrázek ${i+1}`, type: 'image/jpeg', data: im })) || []),
                            ...(previewItem.files?.map(f => ({ name: f.name, type: f.mimeType, data: f.data })) || [])
                          ];
                          setViewingFile({ name: `Obrázek ${idx + 1}`, type: 'image/jpeg', data: img, allFiles: allAssets, currentIndex: idx });
                        }}
                        className="relative aspect-video rounded-xl overflow-hidden bg-black/40 border border-white/5 cursor-pointer hover:border-indigo-500/30 transition-all group"
                      >
                        <img src={img} className="w-full h-full object-cover grayscale opacity-40 group-hover:grayscale-0 group-hover:opacity-80 transition-all duration-500" />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                          <i className="fa-solid fa-expand text-white"></i>
                        </div>
                      </div>
                    ))}
                    {previewItem.files?.map((file, idx) => (
                      <div 
                        key={idx} 
                        onClick={() => {
                          const allAssets = [
                            ...(previewItem.images?.map((im, i) => ({ name: `Obrázek ${i+1}`, type: 'image/jpeg', data: im })) || []),
                            ...(previewItem.files?.map(f => ({ name: f.name, type: f.mimeType, data: f.data })) || [])
                          ];
                          const startIdx = (previewItem.images?.length || 0) + idx;
                          setViewingFile({ name: file.name, type: file.mimeType, data: file.data, allFiles: allAssets, currentIndex: startIdx });
                        }}
                        className="p-4 rounded-xl bg-white/5 border border-white/5 flex items-center gap-4 group cursor-pointer hover:bg-white/10 hover:border-indigo-500/20 transition-all"
                      >
                        <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-white/5 flex items-center justify-center text-zinc-500 group-hover:text-indigo-500 transition-colors">
                          <i className="fa-solid fa-file-lines text-xs"></i>
                        </div>
                        <div className="flex-grow overflow-hidden text-xs">
                          <p className="text-[9px] font-black text-white uppercase tracking-tight truncate">{file.name}</p>
                          <p className="text-[7px] font-bold text-zinc-600 uppercase tracking-widest">{file.mimeType.split('/')[1]}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="pt-8 border-t border-white/10 flex flex-col md:flex-row gap-4 animate-in slide-in-from-bottom duration-700 delay-400">
                <button 
                  onClick={() => { onOpenItem(previewItem); setPreviewItem(null); }}
                  className="flex-grow py-3 bg-indigo-600 hover:bg-indigo-500 rounded-2xl text-[9px] font-black uppercase tracking-[0.4em] text-white shadow-[0_15px_40px_rgba(79,70,229,0.3)] transition-all active:scale-95 flex items-center justify-center gap-4"
                >
                  <i className="fa-solid fa-bolt-lightning text-xs"></i>
                  Otevřít lekci
                </button>
                <div className="flex gap-3">
                  <button 
                    onClick={() => setIsIconSelectorOpen(!isIconSelectorOpen)}
                    className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/10 transition-all group"
                  >
                    <div className="scale-50 group-hover:scale-60 transition-transform overflow-hidden rounded-lg">
                      <Gymi 
                        pose={(previewItem.icon?.toUpperCase() as any) || 'HAPPY'} 
                        size={60} 
                        avatarURL={currentUser?.avatarURL || firstAvatar?.avatarURL} 
                        avatarPoses={currentUser?.avatarPoses || firstAvatar?.avatarPoses} 
                      />
                    </div>
                  </button>
                  <button 
                    onClick={openShareModal}
                    className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-zinc-400 hover:text-emerald-500 hover:bg-white/10 transition-all"
                  >
                    <i className="fa-solid fa-paper-plane text-sm"></i>
                  </button>
                </div>
              </div>

              {isIconSelectorOpen && (
                <div className="p-8 rounded-[3rem] bg-black/40 border border-white/10 animate-in fade-in slide-in-from-bottom duration-500">
                   <div className="text-[8px] font-black uppercase tracking-[0.4em] text-zinc-500 mb-6 text-center">Vyber pózu pro kartu</div>
                   <div className="grid grid-cols-5 gap-4">
                    {ARCHIVE_POSES.map(pose => (
                      <button 
                        key={pose}
                        onClick={() => handleIconChange(pose)}
                        className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all overflow-hidden border ${previewItem.icon === pose ? 'bg-indigo-600/20 border-indigo-400' : 'bg-zinc-900 border-white/5 hover:bg-white/5'}`}
                      >
                        <div className="scale-75">
                          <Gymi 
                            pose={pose} 
                            size={70} 
                            avatarURL={currentUser?.avatarURL || firstAvatar?.avatarURL} 
                            avatarPoses={currentUser?.avatarPoses || firstAvatar?.avatarPoses} 
                          />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Share Modal */}
      {isShareModalOpen && (
        <div className="fixed inset-0 z-[5000] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={() => setIsShareModalOpen(false)}></div>
          <div className="relative w-full max-w-md bg-zinc-900 border border-white/10 rounded-[3rem] overflow-hidden shadow-2xl flex flex-col max-h-[80vh]">
            <div className="p-10 border-b border-white/5 bg-zinc-950/40">
              <h3 className="text-xl font-black uppercase tracking-widest text-white">Sdílet lekci</h3>
              <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mt-2">Vyberte uživatele, kterému chcete lekci poslat</p>
            </div>
            
            <div className="flex-grow overflow-y-auto p-6 space-y-3 no-scrollbar">
              {users.map(u => (
                <button 
                  key={u.uid}
                  onClick={() => handleShare(u)}
                  disabled={sharing || shareSuccess}
                  className="w-full flex items-center gap-5 p-5 rounded-[2rem] hover:bg-white/5 transition-all group border border-transparent hover:border-white/5"
                >
                  <div className="w-12 h-12 rounded-2xl bg-zinc-800 flex items-center justify-center text-white overflow-hidden shadow-lg">
                    {u.photoURL ? <img src={u.photoURL} className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : <i className="fa-solid fa-user"></i>}
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-black uppercase text-white tracking-tight">{u.displayName || u.email.split('@')[0]}</p>
                    <p className="text-[9px] font-black uppercase text-zinc-600 tracking-widest">{u.role}</p>
                  </div>
                  <div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                    <i className="fa-solid fa-paper-plane text-indigo-500"></i>
                  </div>
                </button>
              ))}
              {users.length === 0 && (
                <div className="py-20 text-center opacity-20">
                  <i className="fa-solid fa-users-slash text-4xl mb-4"></i>
                  <p className="text-[10px] font-black uppercase tracking-widest">Žádní uživatelé nenalezeni</p>
                </div>
              )}
            </div>

            {shareSuccess && (
              <div className="absolute inset-0 bg-emerald-600 flex flex-col items-center justify-center text-white animate-in slide-in-from-bottom duration-500">
                <i className="fa-solid fa-circle-check text-6xl mb-4"></i>
                <p className="text-xl font-black uppercase tracking-widest">Sdíleno!</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Immersive Document Studio - Ultra Fullscreen Ghost UI */}
      {viewingFile && (
        <div className="fixed inset-0 z-[4000] flex flex-col bg-[#020617] animate-in fade-in duration-500">
          {/* Top Floating Controls - Very subtle and minimal */}
          <div className="absolute top-0 left-0 right-0 z-50 h-14 px-6 flex justify-between items-center pointer-events-none">
            <div className="flex items-center gap-4 pointer-events-auto">
              <button 
                onClick={() => setViewingFile(null)}
                className="flex items-center gap-2 text-white/50 hover:text-white transition-all text-[8px] font-black uppercase tracking-widest px-4 py-2 bg-black/40 backdrop-blur-md rounded-full border border-white/5 hover:bg-red-500 hover:border-red-400 group"
              >
                <i className="fa-solid fa-xmark group-hover:rotate-90 transition-transform"></i>
                <span>Zavřít</span>
              </button>
              <div className="hidden md:flex items-center px-4 py-2 bg-black/40 backdrop-blur-md rounded-full border border-white/5 text-[8px] font-black uppercase tracking-widest text-white/40">
                {viewingFile.name}
              </div>
            </div>

            <div className="flex items-center gap-3 pointer-events-auto">
               <div className="flex bg-black/40 backdrop-blur-md p-0.5 rounded-full border border-white/5">
                <button onClick={handlePrevPage} className="w-10 h-10 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/5 rounded-full transition-all">
                  <i className="fa-solid fa-chevron-left text-xs"></i>
                </button>
                <div className="w-px h-4 bg-white/10 self-center"></div>
                <button onClick={handleNextPage} className="w-10 h-10 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/5 rounded-full transition-all">
                  <i className="fa-solid fa-chevron-right text-xs"></i>
                </button>
              </div>
              <a 
                href={viewingFile.data.startsWith('data:') || viewingFile.data.startsWith('http') ? viewingFile.data : `data:${viewingFile.type};base64,${viewingFile.data}`} 
                download={viewingFile.name}
                className="w-10 h-10 bg-white text-black rounded-full flex items-center justify-center hover:bg-indigo-500 hover:text-white transition-all shadow-xl active:scale-95"
                title="Stáhnout"
              >
                <i className="fa-solid fa-download text-xs"></i>
              </a>
            </div>
          </div>

          {/* Full-Height Content Area - ZERO Padding */}
          <div className="relative flex-grow flex items-stretch justify-center overflow-hidden">
             {viewingFile.type.startsWith('image/') ? (
                <div className="w-full h-full flex items-center justify-center bg-black/40 p-4">
                  <img 
                    src={viewingFile.data.startsWith('data:') || viewingFile.data.startsWith('http') ? viewingFile.data : `data:${viewingFile.type};base64,${viewingFile.data}`} 
                    className="max-w-full max-h-full object-contain shadow-[0_0_100px_rgba(0,0,0,0.5)] animate-in zoom-in-95 duration-500" 
                    alt={viewingFile.name}
                  />
                </div>
              ) : viewingFile.type === 'application/pdf' ? (
                <iframe 
                  src={viewingFile.data.startsWith('data:') || viewingFile.data.startsWith('http') ? viewingFile.data : `data:${viewingFile.type};base64,${viewingFile.data}`}
                  className="w-full h-full border-none bg-white animate-in fade-in duration-700"
                  title={viewingFile.name}
                />
              ) : viewingFile.data.startsWith('http') && (
                viewingFile.type.includes('presentation') || 
                viewingFile.type.includes('msword') || 
                viewingFile.type.includes('officedocument') ||
                viewingFile.type.includes('excel') ||
                viewingFile.type.includes('spreadsheet')
              ) ? (
                <div className="w-full h-full bg-[#f0f0f0] flex flex-col">
                  <iframe 
                    src={`https://docs.google.com/viewer?url=${encodeURIComponent(viewingFile.data)}&embedded=true`}
                    className="w-full h-full border-none shadow-inner"
                    style={{ height: '100vh', width: '100%' }}
                    title={viewingFile.name}
                  />
                  {/* Floating New Window Link */}
                  <a 
                    href={viewingFile.data} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="absolute bottom-6 left-6 h-10 px-6 bg-black/60 backdrop-blur-md border border-white/10 rounded-full flex items-center gap-3 text-[8px] font-black uppercase tracking-widest text-white/50 hover:text-white transition-all z-50 invisible md:visible"
                  >
                    <i className="fa-solid fa-up-right-from-square"></i>
                    Celá obrazovka prohlížeče
                  </a>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center p-12 text-center bg-black/40 rounded-3xl border border-white/5 max-w-xl mx-auto my-auto shadow-2xl">
                     <div className="w-20 h-20 rounded-[2rem] bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mx-auto mb-8">
                      <i className="fa-solid fa-cloud-arrow-down text-3xl"></i>
                    </div>
                    <h4 className="text-lg font-black uppercase tracking-tight text-white mb-3">{viewingFile.name}</h4>
                    <p className="text-[10px] text-zinc-500 uppercase tracking-widest leading-relaxed font-bold mb-8 italic">Náhled není podporován přímo v prohlížeči. Stáhněte si jej pro studium.</p>
                    <a 
                      href={viewingFile.data.startsWith('data:') || viewingFile.data.startsWith('http') ? viewingFile.data : `data:${viewingFile.type};base64,${viewingFile.data}`} 
                      download={viewingFile.name}
                      className="h-12 px-10 items-center justify-center rounded-2xl bg-indigo-600 text-white text-[9px] font-black uppercase tracking-widest shadow-xl hover:bg-indigo-500 transition-all active:scale-95 flex gap-3"
                    >
                      <i className="fa-solid fa-file-download"></i>
                      Stáhnout a otevřít
                    </a>
                </div>
              )}
          </div>

          {/* Transparent Hitboxes for Navigation (Full height) */}
          <div className="absolute inset-y-0 left-0 w-24 z-20 cursor-pointer pointer-events-auto opacity-0 group" onClick={handlePrevPage}></div>
          <div className="absolute inset-y-0 right-0 w-24 z-20 cursor-pointer pointer-events-auto opacity-0 group" onClick={handleNextPage}></div>

          {/* Slim Hidden Scroll Thumbnail Bar (Only on hover near bottom) */}
          <div className="absolute bottom-0 left-0 right-0 z-40 transition-all duration-300 transform translate-y-full hover:translate-y-0 opacity-0 hover:opacity-100 flex justify-center bg-zinc-950/80 backdrop-blur-md border-t border-white/10 p-4">
              <div className="flex gap-3 overflow-x-auto no-scrollbar">
                {viewingFile.allFiles?.map((f, i) => (
                  <button 
                    key={i}
                    onClick={() => setViewingFile({ name: f.name, type: f.mimeType || f.type, data: f.data, allFiles: viewingFile.allFiles, currentIndex: i })}
                    className={`w-10 h-10 rounded-lg transition-all border shrink-0 flex items-center justify-center overflow-hidden ${viewingFile.currentIndex === i ? 'bg-indigo-600 border-indigo-400 scale-110' : 'bg-white/5 border-white/5 opacity-40 hover:opacity-100'}`}
                  >
                    {f.type?.startsWith('image/') || (f.mimeType && f.mimeType.startsWith('image/')) ? (
                      <img src={f.data} className="w-full h-full object-cover" alt="thumb" />
                    ) : (
                      <i className={`fa-solid ${f.type?.includes('pdf') ? 'fa-file-pdf' : 'fa-file-lines'} text-[10px] text-white/50`}></i>
                    )}
                  </button>
                ))}
              </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ArchiveList;
