
import React, { useState, useEffect, useRef } from 'react';
import { doc, updateDoc, setDoc, collection, onSnapshot, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { UserProfile, Assistant, Subject } from '../types';
import { handleFirestoreError, OperationType, saveUserApiConfig, fetchUserApiKeyData } from '../services/dbService';
import { motion, AnimatePresence } from 'motion/react';
import { systemLog } from '../services/logService';
import { generateAvatarPortrait, organizeAvatarPoses, setGlobalApiKey } from '../services/geminiService';
import Gymi from './Gymi';
import { uploadToCloudinary, setCloudinaryConfig } from '../services/cloudinaryService';

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

  // --- API Config State ---
  const [geminiKey, setGeminiKey] = useState('');
  const [cloudName, setCloudName] = useState('');
  const [uploadPreset, setUploadPreset] = useState('');
  const [cloudinaryApiKey, setCloudinaryApiKey] = useState('');
  const [cloudinaryApiSecret, setCloudinaryApiSecret] = useState('');
  const [emailToShare, setEmailToShare] = useState('');
  const [sharedEmails, setSharedEmails] = useState<string[]>([]);
  const [isLoadingKeys, setIsLoadingKeys] = useState(false);

  // Load API Keys
  useEffect(() => {
    const loadApiKeys = async () => {
      setIsLoadingKeys(true);
      try {
        const data = await fetchUserApiKeyData();
        if (data) {
          setGeminiKey(data.key || '');
          setCloudName(data.cloudinaryCloudName || '');
          setUploadPreset(data.cloudinaryUploadPreset || '');
          setCloudinaryApiKey(data.cloudinaryApiKey || '');
          setCloudinaryApiSecret(data.cloudinaryApiSecret || '');
          setSharedEmails(data.sharedWith || []);
        }
      } catch (e) {
        console.error("Failed to load API keys:", e);
      } finally {
        setIsLoadingKeys(false);
      }
    };
    loadApiKeys();
  }, [userProfile.uid]);

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
      // 1. Save standard profile info
      const userRef = doc(db, usersPath, userProfile.uid);
      const updates = { displayName, bio, photoURL, grade, status: 'online' as const };
      await updateDoc(userRef, updates);
      onUpdate({ ...userProfile, ...updates });

      // 2. Save API configurations
      await saveUserApiConfig({
        key: geminiKey,
        cloudinaryCloudName: cloudName,
        cloudinaryUploadPreset: uploadPreset,
        cloudinaryApiKey: cloudinaryApiKey,
        cloudinaryApiSecret: cloudinaryApiSecret
      }, sharedEmails);

      // 3. Update global services
      setGlobalApiKey(geminiKey);
      setCloudinaryConfig(cloudName, uploadPreset, cloudinaryApiKey, cloudinaryApiSecret);

      systemLog("Konfigurace a profil uloženy.");
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
    <div className="max-w-6xl mx-auto py-8 px-6 flex flex-col h-full animate-fade overscroll-none">
      {/* Refined Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-6 pb-6 border-b border-white/5 shrink-0">
        <div className="flex items-center gap-6">
          <div className="w-14 h-14 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-xl shadow-indigo-500/10 group hover:-rotate-6 transition-all duration-500">
            <i className="fa-solid fa-user-gear text-white text-xl"></i>
          </div>
          <div className="space-y-0.5">
            <p className="text-[10px] font-black uppercase tracking-[0.6em] text-indigo-500/60 leading-none mb-1">Systém</p>
            <h2 className="text-2xl font-black text-white uppercase tracking-tighter italic">Nastavení</h2>
          </div>
        </div>
        
        <div className="flex bg-black/40 p-1.5 rounded-2xl border border-white/5 shadow-xl backdrop-blur-3xl shrink-0">
          <button 
            onClick={() => setActiveTab('profile')}
            className={`px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'profile' ? 'bg-indigo-600 text-white shadow-lg' : 'text-zinc-600 hover:text-zinc-400'}`}
          >
            Uživatel
          </button>
          <button 
            onClick={() => setActiveTab('assistant')}
            className={`px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'assistant' ? 'bg-indigo-600 text-white shadow-lg' : 'text-zinc-600 hover:text-zinc-400'}`}
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
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="h-full flex flex-col lg:flex-row gap-6 overflow-y-auto no-scrollbar"
              >
                {/* Profile Card Integration */}
                <div className="lg:w-[320px] space-y-6 shrink-0">
                  <div className="p-6 rounded-[2rem] bg-black/40 border border-white/5 backdrop-blur-md flex flex-col items-center">
                    <div className="relative w-28 h-28 rounded-[2rem] bg-zinc-950 border border-white/10 overflow-hidden shadow-2xl flex items-center justify-center mb-6 group">
                        {photoURL ? (
                          <img src={photoURL} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" referrerPolicy="no-referrer" />
                        ) : (
                          <i className="fa-solid fa-user text-2xl text-zinc-800"></i>
                        )}
                        <div className="absolute inset-0 bg-indigo-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <div className="text-center space-y-1 w-full">
                        <h3 className="text-lg font-black text-white uppercase tracking-tighter italic truncate">{displayName || userProfile.email.split('@')[0]}</h3>
                        <p className="text-[9px] font-mono text-zinc-600 uppercase tracking-widest leading-none">{userProfile.email}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-3 w-full mt-8">
                       <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 text-center">
                          <p className="text-[8px] font-black text-indigo-500 uppercase tracking-widest mb-1">Úroveň</p>
                          <p className="text-lg font-black text-white uppercase">{grade}. <span className="text-[10px] text-zinc-600">ročník</span></p>
                       </div>
                       <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 text-center">
                          <p className="text-[8px] font-black text-cyan-500 uppercase tracking-widest mb-1">Status</p>
                          <p className="text-lg font-black text-white uppercase italic">Active</p>
                       </div>
                    </div>
                  </div>

                  <div className="p-6 rounded-[2rem] bg-white/[0.02] border border-white/5 space-y-4">
                    <div className="flex items-center justify-between">
                       <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">Informace</p>
                       <i className="fa-solid fa-circle-info text-zinc-800 text-[10px]"></i>
                    </div>
                    <p className="text-[10px] text-zinc-500 leading-relaxed italic">
                      Tato nastavení ovlivňují způsob, jakým s tebou Gymi komunikuje a jak se prezentuješ v rámci cloudu.
                    </p>
                  </div>
                </div>

                {/* Main Settings Grid */}
                <div className="flex-grow space-y-6 lg:overflow-y-auto no-scrollbar pb-10">
                   {/* Personal Info */}
                   <div className="p-8 rounded-[2.5rem] bg-black/20 border border-white/5 space-y-8">
                      <div className="flex items-center gap-3">
                         <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                            <i className="fa-solid fa-id-card text-xs"></i>
                         </div>
                         <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-white">Osobní Profi</h3>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-3">
                          <p className="text-[9px] font-black uppercase tracking-widest text-zinc-600 ml-1">Zobrazované Jméno</p>
                          <input 
                            value={displayName} 
                            onChange={e => setDisplayName(e.target.value)} 
                            type="text" 
                            className="w-full bg-black/40 border border-white/5 rounded-xl px-5 py-4 text-xs font-bold text-white focus:border-indigo-500/40 outline-none transition-all" 
                            placeholder="Zadej své jméno" 
                          />
                        </div>
                        <div className="space-y-3">
                          <p className="text-[9px] font-black uppercase tracking-widest text-zinc-600 ml-1">Školní Ročník</p>
                          <div className="flex bg-black/40 p-1 rounded-xl border border-white/5">
                            {[1,2,3,4].map(r => (
                              <button 
                                key={r} 
                                onClick={() => setGrade(r)}
                                className={`flex-grow h-10 rounded-lg text-[9px] font-black transition-all ${grade === r ? 'bg-indigo-600 text-white shadow-lg' : 'text-zinc-600 hover:text-zinc-400'}`}
                              >
                                 {r}.
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="space-y-3 md:col-span-2">
                          <p className="text-[9px] font-black uppercase tracking-widest text-zinc-600 ml-1">Bio / Popis Pozitivní Motivace</p>
                          <textarea 
                            value={bio} 
                            onChange={e => setBio(e.target.value)} 
                            className="w-full bg-black/40 border border-white/5 rounded-2xl p-5 text-xs font-medium text-zinc-400 h-24 resize-none focus:border-indigo-500/40 outline-none transition-all" 
                            placeholder="Napiš o sobě pár slov..." 
                          />
                        </div>
                      </div>
                   </div>

                   {/* Integrations */}
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Gemini */}
                      <div className="p-8 rounded-[2.5rem] bg-indigo-600/5 border border-indigo-500/10 space-y-6 shadow-xl">
                         <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                               <i className="fa-solid fa-brain text-indigo-400 text-sm"></i>
                               <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-indigo-400">Gemini Engine</h3>
                            </div>
                            <div className="px-2 py-1 rounded bg-indigo-500/10 text-[7px] font-black text-indigo-400 uppercase tracking-widest">v1.5 Pro/Flash</div>
                         </div>
                         
                         <div className="space-y-4">
                            <div className="space-y-2">
                              <p className="text-[9px] font-black uppercase tracking-widest text-zinc-600 ml-1">Vlastní API Klíč</p>
                              <input 
                                type="password"
                                value={geminiKey}
                                onChange={(e) => setGeminiKey(e.target.value)}
                                className="w-full bg-black/60 border border-white/5 rounded-xl px-4 py-3 text-[11px] font-mono text-indigo-400 focus:border-indigo-500 outline-none transition-all placeholder:text-zinc-800"
                                placeholder="sk-..."
                              />
                            </div>
                            
                            <div className="pt-4 border-t border-white/5">
                               <p className="text-[9px] font-black uppercase tracking-widest text-zinc-600 ml-1 mb-3">Sdílené Přístupy</p>
                               <div className="flex gap-2">
                                  <input 
                                    type="email"
                                    value={emailToShare}
                                    onChange={(e) => setEmailToShare(e.target.value)}
                                    className="flex-1 bg-black/60 border border-white/5 rounded-xl px-4 py-3 text-[11px] text-zinc-300 outline-none focus:border-indigo-500 transition-all"
                                    placeholder="email@shoda.cz"
                                  />
                                  <button onClick={() => {
                                    if (emailToShare && !sharedEmails.includes(emailToShare)) {
                                      setSharedEmails([...sharedEmails, emailToShare]);
                                      setEmailToShare('');
                                    }
                                  }} className="px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition-all active:scale-95">
                                    <i className="fa-solid fa-plus text-[10px]"></i>
                                  </button>
                               </div>
                               
                               {sharedEmails.length > 0 && (
                                 <div className="flex flex-wrap gap-2 mt-3">
                                    {sharedEmails.map(email => (
                                      <div key={email} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-600/10 border border-indigo-500/20 text-[8px] font-black text-indigo-400 uppercase italic">
                                        {email}
                                        <button onClick={() => setSharedEmails(sharedEmails.filter(e => e !== email))} className="hover:text-white transition-all"><i className="fa-solid fa-xmark"></i></button>
                                      </div>
                                    ))}
                                 </div>
                               )}
                            </div>
                         </div>
                      </div>

                      {/* Cloudinary */}
                      <div className="p-8 rounded-[2.5rem] bg-cyan-600/5 border border-cyan-500/10 space-y-6 shadow-xl">
                         <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                               <i className="fa-solid fa-image text-cyan-400 text-sm"></i>
                               <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-cyan-400">Media API</h3>
                            </div>
                            <div className="px-2 py-1 rounded bg-cyan-500/10 text-[7px] font-black text-cyan-400 uppercase tracking-widest">Cloudinary</div>
                         </div>
                         
                         <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-2">
                                <p className="text-[9px] font-black uppercase tracking-widest text-zinc-600 ml-1">Cloud Name</p>
                                <input 
                                  type="text"
                                  value={cloudName}
                                  onChange={(e) => setCloudName(e.target.value)}
                                  className="w-full bg-black/60 border border-white/5 rounded-xl px-4 py-3 text-[11px] font-mono text-cyan-400 focus:border-cyan-500 outline-none transition-all placeholder:text-zinc-800"
                                  placeholder="dg06..."
                                />
                              </div>
                              <div className="space-y-2">
                                <p className="text-[9px] font-black uppercase tracking-widest text-zinc-600 ml-1">API Key</p>
                                <input 
                                  type="text"
                                  value={cloudinaryApiKey}
                                  onChange={(e) => setCloudinaryApiKey(e.target.value)}
                                  className="w-full bg-black/60 border border-white/5 rounded-xl px-4 py-3 text-[11px] font-mono text-cyan-400 focus:border-cyan-500 outline-none transition-all placeholder:text-zinc-800"
                                />
                              </div>
                            </div>
                            <div className="space-y-2">
                              <p className="text-[9px] font-black uppercase tracking-widest text-zinc-600 ml-1">API Secret</p>
                              <input 
                                type="password"
                                value={cloudinaryApiSecret}
                                onChange={(e) => setCloudinaryApiSecret(e.target.value)}
                                className="w-full bg-black/60 border border-white/5 rounded-xl px-4 py-3 text-[11px] font-mono text-cyan-400 focus:border-cyan-500 outline-none transition-all placeholder:text-zinc-800"
                              />
                            </div>
                         </div>
                      </div>
                   </div>

                   {/* Save Bar */}
                   <div className="p-6 rounded-[2rem] bg-white/[0.03] border border-white/5 flex items-center justify-between backdrop-blur-xl">
                      <div className="flex items-center gap-4 text-zinc-600 ml-2">
                        <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                        <p className="text-[9px] font-black uppercase tracking-[0.2em]">Synchronizace Cloud Storage aktivní</p>
                      </div>
                      <button 
                        onClick={handleProfileSave} 
                        disabled={isSavingProfile} 
                        className="px-10 py-4 rounded-xl bg-indigo-600 text-white text-[10px] font-black uppercase tracking-[0.25em] hover:bg-indigo-500 transition-all shadow-xl shadow-indigo-500/20 disabled:opacity-50 active:scale-95"
                      >
                        {isSavingProfile ? 'UKLÁDÁM...' : 'ULOŽIT ZMĚNY'}
                      </button>
                   </div>
                </div>
              </motion.div>
            ) : (
              <motion.div 
                key="assistant"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="h-full flex flex-col lg:flex-row gap-6 overflow-hidden"
              >
                {/* Assistant Sidebar */}
                <div className="lg:w-[320px] rounded-[2rem] bg-black/40 border border-white/5 backdrop-blur-md flex flex-col overflow-hidden shrink-0">
                   <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                      <div className="space-y-0.5">
                        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-indigo-500/60 leading-none">Avatar</p>
                        <h3 className="text-sm font-black text-white uppercase tracking-widest italic">Knihovna</h3>
                      </div>
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
                        className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center hover:bg-indigo-500 transition-all shadow-lg active:scale-95"
                      >
                        <i className="fa-solid fa-plus text-xs"></i>
                      </button>
                   </div>
                   <div className="flex-grow overflow-y-auto no-scrollbar p-4 space-y-3">
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
                          className={`w-full group flex items-center gap-4 transition-all cursor-pointer p-3 rounded-2xl border ${selectedProfileId === p.uid ? 'bg-indigo-600/10 border-indigo-500/30' : 'bg-transparent border-transparent opacity-50 hover:opacity-100 hover:bg-white/5'}`}
                        >
                           <div className={`w-12 h-12 rounded-xl overflow-hidden border transition-all ${selectedProfileId === p.uid ? 'border-indigo-500 shadow-lg' : 'border-white/10 grayscale group-hover:grayscale-0'}`}>
                              <div className="w-full h-full bg-zinc-950 flex items-center justify-center">
                                {p.avatarURL ? (
                                  <img src={p.avatarURL} className="w-full h-full object-cover" />
                                ) : (
                                  <Gymi pose="FRIENDLY" size={24} className="opacity-20" />
                                )}
                              </div>
                           </div>
                           <div className="text-left flex-grow truncate">
                              <p className="text-[10px] font-black uppercase tracking-wider text-white truncate">{p.displayName}</p>
                              {selectedProfileId === p.uid && (
                                <p className="text-[7px] font-black text-emerald-500 uppercase tracking-widest leading-none mt-1">ACTIVE SYSTEM</p>
                              )}
                           </div>
                           {p.ownerId === userProfile.uid && (
                             <button onClick={(e) => handleDeleteAssistant(p.uid, e)} className="o-0 group-hover:o-100 p-2 text-zinc-800 hover:text-red-500 transition-all">
                               <i className="fa-solid fa-trash-can text-[10px]"></i>
                             </button>
                           )}
                        </div>
                      ))}
                   </div>
                </div>

                {/* Assistant Content Panel */}
                <div className="flex-grow overflow-y-auto no-scrollbar rounded-[2.5rem] bg-black/20 border border-white/5 p-8 lg:p-10">
                   {isEditingAssistant ? (
                     <div className="space-y-8 animate-fade">
                        <div className="flex items-center justify-between flex-wrap gap-4">
                             <div className="space-y-1">
                               <p className="text-[9px] font-black uppercase tracking-[0.4em] text-indigo-500">Konfigurace Jednotky</p>
                               <h2 className="text-2xl font-black text-white uppercase tracking-tight italic">Upravit Asistenta</h2>
                             </div>
                             <div className="flex gap-3">
                               <button onClick={() => setIsEditingAssistant(false)} className="px-6 py-3 rounded-xl bg-white/5 text-zinc-500 text-[9px] font-black uppercase tracking-widest hover:text-white transition-all">Storno</button>
                               <button onClick={handleAssistantSave} disabled={isSavingAssistant} className="px-8 py-3 rounded-xl bg-indigo-600 text-white text-[9px] font-black uppercase tracking-widest hover:bg-indigo-500 transition-all shadow-xl shadow-indigo-500/20">
                                  {isSavingAssistant ? 'Synchronizuji...' : 'Uložit Sestavu'}
                               </button>
                             </div>
                        </div>

                        <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
                           <div className="xl:col-span-4 space-y-6">
                              <div className="aspect-[4/5] rounded-[2rem] bg-zinc-950 border border-white/5 overflow-hidden shadow-2xl relative group">
                                 {editAssistantData.avatarURL ? (
                                   <img src={editAssistantData.avatarURL.startsWith('http') ? editAssistantData.avatarURL : `data:image/png;base64,${editAssistantData.avatarURL}`} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                                 ) : (
                                   <div className="w-full h-full flex flex-col items-center justify-center opacity-10 gap-4 text-white">
                                      <i className="fa-solid fa-user-astronaut text-4xl"></i>
                                      <p className="text-[8px] font-black uppercase tracking-widest">Master Visual</p>
                                   </div>
                                 )}
                                 {isGeneratingAssistant && (
                                   <div className="absolute inset-0 bg-black/80 backdrop-blur-md flex flex-col items-center justify-center gap-4">
                                      <div className="w-8 h-8 rounded-full border-2 border-indigo-500/20 border-t-indigo-500 animate-spin" />
                                      <p className="text-[8px] font-black uppercase tracking-[0.3em] text-indigo-400 animate-pulse">Analýza Generování...</p>
                                   </div>
                                 )}
                              </div>
                              <div className="grid grid-cols-2 gap-3">
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
                                   className="py-3.5 rounded-xl bg-indigo-600/10 border border-indigo-500/20 text-indigo-400 text-[9px] font-black uppercase tracking-widest hover:bg-indigo-600 hover:text-white transition-all flex items-center justify-center gap-3 active:scale-95"
                                 >
                                    <i className="fa-solid fa-wand-magic-sparkles text-[10px]"></i>
                                    AI GEN
                                 </button>
                                 <button onClick={() => fileInputRef.current?.click()} className="py-3.5 rounded-xl bg-white/5 border border-white/10 text-white text-[9px] font-black uppercase tracking-widest hover:bg-white/10 transition-all flex items-center justify-center gap-3 active:scale-95">
                                    <i className="fa-solid fa-upload text-[10px]"></i>
                                    NAHRÁT
                                 </button>
                                 <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={(e) => handleFileSelect(e, (url) => setEditAssistantData(prev => ({ ...prev, avatarURL: url })))} />
                              </div>
                           </div>
                           <div className="xl:col-span-8 space-y-6">
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
                     <div className="space-y-10 animate-fade">
                        {selectedAssistant ? (
                          <div className="space-y-10">
                            <div className="flex flex-col md:flex-row gap-8 items-start bg-black/40 p-6 xl:p-8 rounded-[2rem] border border-white/5 backdrop-blur-md relative overflow-hidden group">
                               <div className="absolute inset-x-0 -top-24 h-64 bg-indigo-600/5 blur-[100px] pointer-events-none rounded-full" />
                               
                               {/* Compact Image */}
                               <div className="w-32 xl:w-40 aspect-[4/5] rounded-2xl bg-zinc-950 border border-white/10 overflow-hidden shadow-2xl shrink-0 group relative self-center md:self-auto">
                                  {selectedAssistant.avatarURL ? (
                                    <img src={selectedAssistant.avatarURL} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center opacity-10">
                                       <i className="fa-solid fa-robot text-3xl"></i>
                                    </div>
                                  )}
                               </div>

                               <div className="flex-grow space-y-6">
                                  <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                                     <div className="space-y-1.5">
                                        <p className="text-[9px] font-black uppercase tracking-[0.5em] text-emerald-500 flex items-center gap-2">
                                           <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                           Active System Status
                                        </p>
                                        <h2 className="text-3xl xl:text-4xl font-black text-white uppercase tracking-tight italic leading-none">{selectedAssistant.displayName}</h2>
                                     </div>
                                     <div className="flex gap-2">
                                        {selectedAssistant.ownerId === userProfile.uid && (
                                          <button onClick={() => { setEditAssistantData(selectedAssistant); setIsEditingAssistant(true); }} className="px-5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-[9px] font-black uppercase tracking-widest hover:bg-white hover:text-black transition-all active:scale-95 flex items-center gap-2.5">
                                             <i className="fa-solid fa-pen-nib text-[9px]"></i>
                                             Upravit
                                          </button>
                                        )}
                                        <button 
                                          onClick={(e) => handleDeleteAssistant(selectedAssistant.uid, e)}
                                          className="px-5 py-2.5 rounded-xl bg-red-600/5 border border-red-600/20 text-red-500 text-[9px] font-black uppercase tracking-widest hover:bg-red-600 hover:text-white transition-all active:scale-95"
                                        >
                                           Smazat
                                        </button>
                                     </div>
                                  </div>

                                  <div className="max-w-2xl px-1">
                                     <p className="text-xs text-zinc-500 font-medium leading-relaxed italic opacity-80">
                                       {selectedAssistant.bio || "Systémový popis nedefinován..."}
                                     </p>
                                  </div>

                                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                     {[
                                       { label: 'Intellect', val: '95', icon: 'fa-brain' },
                                       { label: 'Energy', val: '80', icon: 'fa-bolt' },
                                       { label: 'Social', val: '70', icon: 'fa-comments' },
                                       { label: 'Active', val: 'YES', icon: 'fa-check' }
                                     ].map(s => (
                                       <div key={s.label} className="p-3 rounded-xl bg-white/[0.02] border border-white/5 flex items-center gap-3">
                                          <i className={`fa-solid ${s.icon} text-[10px] text-zinc-700`}></i>
                                          <div>
                                             <p className="text-[7px] font-black text-zinc-600 uppercase tracking-widest leading-none mb-1">{s.label}</p>
                                             <p className="text-[10px] font-black text-white">{s.val}</p>
                                          </div>
                                       </div>
                                     ))}
                                  </div>
                               </div>
                            </div>
                            
                            {/* Poses Area Redesign */}
                            <div className="space-y-8">
                               <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 border-b border-white/5 pb-8">
                                  <div className="space-y-1">
                                    <h3 className="text-sm font-black uppercase tracking-[0.3em] text-white italic">Knihovna Póziček</h3>
                                    <p className="text-[9px] font-black text-zinc-600 uppercase tracking-[0.4em]">Behaviorální Vizualizace</p>
                                  </div>
                                  <div className="flex flex-wrap gap-3">
                                    <button 
                                      onClick={() => setIsAddingPose(true)} 
                                      className="flex items-center gap-2.5 px-5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-[9px] font-black uppercase tracking-widest hover:bg-indigo-600 hover:border-indigo-500 transition-all active:scale-95"
                                    >
                                      <i className="fa-solid fa-plus text-[9px]"></i>
                                      Nový Slot
                                    </button>
                                    <button 
                                      onClick={() => bulkPoseInputRef.current?.click()} 
                                      disabled={isOrganizingPoses}
                                      className="flex items-center gap-2.5 px-6 py-2.5 rounded-xl bg-indigo-600 text-white text-[9px] font-black uppercase tracking-widest hover:bg-indigo-500 transition-all shadow-lg active:scale-95 disabled:opacity-50"
                                    >
                                      <i className={`fa-solid ${isOrganizingPoses ? 'fa-spinner fa-spin' : 'fa-wand-magic-sparkles'} text-[10px]`}></i>
                                      AI Auto-Sync
                                    </button>
                                    <input type="file" ref={bulkPoseInputRef} className="hidden" multiple accept="image/*" onChange={handleBulkPoseUpload} />
                                  </div>
                               </div>

                               <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-7 gap-4">
                                  <input type="file" ref={poseFileInputRef} className="hidden" accept="image/*" onChange={(e) => {
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
                                          } catch (err) { handleFirestoreError(err, OperationType.WRITE, 'avatars/users'); }
                                        });
                                      }
                                    }} 
                                  />
                                  {(() => {
                                    const defaultList = ['SPEAKING', 'THINKING', 'WAITING', 'FRIENDLY', 'SHOCKED', 'HAPPY', 'LAUGHING', 'CASUAL', 'TAKING_NOTES', 'HAPPY_TO_STUDY', 'TIRED_OF_STUDYING', 'WORKING_OUT', 'WITH_FRIEND', 'BORED'];
                                    const activePoseKeys = Object.keys(selectedAssistant.avatarPoses || {});
                                    const removedSuggestions = selectedAssistant.removedSuggestions || [];
                                    const combinedPoses = [...new Set([...activePoseKeys, ...defaultList])].filter(p => !removedSuggestions.includes(p)).sort();
                                    
                                    return combinedPoses.map(pose => {
                                      const pUrl = selectedAssistant.avatarPoses?.[pose];
                                      const isGenerating = generatingPoses.has(pose);
                                      return (
                                        <div key={pose} className="space-y-3 group cursor-pointer relative">
                                           <div className={`aspect-[4/5] rounded-xl overflow-hidden border transition-all relative ${pUrl ? 'bg-zinc-950 border-indigo-500/30' : 'bg-black/20 border-white/5 hover:border-white/10'}`}>
                                              {(pUrl || selectedAssistant.avatarURL) && <img src={pUrl || selectedAssistant.avatarURL} className={`w-full h-full object-cover transition-all duration-500 group-hover:scale-110 ${pUrl ? '' : 'opacity-10 grayscale'}`} />}
                                              {isGenerating && <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center"><div className="w-5 h-5 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" /></div>}
                                              
                                              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-all bg-black/80 backdrop-blur-[2px] flex flex-col items-center justify-center gap-1.5 p-3">
                                                 {!isGenerating && (
                                                   <>
                                                     <button onClick={(e) => { e.stopPropagation(); handleAssistantPoseClick(pose); }} className="w-full py-2 rounded-lg bg-indigo-600 text-white text-[8px] font-black uppercase tracking-widest hover:bg-indigo-500">GEN</button>
                                                     <button onClick={(e) => { e.stopPropagation(); setActivePoseToUpload(pose); poseFileInputRef.current?.click(); }} className="w-full py-2 rounded-lg bg-white/10 text-white text-[8px] font-black uppercase tracking-widest hover:bg-white/20">FILE</button>
                                                     <button onClick={(e) => handleDeletePose(pose, e)} className="w-full py-2 rounded-lg bg-red-600/10 text-red-500 text-[8px] font-black uppercase tracking-widest hover:bg-red-600 hover:text-white">DEL</button>
                                                   </>
                                                 )}
                                              </div>
                                           </div>
                                           <p className={`text-[8px] font-black uppercase tracking-widest text-center truncate ${pUrl ? 'text-zinc-400' : 'text-zinc-700'}`}>{pose}</p>
                                        </div>
                                      );
                                    });
                                  })()}
                               </div>
                            </div>
                          </div>
                        ) : (
                          <div className="h-full flex flex-col items-center justify-center text-zinc-800 opacity-20 text-center gap-4">
                             <i className="fa-solid fa-robot text-7xl"></i>
                             <p className="text-xl font-black uppercase tracking-tighter">Vyber jednotku</p>
                          </div>
                        )}
                     </div>
                   )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        
        {isAddingPose && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md">
            <div className="w-full max-w-sm bg-zinc-950 border border-white/5 rounded-3xl p-8 shadow-2xl animate-fade-up">
              <h3 className="text-xl font-black text-white uppercase tracking-tighter italic mb-6">Nová Póza</h3>
              <input value={newPoseName} onChange={e => setNewPoseName(e.target.value)} type="text" placeholder="JMÉNO_PÓZY" className="w-full bg-black border border-white/10 rounded-xl p-4 text-sm font-bold text-indigo-400 outline-none focus:border-indigo-500 mb-6" />
              <div className="flex gap-4">
                <button onClick={() => setIsAddingPose(false)} className="flex-1 py-4 text-[10px] font-black uppercase tracking-widest text-zinc-500 hover:text-white transition-all">Storno</button>
                <button onClick={handleAddCustomPose} className="flex-1 py-4 bg-indigo-600 rounded-xl text-[10px] font-black uppercase tracking-widest text-white shadow-lg">Přidat</button>
              </div>
            </div>
          </div>
        )}
    </div>
  );
};

export default ProfileSettings;
