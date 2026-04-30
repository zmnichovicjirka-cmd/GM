
import { db as firestoreDb, auth as firebaseAuth } from "../firebase";
import { 
  collection, 
  addDoc, 
  getDocs, 
  deleteDoc, 
  doc, 
  query, 
  orderBy, 
  where,
  serverTimestamp,
  Timestamp,
  Firestore,
  limit as firestoreLimit,
  enableIndexedDbPersistence,
  getDocFromServer
} from "firebase/firestore";
import { DbConfig, StudyResult, EnhancedArchiveItem, SavedCurriculum, StudyFile } from "../types";
import { systemLog } from "./logService";
import firebaseConfig from "../firebase-applet-config.json";
import { uploadToCloudinary } from "./cloudinaryService";

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: firebaseAuth.currentUser?.uid,
      email: firebaseAuth.currentUser?.email,
      emailVerified: firebaseAuth.currentUser?.emailVerified,
      isAnonymous: firebaseAuth.currentUser?.isAnonymous,
      tenantId: firebaseAuth.currentUser?.tenantId,
      providerInfo: firebaseAuth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

let db: Firestore = firestoreDb;
let useFirestore = true;

const initPersistence = () => {
  try {
    systemLog("Konfiguruji lokální perzistenci...");
    enableIndexedDbPersistence(db).catch((err) => {
      systemLog(`Offline režim: ${err.code}`);
    });

    // Test connection as per guidelines
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration. ");
          systemLog("CHYBA: Firestore je offline. Zkontrolujte konfiguraci.");
        }
      }
    };
    testConnection();

  } catch (error: any) {
    systemLog(`CHYBA perzistence: ${error.message}`);
    console.error("❌ Firestore Persistence Error:", error);
  }
};

initPersistence();

const STORAGE_KEY = 'gymni_mate_archive';

export const ORACLE_SERVER_URL = firebaseConfig.projectId;
export const ORACLE_API_SECRET = "robust_registry_v7";

