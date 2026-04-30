
import React, { useState, useEffect } from 'react';
import { Subject, CurriculumPlan, CurriculumTopic, QuizQuestion, SavedCurriculum, QuizSet, UserProfile } from '../types';
import { generateCurriculumPlan, generateCurriculumTest, refineCurriculumPlan, generateTopicQuiz } from '../services/geminiService';
import { storeCurriculum, fetchUserCurricula, updateCurriculum } from '../services/dbService';
import { ALL_AVAILABLE_SUBJECTS } from '../src/constants';
import { FormattedText } from './StudyOutput';
import { motion, AnimatePresence } from 'motion/react';
import Gymi from './Gymi';

interface CurriculumGuideProps {
  activeSubject: Subject;
  archive: any[];
  onGenerateLesson: (topic: string, topicId?: string, curriculumId?: string) => void;
  userProfile?: UserProfile;
  userSubjects: Subject[];
  onSelectSubject: (subject: Subject) => void;
  onOpenLogin: () => void;
  onOpenAddSubject: () => void;
  publishedCurricula: SavedCurriculum[];
  firstAvatar?: any;
  preloadedPlan?: SavedCurriculum | null;
  onClearPreloaded?: () => void;
  isAgentOpen?: boolean;
}

type SchoolLevel = 'elementary' | 'high' | 'none';
type ViewState = 'level' | 'grade' | 'plan' | 'testing' | 'results';

