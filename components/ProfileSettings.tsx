
import React, { useState, useEffect, useRef } from 'react';
import { doc, updateDoc, setDoc, collection, onSnapshot, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { UserProfile, Assistant, Subject } from '../types';
import { handleFirestoreError, OperationType } from '../services/dbService';
import { motion, AnimatePresence } from 'motion/react';
import { systemLog } from '../services/logService';
import { generateAvatarPortrait, organizeAvatarPoses } from '../services/geminiService';
import Gymi from './Gymi';

interface ProfileSettingsProps {
  userProfile: UserProfile;
  userSubjects: Subject[];
  onUpdate: (profile: UserProfile) => void;
  onClose: () => void;
}

const STAT_NAMES = {
  intellect: 'INT',
  creativity: 'CRT',
  stamina: 'STM',
  social: 'SOC_VERIFIED'
};

const processAvatarImage = (dataUrl: string): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const MAX_SIZE = 512;
      let width = img.width;
      let height = img.height;
      if (width > height) {
        if (width > MAX_SIZE) {
          height *= MAX_SIZE / width;
          width = MAX_SIZE;
        }
      } else {
        if (height > MAX_SIZE) {
          width *= MAX_SIZE / height;
          height = MAX_SIZE;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(dataUrl.split(',')[1] || dataUrl); return; }
      ctx.drawImage(img, 0, 0, width, height);
      const imageData = ctx.getImageData(0, 0, width, height);
      const data = imageData.data;
      const threshold = 35; 
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] < threshold && data[i+1] < threshold && data[i+2] < threshold) {
          data[i+3] = 0; 
        }
      }
      ctx.putImageData(imageData, 0, 0);
      const result = canvas.toDataURL('image/png').split(',')[1];
      resolve(result);
    };
    img.onerror = () => resolve(dataUrl.split(',')[1] || dataUrl);
    img.src = dataUrl;
  });
};