export const storeInArchive = async (
  config: DbConfig,
  data: {
    topic: string;
    topicId?: string;
    subject: string;
    originalImage: string | null;
    videoUrl: string | null;
    fullStudyResult: StudyResult;
    files?: StudyFile[];
    images?: string[];
    parentId?: string;
  }
) => {
  systemLog(`Optimalizuji a nahrávám materiály do Cloudu...`);
  
  // Parallel upload all assets to Cloudinary to avoid Firestore 1MB limit
  const [cloudOriginal, cloudGenerated, cloudAudio] = await Promise.all([
    uploadToCloudinary(data.originalImage, `original_${data.topic}`),
    uploadToCloudinary(data.fullStudyResult.generatedImage || null, `result_${data.topic}`),
    uploadToCloudinary(data.fullStudyResult.mainAudio || null, `audio_${data.topic}`)
  ]);

  let cloudImages: string[] = [];
  if (data.images && data.images.length > 0) {
    systemLog(`Nahrávám ${data.images.length} obrázků...`);
    cloudImages = await Promise.all(
      data.images.map((img, i) => uploadToCloudinary(img, `image_${i}_${data.topic}`) as Promise<string>)
    );
  }

  let cloudFiles: StudyFile[] = [];
  if (data.files && data.files.length > 0) {
    systemLog(`Nahrávám ${data.files.length} souborů...`);
    cloudFiles = await Promise.all(
      data.files.map(async (file) => {
        const url = await uploadToCloudinary(file.data, file.name);
        return { ...file, data: url || file.data };
      })
    );
  }
  
  const optimizedResult: StudyResult = {
    ...data.fullStudyResult,
    generatedImage: cloudGenerated || undefined,
    mainAudio: cloudAudio || undefined
  };

  let cloudId: string | undefined = undefined;
  const auth = firebaseAuth;

  if (useFirestore && db) {
    const path = "lessons";
    try {
      const colRef = collection(db, path);
      
      const docData = {
        topic: data.topic,
        topicId: data.topicId || '',
        subject: data.subject,
        parentId: data.parentId || '',
        video_url: data.videoUrl || '',
        study_json: JSON.stringify(optimizedResult),
        image_url: cloudOriginal,
        created_at: serverTimestamp(),
        projectId: firebaseConfig.projectId,
        uid: auth.currentUser?.uid || "guest",
        files: JSON.stringify(cloudFiles),
        images: JSON.stringify(cloudImages)
      };

      // Check size (approximate) - now mostly small URLs so it should pass
      let docDataStr = JSON.stringify(docData);
      if (docDataStr.length > 1000000) { 
        systemLog("VAROVÁNÍ: Lekce je stále příliš velká, ořezávám metadata...");
        // Stripping large binary fields if they failed to upload to Cloudinary and are still in base64
        const strippedResult = { 
          ...optimizedResult, 
          generatedImage: (optimizedResult.generatedImage?.length || 0) > 2000 ? undefined : optimizedResult.generatedImage,
          mainAudio: (optimizedResult.mainAudio?.length || 0) > 2000 ? undefined : optimizedResult.mainAudio
        };
        docData.study_json = JSON.stringify(strippedResult);
        // Also check files and images
        const strippedFiles = cloudFiles.map(f => (f.data.length > 2000 ? { ...f, data: '[Odkaz vypršel nebo je příliš velký]' } : f));
        const strippedImages = cloudImages.map(img => (img.length > 2000 ? '[Odkaz vypršel nebo je příliš velký]' : img));
        docData.files = JSON.stringify(strippedFiles);
        docData.images = JSON.stringify(strippedImages);
      }

      const docRef = await addDoc(colRef, docData);
      cloudId = docRef.id;
      systemLog("Synchronizace s cloudem OK.");
    } catch (e: any) {
      systemLog(`Cloud fail: ${e.code || e.message}`);
      handleFirestoreError(e, OperationType.WRITE, path);
    }
  }

  // Local mirror
  try {
    const rawData = localStorage.getItem(STORAGE_KEY);
    const archive = rawData ? JSON.parse(rawData) : [];
    const newItem = {
      id: cloudId || ("local_" + Math.random().toString(36).substring(2, 11)),
      topic: data.topic,
      topicId: data.topicId,
      subject: data.subject,
      parentId: data.parentId,
      image_url: cloudOriginal,
      created_at: new Date().toISOString(),
      study_json: JSON.stringify(optimizedResult),
      cloudId: cloudId,
      files: cloudFiles,
      images: cloudImages
    };
    archive.unshift(newItem);
    try {
      // Limit local backup to last 3 items and remove large fields for local storage
      const localBackupItem = { ...newItem };
      // Optional: you could strip even more data here if needed
      archive.unshift(localBackupItem);
      const trimmedArchive = archive.slice(0, 3); 
      
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmedArchive));
      systemLog("Lokální kopie uložena.");
    } catch (storageErr: any) {
      console.warn("LocalStorage quota exceeded, using Cloud-only mode for this session.", storageErr);
      systemLog("Poznámka: Lokální paměť plná, uloženo pouze v Cloudu.");
      // We don't throw here so the user sees success if Firebase worked
    }
    return { success: true, id: newItem.id };
  } catch (err: any) {
    // This catch only triggers if Firebase fails AND local recovery fails
    systemLog("Kritická chyba ukládání.");
    throw err;
  }
};

export const fetchArchive = async (config: DbConfig): Promise<{ archive: EnhancedArchiveItem[] }> => {
  systemLog("Načítám archivy (lekce i osnovy)...");
  let combinedCloud: EnhancedArchiveItem[] = [];
  const auth = firebaseAuth;
  
  if (useFirestore && db && auth.currentUser) {
    try {
      // 1. Fetch Lessons
      const lessonsCol = collection(db, "lessons");
      const lessonsQ = query(
        lessonsCol, 
        where("uid", "==", auth.currentUser.uid),
        orderBy("created_at", "desc"), 
        firestoreLimit(20)
      );
      const lessonsSnap = await getDocs(lessonsQ);
      const lessons: EnhancedArchiveItem[] = lessonsSnap.docs.map(docSnap => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          type: 'lesson',
          topic: data.topic,
          topicId: data.topicId,
          subject: data.subject,
          parentId: data.parentId,
          image_url: data.image_url,
          created_at: (data.created_at as Timestamp)?.toDate()?.toISOString() || null,
          study_json: JSON.parse(data.study_json),
          storageSource: 'cloud',
          files: data.files ? JSON.parse(data.files) : [],
          images: data.images ? JSON.parse(data.images) : []
        };
      });

      // 2. Fetch Curricula
      const currCol = collection(db, "curricula");
      const currQ = query(
        currCol, 
        where("authorId", "==", auth.currentUser.uid),
        orderBy("timestamp", "desc"), 
        firestoreLimit(20)
      );
      const currSnap = await getDocs(currQ);
      const curricula: EnhancedArchiveItem[] = currSnap.docs.map(docSnap => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          type: 'curriculum',
          topic: `Osnova: ${data.plan?.subject} (${(data.plan?.grade || 0)}. ročník)`,
          subject: data.plan?.subject,
          image_url: null,
          created_at: (data.timestamp as Timestamp)?.toDate()?.toISOString() || null,
          curriculum_json: { id: docSnap.id, ...data } as SavedCurriculum,
          storageSource: 'cloud'
        };
      });

      combinedCloud = [...lessons, ...curricula];
      systemLog(`Cloud: ${lessons.length} lekcí, ${curricula.length} osnov.`);
    } catch (e: any) {
      systemLog("Cloud fetch selhal.");
      handleFirestoreError(e, OperationType.GET, "lessons/curricula");
    }
  }

  const rawData = localStorage.getItem(STORAGE_KEY);
  const localRaw = rawData ? JSON.parse(rawData) : [];
  const localItems: EnhancedArchiveItem[] = localRaw.map((l: any) => ({
    ...l,
    type: 'lesson',
    parentId: l.parentId,
    study_json: JSON.parse(l.study_json),
    storageSource: 'local'
  }));

  const combined = [...combinedCloud, ...localItems.filter(l => !combinedCloud.some(c => c.topic === l.topic))];
  combined.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return { archive: combined };
};

