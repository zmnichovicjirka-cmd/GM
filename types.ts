
export type UserRole = 'student' | 'teacher' | 'admin';

export interface Subject {
  id: string;
  name: string;
  icon: string;
  color: string;
  description?: string;
  isCustom?: boolean;
  target?: string;
  topic?: string;
}

export interface ScheduleItem {
  id: string;
  day: string; // 'Pondělí', 'Úterý', etc.
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  subject: string;
  topic?: string;
  completed: boolean;
}

export interface UserProfile {
  uid: string;
  email: string;
  isLoggedIn: boolean;
  role: UserRole;
  grade?: number; // 1-4
  displayName?: string;
  photoURL?: string;
  selectedAvatarId?: string; // ID of the shared assistant
  avatarURL?: string; // Cached assistant avatar URL
  avatarPoses?: { [poseName: string]: string }; // Cached assistant poses
  level?: number;
  xp?: number;
  maxXP?: number;
  bio?: string;
  status?: 'online' | 'offline' | 'away';
  language?: 'cs' | 'en';
  stats?: {
    intellect: number;
    creativity: number;
    stamina: number;
    social: number;
  };
  schedule?: ScheduleItem[];
  subjects?: Subject[];
}

export interface Assistant {
  uid: string;
  ownerId?: string; // ID of the user who created this assistant
  displayName: string;
  bio: string;
  avatarURL: string;
  avatarPoses: { [poseName: string]: string };
  removedSuggestions?: string[];
  stats: {
    intellect: number;
    creativity: number;
    stamina: number;
    social: number;
  };
  level?: number;
  xp?: number;
  maxXP?: number;
}

export interface UserApiKey {
  key: string;
  ownerId: string;
  sharedWith: string[];
}

export interface DbConfig {
  url: string;
  secret: string;
}

export interface MindMapNode {
  topic: string;
  details: string[];
}

export interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  topicTag?: string;
  type?: 'mcq' | 'truefalse';
  explanation?: string;
}

export interface QuizSet {
  id: string;
  title: string;
  questions: QuizQuestion[];
}

export interface Flashcard {
  front: string;
  back: string;
}

export interface Slide {
  title: string;
  content: string[];
}

export interface SummaryParagraph {
  text: string;
  question: string;
}

export interface StudyFile {
  name: string;
  mimeType: string;
  data: string; // base64
  analysis?: string;
  isAnalyzing?: boolean;
}

export interface YouTubeVideo {
  url: string;
  title: string | null;
  resolving: boolean;
  analysis?: string;
  transcript?: string;
}

export interface WebPage {
  url: string;
  title: string | null;
  resolving: boolean;
  analysis?: string;
}

export interface CurriculumTopic {
  id: string;
  title: string;
  summary: {
    what: string;
    how: string;
    why: string;
  };
  mustKnow: string[];
}

export interface CurriculumPlan {
  subject: string;
  grade: number;
  topics: CurriculumTopic[];
}

export interface StudyResult {
  title: string;
  learningGoal: string;
  whyImportant: string;
  prerequisites: string[];
  relatedTopics: string[];       
  enhancementSuggestions: string[]; 
  fullSummary: SummaryParagraph[];
  shortSummary?: string;
  lessonIntro?: {
    title?: string;
    description?: string;
    objectives?: string[];
    methodology: string;
    expectations: string;
    totalDuration: string;
    teachingPlan: { step: string; duration: string }[];
  };
  lessonContent?: { heading: string }[];
  transcript?: string;
  generatedImage?: string;
  mainAudio?: string; 
  topicIntro?: { subjectName: string; what: string; why: string };
  cheatSheet?: string[];
  mindMap?: MindMapNode[];
  quizzes?: QuizSet[];
  flashcards?: Flashcard[];
  slides?: Slide[];
  progress?: number | string; 
  youtubeVideos?: YouTubeVideo[];
  sources?: {uri: string, title: string}[];
  interactiveHighScores?: {
    easy: number;
    medium: number;
    hard: number;
  };
  visuals?: string[];
}

export interface SavedCurriculum {
  id: string;
  plan: CurriculumPlan;
  level: 'elementary' | 'high' | 'none';
  timestamp: number;
  results?: { [itemId: string]: number }; // itemId -> score percentage (0-100)
  isPublished?: boolean;
  authorId?: string;
  authorName?: string;
  likes?: number;
  saves?: number;
}

export interface UserSubjectList {
  uid: string;
  subjectIds: string[];
}

export interface EnhancedArchiveItem {
  id: string;
  type?: 'lesson' | 'curriculum';
  topic: string;
  topicId?: string;
  subject?: string;
  parentId?: string; // Links lesson to a curriculum
  image_url: string | null;
  videoUrl?: string | null;
  created_at: string;
  study_json?: StudyResult;
  curriculum_json?: SavedCurriculum;
  storageSource: 'cloud' | 'local';
  icon?: string;
  error?: string;
  files?: StudyFile[];
  images?: string[];
}

export interface VerifiedInfo {
  whatToLearn: string;
  bestWayToLearn: string;
  difficulty: 'easy' | 'medium' | 'hard';
  formulationAdvice: string;
  summary: string;
  facts: string[];
  sources: {uri: string, title: string}[];
}

export interface ProcessingState {
  isLoadingInitial: boolean;
  isLoadingExtra: boolean;
  isVerifying?: boolean;
  verifiedInfo?: VerifiedInfo | null;
  selectedSources: string[]; // URIs for Google Search sources
  selectedFiles: string[]; // Names of files
  selectedImages: number[]; // Indices of images
  selectedYtVideos: string[]; // URLs
  selectedWebPages: string[]; // URLs
  tone: 'student' | 'expert' | 'creative';
  isGeneratingImage?: boolean;
  isGeneratingAudio?: boolean;
  error: string | null;
  result: StudyResult | null;
  archiveId?: string;
}