const CurriculumGuide: React.FC<CurriculumGuideProps> = ({ 
  activeSubject, 
  archive, 
  onGenerateLesson, 
  userProfile,
  userSubjects,
  onSelectSubject,
  onOpenLogin,
  onOpenAddSubject,
  publishedCurricula,
  firstAvatar,
  preloadedPlan,
  onClearPreloaded,
  isAgentOpen
}) => {
  const [view, setView] = useState<ViewState>('level');
  const [level, setLevel] = useState<SchoolLevel | null>(null);
  const [grade, setGrade] = useState<number | null>(null);
  const [plan, setPlan] = useState<CurriculumPlan | null>(null);
  const [currentTopicIndex, setCurrentTopicIndex] = useState(0);
  const [currentLessonIndex, setCurrentLessonIndex] = useState(0);
  const [randomPoses, setRandomPoses] = useState<Record<number, string>>({});
  const [test, setTest] = useState<{questions: QuizQuestion[]} | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSavedView, setIsSavedView] = useState(false);
  const [isNewPlanModalOpen, setIsNewPlanModalOpen] = useState(false);
  const [newPlanLevel, setNewPlanLevel] = useState<SchoolLevel | 'none'>(level || 'high');
  const [newPlanGrade, setNewPlanGrade] = useState<number>(grade || 1);
  const [newPlanNotes, setNewPlanNotes] = useState('');
  
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(true);

  const checkScroll = () => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
      setShowLeftArrow(scrollLeft > 10);
      setShowRightArrow(scrollLeft < scrollWidth - clientWidth - 10);
    }
  };

  React.useEffect(() => {
    checkScroll();
    window.addEventListener('resize', checkScroll);
    return () => window.removeEventListener('resize', checkScroll);
  }, [isAgentOpen, plan]);
  
  // Saved Curricula State
  const [savedCurricula, setSavedCurricula] = useState<SavedCurriculum[]>([]);
  const [showSaveConflict, setShowSaveConflict] = useState(false);
  
  // Chatbot State
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [isRefining, setIsRefining] = useState(false);
  const [activeTopicItemId, setActiveTopicItemId] = useState<string | null>(null);

  // Testing state
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [resultsByTopic, setResultsByTopic] = useState<Record<string, { total: number, correct: number }>>({});
  const [showExplanation, setShowExplanation] = useState(false);

  useEffect(() => {
    if (preloadedPlan) {
      setPlan(preloadedPlan.plan);
      setLevel(preloadedPlan.level);
      setGrade(preloadedPlan.plan.grade);
      setCurrentTopicIndex(0);
      setCurrentLessonIndex(0);
      setView('plan');
      if (onClearPreloaded) onClearPreloaded();
    }
  }, [preloadedPlan]);

  // Load saved curricula
  useEffect(() => {
    const loadCurricula = async () => {
      let combined: SavedCurriculum[] = [];
      
      // Local saved
      const savedLocal = localStorage.getItem(`gymni_mate_curricula_${activeSubject.id}`);
      if (savedLocal) {
        combined = JSON.parse(savedLocal);
      }

      // Cloud saved
      if (userProfile?.isLoggedIn) {
        const cloud = await fetchUserCurricula();
        const filteredCloud = cloud.filter(c => c.plan.subject === activeSubject.name);
        combined = [...filteredCloud, ...combined.filter(l => !filteredCloud.some(c => c.id === l.id))];
      }

      setSavedCurricula(combined);
      
      if (combined.length > 0 && view === 'level') {
        const latest = combined[0];
        setPlan(latest.plan);
        setLevel(latest.level);
        setGrade(latest.plan.grade);
        setCurrentTopicIndex(0);
        setCurrentLessonIndex(0);
        setView('plan');
      } else if (combined.length === 0 && (view === 'plan' || view === 'results')) {
        resetToInitial();
      }
    };

    loadCurricula();
  }, [activeSubject.id, userProfile?.isLoggedIn]);

  useEffect(() => {
    if (plan && plan.topics) {
      const availablePoses = ['HAPPY', 'LAUGHING', 'THINKING', 'INTENSE', 'EXPLAIN', 'SHOCKED', 'FRIENDLY', 'CASUAL', 'WAITING'];
      const newPoses: Record<number, string> = {};
      plan.topics.forEach((_, i) => {
        newPoses[i] = availablePoses[i % availablePoses.length];
      });
      setRandomPoses(newPoses);
    }
  }, [plan]);

  const resetToInitial = () => {
    setPlan(null);
    const onboardingLevel = localStorage.getItem('gymni_mate_onboarding_level') as SchoolLevel;
    const onboardingGrade = userProfile?.grade || (localStorage.getItem('gymni_mate_onboarding_grade') ? parseInt(localStorage.getItem('gymni_mate_onboarding_grade')!) : null);
    
    if (onboardingLevel && onboardingGrade) {
      setLevel(onboardingLevel);
      setGrade(onboardingGrade);
      setView('plan'); 
    } else {
      setLevel(null);
      setGrade(null);
      setView('level');
    }
  };

  const handleGradeSelect = (g: number) => {
    setGrade(g);
  };

  const onGenerate = async () => {
    setIsNewPlanModalOpen(false);
    setGrade(newPlanGrade);
    setLevel(newPlanLevel);
    setCurrentTopicIndex(0);
    setCurrentLessonIndex(0);
    setIsLoading(true);
    setView('plan');
    setIsSavedView(false);
    try {
      const data = await generateCurriculumPlan(activeSubject.name, newPlanGrade, newPlanLevel);
      setPlan(data);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const saveToLocalStorage = (list: SavedCurriculum[]) => {
    localStorage.setItem(`gymni_mate_curricula_${activeSubject.id}`, JSON.stringify(list));
    setSavedCurricula(list);
  };

  const handleLevelSelect = (l: SchoolLevel) => {
    setLevel(l);
    setGrade(null);
  };

  const handleSave = async () => {
    if (!plan || !level) return;
    
    if (savedCurricula.length >= 5) {
      setShowSaveConflict(true);
      return;
    }

    const newSaved: SavedCurriculum = {
      id: Math.random().toString(36).substr(2, 9),
      plan,
      level,
      timestamp: Date.now(),
      authorId: userProfile?.uid,
      authorName: userProfile?.displayName || userProfile?.email?.split('@')[0] || 'Student'
    };

    if (userProfile?.isLoggedIn) {
      const res = await storeCurriculum(newSaved);
      if (res.success) {
        newSaved.id = res.id!;
      }
    }

    saveToLocalStorage([newSaved, ...savedCurricula]);
  };

  const handleReplaceSave = async (idToReplace: string) => {
    if (!plan || !level) return;
    
    const newSaved: SavedCurriculum = {
      id: Math.random().toString(36).substr(2, 9),
      plan,
      level,
      timestamp: Date.now(),
      authorId: userProfile?.uid,
      authorName: userProfile?.displayName || userProfile?.email?.split('@')[0] || 'Student'
    };

    if (userProfile?.isLoggedIn) {
      const res = await storeCurriculum(newSaved);
      if (res.success) {
        newSaved.id = res.id!;
      }
    }

    const newList = savedCurricula.filter(c => c.id !== idToReplace);
    saveToLocalStorage([newSaved, ...newList]);
    setShowSaveConflict(false);
  };

  const handleCreateNew = () => {
    const onboardingGrade = userProfile?.grade || (localStorage.getItem('gymni_mate_onboarding_grade') ? parseInt(localStorage.getItem('gymni_mate_onboarding_grade')!) : 1);
    const onboardingLevel = (localStorage.getItem('gymni_mate_onboarding_level') as SchoolLevel) || 'high';
    
    setNewPlanGrade(onboardingGrade);
    setNewPlanLevel(onboardingLevel);
    setNewPlanNotes('');
    setIsNewPlanModalOpen(true);
  };

  const handleRefine = async () => {
    if (!plan || !chatInput.trim()) return;
    setIsRefining(true);
    try {
      const updatedPlan = await refineCurriculumPlan(plan, chatInput);
      setPlan(updatedPlan);
      setChatInput('');
    } catch (e) {
      console.error(e);
    } finally {
      setIsRefining(false);
    }
  };

  const startTest = async () => {
    if (!plan) return;
    setIsLoading(true);
    setView('testing');
    setCurrentQ(0);
    setAnswers({});
    setShowExplanation(false);
    try {
      const data = await generateCurriculumTest(plan, level!);
      setTest(data);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAnswer = (qIdx: number, aIdx: number) => {
    if (answers[qIdx] !== undefined) return;
    setAnswers(prev => ({ ...prev, [qIdx]: aIdx }));
    setShowExplanation(true);
  };

  const startTopicTest = async () => {
    if (!plan) return;
    const currentTopic = plan.topics[currentTopicIndex];
    setIsLoading(true);
    try {
      const quiz = await generateTopicQuiz(currentTopic.title, currentTopic.summary?.what || '');
      setTest(quiz);
      setAnswers({});
      setCurrentQ(0);
      setShowExplanation(false);
      setActiveTopicItemId(currentTopic.id);
      setView('testing');
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const finishTest = () => {
    if (!test || !plan) return;

    if (activeTopicItemId) {
      const correctCount = test.questions.reduce((acc, q, idx) => 
        answers[idx] === q.correctIndex ? acc + 1 : acc, 0
      );
      const score = Math.round((correctCount / test.questions.length) * 100);

      const updatedSaved = savedCurricula.map(c => {
        if (c.plan === plan) {
          return {
            ...c,
            results: { ...(c.results || {}), [activeTopicItemId]: score }
          };
        }
        return c;
      });
      setSavedCurricula(updatedSaved);
      saveToLocalStorage(updatedSaved);
      setActiveTopicItemId(null);
      setView('plan');
      return;
    }

    const topicStats: Record<string, { total: number, correct: number }> = {};
    plan.topics.forEach(t => topicStats[t.title] = { total: 0, correct: 0 });

    test.questions.forEach((q, idx) => {
      const topic = q.topicTag || "Ostatní";
      if (!topicStats[topic]) topicStats[topic] = { total: 0, correct: 0 };
      topicStats[topic].total += 1;
      if (answers[idx] === q.correctIndex) {
        topicStats[topic].correct += 1;
      }
    });

    setResultsByTopic(topicStats);
    setView('results');
  };

  const renderSkeleton = () => (
    <div className="space-y-12">
      {[1, 2, 3].map(i => (
        <div key={i} className="bg-white/5 animate-pulse h-80 rounded-[3rem]"></div>
      ))}
    </div>
  );

  const handlePublish = async (id: string) => {
    if (!userProfile?.isLoggedIn) {
      onOpenLogin();
      return;
    }
    const authorName = userProfile.displayName || userProfile.email.split('@')[0];
    if (!id.startsWith('local_')) {
      await updateCurriculum(id, { isPublished: true, authorName });
    }
    const updated = savedCurricula.map(c => 
      c.id === id ? { ...c, isPublished: true, authorName } : c
    );
    saveToLocalStorage(updated);
  };

  const currentSaved = savedCurricula.find(c => c.plan === plan);
  const isCurrentlyPublished = currentSaved?.isPublished;

  return (
    <div className="max-w-7xl mx-auto pt-0 pb-8 px-6">
      <div className="flex flex-col gap-4 mb-2">
        <div className="bg-zinc-950 p-2 rounded-[1.5rem] border border-white/5 shadow-2xl flex flex-wrap items-center justify-between gap-3">
           <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 md:pb-0">
              {userSubjects.map(s => (
                <button 
                   key={s.id}
                   onClick={() => onSelectSubject(s)}
                   className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all shrink-0 border uppercase tracking-widest text-[8px] font-black ${
                     activeSubject?.id === s.id 
                       ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg' 
                       : 'bg-white/5 border-white/5 text-zinc-600 hover:text-zinc-400'
                   }`}
                >
                   <i className={`fa-solid ${s.icon} text-[9px]`}></i>
                   {activeSubject?.id === s.id && s.name}
                </button>
              ))}
              <button 
                onClick={onOpenAddSubject}
                className="w-8 h-8 rounded-xl bg-white/5 border border-dashed border-white/10 text-zinc-700 hover:text-indigo-400 hover:border-indigo-500/30 transition-all flex items-center justify-center"
              >
                <i className="fa-solid fa-plus text-[9px]"></i>
              </button>
           </div>

           <div className="flex items-center gap-2">
              {plan && view === 'plan' && (
                <React.Fragment>
                   {!currentSaved ? (
                     <button 
                       onClick={handleSave}
                       className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-[9px] font-black uppercase tracking-widest hover:bg-emerald-600 transition-all flex items-center gap-2 shadow-lg shadow-indigo-500/20"
                     >
                       <i className="fa-solid fa-cloud-arrow-up"></i>
                       Uložit Osnovu
                     </button>
                   ) : (
                     <button 
                       onClick={() => handlePublish(currentSaved.id)}
                       disabled={isCurrentlyPublished}
                       className={`px-5 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-2 border ${isCurrentlyPublished ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-white/5 border-indigo-500/10 text-indigo-400 hover:bg-indigo-600 hover:text-white'}`}
                     >
                       <i className={`fa-solid ${isCurrentlyPublished ? 'fa-globe' : 'fa-share-nodes'}`}></i>
                       {isCurrentlyPublished ? 'Publikováno' : 'Publikovat'}
                     </button>
                   )}
                </React.Fragment>
              )}
              <button 
                onClick={() => setIsSavedView(!isSavedView)}
                className={`px-5 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${isSavedView ? 'bg-indigo-600 text-white' : 'bg-white/5 text-zinc-500 hover:text-zinc-300'}`}
              >
                <i className={`fa-solid ${isSavedView ? 'fa-book-open' : 'fa-bookmark'}`}></i>
                {isSavedView ? 'Zpět na plán' : 'Moje Knihovna'}
              </button>
              <button 
                onClick={handleCreateNew}
                className="px-5 py-2.5 rounded-xl bg-emerald-600/10 border border-emerald-500/20 text-emerald-400 text-[9px] font-black uppercase tracking-widest hover:bg-emerald-600/20 transition-all flex items-center gap-2"
              >
                <i className="fa-solid fa-magic"></i>
                Nová Osnova
              </button>
           </div>
        </div>
      </div>

      <AnimatePresence>
        {isNewPlanModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-zinc-950 border border-white/10 w-full max-w-5xl rounded-[3.5rem] overflow-hidden shadow-[0_50px_200px_rgba(0,0,0,1)] flex flex-col md:flex-row h-[700px]"
            >
              <div className="w-full md:w-[450px] p-10 md:p-14 border-r border-white/5 flex flex-col gap-10 overflow-y-auto no-scrollbar">
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]"></div>
                    <span className="text-[10px] font-black uppercase tracking-[0.5em] text-emerald-500">Neural Plan Genesis</span>
                  </div>
                  <h3 className="text-4xl font-black text-white uppercase tracking-tighter italic-serif-header leading-none">Nová <span className="text-indigo-500">Osnova</span></h3>
                  <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest leading-relaxed">Nastav parametry své nové cesty.</p>
                </div>

                <div className="space-y-4">
                   <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Úroveň studia</p>
                   <div className="grid grid-cols-3 gap-2">
                     <button onClick={() => { setNewPlanLevel('elementary'); setNewPlanGrade(1); }} className={`h-14 rounded-2xl text-[9px] font-black uppercase tracking-widest transition-all border ${newPlanLevel === 'elementary' ? 'bg-indigo-600 border-indigo-400 text-white shadow-lg' : 'bg-white/5 border-white/5 text-zinc-600'}`}>ZŠ</button>
                     <button onClick={() => { setNewPlanLevel('high'); setNewPlanGrade(1); }} className={`h-14 rounded-2xl text-[9px] font-black uppercase tracking-widest transition-all border ${newPlanLevel === 'high' ? 'bg-indigo-600 border-indigo-400 text-white shadow-lg' : 'bg-white/5 border-white/5 text-zinc-600'}`}>SŠ</button>
                     <button onClick={() => { setNewPlanLevel('none'); setNewPlanGrade(0); }} className={`h-14 rounded-2xl text-[9px] font-black uppercase tracking-widest transition-all border ${newPlanLevel === 'none' ? 'bg-indigo-600 border-indigo-400 text-white shadow-lg' : 'bg-white/5 border-white/5 text-zinc-600'}`}>Bez ročníku</button>
                   </div>
                </div>

                {newPlanLevel !== 'none' && (
                  <div className="space-y-4">
                     <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Vyber Ročník</p>
                     <div className="grid grid-cols-5 gap-2">
                        {(newPlanLevel === 'elementary' ? [1,2,3,4,5,6,7,8,9] : [1,2,3,4]).map(g => (
                          <button key={g} onClick={() => setNewPlanGrade(g)} className={`h-10 rounded-xl text-[10px] font-black transition-all ${newPlanGrade === g ? 'bg-white text-black' : 'bg-white/5 text-zinc-500'}`}>{g}.</button>
                        ))}
                     </div>
                  </div>
                )}

                <div className="space-y-4 flex-grow">
                  <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Poznámka k osnově</p>
                  <textarea 
                    value={newPlanNotes}
                    onChange={(e) => setNewPlanNotes(e.target.value)}
                    placeholder="Chci se zaměřit více na..."
                    className="w-full h-32 bg-white/5 border border-white/5 rounded-3xl p-6 text-xs text-white focus:outline-none focus:border-indigo-500 transition-all placeholder:text-zinc-800 font-bold resize-none"
                  />
                </div>

                <div className="pt-6 border-t border-white/5 flex gap-4">
                  <button onClick={() => setIsNewPlanModalOpen(false)} className="px-8 py-5 rounded-2xl bg-white/5 text-zinc-500 text-[9px] font-black uppercase tracking-widest hover:text-white transition-all">Zrušit</button>
                  <button onClick={onGenerate} disabled={isLoading} className="flex-grow py-5 rounded-2xl bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-xl shadow-indigo-600/20 disabled:opacity-50">
                    {isLoading ? <i className="fa-solid fa-circle-notch fa-spin"></i> : 'Generovat'}
                  </button>
                </div>
              </div>

              <div className="flex-grow bg-zinc-900/30 p-10 md:p-14 flex flex-col gap-8 overflow-y-auto no-scrollbar">
                <div className="space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-[0.4em] text-zinc-600">Existující Osnovy</p>
                  <h4 className="text-xl font-black text-white uppercase tracking-tight italic-serif-header">Vybírej z <span className="text-indigo-500">archivu</span></h4>
                </div>

                <div className="space-y-6">
                  <div className="space-y-4">
                    <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Publikované světem</p>
                    <div className="grid grid-cols-1 gap-3">
                       {publishedCurricula.filter(pc => pc.plan.subject === activeSubject.name).slice(0, 3).map(pc => (
                         <div 
                           key={pc.id}
                           onClick={() => {
                              setPlan(pc.plan);
                              setLevel(pc.level);
                              setGrade(pc.plan.grade);
                              setCurrentTopicIndex(0);
                              setIsNewPlanModalOpen(false);
                              setView('plan');
                           }}
                           className="flex items-center gap-4 p-4 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-indigo-500/30 group cursor-pointer transition-all"
                         >
                            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                               <i className={`fa-solid ${activeSubject.icon} text-xs`}></i>
                            </div>
                            <div className="flex-grow">
                               <p className="text-[10px] font-black text-white uppercase tracking-tight">{pc.plan.topics[0]?.title || 'Téma'}</p>
                               <p className="text-[8px] font-bold text-zinc-600 uppercase tracking-widest">{pc.plan.grade === 0 ? 'Obecná' : `${pc.plan.grade}. ročník`} • {pc.authorName || 'Mentor'}</p>
                            </div>
                         </div>
                       ))}
                       {publishedCurricula.filter(pc => pc.plan.subject === activeSubject.name).length === 0 && (
                         <p className="text-[9px] font-bold text-zinc-800 uppercase text-center py-4 italic">Zatím žádné veřejné osnovy pro tento předmět.</p>
                       )}
                    </div>
                  </div>

                  <div className="space-y-4 pt-4">
                    <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Tvé nedávné</p>
                    <div className="grid grid-cols-1 gap-3">
                       {savedCurricula.slice(0, 3).map(sc => (
                         <div 
                           key={sc.id}
                           onClick={() => {
                              setPlan(sc.plan);
                              setLevel(sc.level);
                              setGrade(sc.plan.grade);
                              setCurrentTopicIndex(0);
                              setIsNewPlanModalOpen(false);
                              setView('plan');
                           }}
                           className="flex items-center gap-4 p-4 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-emerald-500/30 group cursor-pointer transition-all"
                         >
                            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                               <i className="fa-solid fa-history text-xs"></i>
                            </div>
                            <div className="flex-grow">
                               <p className="text-[10px] font-black text-white uppercase tracking-tight">{sc.plan.topics[0]?.title || 'Téma'}</p>
                               <p className="text-[8px] font-bold text-zinc-600 uppercase tracking-widest">{new Date(sc.timestamp).toLocaleDateString()}</p>
                            </div>
                         </div>
                       ))}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {isSavedView ? (
        <div className="animate-fade space-y-12">
          <div className="space-y-2">
            <h3 className="text-3xl font-black text-white uppercase tracking-tighter italic-serif-header">Moje <span className="text-indigo-500">Knihovna</span></h3>
            <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest leading-relaxed">Tady najdeš všechny své vytvořené osnovy pro {activeSubject.name}.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {savedCurricula.length > 0 ? savedCurricula.map((sc) => (
              <div 
                key={sc.id}
                onClick={() => {
                  setPlan(sc.plan);
                  setLevel(sc.level);
                  setGrade(sc.plan.grade);
                  setCurrentTopicIndex(0);
                  setIsSavedView(false);
                  setView('plan');
                }}
                className="group relative p-8 rounded-[2.5rem] bg-zinc-950 border border-white/5 hover:border-indigo-500/30 transition-all cursor-pointer overflow-hidden shadow-xl"
              >
                <div className="relative z-10 space-y-6">
                  <div className="flex justify-between items-start">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 group-hover:bg-indigo-600 group-hover:text-white transition-all">
                      <i className={`fa-solid ${activeSubject.icon} text-sm`}></i>
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase text-indigo-500 tracking-[0.2em] mb-1">{sc.plan.grade === 0 ? 'Obecná Osnova' : `${sc.plan.grade}. ročník`} • {sc.level === 'elementary' ? 'ZŠ' : sc.level === 'high' ? 'SŠ' : 'Expert'}</p>
                    <h4 className="text-xl font-black text-white uppercase tracking-tight group-hover:text-indigo-400 transition-colors line-clamp-2 leading-tight">{sc.plan.topics[0]?.title || 'Bezejmenná'}</h4>
                  </div>
                  <div className="pt-4 border-t border-white/5 flex items-center justify-between">
                    <span className="text-[8px] font-mono text-zinc-600 uppercase tracking-widest">{new Date(sc.timestamp).toLocaleDateString()}</span>
                    <i className="fa-solid fa-arrow-right text-[10px] text-zinc-800 group-hover:text-indigo-500 transition-all"></i>
                  </div>
                </div>
              </div>
            )) : (
              <div className="col-span-full py-24 rounded-[3rem] border border-dashed border-white/5 flex flex-col items-center justify-center gap-6 text-zinc-800 bg-white/[0.01]">
                 <i className="fa-solid fa-bookmark text-4xl opacity-10"></i>
                 <div className="text-center space-y-2">
                    <p className="text-[11px] font-black uppercase tracking-[0.3em]">Knihovna je prázdná</p>
                    <p className="text-[9px] font-bold text-zinc-700 uppercase tracking-widest">Vytvoř si svou první osnovu pro tento předmět.</p>
                 </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <React.Fragment>
          {userSubjects.length === 0 ? (
            <div className="text-center py-20 space-y-12 animate-fade max-w-2xl mx-auto">
              <div className="space-y-6">
                <div className="relative w-32 h-32 mx-auto mb-4">
                  <div className="absolute inset-0 bg-indigo-500/10 blur-2xl rounded-full"></div>
                  <Gymi pose="WAITING" size={128} className="relative z-10" avatarURL={userProfile?.avatarURL || firstAvatar?.avatarURL} avatarPoses={userProfile?.avatarPoses || firstAvatar?.avatarPoses} />
                </div>
                <h3 className="text-2xl font-black text-white uppercase tracking-tighter italic-serif-header">Tvůj prostor je <span className="text-indigo-500">prázdný</span></h3>
                <p className="text-zinc-500 font-bold text-xs uppercase tracking-[0.2em] leading-relaxed">Přidej svůj první předmět pomocí tlačítka <i className="fa-solid fa-plus mx-1 text-indigo-400"></i> výše.</p>
                <button onClick={onOpenAddSubject} className="px-12 py-5 rounded-[2rem] bg-indigo-600 text-white text-[10px] font-black uppercase tracking-[0.4em] shadow-xl shadow-indigo-500/20 hover:scale-105 active:scale-95 transition-all">Přidat první předmět</button>
              </div>
            </div>
          ) : (
            <React.Fragment>
              {!plan && !isLoading && (
                <div className="flex flex-col items-center justify-center py-24 text-center space-y-12 animate-fade">
                   <div className="relative">
                      <div className="absolute -inset-8 bg-indigo-500/5 blur-3xl rounded-full"></div>
                      <Gymi pose="FRIENDLY" size={200} className="relative z-10" avatarURL={userProfile?.avatarURL || firstAvatar?.avatarURL} avatarPoses={userProfile?.avatarPoses || firstAvatar?.avatarPoses} />
                   </div>
                   <div className="space-y-6 max-w-md">
                     <h3 className="text-3xl font-black text-white uppercase tracking-tighter italic-serif-header leading-tight">Vytvoř si svou první <span className="text-indigo-500">akademickou</span> osnovu</h3>
                     <p className="text-zinc-500 font-bold text-[10px] uppercase tracking-[0.2em] leading-relaxed">Vyber si předmět, nastav ročník a náš Neural Mentor ti připraví špičkový plán studia.</p>
                     <button onClick={handleCreateNew} className="px-12 py-5 rounded-[2rem] bg-indigo-600 text-white text-[10px] font-black uppercase tracking-[0.4em] shadow-xl shadow-indigo-500/20 hover:scale-105 active:scale-95 transition-all">Začít teď</button>
                   </div>
                </div>
              )}

              {isLoading && !plan && (
                <div className="py-24">
                  {renderSkeleton()}
                </div>
              )}

              {view === 'plan' && plan && !isLoading && (
                <div className="animate-fade space-y-4 py-0 min-h-[70vh] flex flex-col items-center justify-start relative overflow-visible mt-2">
                   {/* Background Decorations */}
                   <div className="absolute top-1/2 left-0 w-96 h-96 bg-indigo-500/10 blur-[120px] rounded-full pointer-events-none -translate-x-1/2 -translate-y-1/2 -z-10" />
                   <div className="absolute top-1/2 right-0 w-96 h-96 bg-emerald-500/5 blur-[120px] rounded-full pointer-events-none translate-x-1/2 -translate-y-1/2 -z-10" />

                   {/* Category Navigation */}
                   <div className="w-full flex items-center justify-between gap-6 px-4 relative">
                      <button onClick={() => { setCurrentTopicIndex(Math.max(0, currentTopicIndex - 1)); setCurrentLessonIndex(0); }} disabled={currentTopicIndex === 0} className={`w-10 h-10 md:w-12 md:h-12 rounded-xl flex items-center justify-center transition-all border ${currentTopicIndex === 0 ? 'bg-white/5 border-white/5 text-zinc-800' : 'bg-zinc-950 border-white/10 text-white hover:border-indigo-500 hover:scale-110 active:scale-95 shadow-xl'}`}>
                        <i className="fa-solid fa-chevron-left text-lg"></i>
                      </button>
                      <div className="text-center space-y-0.5 xl:pl-[180px]">
                         <p className="text-[8px] font-black uppercase tracking-[0.5em] text-indigo-500/60">Kategorie {currentTopicIndex + 1} z {plan.topics.length}</p>
                         <h2 className="text-lg md:text-xl font-black text-white uppercase tracking-tighter italic-serif-header leading-tight max-w-2xl mx-auto">{plan.topics[currentTopicIndex].title}</h2>
                      </div>
                      <button onClick={() => { setCurrentTopicIndex(Math.min(plan.topics.length - 1, currentTopicIndex + 1)); setCurrentLessonIndex(0); }} disabled={currentTopicIndex === plan.topics.length - 1} className={`w-10 h-10 md:w-12 md:h-12 rounded-xl flex items-center justify-center transition-all border ${currentTopicIndex === plan.topics.length - 1 ? 'bg-white/5 border-white/5 text-zinc-800' : 'bg-zinc-950 border-white/10 text-white hover:border-indigo-500 hover:scale-110 active:scale-95 shadow-xl'}`}>
                        <i className="fa-solid fa-chevron-right text-lg"></i>
                      </button>
                   </div>

                   {/* Main Panel */}
                   <div className="w-full max-w-7xl flex flex-col md:flex-row items-stretch gap-0 border border-white/10 rounded-[3.5rem] bg-zinc-950/40 backdrop-blur-3xl shadow-[0_50px_200px_rgba(0,0,0,0.8)] relative overflow-hidden">
                      <AnimatePresence>
                        {!isAgentOpen && (
                          <div className="absolute -left-24 -top-24 pointer-events-none hidden xl:block z-10 w-[500px]">
                             <Gymi pose={randomPoses[currentTopicIndex] as any || 'CASUAL'} size={500} avatarURL={userProfile?.avatarURL || firstAvatar?.avatarURL} avatarPoses={userProfile?.avatarPoses || firstAvatar?.avatarPoses} />
                          </div>
                        )}
                      </AnimatePresence>

                      <div className={`flex-grow p-6 md:p-10 flex flex-col min-h-[480px] border-r border-white/5 transition-all duration-500 ${!isAgentOpen ? 'xl:pl-[380px]' : 'xl:pl-10'}`}>
                         <AnimatePresence mode="wait">
                           <motion.div key={`${currentTopicIndex}-${currentLessonIndex}`} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-8">
                             <div className="space-y-3">
                               <div className="flex items-center gap-3">
                                  <div className="px-3 py-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-[9px] font-black uppercase tracking-widest text-indigo-400">Bod č. {currentLessonIndex + 1}</div>
                                  <span className="text-zinc-700 text-[10px] uppercase font-black tracking-widest">{activeSubject.name} • {grade}. Ročník</span>
                               </div>
                               <h3 className="text-3xl md:text-5xl font-black text-white uppercase tracking-tighter italic leading-[0.9] drop-shadow-2xl max-w-2xl">{plan.topics[currentTopicIndex].mustKnow[currentLessonIndex]}</h3>
                             </div>

                             <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                <div className="space-y-4">
                                   <p className="text-[10px] font-black uppercase tracking-widest text-indigo-500/60">O čem to je?</p>
                                   <p className="text-zinc-300 text-lg font-medium leading-relaxed italic-serif-header">{plan.topics[currentTopicIndex].summary.what}</p>
                                </div>
                                <div className="space-y-4">
                                   <p className="text-[10px] font-black uppercase tracking-widest text-emerald-500/60">Proč se to učíme?</p>
                                   <p className="text-zinc-400 text-sm font-bold leading-relaxed">{plan.topics[currentTopicIndex].summary.why || "Tato znalost tvoří základní stavební kámen."}</p>
                                </div>
                             </div>

                             <div className="p-6 rounded-[2rem] bg-white/5 border border-white/10 relative overflow-hidden group">
                                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-30 transition-opacity"><i className="fa-solid fa-lightbulb text-3xl text-indigo-400"></i></div>
                                <div className="space-y-1 relative z-10">
                                   <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500 mb-1">Metodika lekce</p>
                                   <p className="text-zinc-300 text-sm font-medium leading-relaxed">{plan.topics[currentTopicIndex].summary.how || "Zaměříme se na praktické příklady a logické provázanosti."}</p>
                                </div>
                             </div>

                             <div className="pt-4 flex flex-col sm:flex-row items-center gap-4">
                               <button onClick={() => onGenerateLesson(`Studovat lekci: ${plan.topics[currentTopicIndex].mustKnow[currentLessonIndex]} within context of ${plan.topics[currentTopicIndex].title}`, `${activeSubject.id}_${grade}_${plan.topics[currentTopicIndex].id}_${currentLessonIndex}`, currentSaved?.id)} className="w-full sm:w-auto px-10 py-5 bg-white text-black rounded-[2rem] font-black uppercase text-[10px] tracking-[0.3em] shadow-[0_20px_50px_rgba(255,255,254,0.1)] hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-4 group">
                                 <i className="fa-solid fa-graduation-cap group-hover:rotate-12 transition-transform"></i> Spustit Lekci
                               </button>
                               <button onClick={startTopicTest} className="w-full sm:w-auto px-10 py-5 bg-indigo-600 text-white rounded-[2rem] font-black uppercase text-[10px] tracking-[0.3em] shadow-[0_20px_50px_rgba(79,70,229,0.2)] hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-4 group">
                                 <i className="fa-solid fa-bolt group-hover:animate-pulse"></i> Otestovat znalosti
                               </button>
                             </div>
                           </motion.div>
                         </AnimatePresence>
                      </div>

                      {!isAgentOpen && (
                        <div className="md:w-80 p-6 md:p-8 flex flex-col gap-6 bg-zinc-950/20">
                           <div className="space-y-3">
                             <div className="flex items-center justify-between">
                                <div className="w-12 h-0.5 bg-white/5 rounded-full" />
                                <span className="text-[9px] font-mono text-zinc-800">{currentLessonIndex + 1}/{plan.topics[currentTopicIndex].mustKnow.length}</span>
                             </div>
                             <div className="flex gap-1">
                               {plan.topics[currentTopicIndex].mustKnow.map((_, i) => (
                                 <div key={i} className={`h-1 rounded-full transition-all duration-500 ${i === currentLessonIndex ? 'flex-grow bg-indigo-500 shadow-[0_0_10px_rgba(79,70,229,0.5)]' : 'w-1 bg-white/10'}`} />
                               ))}
                             </div>
                           </div>
                           <div className="space-y-2 overflow-y-auto no-scrollbar max-h-[450px]">
                              {plan.topics[currentTopicIndex].mustKnow.map((point, idx) => {
                                 const itemId = `${activeSubject.id}_${grade}_${plan.topics[currentTopicIndex].id}_${idx}`;
                                 const isDone = archive.some(a => a.topicId === itemId);
                                 return (
                                   <button key={idx} onClick={() => setCurrentLessonIndex(idx)} className={`w-full p-5 rounded-2xl text-left transition-all border flex items-center gap-4 group relative overflow-hidden ${currentLessonIndex === idx ? 'bg-indigo-600/10 border-indigo-500/50 shadow-xl' : 'bg-transparent border-transparent hover:bg-white/5 hover:border-white/5'}`}>
                                      <div className="space-y-0.5 flex-grow">
                                         <p className={`text-[10px] font-black uppercase tracking-tight leading-tight line-clamp-3 ${currentLessonIndex === idx ? 'text-white' : isDone ? 'text-emerald-500' : 'text-zinc-500 group-hover:text-zinc-300'}`}>{point}</p>
                                      </div>
                                      {currentLessonIndex === idx && <motion.div layoutId="active-lesson-indicator" className="absolute left-0 w-1 h-6 bg-indigo-500 rounded-full" />}
                                   </button>
                                 );
                              })}
                           </div>
                           <div className="mt-auto pt-8 border-t border-white/5 text-center">
                              <p className="text-[8px] font-bold text-zinc-700 uppercase tracking-widest italic">Dokonči vše pro splnění kategorie.</p>
                           </div>
                        </div>
                      )}
                   </div>

                   <div className="flex gap-4">
                      {plan.topics.map((_, i) => (
                        <button key={i} onClick={() => { setCurrentTopicIndex(i); setCurrentLessonIndex(0); }} className={`w-3 h-3 rounded-full transition-all duration-500 border ${i === currentTopicIndex ? 'bg-white border-white scale-125' : 'bg-white/10 border-transparent hover:bg-white/30'}`} />
                      ))}
                   </div>

                   {isAgentOpen && (
                     <div className="fixed bottom-0 left-0 lg:left-72 right-0 z-[120] transition-all duration-500 transform translate-y-0 opacity-100">
                        <div className="mx-auto max-w-6xl mb-8 px-6">
                           <div className="glass-panel rounded-[2.5rem] p-3 border-white/10 shadow-[0_25px_70px_rgba(0,0,0,0.6)] flex items-center gap-1 overflow-hidden relative group">
                              <div className="flex items-center gap-3 px-5 py-2 border-r border-white/10 shrink-0 relative z-10 bg-zinc-950/20 rounded-l-[2rem]">
                                 <div className="w-8 h-8 rounded-full bg-zinc-900 flex items-center justify-center border border-white/5">
                                    <i className="fa-solid fa-graduation-cap text-indigo-500 text-[10px]"></i>
                                 </div>
                                 <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400 hidden sm:block">Lekce</span>
                              </div>

                              {showLeftArrow && (
                                <button 
                                  onClick={() => scrollRef.current?.scrollBy({ left: -300, behavior: 'smooth' })}
                                  className="absolute left-32 z-20 w-8 h-8 rounded-full bg-zinc-900/90 border border-white/10 text-white flex items-center justify-center hover:bg-indigo-600 transition-all shadow-lg"
                                >
                                  <i className="fa-solid fa-chevron-left text-[10px]"></i>
                                </button>
                              )}

                              <div 
                                ref={scrollRef}
                                onScroll={checkScroll}
                                className="flex items-center gap-2 overflow-x-auto no-scrollbar scroll-smooth px-4 relative z-10 flex-grow"
                              >
                                 {plan.topics[currentTopicIndex].mustKnow.map((point, idx) => {
                                    const itemId = `${activeSubject.id}_${grade}_${plan.topics[currentTopicIndex].id}_${idx}`;
                                    const isDone = archive.some(a => a.topicId === itemId);
                                    return (
                                       <button
                                          key={idx}
                                          onClick={() => setCurrentLessonIndex(idx)}
                                          className={`flex items-center gap-3 px-5 py-3 rounded-2xl transition-all shrink-0 group/item ${
                                             currentLessonIndex === idx 
                                             ? 'bg-white/10 ring-1 ring-white/20 shadow-lg' 
                                             : 'hover:bg-white/5 border border-transparent'
                                          }`}
                                       >
                                          <div className={`w-9 h-9 rounded-xl ${currentLessonIndex === idx ? 'bg-indigo-600' : isDone ? 'bg-emerald-600/50' : 'bg-zinc-900'} flex items-center justify-center text-white shadow-lg transition-all duration-300`}>
                                             <span className="text-[10px] font-black">{idx + 1}</span>
                                          </div>
                                          <div className="text-left">
                                             <span className={`block text-[11px] font-black uppercase tracking-widest leading-none truncate max-w-[120px] ${currentLessonIndex === idx ? 'text-white' : isDone ? 'text-emerald-500' : 'text-zinc-500 group-hover:text-zinc-300'}`}>
                                                {point}
                                             </span>
                                          </div>
                                       </button>
                                    );
                                 })}
                              </div>

                              {showRightArrow && (
                                <button 
                                  onClick={() => scrollRef.current?.scrollBy({ left: 300, behavior: 'smooth' })}
                                  className="absolute right-6 z-20 w-8 h-8 rounded-full bg-zinc-900/90 border border-white/10 text-white flex items-center justify-center hover:bg-indigo-600 transition-all shadow-lg"
                                >
                                  <i className="fa-solid fa-chevron-right text-[10px]"></i>
                                </button>
                              )}
                           </div>
                        </div>
                     </div>
                   )}
                </div>
              )}
            </React.Fragment>
          )}
        </React.Fragment>
      )}

      {view === 'testing' && test && (
        <div className="max-w-4xl mx-auto space-y-12 animate-fade py-12">
          <div className="bg-zinc-950 p-12 rounded-[4rem] border border-white/10 shadow-[0_50px_100px_rgba(0,0,0,0.8)] relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-white/5">
               <div className="h-full bg-indigo-500 transition-all duration-700 shadow-[0_0_20px_rgba(99,102,241,0.5)]" style={{ width: `${((currentQ + 1) / test.questions.length) * 100}%` }}></div>
            </div>
            
            <div className="flex justify-between items-center mb-12">
              <div className="flex items-center gap-4">
                 <span className="text-[10px] font-black uppercase tracking-[0.5em] text-indigo-500">Diagnostika</span>
                 <span className="px-3 py-1 rounded-lg bg-zinc-900 text-[9px] font-black uppercase tracking-widest text-zinc-500">Otázka {currentQ + 1} / {test.questions.length}</span>
              </div>
            </div>

            <p className="text-3xl font-black text-white mb-12 leading-tight tracking-tight uppercase">{test.questions[currentQ].question}</p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {test.questions[currentQ].options.map((opt, i) => {
                const isSelected = answers[currentQ] === i;
                const isCorrect = i === test.questions[currentQ].correctIndex;
                const showResults = answers[currentQ] !== undefined;
                return (
                  <button key={i} onClick={() => handleAnswer(currentQ, i)} className={`p-7 rounded-[2rem] text-left text-sm font-black border transition-all relative overflow-hidden group ${!showResults ? 'bg-zinc-900 border-white/5 hover:border-indigo-500/50 hover:bg-white/5' : isCorrect ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : isSelected ? 'bg-red-500/20 border-red-500 text-red-400' : 'bg-zinc-900 border-white/5 opacity-40'}`}>
                    <div className="flex items-center justify-between relative z-10">
                       <span className="uppercase tracking-wide">{opt}</span>
                       {showResults && (isCorrect ? <i className="fa-solid fa-check text-emerald-500"></i> : isSelected && <i className="fa-solid fa-xmark text-red-500"></i>)}
                    </div>
                  </button>
                );
              })}
            </div>

            {showExplanation && (
              <div className="mt-12 p-8 rounded-[2.5rem] bg-indigo-600/5 border border-indigo-500/10 animate-fade">
                <p className="text-zinc-300 font-bold text-sm leading-relaxed">{test.questions[currentQ].explanation}</p>
              </div>
            )}

            {answers[currentQ] !== undefined && (
              <button onClick={() => { if (currentQ < test.questions.length - 1) { setCurrentQ(c => c + 1); setShowExplanation(false); } else { finishTest(); } }} className="w-full mt-12 py-6 bg-indigo-600 rounded-[2rem] text-[11px] font-black uppercase tracking-[0.3em] text-white hover:bg-indigo-500 transition-all shadow-2xl shadow-indigo-500/20 active:scale-95">
                {currentQ < test.questions.length - 1 ? 'Pokračovat' : 'Vyhodnotit'}
              </button>
            )}
          </div>
        </div>
      )}

      {view === 'results' && plan && (
        <div className="space-y-20 animate-fade pb-24">
          <div className="text-center space-y-8">
            <h2 className="text-4xl font-black uppercase text-white tracking-tighter italic-serif-header">Mapa znalostí</h2>
            <p className="text-zinc-500 font-bold text-lg uppercase tracking-widest max-w-2xl mx-auto leading-relaxed pt-8 border-t border-white/5">Na základě tvých odpovědí jsme identifikovali oblasti, které vyžadují tvou pozornost.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-0 border border-white/5 rounded-[3rem] overflow-hidden shadow-2xl">
            {plan.topics.map((t, idx) => {
              const stats = resultsByTopic[t.title] || { total: 0, correct: 0 };
              const percent = stats.total > 0 ? (stats.correct / stats.total) * 100 : 0;
              const isBad = stats.total > 0 && percent < 70;
              return (
                <div key={t.id} className={`p-16 flex flex-col justify-between border-white/5 transition-all ${idx % 2 === 0 ? 'md:border-r' : ''} ${idx < plan.topics.length - 2 ? 'border-b' : ''} ${isBad ? 'bg-red-500/5' : 'bg-zinc-950'}`}>
                   <div>
                      <div className="flex justify-between items-start mb-12">
                        <h4 className={`text-4xl font-black uppercase tracking-tight leading-none ${isBad ? 'text-red-400' : 'text-white'}`}>{t.title}</h4>
                        <div className={`px-6 py-3 rounded-2xl font-mono text-[11px] font-black uppercase tracking-widest ${isBad ? 'bg-red-500/10 text-red-500 border border-red-500/20' : 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'}`}>
                           {Math.round(percent)}%
                        </div>
                      </div>
                      <p className="text-zinc-500 font-bold text-base mb-12 leading-relaxed italic-serif-header">{t.summary.what}</p>
                   </div>
                   {isBad && (
                     <button onClick={() => onGenerateLesson(`Mám velké mezery v tématu: ${t.title}.`)} className="w-full py-6 rounded-[2rem] bg-red-600 text-white text-[11px] font-black uppercase tracking-[0.25em] shadow-2xl shadow-red-500/20 hover:scale-[1.02] transition-all">Doučit se</button>
                   )}
                </div>
              );
            })}
          </div>
          <div className="flex justify-center pt-20 border-t border-white/5">
            <button onClick={() => setView('plan')} className="px-16 py-6 rounded-[2.5rem] bg-zinc-950 border border-white/10 text-zinc-500 text-[11px] font-black uppercase tracking-[0.3em] hover:text-white transition-all shadow-2xl flex items-center gap-6 group">
               <i className="fa-solid fa-arrow-left group-hover:-translate-x-2 transition-transform"></i> Zpět na přehled
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CurriculumGuide;