export const deleteArchiveItem = async (config: DbConfig, id: string) => {
  systemLog(`Mažu položku ${id.substring(0, 5)}...`);
  const path = `lessons/${id}`;
  if (useFirestore && db && !id.startsWith('local_')) {
    try {
      await deleteDoc(doc(db, "lessons", id));
      systemLog("Cloud smazán.");
    } catch (e) {
      systemLog("Chyba smazání cloudu.");
      handleFirestoreError(e, OperationType.DELETE, path);
    }
  }
  const rawData = localStorage.getItem(STORAGE_KEY);
  if (rawData) {
    const archive = JSON.parse(rawData);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(archive.filter((i: any) => i.id !== id)));
  }
  return { success: true };
};

export const updateArchiveItem = async (config: DbConfig, id: string, updates: any) => {
  systemLog(`Aktualizuji položku ${id.substring(0, 5)}...`);
  const auth = firebaseAuth;
  
  if (useFirestore && db && !id.startsWith('local_') && auth.currentUser) {
    const path = `lessons/${id}`;
    try {
      const { updateDoc } = await import("firebase/firestore");
      const docRef = doc(db, "lessons", id);
      await updateDoc(docRef, updates);
      systemLog("Cloud aktualizován.");
    } catch (e) {
      systemLog("Chyba aktualizace cloudu.");
      handleFirestoreError(e, OperationType.UPDATE, path);
    }
  }
  
  const rawData = localStorage.getItem(STORAGE_KEY);
  if (rawData) {
    const archive = JSON.parse(rawData);
    const updatedArchive = archive.map((i: any) => i.id === id ? { ...i, ...updates } : i);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedArchive));
  }
  return { success: true };
};

export const testDbConnection = async (config: DbConfig) => {
  const auth = firebaseAuth;
  if (!useFirestore || !db || !auth.currentUser) return { status: "offline", error: "SDK Init Fail or No Auth" };
  const path = "lessons";
  try {
    const q = query(
      collection(db, path), 
      where("uid", "==", auth.currentUser.uid),
      firestoreLimit(1)
    );
    await getDocs(q);
    return { status: "online" };
  } catch (e: any) {
    return { status: "offline", error: e.message };
  }
};

export const fetchServerCode = async (config: DbConfig) => "# Unified Ver v10.13.2";
export const updateServerCode = async (config: DbConfig, code: string) => {};

// --- CURRICULUM FUNCTIONS ---
export const storeCurriculum = async (curriculum: Omit<SavedCurriculum, 'id'>) => {
  if (!useFirestore || !db) return { success: false, error: "Firestore not initialized" };
  const auth = firebaseAuth;
  if (!auth.currentUser) return { success: false, error: "Not authenticated" };

  try {
    const colRef = collection(db, "curricula");
    const docData = {
      ...curriculum,
      authorId: auth.currentUser.uid,
      isPublished: curriculum.isPublished ?? false,
      timestamp: serverTimestamp()
    };
    const docRef = await addDoc(colRef, docData);
    return { success: true, id: docRef.id };
  } catch (e: any) {
    handleFirestoreError(e, OperationType.WRITE, "curricula");
    return { success: false, error: e.message };
  }
};

