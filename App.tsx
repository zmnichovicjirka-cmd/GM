
import React, { useState, useEffect, Component, ErrorInfo, ReactNode } from 'react';
import { getAuth, onAuthStateChanged, signOut } from 'firebase/auth';
import { 
  Subject, 
  UserProfile, 
  DbConfig, 
  StudyResult, 
  StudyFile, 
  YouTubeVideo, 
  WebPage, 
  ProcessingState,
  EnhancedArchiveItem,
  ScheduleItem
} from './types';

import { 
  generateInitialSummary, 
  generateExtendedStudy, 
  generateTopicImage,
  findEducationalVisuals,
  verifyTopic,
  classifyAndExplainTopic,
  generateTopicIntro,
  analyzeArchiveUpload
} from './services/geminiService.ts';

import { 
  storeInArchive, 
  fetchArchive, 
  updateArchiveItem, 
  fetchPublishedCurricula,
  ORACLE_SERVER_URL, 
  ORACLE_API_SECRET,
  handleFirestoreError,
  OperationType
} from './services/dbService.ts';
import { systemLog } from './services/logService';

import Sidebar, { PageId } from './components/Sidebar.tsx';
import StudyInput from './components/StudyInput.tsx';
import VerificationPanel from './components/VerificationPanel.tsx';
import StudyOutput from './components/StudyOutput.tsx';
import SubjectBar, { SUBJECTS } from './components/SubjectBar.tsx';
import CurriculumGuide from './components/CurriculumGuide.tsx';
import ArchiveList from './components/ArchiveList.tsx';
import ArchiveUpload from './components/ArchiveUpload.tsx';
import UserChat from './components/UserChat.tsx';
import ProfileSettings from './components/ProfileSettings.tsx';
import GymniLiveAgent from './components/GymniLiveAgent.tsx';
import AddSubjectModal from './components/AddSubjectModal.tsx';
import LoginModal from './components/LoginModal.tsx';
import SettingsModal from './components/SettingsModal.tsx';
import Gymi from './components/Gymi.tsx';
import InteractiveLearning from './components/InteractiveLearning.tsx';
import Calendar from './components/Calendar.tsx';
import Schedule from './components/Schedule.tsx';
import SystemLog from './components/SystemLog.tsx';
import HelpGuide from './components/HelpGuide.tsx';
import ErrorBoundary from './components/ErrorBoundary.tsx';
import { db } from './firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { DEFAULT_SUBJECTS } from './src/constants';
import { SavedCurriculum } from './types';
import { motion, AnimatePresence } from 'motion/react';

import DashboardOverview from './components/DashboardOverview.tsx';
import ExploreGrid from './components/ExploreGrid.tsx';

