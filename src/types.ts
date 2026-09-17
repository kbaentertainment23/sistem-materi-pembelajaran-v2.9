import { ThemeConfig } from './types/theme';

export type MaterialType = 'gdrive' | 'canva' | 'pdf' | 'youtube' | 'video' | 'gform' | 'other';

export interface Subject {
  id: string;
  name: string;
  code?: string;
  description?: string;
  icon?: string;
  color?: string;
  order: number;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctAnswerIndex: number;
  explanation?: string;
  cognitiveLevel?: string; // 'C1' | 'C2' | 'C3' | 'C4 (HOTS)'
}

export interface FlashcardItem {
  id: string;
  front: string;
  back: string;
}

export interface MaterialInteractiveConfig {
  enableGamification?: boolean; // System Level, EXP, Lencana 8 Dimensi & Daily Streak
  enableTimeAttack?: boolean;   // Mode Tantangan Waktu (15-30s) per soal
  timeAttackSeconds?: number;   // Durasi waktu per soal (default 30)
  enableLifelines?: boolean;    // Fitur Bantuan 50:50 & Petunjuk AI
  enableAITutor?: boolean;      // AI Tutor Companion (Analogi & Narasi Suara)
}

export interface TeacherAccount {
  id: string;
  name: string;
  nip?: string;
  username: string;
  password?: string;
  passwordHash?: string;
  subjectId: string;
  assignedClasses?: string[]; // e.g. ['7A', '7B', '8A']
  createdAt: string;
  updatedAt: string;
}

export interface Material {
  id: string;
  categoryId: string;
  title: string;
  type: MaterialType;
  originalUrl: string;
  embedUrl: string;
  order: number;
  description?: string;
  learningObjectives?: string; // Tujuan Pembelajaran (TP) / Indikator Capaian Materi
  targetGrade?: string; // e.g. 'smp-7' | 'smp-8' | 'smp-9' | 'sma-10' | 'sma-11' | 'sma-12' | 'sd-4-6' | 'umum'
  isPublished: boolean;
  reflectionQuestions?: string[];
  quizQuestions?: QuizQuestion[];
  quizBankQuestions?: QuizQuestion[];       // Pool 30 butir bank soal AI berbasis TP
  quizSelectedQuestionIds?: string[];      // ID butir soal terpilih kurasi guru (minimal 10)
  quizTargetClasses?: string[];            // Target kelas mini kuis ini (kosong = semua kelas)
  quizStatus?: 'draft' | 'published';      // Status kuis ('draft' atau 'published')
  quizRandomize?: boolean;                 // Urutan soal diacak otomatis untuk tiap siswa
  quizCuratedAt?: string;                  // Waktu kurasi / terbit terakhir
  flashcards?: FlashcardItem[];
  interactiveConfig?: MaterialInteractiveConfig;
  requirePreviousCompleted?: boolean; // If true, requires previous material or prerequisite to be completed
  prerequisiteMaterialId?: string;    // Specific material ID required before this material opens ('none', 'previous', or mat ID)
  gformSpreadsheetUrl?: string;       // Link Google Sheet Hasil Ujian / Respon Siswa (Khusus tipe Google Form)
  isAccessTimeRestricted?: boolean;   // Batasi akses pengerjaan berdasarkan jadwal waktu
  accessStartDate?: string;           // Tanggal & jam mulai akses ujian (format ISO / YYYY-MM-DDTHH:mm)
  accessEndDate?: string;             // Tanggal & jam batas akhir akses ujian (format ISO / YYYY-MM-DDTHH:mm)
  isManuallyUnlocked?: boolean;       // Status dibuka kembali / override manual oleh admin atau guru
  createdBy?: string; // ID or username of teacher/admin who created this
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  subjectId?: string;
  title: string;
  description: string;
  icon: string;
  color?: string;
  order: number;
  targetGrade?: string; // e.g. '7' | '8' | '9' | '10' | 'smp-7' | 'smp-8' | 'smp-9' | 'all' | 'umum'
  isPublished?: boolean; // If false, hidden/draft from student dashboard
  requirePreviousCompleted?: boolean; // If true, requires previous topic or specific prerequisite topic to be 100% completed
  prerequisiteCategoryId?: string;    // Specific category ID required before this topic opens ('none', 'previous', or category ID)
  createdBy?: string; // ID or username of teacher/admin who created this
  createdAt: string;
  updatedAt: string;
}

export interface StudentAccount {
  id: string;
  nama: string;
  kelas: string;
  noAbsen: string;
  nisn: string;
  username: string;
  password?: string;
  passwordHash?: string;
  isOnline?: boolean;
  lastActive?: string;
  lastLogin?: string;
  createdAt: string;
  updatedAt: string;
}

export type UserRole = 'admin' | 'teacher' | 'student';

export interface AuthSession {
  role: UserRole;
  teacher?: TeacherAccount;
  student?: StudentAccount;
}

export interface UserNote {
  materialId: string;
  content: string;
  updatedAt: string;
}

export interface UserProgress {
  completedMaterialIds: string[];
  notes: Record<string, string>; // materialId -> note text
}

export interface MaterialActivityLog {
  materialId: string;
  materialTitle: string;
  categoryId?: string;
  categoryTitle?: string;
  subjectId?: string;
  subjectName?: string;
  completedAt: string; // ISO string
  type?: MaterialType;
}

export interface StudentGamificationData {
  exp: number;
  level: number;
  unlockedBadges: string[];
  dailyStreak: number;
  lastActiveDate: string;
  quizzesCompleted: number;
  perfectQuizzes: number;
  flashcardsFlipped: number;
  updatedAt?: string;
}

export interface StudentProgressRecord {
  id?: string;
  studentId: string;
  studentName?: string;
  kelas?: string;
  completedMaterialIds: string[];
  completedMaterialTimestamps?: Record<string, string>; // materialId -> ISO string
  scores?: Record<string, number>;
  quizAttempts?: Record<string, any>;
  activityLogs?: MaterialActivityLog[];
  notes?: Record<string, string>;
  bookmarkedMaterialIds?: string[];
  gamification?: StudentGamificationData;
  updatedAt: string;
}

export interface AdminSettings {
  adminPin?: string;
  adminPinHash?: string;
  siteTitle: string;
  minQuizScoreToUnlock?: number; // Minimal jumlah jawaban benar mini kuis agar materi berikutnya terbuka (default 8 dari 10 soal)
  updatedAt: string;
}

export interface DatabaseJunkItem {
  id: string;
  type: 'orphan_progress' | 'orphan_category' | 'orphan_material' | 'stale_score' | 'invalid_student' | 'invalid_teacher';
  title: string;
  description: string;
  collection: string;
  rawDetails?: any;
}

export interface DatabaseJunkReport {
  scannedAt: string;
  totalJunkCount: number;
  orphanProgressCount: number;
  orphanCategoriesCount: number;
  orphanMaterialsCount: number;
  staleMaterialScoresCount: number;
  invalidStudentsCount: number;
  invalidTeachersCount: number;
  items: DatabaseJunkItem[];
  healthy: boolean;
}

export interface SystemBackupData {
  version: string;
  backupDate: string;
  systemName: string;
  subjects: Subject[];
  categories: Category[];
  materials: Material[];
  teachers: TeacherAccount[];
  students: StudentAccount[];
  studentProgress?: Record<string, StudentProgressRecord>;
  masterGrades?: Array<{ id: string; label: string; subLabel: string }>;
  masterClasses?: string[];
  adminSettings?: Partial<AdminSettings>;
  themeConfig?: ThemeConfig;
}