export const fetchUserCurricula = async () => {
  if (!useFirestore || !db) return [];
  const auth = firebaseAuth;
  if (!auth.currentUser) return [];

  try {
    const colRef = collection(db, "curricula");
    const q = query(colRef, where("authorId", "==", auth.currentUser.uid), orderBy("timestamp", "desc"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SavedCurriculum));
  } catch (e: any) {
    handleFirestoreError(e, OperationType.GET, "curricula");
    return [];
  }
};

export const fetchPublishedCurricula = async () => {
  if (!useFirestore || !db) return [];
  try {
    const colRef = collection(db, "curricula");
    const q = query(colRef, where("isPublished", "==", true), orderBy("timestamp", "desc"), firestoreLimit(20));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SavedCurriculum));
  } catch (e: any) {
    handleFirestoreError(e, OperationType.GET, "curricula/published");
    return [];
  }
};

export const updateCurriculum = async (id: string, updates: Partial<SavedCurriculum>) => {
  if (!useFirestore || !db) return { success: false };
  try {
    const { updateDoc } = await import("firebase/firestore");
    const docRef = doc(db, "curricula", id);
    await updateDoc(docRef, updates);
    return { success: true };
  } catch (e: any) {
    handleFirestoreError(e, OperationType.UPDATE, `curricula/${id}`);
    return { success: false };
  }
};

// --- API KEY FUNCTIONS ---
export const saveUserApiConfig = async (data: { 
  key?: string, 
  cloudinaryCloudName?: string, 
  cloudinaryUploadPreset?: string,
  cloudinaryApiKey?: string,
  cloudinaryApiSecret?: string
}, sharedWith: string[] = []) => {
  if (!useFirestore || !db) return { success: false };
  const auth = firebaseAuth;
  if (!auth.currentUser) return { success: false };
  
  try {
    const { setDoc } = await import("firebase/firestore");
    const docRef = doc(db, "api_keys", auth.currentUser.uid);
    await setDoc(docRef, {
      ...data,
      ownerId: auth.currentUser.uid,
      sharedWith
    });
    return { success: true };
  } catch (e: any) {
    handleFirestoreError(e, OperationType.WRITE, "api_keys");
    return { success: false };
  }
};

export const fetchUserApiKeyData = async () => {
  if (!useFirestore || !db) return null;
  const auth = firebaseAuth;
  if (!auth.currentUser) return null;

  try {
    const docRef = doc(db, "api_keys", auth.currentUser.uid);
    const snap = await getDocFromServer(docRef);
    if (snap.exists()) return snap.data();
    return null;
  } catch (e) {
    return null;
  }
};

export const fetchEffectiveApiConfig = async (): Promise<{ 
  key?: string, 
  cloudinaryCloudName?: string, 
  cloudinaryUploadPreset?: string,
  cloudinaryApiKey?: string,
  cloudinaryApiSecret?: string
} | null> => {
  if (!useFirestore || !db) return null;
  const auth = firebaseAuth;
  if (!auth.currentUser) return null;

  try {
    // 1. Try to get my own key
    const docRef = doc(db, "api_keys", auth.currentUser.uid);
    const snap = await getDocFromServer(docRef);
    if (snap.exists()) {
      const data = snap.data();
      return { 
        key: data.key, 
        cloudinaryCloudName: data.cloudinaryCloudName, 
        cloudinaryUploadPreset: data.cloudinaryUploadPreset,
        cloudinaryApiKey: data.cloudinaryApiKey,
        cloudinaryApiSecret: data.cloudinaryApiSecret
      };
    }

    // 2. Try to find a key shared with me
    const q = query(
      collection(db, "api_keys"),
      where("sharedWith", "array-contains", auth.currentUser.email)
    );
    const sharedSnap = await getDocs(q);
    if (!sharedSnap.empty) {
      const data = sharedSnap.docs[0].data();
      return { 
        key: data.key, 
        cloudinaryCloudName: data.cloudinaryCloudName, 
        cloudinaryUploadPreset: data.cloudinaryUploadPreset,
        cloudinaryApiKey: data.cloudinaryApiKey,
        cloudinaryApiSecret: data.cloudinaryApiSecret
      };
    }

    return null;
  } catch (e) {
    return null;
  }
};