const App: React.FC = () => {
  const [isArchiveUploadOpen, setIsArchiveUploadOpen] = useState(false);
  const [isArchivingInProgress, setIsArchivingInProgress] = useState(false);
  const [archiveRefreshKey, setArchiveRefreshKey] = useState(0);

  // --- UI STATE ---
  const [userSubjects, setUserSubjects] = useState<Subject[]>(() => {
    const saved = localStorage.getItem('gymni_mate_user_subjects');
    return saved ? JSON.parse(saved) : []; // Empty by default as requested
  });
  const [activeSubject, setActiveSubject] = useState<Subject>(() => {
    const saved = localStorage.getItem('gymni_mate_user_subjects');
    const parsed = saved ? JSON.parse(saved) : [];
    return parsed.length > 0 ? parsed[0] : { id: 'math', name: 'Matematika', icon: 'fa-calculator', color: 'bg-blue-500', description: 'Logické uvažování a řešení problémů.' };
  });

  useEffect(() => {
    localStorage.setItem('gymni_mate_user_subjects', JSON.stringify(userSubjects));
  }, [userSubjects]);
  const [calendarEvents, setCalendarEvents] = useState<Record<string, string>>(() => {
    const saved = localStorage.getItem('gymni_mate_calendar_events_v2');
    return saved ? JSON.parse(saved) : {};
  });
  const [userSchedule, setUserSchedule] = useState<ScheduleItem[]>(() => {
    const saved = localStorage.getItem('gymni_mate_user_schedule');
    return saved ? JSON.parse(saved) : [];
  });
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isProfileSettingsOpen, setIsProfileSettingsOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isInteractiveLearningOpen, setIsInteractiveLearningOpen] = useState(false);
  const [activePage, setActivePage] = useState<PageId>('home');
  const [isAddSubjectModalOpen, setIsAddSubjectModalOpen] = useState(false);
  const [isSubjectBarOpen, setIsSubjectBarOpen] = useState(false);
  const [dashboardSubTab, setDashboardSubTab] = useState<'overview' | 'explore'>('overview');
  const [exploreFilterSubject, setExploreFilterSubject] = useState<string>('all');
  const [exploreFilterGrade, setExploreFilterGrade] = useState<string>('all');
  const [firstAvatar, setFirstAvatar] = useState<any>(null);
  const [currentAnnotation, setCurrentAnnotation] = useState<any>(null);
  const [isAgentOpen, setIsAgentOpen] = useState(false);
  const [preloadedCurriculum, setPreloadedCurriculum] = useState<SavedCurriculum | null>(null);

  // --- EXPLORE STATE ---
  const [publishedCurricula, setPublishedCurricula] = useState<SavedCurriculum[]>([]);

  // --- APP STATE ---
  const [userProfile, setUserProfile] = useState<UserProfile>({
    uid: '',
    email: '',
    isLoggedIn: false,
    role: 'student'
  });
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    const auth = getAuth();
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      try {
        if (user) {
          // Fetch full profile from Firestore
          const userRef = doc(db, 'users', user.uid);
          let userSnap;
          try {
            userSnap = await getDoc(userRef);
          } catch (e) {
            handleFirestoreError(e, OperationType.GET, `users/${user.uid}`);
            return;
          }
          
          if (userSnap.exists()) {
            const data = userSnap.data();
            setUserProfile({
              uid: user.uid,
              email: user.email || '',
              isLoggedIn: true,
              role: data.role || 'student',
              grade: data.grade,
              displayName: data.displayName || (user.email ? user.email.split('@')[0] : 'Student'),
              photoURL: data.photoURL || user.photoURL,
              bio: data.bio,
              status: 'online',
              selectedAvatarId: data.selectedAvatarId,
              avatarURL: data.avatarURL,
              avatarPoses: data.avatarPoses
            });
          } else {
            // Create initial profile if it doesn't exist
            // Try to migrate from localStorage if available
            const savedGrade = localStorage.getItem('gymni_mate_onboarding_grade');
            const initialProfile: any = {
              uid: user.uid,
              email: user.email || '',
              role: 'student',
              status: 'online',
              createdAt: serverTimestamp()
            };
            if (savedGrade) initialProfile.grade = parseInt(savedGrade);

            try {
              await setDoc(userRef, initialProfile);
            } catch (e) {
              console.error("Failed to create user profile in Firestore", e);
              handleFirestoreError(e, OperationType.WRITE, `users/${user.uid}`);
            }
            setUserProfile({
              ...initialProfile,
              displayName: user.displayName || (user.email ? user.email.split('@')[0] : 'Student'),
              photoURL: user.photoURL,
              isLoggedIn: true,
              role: 'student'
            } as UserProfile);
          }
        } else {
          // Guest User - Check for onboarding data in localStorage
          const savedGrade = localStorage.getItem('gymni_mate_onboarding_grade');
          const savedLevel = localStorage.getItem('gymni_mate_onboarding_level');
          
          setUserProfile({
            uid: '',
            email: '',
            isLoggedIn: false,
            role: 'student',
            grade: savedGrade ? parseInt(savedGrade) : undefined,
            // We could add level to UserProfile type if needed, but for now grade handles the logic
          });
        }
      } catch (error) {
        console.error("Auth state change error:", error);
        if (user) {
          setUserProfile({
            uid: user.uid,
            email: user.email || '',
            isLoggedIn: true,
            role: 'student'
          });
        }
      } finally {
        setIsAuthReady(true);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    // Fetch default assistant avatar
    const fetchDefaultAvatar = async () => {
      try {
        const { collection, query, limit, getDocs } = await import('firebase/firestore');
        const q = query(collection(db, 'avatars'), limit(1));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          setFirstAvatar(snapshot.docs[0].data());
        }
      } catch (e) {
        console.error("Failed to fetch default avatar", e);
        handleFirestoreError(e, OperationType.GET, 'avatars');
      }
    };
    fetchDefaultAvatar();
  }, []);

  const handleLogout = async () => {
    const auth = getAuth();
    try {
      await signOut(auth);
      systemLog("Uživatel odhlášen.");
    } catch (error: any) {
      systemLog(`Chyba při odhlášení: ${error.message}`);
    }
  };

  const handleAddSubject = (newSub: Subject) => {
    // Check if already exists by name
    if (userSubjects.some(s => s.name.toLowerCase() === newSub.name.toLowerCase())) {
        systemLog(`Předmět ${newSub.name} již máš ve svém vesmíru.`);
        setIsAddSubjectModalOpen(false);
        return;
    }
    
    setUserSubjects([...userSubjects, newSub]);
    setActiveSubject(newSub);
    setIsAddSubjectModalOpen(false);
    setActivePage('curriculum');
    systemLog(`Předmět ${newSub.name} byl přidán.`);
  };

  const handleRemoveSubject = (id: string) => {
    if (userSubjects.length <= 1) return;
    const newList = userSubjects.filter(s => s.id !== id);
    setUserSubjects(newList);
    if (activeSubject.id === id) {
      setActiveSubject(newList[0]);
    }
  };

  const [dbConfig, setDbConfig] = useState<DbConfig>({
    url: ORACLE_SERVER_URL,
    secret: ORACLE_API_SECRET
  });

  // --- INPUT STATE ---
  const [inputText, setInputText] = useState('');
  const [currentCurriculumId, setCurrentCurriculumId] = useState<string | undefined>(undefined);
  const [images, setImages] = useState<string[]>([]);
  const [files, setFiles] = useState<StudyFile[]>([]);
  const [ytVideos, setYtVideos] = useState<YouTubeVideo[]>([]);
  const [webPages, setWebPages] = useState<WebPage[]>([]);

  // --- PROCESSING STATE ---
  const [proc, setProc] = useState<ProcessingState>({
    isLoadingInitial: false,
    isLoadingExtra: false,
    error: null,
    result: null,
    selectedSources: [],
    selectedFiles: [],
    selectedImages: [],
    selectedYtVideos: [],
    selectedWebPages: [],
    tone: 'student'
  });

  const [currentTopicId, setCurrentTopicId] = useState<string | undefined>(undefined);
  const [archive, setArchive] = useState<EnhancedArchiveItem[]>([]);
  const [topicIntro, setTopicIntro] = useState<{ subjectName: string, what: string, why: string } | null>(null);
  const [isIntroPanelOpen, setIsIntroPanelOpen] = useState(false);
  const [introSlideIndex, setIntroSlideIndex] = useState(0);
  const [isAiLedGeneration, setIsAiLedGeneration] = useState(false);
  const [activeLearningTab, setActiveLearningTab] = useState<'summary' | 'visuals' | 'slides' | 'cheat' | 'flashcards' | 'mindmap' | 'image' | 'videos'>('summary');
  const [activeHighlightIndex, setActiveHighlightIndex] = useState<number | null>(null);

  const [isArchiveChoiceModalOpen, setIsArchiveChoiceModalOpen] = useState(false);
  const [archiveItemToOpen, setArchiveItemToOpen] = useState<EnhancedArchiveItem | null>(null);

  const handleArchiveOpenItem = (item: EnhancedArchiveItem) => {
    if (item.subject) {
      const matched = userSubjects.find(s => s.name.toLowerCase() === item.subject?.toLowerCase());
      if (matched) setActiveSubject(matched);
    }

    if (item.type === 'curriculum' && item.curriculum_json) {
      setPreloadedCurriculum(item.curriculum_json);
      setActivePage('curriculum');
    } else if (item.study_json) {
      if (item.study_json.topicIntro) {
        setArchiveItemToOpen(item);
        setIsArchiveChoiceModalOpen(true);
      } else {
        setProc(p => ({ ...p, result: item.study_json!, archiveId: item.id }));
        setActivePage('learn');
      }
    }
  };

  // --- LOAD ARCHIVE ---
  const loadArchive = async () => {
    try {
      const { archive: fetchedArchive } = await fetchArchive(dbConfig);
      setArchive(fetchedArchive);
    } catch (e) {
      console.error("Failed to load archive:", e);
    }
  };

  const loadPublishedCurricula = async () => {
    try {
      const fetched = await fetchPublishedCurricula();
      if (fetched.length > 0) {
        setPublishedCurricula(fetched);
      }
    } catch (e) {
      console.error("Failed to load published curricula:", e);
    }
  };

  useEffect(() => {
    loadPublishedCurricula();
  }, []);

  useEffect(() => {
    if (userProfile.isLoggedIn) {
      loadArchive();
    }
  }, [userProfile.isLoggedIn]);

  useEffect(() => {
    localStorage.setItem('gymni_mate_calendar_events_v2', JSON.stringify(calendarEvents));
  }, [calendarEvents]);

  useEffect(() => {
    localStorage.setItem('gymni_mate_user_schedule', JSON.stringify(userSchedule));
  }, [userSchedule]);

  const handleIntroSlideComplete = () => {
    if (!isIntroPanelOpen) return;
    
    // Manual advancement only
    if (introSlideIndex === 3) {
      setIsIntroPanelOpen(false);
      setActivePage('learn');
    } else {
      setIntroSlideIndex(prev => prev + 1);
    }
  };

  // AI Autopilot for Lesson Generation - Logic moved to handleIntroSlideComplete

  useEffect(() => {
    const handleOpenLesson = (e: any) => {
      const { lessonId } = e.detail;
      const item = archive.find(i => i.id === lessonId);
      if (item) {
        handleArchiveOpenItem(item);
        setIsAgentOpen(true);
      }
    };
    window.addEventListener('gymni_open_archive_lesson', handleOpenLesson);
    return () => window.removeEventListener('gymni_open_archive_lesson', handleOpenLesson);
  }, [archive]);

  // --- HANDLERS ---
  const handleVerify = async () => {
    systemLog("Ověřuji téma...");
    setProc(p => ({ 
      ...p, 
      isVerifying: true, 
      error: null, 
      verifiedInfo: null,
      selectedFiles: files.map(f => f.name),
      selectedImages: images.map((_, i) => i),
      selectedYtVideos: ytVideos.map(v => v.url),
      selectedWebPages: webPages.map(p => p.url)
    }));
    
    try {
      const info = await verifyTopic(inputText, images, files);
      setProc(p => ({ 
        ...p, 
        isVerifying: false, 
        verifiedInfo: info,
        selectedSources: info.sources.map(s => s.uri) // Select all by default
      }));
      systemLog("Ověřené informace nalezeny.");
    } catch (err: any) {
      systemLog(`Chyba při ověřování: ${err.message}`);
      setProc(p => ({ ...p, error: err.message, isVerifying: false }));
    }
  };

  const handleGenerate = async (topic?: string, topicId?: string, curriculumId?: string) => {
    const finalTopic = topic || inputText;
    if (!finalTopic.trim()) return;

    if (curriculumId) setCurrentCurriculumId(curriculumId);
    else if (!topicId) setCurrentCurriculumId(undefined); // Reset if not from curriculum

    systemLog(`Zahajuji generování pro téma: ${finalTopic}`);
    
    // Auto-select all current assets
    setProc(p => ({ 
      ...p, 
      isLoadingInitial: true, 
      error: null, 
      result: null,
      selectedFiles: files.map(f => f.name),
      selectedImages: images.map((_, i) => i),
      selectedYtVideos: ytVideos.map(v => v.url),
      selectedWebPages: webPages.map(p => p.url),
      selectedSources: p.selectedSources || []
    }));

    setTopicIntro(null);
    setIsIntroPanelOpen(true);
    setIntroSlideIndex(0);
    setIsAiLedGeneration(true); // Always use AI led mode on topic input

    // Initial Intro & Classification (Immediate Feedback)
    const introPromise = classifyAndExplainTopic(finalTopic, userSubjects.map(s => s.name)).then(intro => {
      setTopicIntro(intro);
      // Auto-set the subject if it was different
      const matched = userSubjects.find(s => s.name.toLowerCase() === intro.subjectName.toLowerCase());
      if (matched && matched.id !== activeSubject.id) {
        setActiveSubject(matched);
      }
      return intro;
    }).catch(e => {
      console.error("Classification error:", e);
      return null;
    });

    try {
      // Archive Check
      if (topicId) {
        systemLog("Kontroluji archiv pro toto téma...");
        const existing = archive.find(item => item.topicId === topicId);
        if (existing) {
          systemLog("Nalezena existující lekce v archivu. Načítám...");
          setProc(p => ({ ...p, result: existing.study_json, archiveId: existing.id, isLoadingInitial: false }));
          return;
        }
      }

      // Background Verification (Optional but recommended for quality)
      let currentVerifiedInfo = proc.verifiedInfo;
      let currentSelectedSources = proc.selectedSources || [];

      if (!currentVerifiedInfo) {
        systemLog("Systém automaticky vyhledává doplňující zdroje...");
        try {
          currentVerifiedInfo = await verifyTopic(finalTopic, images, files);
          currentSelectedSources = currentVerifiedInfo.sources.map(s => s.uri);
          setProc(p => ({ 
            ...p, 
            verifiedInfo: currentVerifiedInfo, 
            selectedSources: currentSelectedSources 
          }));
        } catch (vErr) {
          systemLog("Upozornění: Automatické ověření zdrojů nebylo zcela úspěšné, pokračuji s dostupnými daty.");
        }
      }

      systemLog("Generuji základní rozbor...");
      const selectedSourcesInfo = [
        ...(currentVerifiedInfo?.sources.filter(s => currentSelectedSources.includes(s.uri)) || []),
        ...ytVideos.filter(v => proc.selectedYtVideos.includes(v.url) || true).map(v => ({ uri: v.url, title: v.title || v.url })),
        ...webPages.filter(p => proc.selectedWebPages.includes(p.url) || true).map(p => ({ uri: p.url, title: p.title || p.url }))
      ];

      const preAnalyses = [
        ...ytVideos.map(v => v.analysis || ''),
        ...webPages.map(p => p.analysis || ''),
        ...selectedSourcesInfo.map(s => `Zdroj: ${s.title} (${s.uri})`)
      ].filter(a => a);

      const filteredImages = images.filter((_, i) => proc.selectedImages.includes(i));
      const filteredFiles = files.filter(f => proc.selectedFiles.includes(f.name));

      const initial = await generateInitialSummary(
        finalTopic, 
        filteredImages, 
        filteredFiles, 
        preAnalyses,
        proc.tone
      );
      
      const partialResult: StudyResult = {
        ...(initial as StudyResult),
        sources: selectedSourcesInfo
      };
      setProc(p => ({ ...p, result: partialResult, isLoadingInitial: false, isLoadingExtra: true }));

      // Wait for intro to be sure it's captured
      const intro = await introPromise;

      const finalResult: StudyResult = {
        ...partialResult,
        topicIntro: intro || undefined,
        generatedImage: null // No image by default
      };

      setProc(p => ({ ...p, result: finalResult, isLoadingExtra: false }));
      systemLog("Lekce hotova. Archivuji.");

      const storeRes = await storeInArchive(dbConfig, {
        topic: finalResult.title,
        topicId: currentTopicId,
        subject: activeSubject.name,
        parentId: currentCurriculumId,
        originalImage: filteredImages[0] || null,
        videoUrl: ytVideos.filter(v => proc.selectedYtVideos.includes(v.url))[0]?.url || null,
        fullStudyResult: finalResult,
        files: filteredFiles,
        images: filteredImages
      });
      
      if (storeRes.success && storeRes.id) {
        setProc(p => ({ ...p, archiveId: storeRes.id }));
      }
      
      // Refresh archive after save
      loadArchive();

    } catch (err: any) {
      systemLog(`Kritická chyba: ${err.message}`);
      setProc(p => ({ ...p, error: err.message, isLoadingInitial: false, isLoadingExtra: false }));
    }
  };

  const handleGenerateImage = async () => {
    if (!proc.result || proc.isGeneratingImage) return;
    systemLog("Vyhledávám odborné vizuální materiály a schémata...");
    setProc(p => ({ ...p, isGeneratingImage: true }));
    try {
      const visuals = await findEducationalVisuals(proc.result.title);
      if (visuals && visuals.length > 0) {
        const updatedResult = { ...proc.result, visuals };
        setProc(p => ({ ...p, result: updatedResult, isGeneratingImage: false }));
        
        if (proc.archiveId) {
          await updateArchiveItem(dbConfig, proc.archiveId, {
            study_json: JSON.stringify(updatedResult)
          });
        }
        systemLog(`Nalezeno ${visuals.length} vizuálních materiálů.`);
      } else {
        setProc(p => ({ ...p, isGeneratingImage: false, error: "Nepodařilo se najít vhodné vizuální materiály." }));
      }
    } catch (err: any) {
      systemLog(`Chyba při hledání vizuálů: ${err.message}`);
      setProc(p => ({ ...p, isGeneratingImage: false }));
    }
  };

  const handleGenerateExtra = async () => {
    if (!proc.result) return;
    systemLog("Generuji doplňkové materiály (slajdy, testy, mapy)...");
    setProc(p => ({ ...p, isLoadingExtra: true }));
    try {
      const extended = await generateExtendedStudy(proc.result.title, images.filter((_, i) => proc.selectedImages.includes(i)), files.filter(f => proc.selectedFiles.includes(f.name)));
      const updatedResult = { ...proc.result, ...extended };
      setProc(p => ({ ...p, result: updatedResult, isLoadingExtra: false }));
      setActiveLearningTab('slides'); // Show the new page
      
      if (proc.archiveId) {
        await updateArchiveItem(dbConfig, proc.archiveId, {
          study_json: JSON.stringify(updatedResult)
        });
      }
      systemLog("Doplňkové materiály byly přidány.");
    } catch (e: any) {
      systemLog(`Chyba generování doplňků: ${e.message}`);
      setProc(p => ({ ...p, isLoadingExtra: false, error: e.message }));
    }
  };

  const handleReset = () => {
    setProc({ 
      isLoadingInitial: false, 
      isLoadingExtra: false, 
      error: null, 
      result: null, 
      verifiedInfo: null,
      selectedSources: [],
      selectedFiles: [],
      selectedImages: [],
      selectedYtVideos: [],
      selectedWebPages: [],
      tone: 'student'
    });
    setInputText('');
    setCurrentTopicId(undefined);
    setImages([]);
    setFiles([]);
    setYtVideos([]);
    setWebPages([]);
    setActivePage('learn');
  };

  const handleResetVerification = () => {
    setProc(p => ({ 
      ...p, 
      verifiedInfo: null, 
      selectedSources: [],
      selectedFiles: [],
      selectedImages: [],
      selectedYtVideos: [],
      selectedWebPages: []
    }));
  };

  const handleAiCreateLesson = (topic: string) => {
    setIsAiLedGeneration(true);
    setInputText(topic);
    setActivePage('learn');
    handleGenerate(topic);
  };

  const handleAiOpenLesson = async (title: string) => {
    try {
      systemLog(`Hledám lekci: ${title}`);
      const { archive: fetchedArchive } = await fetchArchive(dbConfig);
      
      const lesson = fetchedArchive.find(item => 
        item.topic.toLowerCase().includes(title.toLowerCase()) || 
        item.study_json?.title.toLowerCase().includes(title.toLowerCase())
      );

      if (lesson) {
        systemLog(`Otevírám lekci: ${lesson.topic}`);
        setProc(p => ({
          ...p,
          result: lesson.study_json,
          archiveId: lesson.id,
          isLoadingInitial: false,
          error: null
        }));
        setActivePage('learn');
      } else {
        systemLog(`Lekce "${title}" nebyla nalezena. Zkusím ji vytvořit.`);
        handleAiCreateLesson(title);
      }
    } catch (e) {
      console.error("Failed to open lesson", e);
      systemLog("Chyba při otevírání lekce.");
    }
  };

  const handleUpdateSchedule = (item: any) => {
    const newItem: ScheduleItem = {
      id: Math.random().toString(36).substr(2, 9),
      day: item.day,
      startTime: item.startTime,
      endTime: item.endTime || '',
      subject: item.subject,
      topic: item.topic || '',
      completed: false
    };
    setUserSchedule(prev => [...prev, newItem].sort((a, b) => a.startTime.localeCompare(b.startTime)));
  };

  const handleAddCalendarEvent = (date: string, text: string) => {
    setCalendarEvents(prev => ({ ...prev, [date]: text }));
  };

  const handleAddCustomSubjectAi = (name: string, target: string) => {
    const newSub: Subject = {
      id: `custom_${Date.now()}`,
      name,
      target,
      icon: 'fa-star',
      color: 'bg-indigo-600',
      isCustom: true,
      description: `Vlastní cíl: ${target}`
    };
    setUserSubjects(prev => [...prev, newSub]);
    setActiveSubject(newSub);
  };

  const handleArchiveUpload = async (text: string, files: StudyFile[], images: string[], isRaw: boolean = false) => {
    if (!userProfile.isLoggedIn) {
      setIsLoginModalOpen(true);
      return;
    }
    
    setIsArchivingInProgress(true);
    try {
      const availableSubjects = userSubjects.map(s => s.name);
      systemLog("AI analyzuje materiály pro optimální zařazení...");
      
      const aiAnalysis = await analyzeArchiveUpload(text, images, files, availableSubjects);
      const finalTopic = aiAnalysis.title;
      const finalSubjectName = aiAnalysis.subject;

      // Auto-assign to subject, create if doesn't exist
      let targetSubject = userSubjects.find(s => s.name.toLowerCase() === finalSubjectName.toLowerCase());
      if (!targetSubject) {
        systemLog(`Vytvářím nový předmět: ${finalSubjectName}`);
        const newSub: Subject = {
          id: `custom_${Date.now()}`,
          name: finalSubjectName,
          icon: 'fa-graduation-cap',
          color: 'bg-indigo-600',
          isCustom: true,
          description: `Automaticky vytvořený předmět pro ${finalSubjectName}`
        };
        setUserSubjects(prev => [...prev, newSub]);
        targetSubject = newSub;
      }
      
      let studyResult: StudyResult;
      
      if (isRaw) {
        systemLog(`Ukládám soubory jako "${finalTopic}" do předmětu "${finalSubjectName}"...`);
        studyResult = {
          title: finalTopic,
          learningGoal: "Uložené studijní materiály",
          whyImportant: "Přímý přístup k původním souborům",
          prerequisites: [],
          relatedTopics: [],
          enhancementSuggestions: [],
          fullSummary: [{ text: "Tato položka obsahuje pouze nahrané soubory bez AI rozboru.", question: "" }],
          shortSummary: "Přímý archiv souborů",
          sources: []
        };
      } else {
        systemLog(`Generuji AI rozbor pro "${finalTopic}"...`);
        const initial = await generateInitialSummary(
          finalTopic,
          images,
          files,
          [],
          'student'
        );
        
        studyResult = {
          ...(initial as StudyResult),
          title: finalTopic, // Ensure it uses the AI suggested title
          sources: []
        };
      }

      await storeInArchive(dbConfig, {
        topic: studyResult.title,
        subject: targetSubject.name,
        fullStudyResult: studyResult,
        originalImage: images.length > 0 ? images[0] : null,
        videoUrl: null,
        files,
        images
      });

      systemLog(`Materiály úspěšně uloženy jako "${finalTopic}" v předmětu "${finalSubjectName}".`);
      setArchiveRefreshKey(prev => prev + 1);
      setIsArchiveUploadOpen(false);
    } catch (error: any) {
      systemLog(`Chyba při nahrávání do archivu: ${error.message}`);
      setProc(p => ({ ...p, error: `Nahrávání selhalo: ${error.message}` }));
    } finally {
      setIsArchivingInProgress(false);
    }
  };

  return (
    <ErrorBoundary>
      <div className="flex h-screen overflow-hidden bg-[#020617]">
      <SystemLog />
      
      {!(activePage === 'learn' && proc.result) && (
        <Sidebar 
          activePage={activePage}
          onPageChange={setActivePage}
          hasResult={!!proc.result}
          userProfile={userProfile}
          onUpdateProfile={setUserProfile}
          onOpenLogin={() => setIsLoginModalOpen(true)}
          onLogout={handleLogout}
          onOpenProfile={() => setActivePage('profile')}
          activeSubject={activeSubject}
          onOpenSettings={() => setIsSettingsModalOpen(true)}
          isOpen={isSidebarOpen}
          onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
          onToggleSubjectBar={() => setIsSubjectBarOpen(!isSubjectBarOpen)}
        />
      )}

      <div className={`flex-grow flex flex-col min-w-0 bg-[#020617] relative transition-all duration-500 space-x-0 ${isAgentOpen ? 'pr-[400px]' : 'pr-0'}`}>
        <div className="flex-grow overflow-y-auto no-scrollbar scroll-smooth">
          <AnimatePresence mode="wait">
            <motion.div
              key={activePage}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
              className="h-full"
            >
              {activePage === 'profile' && (
                <ProfileSettings
                  userProfile={userProfile}
                  userSubjects={userSubjects}
                  onUpdate={setUserProfile}
                  onClose={() => setActivePage('home')}
                />
              )}

              {activePage === 'home' && (
                <div className="max-w-7xl mx-auto py-6 px-8 flex flex-col h-full">
                  {/* Dashboard Sub-Navigation */}
                  <div className="flex items-center justify-between mb-8 pb-4 border-b border-white/5 shrink-0">
                    <div className="flex items-center gap-12">
                       <button 
                         onClick={() => setDashboardSubTab('overview')}
                         className={`text-[10px] font-black uppercase tracking-[0.4em] transition-all relative py-2 ${dashboardSubTab === 'overview' ? 'text-white' : 'text-zinc-600 hover:text-zinc-400'}`}
                       >
                         Overview
                         {dashboardSubTab === 'overview' && <motion.div layoutId="dashTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500" />}
                       </button>
                       <button 
                         onClick={() => setDashboardSubTab('explore')}
                         className={`text-[10px] font-black uppercase tracking-[0.4em] transition-all relative py-2 ${dashboardSubTab === 'explore' ? 'text-white' : 'text-zinc-600 hover:text-zinc-400'}`}
                       >
                         Explore
                         {dashboardSubTab === 'explore' && <motion.div layoutId="dashTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500" />}
                       </button>
                    </div>
                  </div>

                  {dashboardSubTab === 'overview' ? (
                    <DashboardOverview 
                      userProfile={userProfile}
                      calendarEvents={calendarEvents}
                      onAddCalendarEvent={handleAddCalendarEvent}
                      userSchedule={userSchedule}
                      onUpdateSchedule={setUserSchedule}
                      archive={archive}
                      firstAvatar={firstAvatar}
                      onNavigate={setActivePage as any}
                      onOpenLesson={(item) => { 
                        setProc(p => ({ ...p, result: item.study_json })); 
                        setActivePage('learn'); 
                        setIsAgentOpen(true);
                      }}
                    />
                  ) : (
                    <ExploreGrid 
                      publishedCurricula={publishedCurricula}
                      filterSubject={exploreFilterSubject}
                      setFilterSubject={setExploreFilterSubject}
                      filterGrade={exploreFilterGrade}
                      setFilterGrade={setExploreFilterGrade}
                      avatarURL={userProfile?.avatarURL || firstAvatar?.avatarURL}
                      avatarPoses={userProfile?.avatarPoses || firstAvatar?.avatarPoses}
                      onExplore={(c) => { 
                        const matched = userSubjects.find(s => s.name === c.plan.subject);
                        if (matched) {
                          setActiveSubject(matched);
                        } else {
                          // Optionally add to user subjects or just temporary? 
                          // Let's just switch and the curriculum will show it.
                          setActiveSubject(DEFAULT_SUBJECTS.find(s => s.name === c.plan.subject) || DEFAULT_SUBJECTS[0]);
                        }
                        setActivePage('curriculum'); 
                      }}
                    />
                  )}
                </div>
              )}

          {activePage === 'learn' && (
            <div className={`flex h-full w-full overflow-hidden ${proc.result ? 'bg-[#050505]' : ''}`}>
              <div className="flex-grow overflow-y-auto no-scrollbar scroll-smooth relative">
                {proc.result && (
                  <button 
                    onClick={handleReset}
                    className="fixed top-8 left-8 z-[200] w-14 h-14 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/5 flex items-center justify-center text-white transition-all group backdrop-blur-xl"
                  >
                    <i className="fa-solid fa-arrow-left group-hover:-translate-x-1 transition-transform"></i>
                  </button>
                )}

                <div className={`${proc.result ? 'w-full max-w-full px-4 md:px-16 py-12' : 'w-full max-w-[1600px] mx-auto py-12 px-10'}`}>
                  {!proc.result && !proc.isLoadingInitial && (
                    <div className="space-y-12 animate-fade py-6">
                      <div className="text-center space-y-4">
                        {!proc.verifiedInfo && !proc.isVerifying && (
                          <>
                            <h2 className="text-3xl md:text-5xl font-black uppercase text-white tracking-tighter leading-none">
                              Co se dnes <br/><span className="text-indigo-600">naučíme?</span>
                            </h2>
                            <p className="text-zinc-500 font-bold text-[10px] uppercase tracking-[0.2em] max-w-lg mx-auto leading-relaxed">
                              Vložte text, soubory nebo fotky a nechte Gemini vytvořit váš studijní vesmír.
                            </p>
                          </>
                        )}
                      </div>
                      
                      {(proc.verifiedInfo || proc.isVerifying) ? (
                        <VerificationPanel 
                          verifiedInfo={proc.verifiedInfo}
                          isVerifying={proc.isVerifying}
                          selectedSources={proc.selectedSources || []}
                          onSelectSources={(uris) => setProc(p => ({ ...p, selectedSources: uris }))}
                          userProfile={userProfile}
                          firstAvatar={firstAvatar}
                          tone={proc.tone}
                          onSelectTone={(tone) => setProc(p => ({ ...p, tone }))}

                          providedSources={{ images, files, ytVideos, webPages }}
                          selectedFiles={proc.selectedFiles}
                          onSelectFiles={(names) => setProc(p => ({ ...p, selectedFiles: names }))}
                          selectedImages={proc.selectedImages}
                          onSelectImages={(indices) => setProc(p => ({ ...p, selectedImages: indices }))}
                          selectedYtVideos={proc.selectedYtVideos}
                          onSelectYtVideos={(urls) => setProc(p => ({ ...p, selectedYtVideos: urls }))}
                          selectedWebPages={proc.selectedWebPages}
                          onSelectWebPages={(urls) => setProc(p => ({ ...p, selectedWebPages: urls }))}
                          
                          onGenerate={() => handleGenerate()}
                          onReset={handleResetVerification}
                        />
                      ) : (
                        <StudyInput 
                          text={inputText} setText={setInputText}
                          images={images} setImages={setImages}
                          files={files} setFiles={setFiles}
                          ytVideos={ytVideos} setYtVideos={setYtVideos}
                          webPages={webPages} setWebPages={setWebPages}
                          onGenerate={() => handleGenerate()}
                          isLoading={proc.isLoadingInitial || proc.isVerifying}
                          isVerifying={proc.isVerifying}
                          hasVerifiedInfo={false}
                        />
                      )}
                    </div>
                  )}
                  
                  {proc.isLoadingInitial && (
                    <div className="flex flex-col items-center justify-center py-20 animate-fade h-full min-h-[60vh]">
                        <div className="space-y-6 text-center">
                           <div className="flex items-center justify-center gap-3">
                              <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                              <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse [animation-delay:0.2s]" />
                              <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse [animation-delay:0.4s]" />
                           </div>
                           <p className="text-[10px] font-black uppercase tracking-[0.6em] text-zinc-500 italic">Neural Sync Active</p>
                        </div>
                    </div>
                  )}

                  {proc.result && (
                    <StudyOutput 
                      result={proc.result}
                      isAgentOpen={isAgentOpen}
                      onReset={handleReset}
                      onUpdateResult={(updated) => setProc(p => ({ ...p, result: updated }))}
                      onGenerateTopic={(t) => { setInputText(t); handleGenerate(t); }}
                      onGenerateExtra={handleGenerateExtra}
                      isLoadingExtra={proc.isLoadingExtra}
                      isLoadingInitial={proc.isLoadingInitial}
                      isGeneratingImage={proc.isGeneratingImage}
                      originalImage={images[0] || null}
                      originalText={inputText}
                      activeSubject={activeSubject}
                      dbConfig={dbConfig}
                      onGenerateImage={handleGenerateImage}
                      activeTab={activeLearningTab}
                      onSetLearningTab={setActiveLearningTab}
                      highlightIndex={activeHighlightIndex}
                      currentAnnotation={currentAnnotation}
                      onClearAnnotation={() => setCurrentAnnotation(null)}
                    />
                  )}
                </div>
              </div>
            </div>
          )}

          {activePage === 'curriculum' && (
            <CurriculumGuide 
              activeSubject={activeSubject} 
              archive={archive}
              isAgentOpen={isAgentOpen}
              userProfile={userProfile}
              userSubjects={userSubjects}
              publishedCurricula={publishedCurricula}
              onSelectSubject={setActiveSubject}
              onOpenLogin={() => setIsLoginModalOpen(true)}
              onOpenAddSubject={() => setIsAddSubjectModalOpen(true)}
              firstAvatar={firstAvatar}
              onGenerateLesson={(topic, topicId, curriculumId) => { 
                setImages([]);
                setFiles([]);
                setYtVideos([]);
                setWebPages([]);
                setInputText(topic); 
                setCurrentTopicId(topicId);
                setCurrentCurriculumId(curriculumId);
                handleGenerate(topic, topicId, curriculumId); 
              }} 
              preloadedPlan={preloadedCurriculum}
              onClearPreloaded={() => setPreloadedCurriculum(null)}
            />
          )}

          {activePage === 'archive' && (
            <div className="max-w-6xl mx-auto py-10 px-8">
               <div className="mb-10 flex justify-between items-end">
                  <div>
                    <h2 className="text-3xl font-black uppercase text-white tracking-tighter">Centrum <span className="text-indigo-500">Znalostí</span></h2>
                    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500 mt-2">Tvé studijní materiály a dříve vygenerované lekce</p>
                  </div>
                  <button 
                    onClick={() => setIsArchiveUploadOpen(true)}
                    className="px-8 py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-black uppercase tracking-widest shadow-xl shadow-indigo-500/20 transition-all active:scale-95 flex items-center gap-3"
                  >
                    <i className="fa-solid fa-cloud-arrow-up"></i>
                    Nahrát materiály
                  </button>
               </div>
               <ArchiveList 
                 key={archiveRefreshKey}
                 config={dbConfig} 
                 currentUser={userProfile}
                 firstAvatar={firstAvatar}
                 onOpenItem={handleArchiveOpenItem} 
               />
            </div>
          )}

          {activePage === 'chat' && (
            <div className="max-w-7xl mx-auto py-12 px-8 h-full">
              <UserChat currentUser={userProfile} />
            </div>
          )}

          </motion.div>
        </AnimatePresence>
      </div>
    </div>

      <GymniLiveAgent 
        userProfile={userProfile} 
        activePage={activePage}
        onPageChange={setActivePage}
        onSetDashboardSubTab={setDashboardSubTab}
        onCreateLesson={handleAiCreateLesson}
        onOpenLesson={handleAiOpenLesson}
        onUpdateSchedule={handleUpdateSchedule}
        onAddCalendarEvent={handleAddCalendarEvent}
        onAddCustomSubject={handleAddCustomSubjectAi}
        publishedCurricula={publishedCurricula}
        currentLesson={proc.result}
        isGenerating={proc.isLoadingInitial}
        onGenerateExtra={handleGenerateExtra}
        onSetLearningTab={setActiveLearningTab}
        onSetAnnotation={setCurrentAnnotation}
        onSetHighlightIndex={(index) => {
          setActiveHighlightIndex(index);
          // Auto-save progress to result
          if (proc.result) {
            setProc(p => ({
              ...p,
              result: p.result ? { ...p.result, progress: index } : null
            }));
          }
        }}
        onAddYouTubeVideo={(video) => {
          if (proc.result) {
            const updated = {
              ...proc.result,
              youtubeVideos: [...(proc.result.youtubeVideos || []), { ...video, resolving: false }]
            };
            setProc(p => ({ ...p, result: updated }));
          }
        }}
        onToggle={setIsAgentOpen}
        isOpen={isAgentOpen}
        topicIntro={topicIntro}
        introSlideIndex={introSlideIndex}
        onIntroSlideComplete={handleIntroSlideComplete}
        isIntroPanelOpen={isIntroPanelOpen}
        isAiLedGeneration={isAiLedGeneration}
      />
      
      <InteractiveLearning 
        result={proc.result}
        archiveId={proc.archiveId}
        isOpen={isInteractiveLearningOpen}
        onClose={() => setIsInteractiveLearningOpen(false)}
        onUpdateHighScores={async (scores) => {
          if (proc.result) {
            const updatedResult = { ...proc.result, interactiveHighScores: scores };
            setProc(p => ({ ...p, result: updatedResult }));
            
            if (proc.archiveId) {
              try {
                await updateArchiveItem(dbConfig, proc.archiveId, {
                  study_json: JSON.stringify(updatedResult)
                });
                // Refresh archive to keep it in sync
                loadArchive();
              } catch (e) {
                console.error("Failed to update high scores in archive", e);
              }
            }
          }
        }}
      />

      <HelpGuide 
        activePage={activePage} 
        userProfile={userProfile} 
        onLoginClick={() => setIsLoginModalOpen(true)}
        onUpdateProfile={(updates) => setUserProfile(prev => ({ ...prev, ...updates }))}
      />

      {isIntroPanelOpen && (
        <div className="fixed inset-0 z-[6000] flex items-center justify-center p-6 animate-fade bg-black/60 backdrop-blur-sm overflow-hidden">
          <motion.div 
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="w-full max-w-4xl bg-zinc-950/90 border border-white/10 rounded-[2.5rem] shadow-[0_50px_150px_rgba(0,0,0,1)] flex flex-col md:flex-row overflow-hidden relative"
          >
            {/* Left Panel: Avatar & Progress */}
            <div className="w-full md:w-[40%] bg-black p-10 flex flex-col items-center justify-between border-b md:border-b-0 md:border-r border-white/5 relative">
                        <div className="flex-grow flex flex-col items-center justify-center gap-6 relative z-10 w-full">
                <div className="relative group -mt-10">
                  <div className="absolute inset-0 bg-indigo-500/10 blur-[80px] rounded-full scale-125 group-hover:scale-150 transition-all duration-1000"></div>
                  <Gymi 
                    pose={introSlideIndex === 0 ? 'HAPPY' : (introSlideIndex === 1 ? 'EXPLAIN' : (introSlideIndex === 2 ? 'THINKING' : 'FRIENDLY'))}
                    size={380}
                    className="relative z-10 drop-shadow-[0_20px_50px_rgba(0,0,0,0.8)] -ml-4"
                    avatarURL={userProfile.avatarURL || firstAvatar?.avatarURL}
                    avatarPoses={userProfile.avatarPoses || firstAvatar?.avatarPoses}
                  />
                </div>
                
                <div className="text-center space-y-4 w-full mt-4">
                  <p className="text-[10px] font-mono font-black uppercase text-zinc-500 tracking-[0.4em]">Neural Analyst // Step {introSlideIndex + 1} of 4</p>
                  <div className="flex gap-2 justify-center">
                    {[0,1,2,3].map(i => (
                      <div key={i} className={`h-1.5 rounded-full transition-all duration-700 ${i === introSlideIndex ? 'w-10 bg-indigo-500' : 'w-2 bg-white/10'}`}></div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Right Panel: Content */}
            <div className="w-full md:w-[60%] p-10 md:p-16 flex flex-col relative bg-zinc-950/40 backdrop-blur-xl">
              <div className="absolute top-0 right-0 p-12 opacity-10">
                <Gymi 
                  pose="THINKING" 
                  size={200} 
                  className="grayscale opacity-50"
                  avatarURL={userProfile.avatarURL || firstAvatar?.avatarURL}
                  avatarPoses={userProfile.avatarPoses || firstAvatar?.avatarPoses}
                />
              </div>

              <div className="flex-grow relative z-10">
                <AnimatePresence mode="wait">
                  <div className="space-y-8">
                    <div className="space-y-2">
                       <p className="text-[10px] font-mono font-black uppercase text-indigo-500 tracking-[0.6em] mb-4">Neural Architecture Analysis</p>
                    </div>
                    
                    {introSlideIndex === 0 && (
                      <motion.div 
                        key="intro" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                        className="space-y-8"
                      >
                         <h3 className="text-4xl md:text-5xl font-black uppercase text-white tracking-tighter italic leading-none">Skvělá volba <br/><span className="text-indigo-500">tématu!</span></h3>
                         <p className="text-base font-bold text-zinc-400 leading-relaxed italic border-l-2 border-indigo-500/40 pl-8 max-w-md">
                            Analyzuji fakta a sestavuji tvůj optimální studijní plán. Pojďme se podívat, co nás čeká.
                         </p>
                      </motion.div>
                    )}

                    {introSlideIndex === 1 && (
                      <motion.div 
                        key="why" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                        className="space-y-8"
                      >
                         <h3 className="text-4xl md:text-5xl font-black uppercase text-white tracking-tighter italic leading-none">V čem je <br/><span className="text-indigo-500">přínos?</span></h3>
                         <p className="text-base font-bold text-zinc-400 leading-relaxed italic border-l-2 border-indigo-500/40 pl-8 max-w-md">
                            {topicIntro ? topicIntro.why : "Synchronizuji neurální data a extrahuji klíčové body..."}
                         </p>
                      </motion.div>
                    )}

                    {introSlideIndex === 2 && (
                      <motion.div 
                        key="what" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                        className="space-y-8"
                      >
                         <h3 className="text-4xl md:text-5xl font-black uppercase text-white tracking-tighter italic leading-none">Klíčové <br/><span className="text-indigo-500">koncepty?</span></h3>
                         <p className="text-base font-bold text-zinc-400 leading-relaxed italic border-l-2 border-indigo-500/40 pl-8 max-w-md">
                            {topicIntro ? topicIntro.what : "Mapuji znalostní uzly a vytvářím optimální studijní cestu..."}
                         </p>
                      </motion.div>
                    )}

                    {introSlideIndex === 3 && (
                      <motion.div 
                        key="subject" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                        className="space-y-8"
                      >
                         <h3 className="text-4xl md:text-5xl font-black uppercase text-white tracking-tighter italic leading-none">Detekovaný <br/><span className="text-indigo-500">předmět?</span></h3>
                         <div className="flex items-center gap-8 p-10 rounded-[3rem] bg-indigo-600/10 border border-white/5 relative overflow-hidden group">
                            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 to-transparent" />
                            <div className="w-20 h-20 rounded-[1.5rem] bg-indigo-600 flex items-center justify-center shadow-2xl shadow-indigo-500/30 group-hover:scale-110 transition-transform relative z-10">
                               <i className={`fa-solid ${activeSubject.icon} text-3xl text-white`}></i>
                            </div>
                            <div className="text-left relative z-10">
                               <p className="text-[10px] font-mono font-black uppercase text-indigo-400 tracking-[0.4em] mb-2">Předmět detekován</p>
                               <p className="text-3xl md:text-4xl font-black text-white uppercase tracking-tighter italic leading-none">{activeSubject.name}</p>
                            </div>
                         </div>
                      </motion.div>
                    )}
                  </div>
                </AnimatePresence>
              </div>

              <div className="mt-16 flex justify-end relative z-10">
                {introSlideIndex < 3 ? (
                  <button 
                    onClick={handleIntroSlideComplete}
                    className="px-12 py-6 rounded-2xl bg-indigo-600 text-white text-xs font-black uppercase tracking-[0.3em] shadow-[0_20px_50px_rgba(79,70,229,0.3)] hover:shadow-[0_25px_60px_rgba(79,70,229,0.5)] hover:scale-105 active:scale-95 transition-all flex items-center gap-6"
                  >
                    Další krok
                    <i className="fa-solid fa-chevron-right text-[10px]"></i>
                  </button>
                ) : (
                  <button 
                    onClick={handleIntroSlideComplete}
                    className="px-12 py-6 rounded-2xl bg-emerald-600 text-white text-xs font-black uppercase tracking-[0.3em] shadow-[0_20px_50px_rgba(16,185,129,0.3)] hover:shadow-[0_25px_60px_rgba(16,185,129,0.5)] hover:scale-105 active:scale-95 transition-all flex items-center gap-6"
                    disabled={proc.isLoadingInitial}
                  >
                    {proc.isLoadingInitial ? "Generuji obsah..." : "Otevřít lekci"}
                    <i className={`fa-solid ${proc.isLoadingInitial ? 'fa-spinner fa-spin' : 'fa-bolt-lightning'} text-xs`}></i>
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}

      <AddSubjectModal 
        isOpen={isAddSubjectModalOpen} 
        onClose={() => setIsAddSubjectModalOpen(false)} 
        onAdd={handleAddSubject}
        existingSubjects={userSubjects}
      />

      <SubjectBar 
        isOpen={isSubjectBarOpen} 
        onClose={() => setIsSubjectBarOpen(false)}
        activeSubjectId={activeSubject.id}
        onSelect={setActiveSubject}
        userSubjects={userSubjects}
        onOpenAddSubject={() => setIsAddSubjectModalOpen(true)}
      />

      {/* ProfileSettings rendered as page above */}

      {isArchiveUploadOpen && (
        <ArchiveUpload 
          onClose={() => setIsArchiveUploadOpen(false)}
          onUpload={handleArchiveUpload}
          isUploading={isArchivingInProgress}
        />
      )}

      {isLoginModalOpen && (
        <LoginModal 
          onLogin={(profile) => { setUserProfile(profile); setIsLoginModalOpen(false); }} 
          onClose={() => setIsLoginModalOpen(false)} 
        />
      )}

      {isSettingsModalOpen && (
        <SettingsModal 
          config={dbConfig} 
          userProfile={userProfile}
          onUpdateProfile={(updates) => setUserProfile(prev => ({ ...prev, ...updates }))}
          onSave={setDbConfig} 
          onClose={() => setIsSettingsModalOpen(false)} 
        />
      )}

      {isArchiveChoiceModalOpen && archiveItemToOpen && (
        <div className="fixed inset-0 z-[8000] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-lg bg-zinc-900 border border-white/10 rounded-[2.5rem] p-10 text-center space-y-8"
          >
            <div className="w-20 h-20 bg-indigo-600 rounded-3xl mx-auto flex items-center justify-center text-3xl text-white shadow-2xl">
              <i className="fa-solid fa-play"></i>
            </div>
            <div>
              <h3 className="text-3xl font-black text-white uppercase tracking-tighter italic">Jak začít lekci?</h3>
              <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mt-2">{archiveItemToOpen.topic}</p>
            </div>

            <div className="grid gap-4">
              <button 
                onClick={() => {
                  setTopicIntro(archiveItemToOpen.study_json!.topicIntro!);
                  setProc(p => ({ ...p, result: archiveItemToOpen.study_json!, archiveId: archiveItemToOpen.id }));
                  setIntroSlideIndex(0);
                  setIsIntroPanelOpen(true);
                  setIsArchiveChoiceModalOpen(false);
                  setIsAiLedGeneration(false); // don't auto-close during replay
                }}
                className="w-full py-6 rounded-2xl bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-indigo-500 transition-all flex items-center justify-center gap-3"
              >
                <i className="fa-solid fa-clapperboard"></i>
                Spustit lekci s úvodem
              </button>
              <button 
                onClick={() => {
                  setProc(p => ({ ...p, result: archiveItemToOpen.study_json!, archiveId: archiveItemToOpen.id }));
                  setActivePage('learn');
                  setIsArchiveChoiceModalOpen(false);
                }}
                className="w-full py-6 rounded-2xl bg-white/5 border border-white/5 text-zinc-400 text-[10px] font-black uppercase tracking-widest hover:text-white hover:bg-white/10 transition-all flex items-center justify-center gap-3"
              >
                <i className="fa-solid fa-forward-step"></i>
                Pokračovat v učení
              </button>
            </div>
            
            <button onClick={() => setIsArchiveChoiceModalOpen(false)} className="text-[10px] font-black uppercase tracking-widest text-zinc-600 hover:text-white transition-colors">
              Zrušit
            </button>
          </motion.div>
        </div>
      )}

      {proc.error && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[3000] p-8 bg-red-600 rounded-[2.5rem] text-white font-black text-xs uppercase tracking-widest shadow-2xl flex items-center gap-8 animate-fade">
           <i className="fa-solid fa-triangle-exclamation text-2xl"></i>
           <span>{proc.error}</span>
           <button onClick={() => setProc(p => ({ ...p, error: null }))} className="w-10 h-10 rounded-full bg-black/20 hover:bg-black/40 flex items-center justify-center transition-all"><i className="fa-solid fa-xmark"></i></button>
        </div>
      )}
    </div>
    </ErrorBoundary>
  );
};

export default App;
