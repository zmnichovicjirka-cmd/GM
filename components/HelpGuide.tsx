
import React, { useState, useEffect, useRef } from 'react';
import { PageId } from './Sidebar';
import { motion, AnimatePresence } from 'motion/react';
import Gymi, { GymiPose } from './Gymi';
import { UserProfile, Assistant } from '../types';
import { collection, query, limit, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { handleFirestoreError, OperationType } from '../services/dbService';

interface HelpStep {
  title: string;
  description: string;
  icon: string;
  targetSelector?: string;
  pose: GymiPose;
}

const HELP_STEPS: Record<PageId, HelpStep[]> = {
  home: [
    {
      title: 'Vítej v Dashboardu',
      description: 'Ahoj! Jsem Gymi, tvůj nový studijní parťák. Tady na Dashboardu uvidíš vše důležité na první pohled. Pojďme se podívat blíž!',
      icon: 'fa-house',
      pose: 'HAPPY'
    },
    {
      title: 'Tvůj Kalendář',
      description: 'Tady vlevo vidíš svůj rozvrh. Klikni na libovolný den a naplánuj si, co se budeme učit příště. Zkus to hned teď!',
      icon: 'fa-calendar-days',
      targetSelector: '#dashboard-calendar',
      pose: 'EXPLAIN'
    },
    {
      title: 'Sleduj svůj progres',
      description: 'Tenhle index ti ukazuje, jak moc jsi tento týden zamakal. Čím víc lekcí dokončíš, tím víc se lišta naplní. Motivující, že?',
      icon: 'fa-chart-line',
      targetSelector: '#dashboard-progress',
      pose: 'LAUGHING'
    }
  ],
  learn: [
    {
      title: 'Centrum tvého studia',
      description: 'Tady se děje ta pravá magie. Můžeš sem vložit cokoliv – od textu z učebnice až po odkaz na YouTube video.',
      icon: 'fa-graduation-cap',
      pose: 'CASUAL'
    },
    {
      title: 'Zkusíme si příklad?',
      description: 'Zkus do pole napsat třeba "Fotosyntéza" nebo "Průmyslová revoluce". Můžeš taky vložit odkaz na video, kterému nerozumíš.',
      icon: 'fa-file-import',
      targetSelector: '#study-input-area',
      pose: 'EXPLAIN'
    },
    {
      title: 'Neural Engine',
      description: 'Až tam něco napíšeš, klikni na tohle tlačítko. Můj Neural Engine to všechno přechroustá a vytvoří ti lekci na míru.',
      icon: 'fa-bolt-lightning',
      targetSelector: '#study-generate-btn',
      pose: 'SHOCKED'
    },
    {
      title: 'Ptej se mě na cokoliv',
      description: 'Když ti v lekci nebude něco jasné, klikni na mě tady v rohu. Budu tam na tebe čekat a rád ti vše vysvětlím polopatě!',
      icon: 'fa-bolt-lightning',
      targetSelector: '#ai-agent-toggle',
      pose: 'HAPPY'
    }
  ],
  curriculum: [
    {
      title: 'Průvodce učivem',
      description: 'Nevíš, kde začít? Průvodce ti ukáže doporučenou cestu. Je to jako mapa tvého vzdělání.',
      icon: 'fa-map',
      pose: 'THINKING'
    },
    {
      title: 'Vyber si úroveň',
      description: 'Studuješ na základce nebo na střední? Vyber si svou úroveň a já ti připravím osnovy přesně podle tvého ročníku.',
      icon: 'fa-layer-group',
      targetSelector: '.curriculum-levels',
      pose: 'EXPLAIN'
    }
  ],
  archive: [
    {
      title: 'Tvůj Archiv',
      description: 'Tady najdeš všechno, co jsme spolu už probrali. Můžeš se k tomu kdykoliv vrátit a zopakovat si to.',
      icon: 'fa-box-archive',
      pose: 'HAPPY'
    }
  ],
  chat: [
    {
      title: 'Pokec s Gymin Mate',
      description: 'Tady si můžeme psát o čemkoliv. Můžeš se mě ptát na látku, nechat si něco vysvětlit znovu, nebo si jen tak pokecat.',
      icon: 'fa-comments',
      pose: 'CASUAL'
    }
  ],
  profile: [
    {
      title: 'Tvé Nastavení',
      description: 'Tady si můžeš upravit svůj profil a hlavně svého asistenta Gymiho. Změň jeho jméno, bio nebo exprese.',
      icon: 'fa-user-gear',
      pose: 'HAPPY'
    },
    {
      title: 'Gymiho Exprese',
      description: 'Můžeš hromadně nahrát nové fotky pro Gymiho pozice. Stačí kliknout na "Hromadné Nahrání" a vybrat soubory.',
      icon: 'fa-layer-group',
      pose: 'EXPLAIN'
    }
  ]
};

interface HelpGuideProps {
  activePage: PageId;
  userProfile: UserProfile;
  onLoginClick?: () => void;
  onUpdateProfile?: (updates: Partial<UserProfile>) => void;
}

type OnboardingStage = 'intro' | 'authChoice' | 'gradeChoice' | 'saveOffer' | 'features';

const HelpGuide: React.FC<HelpGuideProps> = ({ activePage, userProfile, onLoginClick, onUpdateProfile }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [onboardingStage, setOnboardingStage] = useState<OnboardingStage>(userProfile.isLoggedIn ? 'features' : 'intro');
  const [spotlightRect, setSpotlightRect] = useState<DOMRect | null>(null);
  const [panelPosition, setPanelPosition] = useState<'top' | 'bottom'>('bottom');
  const [selectedLevel, setSelectedLevel] = useState<'elementary' | 'high' | null>(null);
  const [firstAvatar, setFirstAvatar] = useState<Assistant | null>(null);
  const steps = HELP_STEPS[activePage] || [];

  // Fetch first available avatar for guest view
  useEffect(() => {
    const fetchAvatar = async () => {
      const avatarsPath = 'avatars';
      // Always try to fetch if we don't have a profile avatar
      if (!userProfile?.avatarURL) {
        try {
          const avatarsRef = collection(db, avatarsPath);
          const q = query(avatarsRef, limit(1));
          const snap = await getDocs(q);
          
          if (!snap.empty) {
            const data = snap.docs[0].data() as Assistant;
            setFirstAvatar(data);
          }
        } catch (e) {
          handleFirestoreError(e, OperationType.GET, avatarsPath);
          console.error("Critical: Failed to fetch default avatar from Neural Storage", e);
        }
      }
    };
    fetchAvatar();
  }, [userProfile?.avatarURL]);

  // Auto-open for guest users who haven't finished onboarding
  useEffect(() => {
    const isCompleted = localStorage.getItem('gymni_mate_onboarding_completed');
    if (!userProfile.isLoggedIn && !isCompleted) {
      setTimeout(() => setIsOpen(true), 1500); // Small delay for effect
    }
  }, [userProfile.isLoggedIn]);

  useEffect(() => {
    if (userProfile.isLoggedIn) {
      setOnboardingStage('features');
    } else {
      setOnboardingStage('intro');
    }
  }, [userProfile.isLoggedIn]);

  useEffect(() => {
    setCurrentStep(0);
  }, [activePage, onboardingStage]);

  useEffect(() => {
    if (isOpen && onboardingStage === 'features' && steps[currentStep]?.targetSelector) {
      const el = document.querySelector(steps[currentStep].targetSelector!);
      if (el) {
        const rect = el.getBoundingClientRect();
        setSpotlightRect(rect);
        // If target is in the bottom half, move panel to top
        if (rect.top > window.innerHeight / 2) {
          setPanelPosition('top');
        } else {
          setPanelPosition('bottom');
        }
      } else {
        setSpotlightRect(null);
        setPanelPosition('bottom');
      }
    } else {
      setSpotlightRect(null);
      setPanelPosition('bottom');
    }
  }, [isOpen, currentStep, activePage, onboardingStage]);

  const handleNext = () => {
    if (onboardingStage === 'intro') {
      setOnboardingStage('authChoice');
    } else if (onboardingStage === 'features') {
      if (currentStep < steps.length - 1) {
        setCurrentStep(currentStep + 1);
      } else {
        setIsOpen(false);
      }
    }
  };

  const handlePrev = () => {
    if (onboardingStage === 'features' && currentStep > 0) {
      setCurrentStep(currentStep - 1);
    } else if (onboardingStage === 'gradeChoice') {
      setOnboardingStage('authChoice');
    } else if (onboardingStage === 'authChoice') {
      setOnboardingStage('intro');
    }
  };

  const handleGradeSelect = (grade: number) => {
    if (onUpdateProfile) {
      onUpdateProfile({ grade });
    }
    // Save to localStorage so guest progress is remembered
    if (!userProfile.isLoggedIn) {
      localStorage.setItem('gymni_mate_onboarding_grade', grade.toString());
      if (selectedLevel) localStorage.setItem('gymni_mate_onboarding_level', selectedLevel);
      localStorage.setItem('gymni_mate_onboarding_completed', 'true');
      setOnboardingStage('saveOffer');
    } else {
      setOnboardingStage('features');
    }
  };

  const getPose = () => {
    if (!isOpen) return 'WAITING';
    if (onboardingStage === 'intro') return 'FRIENDLY';
    if (onboardingStage === 'authChoice') return 'EXPLAIN';
    if (onboardingStage === 'gradeChoice') return 'THINKING';
    if (onboardingStage === 'saveOffer') return 'HAPPY';
    return steps[currentStep]?.pose || 'WAITING';
  };

  return (
    <>
      <div className="fixed top-6 right-6 z-[2000] no-print">
        <button 
          onClick={() => setIsOpen(!isOpen)}
          className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all shadow-2xl backdrop-blur-md border ${
            isOpen ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-white/5 border-white/10 text-zinc-400 hover:text-white hover:bg-white/10'
          }`}
          title="Průvodce funkcemi"
        >
          <i className={`fa-solid ${isOpen ? 'fa-xmark' : 'fa-circle-info'} text-lg`}></i>
        </button>
      </div>

      <AnimatePresence>
        {isOpen && (
          <>
            {/* Spotlight Overlay */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[2400] pointer-events-none"
              style={{
                background: spotlightRect 
                  ? `radial-gradient(circle at ${spotlightRect.left + spotlightRect.width/2}px ${spotlightRect.top + spotlightRect.height/2}px, transparent ${Math.max(spotlightRect.width, spotlightRect.height)/2 + 20}px, rgba(0,0,0,0.8) ${Math.max(spotlightRect.width, spotlightRect.height)/2 + 60}px)`
                  : 'rgba(0,0,0,0.5)'
              }}
            />

            {/* Guide Panel */}
            <motion.div 
              initial={{ y: panelPosition === 'bottom' ? '100%' : '-100%' }}
              animate={{ y: 0 }}
              exit={{ y: panelPosition === 'bottom' ? '100%' : '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className={`fixed left-0 right-0 z-[2500] p-6 no-print ${panelPosition === 'bottom' ? 'bottom-0' : 'top-0'}`}
            >
              <div className="max-w-4xl mx-auto bg-zinc-950/90 border border-white/15 rounded-[3rem] shadow-[0_0_100px_rgba(0,0,0,0.8)] backdrop-blur-3xl">
                <div className="flex flex-col md:flex-row items-stretch">
                  {/* Left side - Gymi & Progress */}
                  <div className="md:w-2/5 bg-transparent p-8 flex flex-col justify-between items-center text-center gap-6 relative">
                    <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent pointer-events-none" />
                    
                    <div className="relative z-10 -ml-12 -mt-20">
                      <Gymi 
                        pose={getPose()} 
                        size={450} 
                        avatarURL={userProfile.avatarURL || firstAvatar?.avatarURL}
                        avatarPoses={userProfile.avatarPoses || firstAvatar?.avatarPoses}
                      />
                    </div>

                    <div className="space-y-2 relative z-10 min-h-[40px]">
                      {onboardingStage === 'features' ? (
                        <>
                          <p className="text-[10px] font-black uppercase tracking-[0.4em] text-indigo-200">Krok {currentStep + 1} z {steps.length}</p>
                          <div className="flex gap-2 justify-center">
                            {steps.map((_, i) => (
                              <div 
                                key={i} 
                                className={`h-1.5 rounded-full transition-all duration-500 ${i === currentStep ? 'w-8 bg-white' : 'w-2 bg-white/30'}`}
                              />
                            ))}
                          </div>
                        </>
                      ) : (
                        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-indigo-200/40 italic">Představení Gymiho</p>
                      )}
                    </div>
                  </div>

                  {/* Right side - Content & Controls */}
                  <div className="flex-grow p-8 md:p-10 flex flex-col justify-center min-h-[400px]">
                    <AnimatePresence mode="wait">
                      {onboardingStage === 'intro' && (
                        <motion.div 
                          key="intro"
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -20 }}
                          className="space-y-8"
                        >
                          <div className="space-y-2">
                            <p className="text-[10px] font-black uppercase tracking-[0.5em] text-indigo-500">Identity Synthesis</p>
                            <h3 className="text-4xl md:text-5xl font-black text-white uppercase tracking-tighter italic">Ahoj, já jsem Gymi!</h3>
                          </div>
                          <p className="text-zinc-400 text-lg font-medium leading-relaxed max-w-xl">
                            Tvůj osobní AI parťák ze světa GYMNI MATE. Pomůžu ti s učením, vysvětlím složité věci a udělám z tvého studia jízdu.
                          </p>
                          <div className="pt-4 flex justify-end">
                            <button 
                              onClick={handleNext}
                              className="px-10 py-5 bg-white text-black rounded-2xl font-black uppercase text-xs tracking-widest shadow-2xl hover:scale-105 active:scale-95 transition-all"
                            >
                              Rád tě poznávám!
                            </button>
                          </div>
                        </motion.div>
                      )}

                      {onboardingStage === 'authChoice' && (
                        <motion.div 
                          key="auth"
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -20 }}
                          className="space-y-8"
                        >
                          <div className="space-y-2">
                             <p className="text-[10px] font-black uppercase tracking-[0.5em] text-indigo-500">Verifikace identity</p>
                             <h3 className="text-4xl font-black text-white uppercase tracking-tighter italic">Máš už u nás účet?</h3>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                             <button 
                               onClick={() => { if (onLoginClick) onLoginClick(); setIsOpen(false); }}
                               className="group p-8 rounded-[2.5rem] bg-white/5 border border-white/10 hover:bg-white/10 hover:border-indigo-500/50 transition-all text-left space-y-4 shadow-xl"
                             >
                                <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 flex items-center justify-center text-indigo-500 group-hover:scale-110 transition-all">
                                   <i className="fa-solid fa-key text-xl"></i>
                                </div>
                                <div>
                                   <p className="text-base font-black text-white uppercase tracking-tight">Ano, mám účet</p>
                                   <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mt-1">Skočit na přihlášení</p>
                                </div>
                             </button>
                             <button 
                               onClick={() => setOnboardingStage('gradeChoice')}
                               className="group p-8 rounded-[2.5rem] bg-white/5 border border-white/10 hover:bg-white/10 hover:border-emerald-500/50 transition-all text-left space-y-4 shadow-xl"
                             >
                                <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 flex items-center justify-center text-emerald-500 group-hover:scale-110 transition-all">
                                   <i className="fa-solid fa-sparkles text-xl"></i>
                                </div>
                                <div>
                                   <p className="text-base font-black text-white uppercase tracking-tight">Jsem tu nový</p>
                                   <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mt-1">Chci se podívat kolem</p>
                                </div>
                             </button>
                          </div>
                          <button onClick={handlePrev} className="text-[10px] font-black uppercase tracking-widest text-zinc-600 hover:text-white transition-all">Zpět na začátek</button>
                        </motion.div>
                      )}

                      {onboardingStage === 'gradeChoice' && (
                        <motion.div 
                          key="grade"
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -20 }}
                          className="space-y-8"
                        >
                          <div className="space-y-2">
                             <p className="text-[10px] font-black uppercase tracking-[0.5em] text-indigo-500">Akademický profil</p>
                             <h3 className="text-4xl font-black text-white uppercase tracking-tighter italic">V jakém jsi ročníku?</h3>
                             <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest">Díky tomu ti Gymi připraví učivo na míru.</p>
                          </div>
                          
                          <div className="space-y-6">
                            <div className="flex gap-2 p-1.5 bg-white/5 rounded-2xl w-fit">
                              <button 
                                onClick={() => setSelectedLevel('elementary')}
                                className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${selectedLevel === 'elementary' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30' : 'text-zinc-500 hover:text-white hover:bg-white/5'}`}
                              >
                                Základka
                              </button>
                              <button 
                                onClick={() => setSelectedLevel('high')}
                                className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${selectedLevel === 'high' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30' : 'text-zinc-500 hover:text-white hover:bg-white/5'}`}
                              >
                                Střední
                              </button>
                            </div>

                            <div className={`grid gap-4 ${selectedLevel === 'elementary' ? 'grid-cols-3 md:grid-cols-5' : 'grid-cols-2 md:grid-cols-4'}`}>
                               {(selectedLevel === 'elementary' ? [1, 2, 3, 4, 5, 6, 7, 8, 9] : [1, 2, 3, 4]).map(grade => (
                                 <button 
                                   key={grade}
                                   onClick={() => handleGradeSelect(grade)}
                                   className="group relative p-8 rounded-[2.5rem] bg-white/5 border border-white/10 hover:bg-indigo-600/20 hover:border-indigo-500 transition-all flex flex-col items-center gap-1 shadow-xl hover:scale-105 active:scale-95"
                                 >
                                    <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-[2.5rem]" />
                                    <span className="text-4xl font-black text-white group-hover:text-white transition-all drop-shadow-lg">{grade}.</span>
                                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-600 group-hover:text-indigo-200">Ročník</span>
                                 </button>
                               ))}
                               {!selectedLevel && (
                                 <div className="col-span-full py-16 text-center border-2 border-dashed border-white/5 rounded-[3rem] bg-white/[0.02]">
                                   <div className="w-16 h-16 rounded-full bg-white/5 mx-auto mb-4 flex items-center justify-center text-zinc-600">
                                      <i className="fa-solid fa-graduation-cap text-2xl"></i>
                                   </div>
                                   <p className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-700 italic">Nejdřív zvol školní úroveň</p>
                                 </div>
                               )}
                            </div>
                          </div>

                          <div className="flex items-center justify-between">
                             <button onClick={handlePrev} className="text-[10px] font-black uppercase tracking-widest text-zinc-600 hover:text-white transition-all">Zpět k účtu</button>
                          </div>
                        </motion.div>
                      )}

                      {onboardingStage === 'saveOffer' && (
                        <motion.div 
                          key="save-offer"
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -20 }}
                          className="space-y-8"
                        >
                          <div className="space-y-4">
                             <p className="text-[10px] font-black uppercase tracking-[0.5em] text-indigo-500">Perfect Setup</p>
                             <h3 className="text-4xl md:text-5xl font-black text-white uppercase tracking-tighter italic leading-tight">Už o tobě vím všechno!</h3>
                             <p className="text-zinc-400 text-lg font-medium leading-relaxed max-w-xl">
                               Abychom tvůj progres a nastavení ročníku uložili navždy, doporučuji si vytvořit svůj profil. Bude to bleskovka!
                             </p>
                          </div>
                          
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                             <button 
                               onClick={() => { if (onLoginClick) onLoginClick(); setIsOpen(false); }}
                               className="group p-8 rounded-[2.5rem] bg-indigo-600 hover:bg-indigo-500 transition-all text-left space-y-4 shadow-[0_20px_40px_rgba(79,70,229,0.3)]"
                             >
                                <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center text-white text-xl">
                                   <i className="fa-solid fa-user-plus"></i>
                                </div>
                                <div>
                                   <p className="text-base font-black text-white uppercase tracking-tight">Vytvořit si profil</p>
                                   <p className="text-[10px] font-bold text-indigo-200 uppercase tracking-widest mt-1">Uložit ročník a data</p>
                                </div>
                             </button>
                             <button 
                               onClick={() => setOnboardingStage('features')}
                               className="group p-8 rounded-[2.5rem] bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-left space-y-4 shadow-xl"
                             >
                                <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center text-zinc-400 text-xl">
                                   <i className="fa-solid fa-arrow-right"></i>
                                </div>
                                <div>
                                   <p className="text-base font-black text-white uppercase tracking-tight">Zatím jako host</p>
                                   <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mt-1">Skočit rovnou do appky</p>
                                </div>
                             </button>
                          </div>
                        </motion.div>
                      )}

                      {onboardingStage === 'features' && (
                        <motion.div 
                          key="features"
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -20 }}
                          className="flex flex-col h-full justify-between gap-8 h-full"
                        >
                          <div className="space-y-6">
                            <div className="space-y-1">
                              <p className="text-[10px] font-black uppercase tracking-[0.5em] text-indigo-500">Průvodce funkcemi</p>
                              <h3 className="text-3xl md:text-4xl font-black text-white uppercase tracking-tighter italic leading-none">{steps[currentStep].title}</h3>
                            </div>
                            <p className="text-zinc-400 text-lg font-medium leading-relaxed max-w-xl">
                              {steps[currentStep].description}
                            </p>
                          </div>

                          <div className="flex items-center justify-between pt-8 border-t border-white/5">
                            <button 
                              onClick={handlePrev}
                              disabled={currentStep === 0}
                              className={`px-8 py-4 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all ${
                                currentStep === 0 ? 'opacity-0 pointer-events-none' : 'text-zinc-500 hover:text-white hover:bg-white/5'
                              }`}
                            >
                              Zpět
                            </button>
                            
                            <button 
                              onClick={handleNext}
                              className="px-10 py-4 bg-indigo-600 rounded-2xl font-black uppercase text-[10px] tracking-widest text-white shadow-[0_10px_30px_rgba(79,70,229,0.4)] hover:shadow-[0_15px_40px_rgba(79,70,229,0.6)] hover:scale-105 active:scale-95 transition-all"
                            >
                              {currentStep === steps.length - 1 ? 'Jasně, to zvládnu!' : 'Další krok'}
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};

export default HelpGuide;