const ProfileSettings: React.FC<ProfileSettingsProps> = ({ userProfile, userSubjects, onUpdate, onClose }) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'assistant'>('profile');
  
  // --- Profile State ---
  const [displayName, setDisplayName] = useState(userProfile.displayName || '');
  const [bio, setBio] = useState(userProfile.bio || '');
  const [photoURL, setPhotoURL] = useState(userProfile.photoURL || '');
  const [grade, setGrade] = useState(userProfile.grade || 1);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [previewError, setPreviewError] = useState(false);

  // --- Assistant State ---
  const [profiles, setProfiles] = useState<Assistant[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string>(userProfile.selectedAvatarId || '');
  const [isEditingAssistant, setIsEditingAssistant] = useState(false);
  const [editAssistantData, setEditAssistantData] = useState<Assistant>({
    uid: '',
    displayName: '',
    bio: '',
    avatarURL: '',
    avatarPoses: {},
    stats: { intellect: 85, creativity: 90, stamina: 70, social: 75 }
  });
  const [isGeneratingAssistant, setIsGeneratingAssistant] = useState(false);
  const [isSavingAssistant, setIsSavingAssistant] = useState(false);
  const [generatingPoses, setGeneratingPoses] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const poseFileInputRef = useRef<HTMLInputElement>(null);
  const [activePoseToUpload, setActivePoseToUpload] = useState<string | null>(null);
  const [newPoseName, setNewPoseName] = useState('');
  const [isAddingPose, setIsAddingPose] = useState(false);
  const [isOrganizingPoses, setIsOrganizingPoses] = useState(false);
  const bulkPoseInputRef = useRef<HTMLInputElement>(null);
  const [poseBeingRenamed, setPoseBeingRenamed] = useState<string | null>(null);
  const [newPoseNameValue, setNewPoseNameValue] = useState('');

  useEffect(() => {
    setPreviewError(false);
  }, [photoURL]);

  // Load Assistant identities from global collection
  useEffect(() => {
    const avatarsPath = 'avatars';
    const avatarsRef = collection(db, avatarsPath);
    const unsubscribe = onSnapshot(avatarsRef, (snapshot) => {
      const loaded: Assistant[] = [];
      snapshot.forEach(doc => {
        loaded.push({ ...doc.data(), uid: doc.id } as Assistant);
      });
      setProfiles(loaded);
      if (!selectedProfileId && loaded.length > 0) {
        const current = loaded.find(p => p.uid === userProfile.selectedAvatarId) || loaded[0];
        if (current) setSelectedProfileId(current.uid);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, avatarsPath);
    });
    return () => unsubscribe();
  }, [userProfile.selectedAvatarId, selectedProfileId]);

  const uploadToCloudinary = async (base64: string): Promise<string> => {
    systemLog("Nahrávám data...");
    const response = await fetch('/api/upload-base64', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: base64.includes(';base64,') ? base64 : `data:image/png;base64,${base64}` })
    });
    if (!response.ok) throw new Error(`Cloud upload failed: ${response.statusText}`);
    const data = await response.json();
    return data.url;
  };

  const handleBulkPoseUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0 || !selectedAssistant) return;

    setIsOrganizingPoses(true);
    systemLog("Probíhá hromadná analýza a organizace póz...");

    try {
      const base64Images: string[] = [];
      for (const file of files) {
        const dataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = (ev) => resolve(ev.target?.result as string);
          reader.readAsDataURL(file);
        });
        const processed = await processAvatarImage(dataUrl);
        base64Images.push(processed);
      }

      const mapping = await organizeAvatarPoses(base64Images);
      const updatedPoses = { ...(selectedAssistant.avatarPoses || {}) };

      systemLog(`Analýza dokončena. Nahrávám ${Object.keys(mapping).length} póz do cloudu...`);

      for (const poseName in mapping) {
        const url = await uploadToCloudinary(mapping[poseName]);
        updatedPoses[poseName] = url;
      }

      const avatarsPath = 'avatars';
      const avatarRef = doc(db, avatarsPath, selectedAssistant.uid);
      await setDoc(avatarRef, { avatarPoses: updatedPoses, ownerId: userProfile.uid }, { merge: true });

      if (userProfile.selectedAvatarId === selectedAssistant.uid) {
        const usersPath = 'users';
        const userRef = doc(db, usersPath, userProfile.uid);
        await setDoc(userRef, { avatarPoses: updatedPoses }, { merge: true });
        onUpdate({ ...userProfile, avatarPoses: updatedPoses });
      }

      systemLog("Hromadná organizace dokončena.");
    } catch (error) {
      console.error(error);
      handleFirestoreError(error, OperationType.WRITE, 'avatars/users');
      systemLog("Chyba při hromadné organizaci póz.");
    } finally {
      setIsOrganizingPoses(false);
      e.target.value = '';
    }
  };

  const selectedAssistant = profiles.find(p => p.uid === selectedProfileId);

  const handleProfileSave = async () => {
    setIsSavingProfile(true);
    const usersPath = 'users';
    try {
      const userRef = doc(db, usersPath, userProfile.uid);
      const updates = { displayName, bio, photoURL, grade, status: 'online' as const };
      await updateDoc(userRef, updates);
      onUpdate({ ...userProfile, ...updates });
      systemLog("Profil uživatele byl aktualizován.");
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `${usersPath}/${userProfile.uid}`);
      console.error("Error updating profile:", error);
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleAssistantPoseClick = async (pose: string, force: boolean = false) => {
    if (!selectedAssistant || !userProfile.uid) return;
    if (selectedAssistant.avatarPoses?.[pose] && !force) return;
    if (generatingPoses.has(pose)) return;

    setGeneratingPoses(prev => new Set(prev).add(pose));
    systemLog(`Vytvářím pózu: ${pose}...`);

    try {
      const reference = selectedAssistant.avatarURL;
      const base64 = await generateAvatarPortrait(selectedAssistant.bio || "", pose, reference);
      if (!base64) throw new Error("Synthesis layer failed.");
      const optimized = await processAvatarImage(base64);
      const url = await uploadToCloudinary(optimized);
      
      const avatarsPath = 'avatars';
      const avatarRef = doc(db, avatarsPath, selectedAssistant.uid);
      const newPoses = { ...(selectedAssistant.avatarPoses || {}), [pose]: url };
      await setDoc(avatarRef, { avatarPoses: newPoses, ownerId: userProfile.uid }, { merge: true });
      if (userProfile.selectedAvatarId === selectedAssistant.uid) {
        const usersPath = 'users';
        const userRef = doc(db, usersPath, userProfile.uid);
        await setDoc(userRef, { avatarPoses: newPoses }, { merge: true });
        onUpdate({ ...userProfile, avatarPoses: newPoses });
      }
      systemLog(`Vytvořeno: Póza ${pose} uložena.`);
    } catch (e: any) {
      handleFirestoreError(e, OperationType.WRITE, 'avatars/users');
      systemLog(`Chyba: Vytvoření ${pose} selhalo.`);
    } finally {
      setGeneratingPoses(prev => {
        const next = new Set(prev);
        next.delete(pose);
        return next;
      });
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>, callback: (url: string) => void) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const dataUrl = event.target?.result as string;
      
      systemLog("Zpracovávám nahraný záznam...");
      try {
        const optimized = await processAvatarImage(dataUrl);
        const url = await uploadToCloudinary(optimized);
        callback(url);
      } catch (err) {
        systemLog("Chyba při zpracování nahrávky.");
        console.error(err);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = ''; // Reset input
  };
  const handleAssistantSave = async () => {
    if (!userProfile.uid) return;
    setIsSavingAssistant(true);
    systemLog("Ukládám asistenta...");
    try {
      let finalAvatarURL = editAssistantData.avatarURL;
      if (editAssistantData.avatarURL && (editAssistantData.avatarURL.includes(';base64,') || !editAssistantData.avatarURL.startsWith('http') && !editAssistantData.avatarURL.startsWith('/'))) {
        finalAvatarURL = await uploadToCloudinary(editAssistantData.avatarURL);
      }
      const avatarsPath = 'avatars';
      const avatarRef = doc(db, avatarsPath, editAssistantData.uid);
      const payload = {
        displayName: editAssistantData.displayName || 'Unnamed Assistant',
        uid: editAssistantData.uid,
        ownerId: editAssistantData.ownerId || userProfile.uid,
        bio: editAssistantData.bio || '',
        avatarURL: finalAvatarURL,
        avatarPoses: editAssistantData.avatarPoses || {},
        stats: editAssistantData.stats
      };
      await setDoc(avatarRef, payload);
      if (userProfile.selectedAvatarId === editAssistantData.uid) {
        const usersPath = 'users';
        const userRef = doc(db, usersPath, userProfile.uid);
        const cache = { avatarURL: finalAvatarURL, avatarPoses: editAssistantData.avatarPoses || {} };
        await setDoc(userRef, cache, { merge: true });
        onUpdate({ ...userProfile, ...cache });
      }
      setIsEditingAssistant(false);
      systemLog("Asistent uložen.");
    } catch (e: any) {
      console.error("Assistant save error:", e);
      handleFirestoreError(e, OperationType.WRITE, 'avatars/users');
      systemLog(`Chyba: ${e.message || "Nepodařilo se uložit asistenta"}`);
    } finally {
      setIsSavingAssistant(false);
    }
  };

  const handleDeleteAssistant = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("Opravdu chceš smazat tohoto asistenta? Tato akce je nevratná.")) return;
    
    systemLog("Mažu asistenta z databáze...");
    const avatarsPath = 'avatars';
    try {
      await deleteDoc(doc(db, avatarsPath, id));
      
      if (selectedProfileId === id) {
        setSelectedProfileId('');
        setIsEditingAssistant(false);
      }
      
      systemLog("Asistent smazán.");
    } catch (error) {
      console.error("Delete failed:", error);
      handleFirestoreError(error, OperationType.DELETE, `${avatarsPath}/${id}`);
      systemLog("Chyba při mazání asistenta.");
    }
  };

  const handleAddCustomPose = async () => {
    if (!newPoseName.trim() || !selectedAssistant) return;
    const cleanName = newPoseName.trim().toUpperCase().replace(/\s+/g, '_');
    
    // Check if pose exists
    if (selectedAssistant.avatarPoses?.[cleanName] || ['SPEAKING', 'THINKING', 'WAITING', 'FRIENDLY', 'SHOCKED', 'EXPLAIN', 'INTENSE', 'HAPPY', 'LAUGHING', 'CASUAL', 'TAKING_NOTES', 'HAPPY_TO_STUDY', 'TIRED_OF_STUDYING', 'WORKING_OUT', 'WITH_FRIEND', 'BORED', 'DRUNK'].includes(cleanName)) {
      systemLog("Tato póza již existuje.");
      return;
    }

    try {
      const avatarsPath = 'avatars';
      const avatarRef = doc(db, avatarsPath, selectedAssistant.uid);
      const newPoses = { ...(selectedAssistant.avatarPoses || {}), [cleanName]: "" };
      await setDoc(avatarRef, { avatarPoses: newPoses, ownerId: userProfile.uid }, { merge: true });
      
      if (userProfile.selectedAvatarId === selectedAssistant.uid) {
        const usersPath = 'users';
        const userRef = doc(db, usersPath, userProfile.uid);
        await setDoc(userRef, { avatarPoses: newPoses }, { merge: true });
        onUpdate({ ...userProfile, avatarPoses: newPoses });
      }
      
      setNewPoseName('');
      setIsAddingPose(false);
      systemLog(`Přidána nová pozice: ${cleanName}`);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'avatars/users');
      systemLog("Chyba při přidávání pozice.");
    }
  };

  const handleRenamePose = async (oldName: string) => {
    if (!selectedAssistant || !newPoseNameValue.trim() || oldName === newPoseNameValue.trim()) {
      setPoseBeingRenamed(null);
      return;
    }

    const newName = newPoseNameValue.trim().toUpperCase().replace(/\s+/g, '_');
    const updatedPoses = { ...(selectedAssistant.avatarPoses || {}) };
    const poseUrl = updatedPoses[oldName];
    
    delete updatedPoses[oldName];
    updatedPoses[newName] = poseUrl;

    const avatarsPath = 'avatars';
    try {
      const avatarRef = doc(db, avatarsPath, selectedAssistant.uid);
      await setDoc(avatarRef, { avatarPoses: updatedPoses }, { merge: true });
      
      if (userProfile.selectedAvatarId === selectedAssistant.uid) {
        const usersPath = 'users';
        const userRef = doc(db, usersPath, userProfile.uid);
        await setDoc(userRef, { avatarPoses: updatedPoses }, { merge: true });
        onUpdate({ ...userProfile, avatarPoses: updatedPoses });
      }
      
      systemLog(`Póza přejmenována na ${newName}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'avatars/users');
      systemLog("Chyba při přejmenování pózy.");
    } finally {
      setPoseBeingRenamed(null);
    }
  };

  const handleDeletePose = async (pose: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!selectedAssistant || !window.confirm(`Opravdu chceš smazat/skrýt pozici ${pose}?`)) return;

    try {
      const avatarsPath = 'avatars';
      const avatarRef = doc(db, avatarsPath, selectedAssistant.uid);
      const updatedPoses = { ...(selectedAssistant.avatarPoses || {}) };
      const pUrl = updatedPoses[pose];

      if (pUrl) {
        delete updatedPoses[pose];
        await setDoc(avatarRef, { avatarPoses: updatedPoses, ownerId: userProfile.uid }, { merge: true });
        
        if (userProfile.selectedAvatarId === selectedAssistant.uid) {
          const usersPath = 'users';
          const userRef = doc(db, usersPath, userProfile.uid);
          await setDoc(userRef, { avatarPoses: updatedPoses }, { merge: true });
          onUpdate({ ...userProfile, avatarPoses: updatedPoses });
        }
        systemLog(`Pozice ${pose} byla smazána.`);
      } else {
        // It's a suggestion. Hide it.
        const removed = selectedAssistant.removedSuggestions || [];
        if (!removed.includes(pose)) {
          removed.push(pose);
        }
        await updateDoc(avatarRef, { removedSuggestions: removed });
        systemLog(`Pozice ${pose} byla skryta.`);
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'avatars/users');
      systemLog("Chyba při mazání pozice.");
    }
  };

  return (
    <div className="max-w-7xl mx-auto py-10 px-8 flex flex-col h-full animate-fade overscroll-none">
      {/* Enhanced Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-16 gap-8 pb-10 border-b border-white/5 shrink-0">
        <div className="flex items-center gap-8">
          <div className="w-20 h-20 rounded-[2.5rem] bg-indigo-600 flex items-center justify-center shadow-2xl shadow-indigo-500/20 group hover:rotate-6 transition-all duration-500">
            <i className="fa-solid fa-user-gear text-white text-3xl"></i>
          </div>
          <div className="space-y-1">
            <h2 className="text-4xl font-black text-white uppercase tracking-tighter italic">Nastavení</h2>
          </div>
        </div>
        
        <div className="flex bg-black/40 p-2 rounded-[2.5rem] border border-white/5 shadow-2xl backdrop-blur-3xl">
          <button 
            onClick={() => setActiveTab('profile')}
            className={`px-12 py-5 rounded-[2rem] text-[11px] font-black uppercase tracking-widest transition-all ${activeTab === 'profile' ? 'bg-indigo-600 text-white shadow-2xl scale-105' : 'text-zinc-600 hover:text-zinc-400'}`}
          >
            Uživatel
          </button>
          <button 
            onClick={() => setActiveTab('assistant')}
            className={`px-12 py-5 rounded-[2rem] text-[11px] font-black uppercase tracking-widest transition-all ${activeTab === 'assistant' ? 'bg-indigo-600 text-white shadow-2xl scale-105' : 'text-zinc-600 hover:text-zinc-400'}`}
          >
            Asistenti
          </button>
        </div>
      </div>

      <div className="flex-grow min-h-0 relative">
          <AnimatePresence mode="wait">
            {activeTab === 'profile' ? (
              <motion.div 
                key="profile"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="h-full flex flex-col md:flex-row overflow-y-auto no-scrollbar"
              >
                {/* Compact Sidebar */}
                <div className="md:w-[280px] p-8 border-r border-white/5 flex flex-col items-center shrink-0 bg-black/20 backdrop-blur-md">
                   <div className="relative w-32 h-32 rounded-[2.5rem] bg-zinc-950 border border-white/10 overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex items-center justify-center mb-6 group transition-all duration-700 hover:rounded-[1.5rem]">
                       {photoURL ? (
                         <img src={photoURL} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" referrerPolicy="no-referrer" />
                       ) : (
                         <i className="fa-solid fa-user text-3xl text-zinc-800"></i>
                       )}
                       <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                   </div>
                   <div className="text-center space-y-1">
                       <h3 className="text-xl font-black text-white uppercase tracking-tighter italic truncate w-full px-4">{displayName || userProfile.email.split('@')[0]}</h3>
                       <p className="text-[9px] font-mono font-black uppercase tracking-[0.3em] text-indigo-500/60">{userProfile.email}</p>
                   </div>
                </div>

                {/* Content */}
                <div className="flex-grow p-10 lg:p-12 space-y-10 overflow-y-auto no-scrollbar">
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="space-y-4">
                        <label className="text-[10px] font-black uppercase tracking-[0.4em] text-zinc-600 ml-1">Jméno</label>
                        <input value={displayName} onChange={e => setDisplayName(e.target.value)} type="text" className="w-full bg-black/40 border border-white/5 rounded-2xl p-5 text-sm font-bold text-white focus:outline-none focus:border-indigo-500/40 transition-all placeholder:text-zinc-800" placeholder="Zadej své jméno" />
                      </div>
                      <div className="space-y-4">
                        <label className="text-[10px] font-black uppercase tracking-[0.4em] text-zinc-600 ml-1">Ročník</label>
                        <div className="flex bg-black/40 p-1.5 rounded-2xl border border-white/5">
                          {[1,2,3,4].map(r => (
                            <button 
                              key={r} 
                              onClick={() => setGrade(r)}
                              className={`flex-grow h-12 rounded-xl text-[10px] font-black transition-all ${grade === r ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-500/20 scale-[1.02]' : 'text-zinc-600 hover:text-zinc-400'}`}
                            >
                               {r}.
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-4 md:col-span-2">
                        <label className="text-[10px] font-black uppercase tracking-[0.4em] text-zinc-600 ml-1">O mně</label>
                        <textarea value={bio} onChange={e => setBio(e.target.value)} className="w-full bg-black/40 border border-white/5 rounded-[2.5rem] p-6 text-sm font-medium text-zinc-300 h-32 resize-none no-scrollbar focus:outline-none focus:border-indigo-500/40 transition-all placeholder:text-zinc-800" placeholder="Napiš o sobě pár slov..." />
                      </div>
                   </div>

                   <div className="pt-12 border-t border-white/5 flex items-center justify-between">
                      <div className="flex items-center gap-3 text-zinc-600">
                        <i className="fa-solid fa-shield-halved text-xs"></i>
                        <p className="text-[9px] font-black uppercase tracking-widest">Přihlášení zabezpečeno přes Google</p>
                      </div>
                      <button onClick={handleProfileSave} disabled={isSavingProfile} className="px-12 py-5 rounded-2xl bg-white text-black text-[10px] font-black uppercase tracking-[0.3em] hover:bg-zinc-200 transition-all shadow-[0_20px_50px_rgba(255,255,255,0.1)] disabled:opacity-50 active:scale-95">
                        {isSavingProfile ? 'Synchronizuji...' : 'Uložit'}
                      </button>
                   </div>
                </div>
              </motion.div>
            ) : (
              <motion.div 
                key="assistant"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="h-full flex overflow-hidden"
              >
                {/* Assistant Sidebar */}
                <div className="w-[300px] border-r border-white/5 overflow-y-auto no-scrollbar p-10 space-y-10 bg-black/40 backdrop-blur-md shrink-0">
                   <div className="flex items-center justify-between">
                      <p className="text-[10px] font-black uppercase tracking-[0.4em] text-indigo-500/60">Seznam asistentů</p>
                      <button 
                        onClick={() => {
                          const newId = `avatar_${Math.random().toString(36).substr(2, 9)}`;
                          setEditAssistantData({
                            uid: newId, 
                            ownerId: userProfile.uid,
                            displayName: 'Nový asistent', bio: '', avatarURL: '', avatarPoses: {}, stats: { intellect: 85, creativity: 90, stamina: 70, social: 75 }
                          });
                          setSelectedProfileId(newId);
                          setIsEditingAssistant(true);
                        }}
                        className="w-8 h-8 rounded-xl bg-white/5 text-zinc-500 flex items-center justify-center hover:bg-white hover:text-black transition-all shadow-lg shadow-black/50"
                      >
                        <i className="fa-solid fa-plus text-[12px]"></i>
                      </button>
                   </div>
                   <div className="space-y-6">
                      {profiles.map(p => (
                        <div 
                          key={p.uid} 
                          onClick={async () => {
                            setSelectedProfileId(p.uid);
                            setIsEditingAssistant(false);
                            if (userProfile.uid) {
                              const usersPath = 'users';
                              const userRef = doc(db, usersPath, userProfile.uid);
                              const updates = { selectedAvatarId: p.uid, avatarURL: p.avatarURL, avatarPoses: p.avatarPoses || {} };
                              try {
                                await updateDoc(userRef, updates);
                                onUpdate({ ...userProfile, ...updates });
                                systemLog("Asistent připojen.");
                              } catch (err) {
                                handleFirestoreError(err, OperationType.UPDATE, `${usersPath}/${userProfile.uid}`);
                              }
                            }
                          }}
                          className={`w-full group flex items-center gap-5 transition-all cursor-pointer p-4 rounded-[2rem] border ${selectedProfileId === p.uid ? 'bg-indigo-600/10 border-indigo-500/30 shadow-[0_15px_30px_rgba(79,70,229,0.1)]' : 'bg-transparent border-transparent opacity-40 hover:opacity-100 hover:bg-white/5'}`}
                        >
                           <div className={`w-14 h-14 rounded-2xl overflow-hidden border transition-all ${selectedProfileId === p.uid ? 'border-indigo-500 shadow-lg' : 'border-white/10 grayscale group-hover:grayscale-0'}`}>
                              <div className="w-full h-full bg-zinc-950 flex items-center justify-center">
                                {p.avatarURL ? (
                                  <img src={p.avatarURL} className="w-full h-full object-cover" />
                                ) : (
                                  <Gymi pose="FRIENDLY" size={35} className="opacity-20" />
                                )}
                              </div>
                           </div>
                           <div className="text-left py-1 flex-grow">
                              <p className="text-[11px] font-black uppercase tracking-wider text-white truncate w-24">{p.displayName}</p>
                              {selectedProfileId === p.uid ? (
                                <div className="flex items-center gap-1.5 mt-1">
                                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                  <span className="text-[8px] font-black text-emerald-500 uppercase tracking-widest">Aktivní</span>
                                </div>
                              ) : (
                                <p className="text-[8px] font-black text-zinc-600 uppercase tracking-widest mt-1">Standby Mode</p>
                              )}
                           </div>
                        </div>
                      ))}
                   </div>
                </div>

                {/* Assistant Content */}
                <div className="flex-grow overflow-y-auto p-10 lg:p-12 no-scrollbar">
                   {isEditingAssistant ? (
                     <div className="space-y-10 animate-fade">
                        <div className="flex items-center justify-between">
                            <div className="space-y-1">
                         <p className="text-[10px] font-black uppercase tracking-[0.4em] text-indigo-500">Konfigurace</p>
                         <h2 className="text-3xl font-black text-white uppercase tracking-tight italic">Upravit asistenta</h2>
                       </div>
                      <div className="flex gap-4">
                         <button onClick={() => setIsEditingAssistant(false)} className="px-6 py-3 rounded-2xl bg-white/5 border border-white/5 text-zinc-500 text-[10px] font-black uppercase tracking-widest hover:text-white transition-all">Storno</button>
                         <button onClick={handleAssistantSave} disabled={isSavingAssistant} className="px-8 py-3 rounded-2xl bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-indigo-500 transition-all shadow-xl shadow-indigo-500/20">
                            {isSavingAssistant ? 'Ukládám...' : 'Uložit'}
                         </button>
                      </div>
                   </div>
                   <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
                      <div className="lg:col-span-5 space-y-8">
                         <div className="aspect-[4/5] rounded-[3rem] bg-zinc-950 border border-white/5 overflow-hidden shadow-[0_30px_100px_rgba(0,0,0,0.8)] relative group">
                            {editAssistantData.avatarURL ? (
                              <img src={editAssistantData.avatarURL.startsWith('http') ? editAssistantData.avatarURL : `data:image/png;base64,${editAssistantData.avatarURL}`} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                            ) : (
                              <div className="w-full h-full flex flex-col items-center justify-center opacity-10 gap-6 text-white bg-gradient-to-b from-indigo-500/20 to-transparent">
                                 <i className="fa-solid fa-user-astronaut text-5xl"></i>
                                 <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Avatar</p>
                              </div>
                            )}
                            {isGeneratingAssistant && (
                              <div className="absolute inset-0 bg-black/80 backdrop-blur-md flex flex-col items-center justify-center gap-6">
                                 <div className="w-10 h-10 rounded-full border-2 border-indigo-500/20 border-t-indigo-500 animate-spin" />
                                 <p className="text-[10px] font-black uppercase tracking-[0.4em] text-indigo-400 animate-pulse">Generuji...</p>
                              </div>
                            )}
                         </div>
                         <div className="grid grid-cols-2 gap-4">
                            <button onClick={async () => {
                                 setIsGeneratingAssistant(true);
                                 try {
                                    const res = await generateAvatarPortrait(editAssistantData.bio, "standing");
                                    if (res) {
                                       const opt = await processAvatarImage(res);
                                       setEditAssistantData(prev => ({ ...prev, avatarURL: opt }));
                                    }
                                 } catch (e) { systemLog("Syntéza selhala."); }
                                 finally { setIsGeneratingAssistant(false); }
                              }}
                              className="py-4 rounded-2xl bg-indigo-600/10 border border-indigo-500/20 text-indigo-400 text-[10px] font-black uppercase tracking-widest hover:bg-indigo-600 hover:text-white transition-all flex items-center justify-center gap-3 shadow-lg active:scale-95"
                            >
                               <i className="fa-solid fa-wand-magic-sparkles text-xs"></i>
                               Vytvořit AI
                            </button>
                            <button onClick={() => fileInputRef.current?.click()} className="py-4 rounded-2xl bg-white/5 border border-white/10 text-white text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all flex items-center justify-center gap-3 shadow-lg active:scale-95">
                               <i className="fa-solid fa-upload text-xs"></i>
                               Nahrát
                            </button>
                            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={(e) => handleFileSelect(e, (url) => setEditAssistantData(prev => ({ ...prev, avatarURL: url })))} />
                         </div>
                      </div>
                      <div className="lg:col-span-7 space-y-8">
                         <div className="space-y-4">
                            <label className="text-[10px] font-black uppercase tracking-[0.4em] text-zinc-600 ml-1">Jméno</label>
                            <input value={editAssistantData.displayName} onChange={e => setEditAssistantData({...editAssistantData, displayName: e.target.value})} type="text" className="w-full bg-black/40 border border-white/5 rounded-2xl p-5 text-sm font-bold text-white focus:border-indigo-500/40 outline-none transition-all placeholder:text-zinc-800" placeholder="Jméno asistenta" />
                         </div>
                         <div className="space-y-4">
                            <label className="text-[10px] font-black uppercase tracking-[0.4em] text-zinc-600 ml-1">O mně</label>
                            <textarea value={editAssistantData.bio} onChange={e => setEditAssistantData({...editAssistantData, bio: e.target.value})} className="w-full bg-black/40 border border-white/5 rounded-[2rem] p-6 text-sm text-zinc-400 font-medium h-48 resize-none no-scrollbar focus:border-indigo-500/40 outline-none transition-all placeholder:text-zinc-800" placeholder="Napiš, jak se má asistent chovat..." />
                         </div>

                      </div>
                   </div>
                </div>
              ) : (
                <div className="space-y-12 animate-fade">
                   {selectedAssistant ? (
                     <>
                       <div className="flex gap-12 items-start bg-black/20 p-10 rounded-[3.5rem] border border-white/5 backdrop-blur-md relative overflow-hidden group">
                          <div className="absolute inset-x-0 -top-24 h-64 bg-indigo-600/5 blur-[100px] pointer-events-none rounded-full" />
                          <div className="w-40 aspect-[3/4] rounded-[2.5rem] bg-zinc-950 border border-white/10 overflow-hidden shadow-2xl shrink-0 group relative">
                             {selectedAssistant.avatarURL ? <img src={selectedAssistant.avatarURL} className="w-full h-full object-cover transition-all" /> : <div className="w-full h-full bg-zinc-950" />}
                          </div>
                          <div className="space-y-6 flex-grow pt-4 relative z-10">
                             <div className="space-y-2">
                                <p className="text-[11px] font-black uppercase tracking-[0.6em] text-indigo-500"></p>
                                <h2 className="text-5xl font-black text-white uppercase tracking-tighter leading-none italic">{selectedAssistant.displayName}</h2>
                             </div>
                             <p className="text-sm font-medium text-zinc-500 leading-relaxed max-w-2xl line-clamp-3">
                               {selectedAssistant.bio || "Tento asistent nemá žádný popis."}
                             </p>
                             <div className="flex gap-4">
                               {selectedAssistant.ownerId === userProfile.uid && (
                                 <button onClick={() => { setEditAssistantData(selectedAssistant); setIsEditingAssistant(true); }} className="px-8 py-4 rounded-2xl bg-white text-black text-[10px] font-black uppercase tracking-widest hover:bg-zinc-200 transition-all shadow-xl active:scale-95 flex items-center gap-3">
                                    <i className="fa-solid fa-sliders text-xs"></i>
                                    Upravit
                                 </button>
                               )}
                               <button 
                                 onClick={(e) => handleDeleteAssistant(selectedAssistant.uid, e)}
                                 className="px-8 py-4 rounded-2xl bg-red-600/10 text-red-500 text-[10px] font-black uppercase tracking-widest hover:bg-red-600 hover:text-white transition-all active:scale-95 border border-red-600/20"
                               >
                                  Smazat
                               </button>
                             </div>
                          </div>
                       </div>
                       
                       <div className="space-y-10 pt-10">
                          <div className="flex items-center justify-between">
                             <div className="space-y-1">
                               <h3 className="text-[11px] font-black uppercase tracking-[0.5em] text-zinc-600">Gesta a pózy</h3>
                               <p className="text-[9px] font-medium text-zinc-700 uppercase tracking-widest">Knihovna póz</p>
                             </div>
                             <div className="flex gap-4">
                               <button 
                                 onClick={() => setIsAddingPose(true)} 
                                 className="flex items-center gap-3 px-6 py-3.5 rounded-2xl bg-white/5 border border-white/10 text-white text-[10px] font-black uppercase tracking-widest hover:bg-white hover:text-black transition-all shadow-xl active:scale-95"
                               >
                                 <i className="fa-solid fa-plus text-xs text-indigo-500"></i>
                                 Přidat pózu
                               </button>
                               <button 
                                 onClick={() => bulkPoseInputRef.current?.click()} 
                                 disabled={isOrganizingPoses}
                                 className="flex items-center gap-3 px-8 py-3.5 rounded-2xl bg-indigo-600 shadow-[0_15px_40px_rgba(79,70,229,0.3)] text-white text-[10px] font-black uppercase tracking-widest hover:bg-indigo-500 hover:scale-105 transition-all disabled:opacity-50 active:scale-95"
                               >
                                 <i className={`fa-solid ${isOrganizingPoses ? 'fa-spinner fa-spin' : 'fa-brain-circuit'} text-[14px]`}></i>
                                 {isOrganizingPoses ? 'Probíhá Analýza...' : 'Synchronizovat pózy'}
                               </button>
                               <input 
                                 type="file" 
                                 ref={bulkPoseInputRef} 
                                 className="hidden" 
                                 multiple 
                                 accept="image/*" 
                                 onChange={handleBulkPoseUpload} 
                               />
                             </div>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
                                  <input 
                                    type="file" 
                                    ref={poseFileInputRef} 
                                    className="hidden" 
                                    accept="image/*" 
                                    onChange={(e) => {
                                      if (activePoseToUpload && selectedAssistant) {
                                        handleFileSelect(e, async (url) => {
                                          const avatarsPath = 'avatars';
                                          const avatarsRef = doc(db, avatarsPath, selectedAssistant.uid);
                                          const newPoses = { ...(selectedAssistant.avatarPoses || {}), [activePoseToUpload]: url };
                                          try {
                                            await setDoc(avatarsRef, { avatarPoses: newPoses, ownerId: userProfile.uid }, { merge: true });
                                            if (userProfile.selectedAvatarId === selectedAssistant.uid) {
                                              const usersPath = 'users';
                                              const userRef = doc(db, usersPath, userProfile.uid);
                                              await setDoc(userRef, { avatarPoses: newPoses }, { merge: true });
                                              onUpdate({ ...userProfile, avatarPoses: newPoses });
                                            }
                                            systemLog(`Póza ${activePoseToUpload} nahrána.`);
                                          } catch (err) {
                                            handleFirestoreError(err, OperationType.WRITE, 'avatars/users');
                                          }
                                        });
                                      }
                                    }} 
                                  />
                                  {(() => {
                                    const defaultList = ['SPEAKING', 'THINKING', 'WAITING', 'FRIENDLY', 'SHOCKED', 'HAPPY', 'LAUGHING', 'CASUAL', 'TAKING_NOTES', 'HAPPY_TO_STUDY', 'TIRED_OF_STUDYING', 'WORKING_OUT', 'WITH_FRIEND', 'BORED'];
                                    const activePoseKeys = Object.keys(selectedAssistant.avatarPoses || {});
                                    const removedSuggestions = selectedAssistant.removedSuggestions || [];
                                    
                                    // Poses that have actual images
                                    const activePoses = activePoseKeys.sort();
                                    
                                    // Suggestions that are NOT active yet and NOT removed
                                    const suggestedPoses = defaultList.filter(p => !activePoseKeys.includes(p) && !removedSuggestions.includes(p));
                                    
                                    // Combine: Active (with images) first, then Suggested (placeholders)
                                    const combinedPoses = [...activePoses, ...suggestedPoses];
                                    
                                    return combinedPoses.map(pose => {
                                      const pUrl = selectedAssistant.avatarPoses?.[pose];
                                      const isGenerating = generatingPoses.has(pose);
                                      const isRenaming = poseBeingRenamed === pose;
                                      
                                      return (
                                        <div key={pose} className="space-y-4 group cursor-pointer relative">
                                           <div className={`aspect-square rounded-[1.5rem] overflow-hidden border transition-all relative ${pUrl ? 'bg-zinc-950 border-indigo-500/40 shadow-2xl shadow-indigo-500/10' : 'bg-black/40 border-white/5 hover:border-white/20'}`}>
                                              {(pUrl || selectedAssistant.avatarURL) && <img src={pUrl || selectedAssistant.avatarURL} className={`w-full h-full object-cover transition-transform duration-500 group-hover:scale-110 ${pUrl ? '' : 'opacity-10 grayscale blur-[1px]'}`} />}
                                              {isGenerating && <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center"><div className="w-6 h-6 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" /></div>}
                                              
                                              {selectedAssistant.ownerId === userProfile.uid && (
                                                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-all bg-black/80 backdrop-blur-[2px] flex flex-col items-center justify-center gap-3 p-4">
                                                   {!isGenerating && (
                                                     <>
                                                       <button 
                                                         onClick={(e) => { e.stopPropagation(); handleAssistantPoseClick(pose); }}
                                                         className="w-full py-2 rounded-xl bg-indigo-600 text-white text-[9px] font-black uppercase tracking-widest hover:bg-indigo-500 shadow-lg"
                                                       >
                                                          Generovat
                                                       </button>
                                                       <button 
                                                         onClick={(e) => { 
                                                           e.stopPropagation(); 
                                                           setActivePoseToUpload(pose);
                                                           poseFileInputRef.current?.click();
                                                         }}
                                                         className="w-full py-2 rounded-xl bg-white text-black text-[9px] font-black uppercase tracking-widest hover:bg-zinc-200 shadow-lg"
                                                       >
                                                          Nahrát
                                                       </button>
                                                       <button 
                                                         onClick={(e) => handleDeletePose(pose, e)}
                                                         className="w-full py-2 rounded-xl bg-red-600/10 text-red-500 text-[9px] font-black uppercase tracking-widest hover:bg-red-600 hover:text-white border border-red-600/20"
                                                       >
                                                          {pUrl ? 'Smazat' : 'Skrýt'}
                                                       </button>
                                                     </>
                                                   )}
                                                </div>
                                              )}

                                              {pUrl && (
                                                <div className="absolute top-3 right-3 flex gap-1">
                                                   <div className="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_10px_rgba(79,70,229,1)]" />
                                                </div>
                                              )}
                                           </div>
                                           <div className="flex flex-col items-center gap-1.5 px-2">
                                              {isRenaming ? (
                                                <div className="flex items-center gap-2">
                                                  <input 
                                                    autoFocus
                                                    value={newPoseNameValue}
                                                    onChange={e => setNewPoseNameValue(e.target.value)}
                                                    onKeyDown={e => e.key === 'Enter' && handleRenamePose(pose)}
                                                    onBlur={() => handleRenamePose(pose)}
                                                    className="bg-white/10 border border-white/20 rounded px-1.5 py-0.5 text-[8px] font-black uppercase tracking-tighter text-white outline-none w-16"
                                                  />
                                                </div>
                                              ) : (
                                                <>
                                                  <p className={`text-[9px] font-black uppercase tracking-widest truncate ${pUrl ? 'text-zinc-300' : 'text-zinc-600'}`}>
                                                    {pose}
                                                  </p>
                                                  {pUrl && selectedAssistant.ownerId === userProfile.uid && (
                                                    <button 
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        setPoseBeingRenamed(pose);
                                                        setNewPoseNameValue(pose);
                                                      }}
                                                      className="opacity-0 group-hover:opacity-100 transition-all text-zinc-500 hover:text-cyan-500"
                                                    >
                                                       <i className="fa-solid fa-pen text-[7px]"></i>
                                                    </button>
                                                  )}
                                                </>
                                              )}
                                           </div>
                                        </div>
                                      );
                                    });
                                  })()}
                               </div>
                            </div>
                          </>
                        ) : (
                          <div className="h-full flex flex-col items-center justify-center text-zinc-700 opacity-20 text-center gap-6">
                             <i className="fa-solid fa-users-viewfinder text-8xl"></i>
                             <p className="text-2xl font-black text-white uppercase tracking-tighter italic">Není vybrán asistent</p>
                          </div>
                        )}
                   </div>
                   )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
    </div>
  );
};

export default ProfileSettings;
