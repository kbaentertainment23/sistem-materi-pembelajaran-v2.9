import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  deleteField,
  query,
  orderBy,
  where,
  writeBatch,
  onSnapshot,
} from 'firebase/firestore';
import { db, auth } from './firebase';
import { Subject, Category, Material, AdminSettings, TeacherAccount, StudentAccount, MaterialActivityLog, StudentProgressRecord, SystemBackupData, DatabaseJunkReport, DatabaseJunkItem } from '../types';
export type { StudentProgressRecord };
import { ThemeConfig, DEFAULT_THEME_CONFIG } from '../types/theme';
import { INITIAL_SUBJECTS, INITIAL_CATEGORIES, INITIAL_MATERIALS } from '../utils/initialData';
import { calculateStudentGamification, getCurrentLevelInfo } from '../utils/gamification';
import {
  hashCredential,
  verifyCredential,
  PIN_SALT,
  TEACHER_SALT,
  STUDENT_SALT,
  sanitizeTeacherForPublic,
  sanitizeStudentForPublic,
} from '../utils/security';
import {
  swrFetch,
  invalidateCache,
  setCacheData,
  getCacheData,
  getInitialCacheArray,
  getInitialCacheValue,
  clearAllSWRCache,
  useFirestoreSWR,
  subscribeToCache,
} from './swrCache';

export {
  swrFetch,
  invalidateCache,
  setCacheData,
  getCacheData,
  getInitialCacheArray,
  getInitialCacheValue,
  clearAllSWRCache,
  useFirestoreSWR,
  subscribeToCache,
};

export const CACHE_KEYS = {
  SUBJECTS: 'subjects',
  CATEGORIES: 'categories',
  MATERIALS: 'materials',
  MATERIALS_CAT: (catId: string) => `materials_cat_${catId}`,
  TEACHERS: 'teachers',
  STUDENTS: 'students',
  THEME_CONFIG: 'theme_config',
  MASTER_GRADES: 'master_grades',
  MASTER_CLASSES: 'master_classes',
  ADMIN_PIN: 'admin_pin',
  SETTINGS_PASSWORD: 'settings_password',
  SITE_LOGO: 'site_logo',
  MIN_QUIZ_SCORE: 'min_quiz_score',
  ALL_STUDENT_PROGRESS: 'all_student_progress',
  LEADERBOARD_SUMMARY: 'leaderboard_summary',
  STUDENT_PROGRESS: (studentId: string) => `student_progress_${studentId}`,
  STUDENT_PROGRESS_DETAILS: (studentId: string) => `student_progress_details_${studentId}`,
  STUDENT_QUIZ_SCORES: (studentId: string) => `student_quiz_scores_${studentId}`,
};

const SUBJECTS_COL = 'subjects';
const CATEGORIES_COL = 'categories';
const MATERIALS_COL = 'materials';
const SETTINGS_COL = 'settings';
const TEACHERS_COL = 'teachers';
const STUDENTS_COL = 'students';
const ADMIN_DOC_ID = 'admin_config';

export const DEFAULT_PIN = '12345';
export const DEFAULT_SETTINGS_PASSWORD = 'admin12345';
export const DEFAULT_MIN_QUIZ_SCORE = 8;

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map((provider) => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  return errInfo;
}

// Helper to strip undefined fields from objects, nested objects, and arrays before sending to Firestore
export function cleanFirestoreData<T extends Record<string, any>>(data: T): T {
  if (data === null || data === undefined) return data;
  if (typeof data !== 'object') return data;
  if (data instanceof Date) return data;

  if (Array.isArray(data)) {
    return data
      .map((item) => (typeof item === 'object' && item !== null && !(item instanceof Date) ? cleanFirestoreData(item) : item))
      .filter((item) => item !== undefined) as unknown as T;
  }

  const result: any = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      if (value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
        result[key] = cleanFirestoreData(value);
      } else if (Array.isArray(value)) {
        result[key] = value
          .map((item) => (typeof item === 'object' && item !== null && !(item instanceof Date) ? cleanFirestoreData(item) : item))
          .filter((item) => item !== undefined);
      } else {
        result[key] = value;
      }
    }
  }
  return result;
}

// Validation helpers for duplicate prevention
export async function validateTeacherUniqueness(
  username: string,
  nip?: string,
  excludeId?: string
): Promise<{ isValid: boolean; conflictReason?: string }> {
  const cleanUsername = (username || '').trim().toLowerCase();
  const cleanNip = (nip || '').trim();

  if (!cleanUsername) {
    return { isValid: false, conflictReason: 'Username guru tidak boleh kosong.' };
  }

  const allTeachers = await fetchTeachers();
  for (const t of allTeachers) {
    if (excludeId && t.id === excludeId) continue;
    if (t.username && t.username.trim().toLowerCase() === cleanUsername) {
      return {
        isValid: false,
        conflictReason: `Username "@${username.trim()}" sudah digunakan oleh guru "${t.name}". Silakan gunakan username lain.`,
      };
    }
    if (cleanNip && t.nip && t.nip.trim() !== '' && t.nip.trim() === cleanNip) {
      return {
        isValid: false,
        conflictReason: `NIP/NIK "${cleanNip}" sudah terdaftar atas nama guru "${t.name}".`,
      };
    }
  }
  return { isValid: true };
}

export async function validateStudentUniqueness(
  nisn: string,
  username?: string,
  excludeId?: string
): Promise<{ isValid: boolean; conflictReason?: string }> {
  const cleanNisn = (nisn || '').trim();
  const cleanUsername = (username || cleanNisn).trim().toLowerCase();

  if (!cleanNisn) {
    return { isValid: false, conflictReason: 'NIS siswa tidak boleh kosong.' };
  }

  const allStudents = await fetchStudents();
  for (const s of allStudents) {
    if (excludeId && s.id === excludeId) continue;
    if (s.nisn && s.nisn.trim() === cleanNisn) {
      return {
        isValid: false,
        conflictReason: `NIS "${cleanNisn}" sudah terdaftar atas nama "${s.nama}" (Kelas ${s.kelas}).`,
      };
    }
    const existingUser = (s.username || s.nisn || '').trim().toLowerCase();
    if (cleanUsername && existingUser && existingUser === cleanUsername) {
      return {
        isValid: false,
        conflictReason: `Username / ID login "@${cleanUsername}" sudah digunakan oleh siswa "${s.nama}".`,
      };
    }
  }
  return { isValid: true };
}

// Initialize default settings doc if needed
export async function seedInitialDataIfNeeded(): Promise<void> {
  try {
    // Settings doc
    const settingsRef = doc(db, SETTINGS_COL, ADMIN_DOC_ID);
    const settingsSnap = await getDoc(settingsRef);
    if (!settingsSnap.exists()) {
      const hashedPin = await hashCredential(DEFAULT_PIN, PIN_SALT);
      await setDoc(settingsRef, {
        adminPinHash: hashedPin,
        siteTitle: 'Sistem Pembelajaran Interaktif',
        minQuizScoreToUnlock: DEFAULT_MIN_QUIZ_SCORE,
        updatedAt: new Date().toISOString(),
      });
    } else {
      const data = settingsSnap.data();
      // Auto-migrate legacy plaintext PIN to secure SHA-256 hash
      if (!data.adminPinHash && data.adminPin) {
        const hashed = await hashCredential(data.adminPin, PIN_SALT);
        await updateDoc(settingsRef, {
          adminPinHash: hashed,
          adminPin: deleteField(),
          updatedAt: new Date().toISOString(),
        }).catch(console.warn);
      }
    }
  } catch (err) {
    console.warn('Error checking settings Firestore:', err);
  }
}

// Clear all data permanently from Firestore & localStorage
export async function clearAllFirestoreData(): Promise<void> {
  try {
    // Clear localStorage
    localStorage.removeItem('sistem_materi_subj_cache');
    localStorage.removeItem('sistem_materi_cat_cache');
    localStorage.removeItem('sistem_materi_mat_cache');
    localStorage.removeItem('sistem_materi_selected_subject_id');

    // Clear Subjects
    const subjSnap = await getDocs(collection(db, SUBJECTS_COL));
    if (!subjSnap.empty) {
      const batch = writeBatch(db);
      subjSnap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }

    // Clear Categories
    const catSnap = await getDocs(collection(db, CATEGORIES_COL));
    if (!catSnap.empty) {
      const batch = writeBatch(db);
      catSnap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }

    // Clear Materials
    const matSnap = await getDocs(collection(db, MATERIALS_COL));
    if (!matSnap.empty) {
      const batch = writeBatch(db);
      matSnap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  } catch (err) {
    console.warn('Error clearing Firestore data:', err);
  }
}

// Subject CRUD
export async function fetchSubjects(options?: { forceRevalidate?: boolean }): Promise<Subject[]> {
  return swrFetch(
    CACHE_KEYS.SUBJECTS,
    async () => {
      try {
        const q = query(collection(db, SUBJECTS_COL), orderBy('order', 'asc'));
        const snapshot = await getDocs(q);
        if (snapshot.empty) {
          return [];
        }
        return snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Subject));
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, SUBJECTS_COL);
        throw err;
      }
    },
    {
      staleTime: 30_000,
      forceRevalidate: options?.forceRevalidate,
      persistKey: 'sistem_materi_subj_cache',
    }
  );
}

export function subscribeSubjects(
  callback: (subjects: Subject[]) => void,
  onError?: (err: any) => void
): () => void {
  const q = query(collection(db, SUBJECTS_COL), orderBy('order', 'asc'));
  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Subject));
      setCacheData(CACHE_KEYS.SUBJECTS, items, 'sistem_materi_subj_cache', false);
      callback(items);
    },
    (error) => {
      console.error('[subscribeSubjects] onSnapshot error:', error);
      if (onError) onError(error);
      handleFirestoreError(error, OperationType.GET, SUBJECTS_COL);
    }
  );
  return unsubscribe;
}

export async function createSubject(subj: Omit<Subject, 'id' | 'createdAt' | 'updatedAt'>): Promise<Subject> {
  const newRef = doc(collection(db, SUBJECTS_COL));
  const newSubj: Subject = {
    ...subj,
    id: newRef.id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Immediate optimistic cache update
  setCacheData<Subject[]>(
    CACHE_KEYS.SUBJECTS,
    (prev = []) => {
      const exists = prev.some((s) => s.id === newSubj.id);
      const next = exists ? prev.map((s) => (s.id === newSubj.id ? newSubj : s)) : [...prev, newSubj];
      return next.sort((a, b) => (a.order || 0) - (b.order || 0));
    },
    'sistem_materi_subj_cache',
    true
  );

  try {
    await setDoc(newRef, cleanFirestoreData(newSubj));
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `${SUBJECTS_COL}/${newSubj.id}`);
    throw err;
  }
  return newSubj;
}

export async function updateSubject(id: string, updates: Partial<Subject>): Promise<void> {
  const now = new Date().toISOString();
  // Immediate optimistic cache update
  setCacheData<Subject[]>(
    CACHE_KEYS.SUBJECTS,
    (prev = []) => {
      const next = prev.map((s) => (s.id === id ? { ...s, ...updates, updatedAt: now } : s));
      return next.sort((a, b) => (a.order || 0) - (b.order || 0));
    },
    'sistem_materi_subj_cache',
    true
  );

  try {
    const ref = doc(db, SUBJECTS_COL, id);
    await updateDoc(ref, cleanFirestoreData({
      ...updates,
      updatedAt: now,
    }));
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `${SUBJECTS_COL}/${id}`);
    throw err;
  }
}

export async function deleteSubject(id: string): Promise<void> {
  // Immediate optimistic cache update
  setCacheData<Subject[]>(
    CACHE_KEYS.SUBJECTS,
    (prev = []) => prev.filter((s) => s.id !== id),
    'sistem_materi_subj_cache',
    true
  );
  setCacheData<Category[]>(
    CACHE_KEYS.CATEGORIES,
    (prev = []) => prev.filter((c) => c.subjectId !== id),
    'sistem_materi_cat_cache',
    true
  );

  try {
    const ref = doc(db, SUBJECTS_COL, id);
    await deleteDoc(ref);

    // Also update or delete categories linked to this subject
    const catQ = query(collection(db, CATEGORIES_COL), where('subjectId', '==', id));
    const catSnap = await getDocs(catQ);
    if (!catSnap.empty) {
      const batch = writeBatch(db);
      catSnap.docs.forEach((docSnap) => batch.delete(docSnap.ref));
      await batch.commit();
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `${SUBJECTS_COL}/${id}`);
    throw err;
  }
}

// Category CRUD
export async function fetchCategories(options?: { forceRevalidate?: boolean }): Promise<Category[]> {
  return swrFetch(
    CACHE_KEYS.CATEGORIES,
    async () => {
      try {
        const q = query(collection(db, CATEGORIES_COL), orderBy('order', 'asc'));
        const snapshot = await getDocs(q);
        return snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Category));
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, CATEGORIES_COL);
        throw err;
      }
    },
    {
      staleTime: 30_000,
      forceRevalidate: options?.forceRevalidate,
      persistKey: 'sistem_materi_cat_cache',
    }
  );
}

export function subscribeCategories(
  callback: (categories: Category[]) => void,
  onError?: (err: any) => void
): () => void {
  const q = query(collection(db, CATEGORIES_COL), orderBy('order', 'asc'));
  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Category));
      setCacheData(CACHE_KEYS.CATEGORIES, items, 'sistem_materi_cat_cache', false);
      callback(items);
    },
    (error) => {
      console.error('[subscribeCategories] onSnapshot error:', error);
      if (onError) onError(error);
      handleFirestoreError(error, OperationType.GET, CATEGORIES_COL);
    }
  );
  return unsubscribe;
}

export async function createCategory(cat: Omit<Category, 'id' | 'createdAt' | 'updatedAt'>): Promise<Category> {
  const newRef = doc(collection(db, CATEGORIES_COL));
  const newCat: Category = {
    ...cat,
    id: newRef.id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Immediate optimistic cache update
  setCacheData<Category[]>(
    CACHE_KEYS.CATEGORIES,
    (prev = []) => {
      const exists = prev.some((c) => c.id === newCat.id);
      const next = exists ? prev.map((c) => (c.id === newCat.id ? newCat : c)) : [...prev, newCat];
      return next.sort((a, b) => (a.order || 0) - (b.order || 0));
    },
    'sistem_materi_cat_cache',
    true
  );

  try {
    await setDoc(newRef, cleanFirestoreData(newCat));
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `${CATEGORIES_COL}/${newCat.id}`);
    throw err;
  }
  return newCat;
}

export async function updateCategory(id: string, updates: Partial<Category>): Promise<void> {
  const now = new Date().toISOString();
  // Immediate optimistic cache update so any component reads the latest data with zero delay
  setCacheData<Category[]>(
    CACHE_KEYS.CATEGORIES,
    (prev = []) => {
      const next = prev.map((c) => (c.id === id ? { ...c, ...updates, updatedAt: now } : c));
      return next.sort((a, b) => (a.order || 0) - (b.order || 0));
    },
    'sistem_materi_cat_cache',
    true
  );

  try {
    const ref = doc(db, CATEGORIES_COL, id);
    await updateDoc(ref, cleanFirestoreData({
      ...updates,
      updatedAt: now,
    }));
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `${CATEGORIES_COL}/${id}`);
    throw err;
  }
}

export async function deleteCategory(id: string): Promise<void> {
  // Immediate optimistic cache update
  setCacheData<Category[]>(
    CACHE_KEYS.CATEGORIES,
    (prev = []) => prev.filter((c) => c.id !== id),
    'sistem_materi_cat_cache',
    true
  );
  setCacheData<Material[]>(
    CACHE_KEYS.MATERIALS,
    (prev = []) => prev.filter((m) => m.categoryId !== id),
    'sistem_materi_mat_cache',
    true
  );

  try {
    const ref = doc(db, CATEGORIES_COL, id);
    await deleteDoc(ref);

    // Also delete associated materials
    const matQ = query(collection(db, MATERIALS_COL), where('categoryId', '==', id));
    const matSnap = await getDocs(matQ);
    if (!matSnap.empty) {
      const batch = writeBatch(db);
      matSnap.docs.forEach((docSnap) => batch.delete(docSnap.ref));
      await batch.commit();
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `${CATEGORIES_COL}/${id}`);
    throw err;
  }
}

// Material CRUD
export async function fetchMaterials(
  categoryId?: string,
  options?: { forceRevalidate?: boolean }
): Promise<Material[]> {
  if (categoryId) {
    if (!options?.forceRevalidate) {
      const allCached = getCacheData<Material[]>(CACHE_KEYS.MATERIALS, 'sistem_materi_mat_cache');
      if (allCached && Array.isArray(allCached) && allCached.length > 0) {
        return allCached.filter((m) => m.categoryId === categoryId);
      }
    }
    return swrFetch(
      CACHE_KEYS.MATERIALS_CAT(categoryId),
      async () => {
        try {
          const q = query(collection(db, MATERIALS_COL), where('categoryId', '==', categoryId), orderBy('order', 'asc'));
          const snapshot = await getDocs(q);
          return snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Material));
        } catch (err) {
          handleFirestoreError(err, OperationType.GET, MATERIALS_COL);
          throw err;
        }
      },
      {
        staleTime: 30_000,
        forceRevalidate: options?.forceRevalidate,
      }
    );
  }

  return swrFetch(
    CACHE_KEYS.MATERIALS,
    async () => {
      try {
        const q = query(collection(db, MATERIALS_COL), orderBy('order', 'asc'));
        const snapshot = await getDocs(q);
        return snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Material));
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, MATERIALS_COL);
        throw err;
      }
    },
    {
      staleTime: 30_000,
      forceRevalidate: options?.forceRevalidate,
      persistKey: 'sistem_materi_mat_cache',
    }
  );
}

export function subscribeMaterials(
  callback: (materials: Material[]) => void,
  onError?: (err: any) => void
): () => void {
  const q = query(collection(db, MATERIALS_COL), orderBy('order', 'asc'));
  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Material));
      setCacheData(CACHE_KEYS.MATERIALS, items, 'sistem_materi_mat_cache', false);
      callback(items);
    },
    (error) => {
      console.error('[subscribeMaterials] onSnapshot error:', error);
      if (onError) onError(error);
      handleFirestoreError(error, OperationType.GET, MATERIALS_COL);
    }
  );
  return unsubscribe;
}

export async function createMaterial(mat: Omit<Material, 'id' | 'createdAt' | 'updatedAt'>): Promise<Material> {
  const newRef = doc(collection(db, MATERIALS_COL));
  const newMat: Material = {
    ...mat,
    id: newRef.id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Immediate optimistic cache update
  setCacheData<Material[]>(
    CACHE_KEYS.MATERIALS,
    (prev = []) => {
      const exists = prev.some((m) => m.id === newMat.id);
      const next = exists ? prev.map((m) => (m.id === newMat.id ? newMat : m)) : [...prev, newMat];
      return next.sort((a, b) => (a.order || 0) - (b.order || 0));
    },
    'sistem_materi_mat_cache',
    true
  );

  try {
    await setDoc(newRef, cleanFirestoreData(newMat));
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `${MATERIALS_COL}/${newMat.id}`);
    throw err;
  }
  return newMat;
}

export async function updateMaterial(id: string, updates: Partial<Material>): Promise<void> {
  const now = new Date().toISOString();
  // Immediate optimistic cache update so any component sees newest values with 0ms delay
  setCacheData<Material[]>(
    CACHE_KEYS.MATERIALS,
    (prev = []) => {
      const next = prev.map((m) => (m.id === id ? { ...m, ...updates, updatedAt: now } : m));
      return next.sort((a, b) => (a.order || 0) - (b.order || 0));
    },
    'sistem_materi_mat_cache',
    true
  );

  try {
    const ref = doc(db, MATERIALS_COL, id);
    await updateDoc(ref, cleanFirestoreData({
      ...updates,
      updatedAt: now,
    }));
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `${MATERIALS_COL}/${id}`);
    throw err;
  }
}

export async function deleteMaterial(id: string): Promise<void> {
  // Immediate optimistic cache update
  setCacheData<Material[]>(
    CACHE_KEYS.MATERIALS,
    (prev = []) => prev.filter((m) => m.id !== id),
    'sistem_materi_mat_cache',
    true
  );

  try {
    const ref = doc(db, MATERIALS_COL, id);
    await deleteDoc(ref);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `${MATERIALS_COL}/${id}`);
    throw err;
  }
}


// Admin PIN Settings & Secure Verification
export async function verifyAdminPin(enteredPin: string): Promise<boolean> {
  const clean = (enteredPin || '').trim();
  if (!clean) return false;

  try {
    const settingsRef = doc(db, SETTINGS_COL, ADMIN_DOC_ID);
    const snap = await getDoc(settingsRef);
    if (snap.exists()) {
      const data = snap.data();
      const storedHash = data.adminPinHash;
      const storedPlain = data.adminPin;

      if (storedHash) {
        return await verifyCredential(clean, storedHash, PIN_SALT);
      }

      if (storedPlain) {
        const isValid = await verifyCredential(clean, storedPlain, PIN_SALT);
        if (isValid) {
          // Seamlessly upgrade legacy plaintext PIN to SHA-256 hash in Firestore
          const hashed = await hashCredential(clean, PIN_SALT);
          await updateDoc(settingsRef, {
            adminPinHash: hashed,
            adminPin: deleteField(),
            updatedAt: new Date().toISOString(),
          }).catch(console.warn);
        }
        return isValid;
      }
    }

    // Default PIN verification
    const isDefault = clean === DEFAULT_PIN;
    if (isDefault) {
      const hashed = await hashCredential(DEFAULT_PIN, PIN_SALT);
      await setDoc(
        settingsRef,
        {
          adminPinHash: hashed,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      ).catch(console.warn);
    }
    return isDefault;
  } catch (err) {
    console.error('Error verifying admin PIN:', err);
    return clean === DEFAULT_PIN;
  }
}

export async function getAdminPin(): Promise<string> {
  return '••••••••';
}

export async function setAdminPin(newPin: string): Promise<void> {
  const clean = (newPin || '').trim();
  if (!clean) return;

  const hashed = await hashCredential(clean, PIN_SALT);
  const settingsRef = doc(db, SETTINGS_COL, ADMIN_DOC_ID);
  await setDoc(
    settingsRef,
    {
      adminPinHash: hashed,
      adminPin: deleteField(),
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );
  invalidateCache(CACHE_KEYS.ADMIN_PIN);
}

// Settings Password
export async function verifySettingsPassword(enteredPassword: string): Promise<boolean> {
  const clean = (enteredPassword || '').trim();
  if (!clean) return false;

  try {
    const settingsRef = doc(db, SETTINGS_COL, ADMIN_DOC_ID);
    const snap = await getDoc(settingsRef);
    if (snap.exists()) {
      const data = snap.data();
      const storedHash = data.settingsPasswordHash;
      const storedPlain = data.settingsPassword;

      if (storedHash) {
        return await verifyCredential(clean, storedHash, PIN_SALT);
      }
      if (storedPlain) {
        const isValid = await verifyCredential(clean, storedPlain, PIN_SALT);
        if (isValid) {
          const hashed = await hashCredential(clean, PIN_SALT);
          await updateDoc(settingsRef, {
            settingsPasswordHash: hashed,
            settingsPassword: deleteField(),
            updatedAt: new Date().toISOString(),
          }).catch(console.warn);
        }
        return isValid;
      }
    }
    return clean === DEFAULT_SETTINGS_PASSWORD;
  } catch (err) {
    return clean === DEFAULT_SETTINGS_PASSWORD;
  }
}

export async function getSettingsPassword(): Promise<string> {
  return '••••••••';
}

export async function setSettingsPassword(newPassword: string): Promise<void> {
  const clean = (newPassword || '').trim();
  if (!clean) return;

  const hashed = await hashCredential(clean, PIN_SALT);
  const settingsRef = doc(db, SETTINGS_COL, ADMIN_DOC_ID);
  await setDoc(
    settingsRef,
    {
      settingsPasswordHash: hashed,
      settingsPassword: deleteField(),
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );
  invalidateCache(CACHE_KEYS.SETTINGS_PASSWORD);
}

// Site Logo Settings
export async function getSiteLogoUrl(): Promise<string> {
  return swrFetch(
    CACHE_KEYS.SITE_LOGO,
    async () => {
      const settingsRef = doc(db, SETTINGS_COL, ADMIN_DOC_ID);
      const snap = await getDoc(settingsRef);
      if (snap.exists() && snap.data().logoUrl !== undefined) {
        return snap.data().logoUrl;
      }
      return '';
    },
    {
      staleTime: 900_000,
      persistKey: 'sistem_materi_logo_url',
    }
  );
}

export async function setSiteLogoUrl(logoUrl: string): Promise<void> {
  const settingsRef = doc(db, SETTINGS_COL, ADMIN_DOC_ID);
  await setDoc(
    settingsRef,
    {
      logoUrl: logoUrl,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );
  setCacheData(CACHE_KEYS.SITE_LOGO, logoUrl, 'sistem_materi_logo_url');
}

// Minimum Quiz Score to Unlock Next Material (KKM Mini Kuis)
export async function getMinQuizScoreToUnlock(): Promise<number> {
  return swrFetch(
    CACHE_KEYS.MIN_QUIZ_SCORE,
    async () => {
      const settingsRef = doc(db, SETTINGS_COL, ADMIN_DOC_ID);
      const snap = await getDoc(settingsRef);
      if (snap.exists() && typeof snap.data().minQuizScoreToUnlock === 'number') {
        return snap.data().minQuizScoreToUnlock;
      }
      return DEFAULT_MIN_QUIZ_SCORE;
    },
    {
      staleTime: 900_000,
      persistKey: 'sistem_materi_min_quiz_score',
    }
  );
}

export async function setMinQuizScoreToUnlock(score: number): Promise<void> {
  const settingsRef = doc(db, SETTINGS_COL, ADMIN_DOC_ID);
  await setDoc(
    settingsRef,
    {
      minQuizScoreToUnlock: score,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );
  setCacheData(CACHE_KEYS.MIN_QUIZ_SCORE, score, 'sistem_materi_min_quiz_score');
}

// Teacher Account CRUD Operations
export async function fetchTeachers(options?: { forceRevalidate?: boolean }): Promise<TeacherAccount[]> {
  return swrFetch(
    CACHE_KEYS.TEACHERS,
    async () => {
      try {
        const q = query(collection(db, TEACHERS_COL), orderBy('name', 'asc'));
        const snapshot = await getDocs(q);
        return snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as TeacherAccount));
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, TEACHERS_COL);
        throw err;
      }
    },
    {
      staleTime: 30_000,
      forceRevalidate: options?.forceRevalidate,
      persistKey: 'sistem_materi_teachers_cache',
    }
  );
}

export function subscribeTeachers(
  callback: (teachers: TeacherAccount[]) => void,
  onError?: (err: any) => void
): () => void {
  const q = query(collection(db, TEACHERS_COL), orderBy('name', 'asc'));
  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as TeacherAccount));
      setCacheData(CACHE_KEYS.TEACHERS, items, 'sistem_materi_teachers_cache', false);
      callback(items);
    },
    (error) => {
      console.error('[subscribeTeachers] onSnapshot error:', error);
      if (onError) onError(error);
      handleFirestoreError(error, OperationType.GET, TEACHERS_COL);
    }
  );
  return unsubscribe;
}


export async function createTeacher(
  teacherData: Omit<TeacherAccount, 'id' | 'createdAt' | 'updatedAt'>
): Promise<TeacherAccount> {
  const cleanUsername = (teacherData.username || '').trim().toLowerCase();
  const cleanNip = (teacherData.nip || '').trim();
  const cleanPassword = (teacherData.password || 'guru123').trim();
  const validation = await validateTeacherUniqueness(cleanUsername, cleanNip);
  if (!validation.isValid) {
    throw new Error(validation.conflictReason || 'Username atau NIP guru sudah terdaftar.');
  }

  const passwordHash = await hashCredential(cleanPassword, TEACHER_SALT);

  const newRef = doc(collection(db, TEACHERS_COL));
  const newTeacher: TeacherAccount = {
    name: teacherData.name.trim(),
    nip: cleanNip,
    username: cleanUsername,
    password: cleanPassword,
    passwordHash,
    subjectId: teacherData.subjectId,
    assignedClasses: teacherData.assignedClasses || [],
    id: newRef.id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await setDoc(newRef, cleanFirestoreData(newTeacher));
  
  invalidateCache(CACHE_KEYS.TEACHERS);
  return newTeacher;
}

export async function updateTeacher(id: string, updates: Partial<TeacherAccount>): Promise<void> {
  const cleanUpdates: Record<string, any> = {};
  for (const [k, v] of Object.entries(updates)) {
    if (v !== undefined) {
      if (typeof v === 'string') {
        cleanUpdates[k] = v.trim();
      } else {
        cleanUpdates[k] = v;
      }
    }
  }

  // Normalize username to lowercase if provided
  if (cleanUpdates.username !== undefined) {
    cleanUpdates.username = String(cleanUpdates.username).toLowerCase();
  }

  if (cleanUpdates.username !== undefined || cleanUpdates.nip !== undefined) {
    const current = await fetchTeachers({ forceRevalidate: true });
    const existing = current.find(t => t.id === id);
    const targetUser = cleanUpdates.username !== undefined ? cleanUpdates.username : (existing?.username || '');
    const targetNip = cleanUpdates.nip !== undefined ? cleanUpdates.nip : (existing?.nip || '');
    const validation = await validateTeacherUniqueness(targetUser, targetNip, id);
    if (!validation.isValid) {
      throw new Error(validation.conflictReason || 'Username atau NIP guru sudah terdaftar.');
    }
  }

  // If password is being updated, hash it and update both password and passwordHash
  if (cleanUpdates.password !== undefined && String(cleanUpdates.password).trim() !== '') {
    const cleanPwd = String(cleanUpdates.password).trim();
    cleanUpdates.password = cleanPwd;
    cleanUpdates.passwordHash = await hashCredential(cleanPwd, TEACHER_SALT);
  }

  const sanitized = cleanFirestoreData({
    ...cleanUpdates,
    updatedAt: new Date().toISOString(),
  });

  const ref = doc(db, TEACHERS_COL, id);
  await updateDoc(ref, sanitized);
  invalidateCache(CACHE_KEYS.TEACHERS);
}

export async function deleteTeacher(id: string): Promise<void> {
  const ref = doc(db, TEACHERS_COL, id);
  await deleteDoc(ref);
  invalidateCache(CACHE_KEYS.TEACHERS);
}

export async function bulkCreateTeachers(
  teachersData: Omit<TeacherAccount, 'id' | 'createdAt' | 'updatedAt'>[]
): Promise<TeacherAccount[]> {
  const existingTeachers = (await fetchTeachers()) || [];
  const existingUsernames = new Set((existingTeachers || []).map(t => (t?.username || '').trim().toLowerCase()));
  const existingNips = new Set((existingTeachers || []).map(t => (t?.nip || '').trim()).filter(Boolean));

  const seenInBatchUsers = new Set<string>();
  const seenInBatchNips = new Set<string>();

  // Filter out duplicates within batch or existing DB
  const validData: Omit<TeacherAccount, 'id' | 'createdAt' | 'updatedAt'>[] = [];
  for (const tData of teachersData) {
    const cleanUser = tData.username.trim().toLowerCase();
    const cleanNip = (tData.nip || '').trim();

    if (!cleanUser) continue;
    if (existingUsernames.has(cleanUser) || seenInBatchUsers.has(cleanUser)) continue;
    if (cleanNip && (existingNips.has(cleanNip) || seenInBatchNips.has(cleanNip))) continue;

    seenInBatchUsers.add(cleanUser);
    if (cleanNip) seenInBatchNips.add(cleanNip);
    validData.push(tData);
  }

  const createdTeachers: TeacherAccount[] = [];
  const batchSize = 400;
  for (let i = 0; i < validData.length; i += batchSize) {
    const chunk = validData.slice(i, i + batchSize);
    const batch = writeBatch(db);
    for (const tData of chunk) {
      const newRef = doc(collection(db, TEACHERS_COL));
      const newTeacher: TeacherAccount = {
        ...tData,
        id: newRef.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      batch.set(newRef, newTeacher);
      createdTeachers.push(newTeacher);
    }
    await batch.commit();
  }

  invalidateCache(CACHE_KEYS.TEACHERS);
  return createdTeachers;
}


export async function authenticateTeacher(usernameOrNip: string, pass: string): Promise<TeacherAccount | null> {
  const cleanInput = usernameOrNip.trim().toLowerCase();
  const cleanPass = pass.trim();
  if (!cleanInput || !cleanPass) return null;

  try {
    let targetDoc: { id: string; data: any } | null = null;

    // 1. Direct query by username (lowercased)
    const qUser = query(collection(db, TEACHERS_COL), where('username', '==', cleanInput));
    const snapUser = await getDocs(qUser);
    if (!snapUser.empty) {
      const d = snapUser.docs[0];
      targetDoc = { id: d.id, data: d.data() };
    } else {
      // 2. Direct query by NIP
      const qNip = query(collection(db, TEACHERS_COL), where('nip', '==', usernameOrNip.trim()));
      const snapNip = await getDocs(qNip);
      if (!snapNip.empty) {
        const d = snapNip.docs[0];
        targetDoc = { id: d.id, data: d.data() };
      }
    }

    // 3. Fallback search (e.g. if case differences in stored username)
    if (!targetDoc) {
      const teachers = await fetchTeachers();
      const found = teachers.find(
        (t) =>
          ((t.username && t.username.trim().toLowerCase() === cleanInput) ||
            (t.nip && t.nip.trim().toLowerCase() === cleanInput))
      );
      if (found) {
        targetDoc = { id: found.id, data: found };
      }
    }

    if (!targetDoc) return null;

    const data = targetDoc.data;
    const dbPassword = data.password !== undefined && data.password !== null && String(data.password).trim() !== ''
      ? String(data.password).trim()
      : '';
    const dbHash = data.passwordHash ? String(data.passwordHash).trim() : '';

    let isPasswordValid = false;

    // A. Direct plaintext match (highest priority: immediately valid if admin updated password in DB)
    if (dbPassword && (cleanPass === dbPassword || cleanPass.toLowerCase() === dbPassword.toLowerCase())) {
      isPasswordValid = true;
    }

    // B. Check against stored SHA-256 hash
    if (!isPasswordValid && dbHash) {
      isPasswordValid = await verifyCredential(cleanPass, dbHash, TEACHER_SALT);
    }

    if (isPasswordValid) {
      // Seamlessly ensure passwordHash is in sync in Firestore
      if ((!dbHash || cleanPass === dbPassword) && targetDoc.id) {
        const hashed = await hashCredential(cleanPass, TEACHER_SALT);
        if (hashed !== dbHash) {
          await updateDoc(doc(db, TEACHERS_COL, targetDoc.id), {
            passwordHash: hashed,
            updatedAt: new Date().toISOString(),
          }).catch(console.warn);
        }
      }

      // Return complete teacher account so teacher session has all valid attributes
      const fullTeacher: TeacherAccount = {
        id: targetDoc.id,
        name: data.name || '',
        nip: data.nip || '',
        username: data.username || cleanInput,
        password: dbPassword || cleanPass,
        subjectId: data.subjectId || '',
        assignedClasses: Array.isArray(data.assignedClasses) ? data.assignedClasses : [],
        createdAt: data.createdAt || new Date().toISOString(),
        updatedAt: data.updatedAt || new Date().toISOString(),
      };
      return fullTeacher;
    }

    return null;
  } catch (err) {
    console.error('Error authenticating teacher:', err);
    return null;
  }
}

// Student Account CRUD Operations
const DEMO_NISNS = [
  '0012345678',
  '0098765432',
  '0081234001',
  '0081234002',
  '0081234003',
  '0082234001',
  '0082234002',
  '0081123401',
];

const DEMO_NAMES = [
  'Andi Pratama',
  'Budi Santoso',
  'Citra Dewi',
  'Dian Permata',
  'Eka Kurniawan',
  'Fajar Nugraha',
  'Siti Rahmawati',
];

export async function purgeDemoAccountsAndData(): Promise<void> {
  try {
    // 1. Fetch current students from Firestore
    const snap = await getDocs(collection(db, STUDENTS_COL));
    if (!snap.empty) {
      const demoDocs = snap.docs.filter((d) => {
        const data = d.data();
        const id = d.id;
        const nisn = (data.nisn || '').trim();
        const nama = (data.nama || '').trim();
        return (
          id.startsWith('std_demo_') ||
          DEMO_NISNS.includes(nisn) ||
          DEMO_NAMES.includes(nama)
        );
      });

      if (demoDocs.length > 0) {
        const batch = writeBatch(db);
        demoDocs.forEach((d) => {
          batch.delete(d.ref);
        });
        await batch.commit();
      }
    }

    // 2. Clear demo progress records if any
    const progSnap = await getDocs(collection(db, STUDENT_PROGRESS_COL));
    if (!progSnap.empty) {
      const demoProgDocs = progSnap.docs.filter((d) => {
        const id = d.id;
        const data = d.data();
        const sName = (data.studentName || '').trim();
        return (
          id.startsWith('std_demo_') ||
          DEMO_NAMES.includes(sName) ||
          DEMO_NISNS.includes(id)
        );
      });
      if (demoProgDocs.length > 0) {
        const batch = writeBatch(db);
        demoProgDocs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
    }

    // 3. Clean localStorage cache
    try {
      const saved = localStorage.getItem('sistem_materi_students_cache');
      if (saved) {
        const list: StudentAccount[] = JSON.parse(saved);
        const filtered = list.filter(
          (s) =>
            !s.id.startsWith('std_demo_') &&
            !DEMO_NISNS.includes(s.nisn?.trim()) &&
            !DEMO_NAMES.includes(s.nama?.trim())
        );
        localStorage.setItem('sistem_materi_students_cache', JSON.stringify(filtered));
      }
    } catch {}

    // Clean specific demo progress localStorage keys
    DEMO_NISNS.forEach((nisn) => {
      localStorage.removeItem(`sistem_materi_prog_${nisn}`);
    });
    ['std_demo_1', 'std_demo_2'].forEach((id) => {
      localStorage.removeItem(`sistem_materi_prog_${id}`);
    });
  } catch (err) {
    console.warn('Error purging demo accounts:', err);
  }
}

export async function fetchStudents(): Promise<StudentAccount[]> {
  return swrFetch(
    CACHE_KEYS.STUDENTS,
    async () => {
      try {
        const q = query(collection(db, STUDENTS_COL), orderBy('nama', 'asc'));
        const snapshot = await getDocs(q);
        return snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            ...data,
            nisn: String(data.nisn || data.nis || data.username || '').trim(),
            username: String(data.username || data.nisn || data.nis || '').trim(),
            password: data.password !== undefined && data.password !== null && String(data.password).trim() !== ''
              ? String(data.password).trim()
              : (data.pass !== undefined && data.pass !== null ? String(data.pass).trim() : 'pass123'),
            isOnline: typeof data.isOnline === 'boolean' ? data.isOnline : false,
            lastActive: data.lastActive || data.updatedAt || undefined,
            lastLogin: data.lastLogin || undefined,
          } as StudentAccount;
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, STUDENTS_COL);
        throw err;
      }
    },
    {
      staleTime: 300_000,
      persistKey: 'sistem_materi_students_cache',
    }
  );
}

export function subscribeStudents(
  callback: (students: StudentAccount[]) => void,
  onError?: (err: any) => void
): () => void {
  const q = query(collection(db, STUDENTS_COL), orderBy('nama', 'asc'));
  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          nisn: String(data.nisn || data.nis || data.username || '').trim(),
          username: String(data.username || data.nisn || data.nis || '').trim(),
          password: data.password !== undefined && data.password !== null && String(data.password).trim() !== ''
            ? String(data.password).trim()
            : (data.pass !== undefined && data.pass !== null ? String(data.pass).trim() : 'pass123'),
          isOnline: typeof data.isOnline === 'boolean' ? data.isOnline : false,
          lastActive: data.lastActive || data.updatedAt || undefined,
          lastLogin: data.lastLogin || undefined,
        } as StudentAccount;
      });
      // Retain full student records in cache for admin viewing and credential verification
      setCacheData(CACHE_KEYS.STUDENTS, items, 'sistem_materi_students_cache', false);
      callback(items);
    },
    (error) => {
      console.error('[subscribeStudents] onSnapshot error:', error);
      if (onError) onError(error);
      handleFirestoreError(error, OperationType.GET, STUDENTS_COL);
    }
  );
  return unsubscribe;
}


export async function createStudent(
  studentData: Omit<StudentAccount, 'id' | 'createdAt' | 'updatedAt'>
): Promise<StudentAccount> {
  const validation = await validateStudentUniqueness(studentData.nisn, studentData.username);
  if (!validation.isValid) {
    throw new Error(validation.conflictReason || 'NIS atau Username siswa sudah terdaftar.');
  }

  const cleanPass = studentData.password ? String(studentData.password).trim() : 'pass123';
  const passHash = await hashCredential(cleanPass, STUDENT_SALT);
  const newRef = doc(collection(db, STUDENTS_COL));
  const newStudent: StudentAccount = {
    ...studentData,
    id: newRef.id,
    password: cleanPass,
    passwordHash: passHash,
    username: studentData.username || studentData.nisn,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await setDoc(newRef, newStudent);

  invalidateCache(CACHE_KEYS.STUDENTS);
  return newStudent;
}

export async function updateStudent(id: string, updates: Partial<StudentAccount>): Promise<void> {
  const cleanUpdates: Record<string, any> = {};
  for (const [k, v] of Object.entries(updates)) {
    if (v !== undefined) {
      if (typeof v === 'string') {
        cleanUpdates[k] = v.trim();
      } else {
        cleanUpdates[k] = v;
      }
    }
  }

  // If password is being updated, automatically synchronize passwordHash to prevent lockout
  if (cleanUpdates.password !== undefined) {
    const passToHash = cleanUpdates.password ? String(cleanUpdates.password).trim() : 'pass123';
    cleanUpdates.password = passToHash;
    cleanUpdates.passwordHash = await hashCredential(passToHash, STUDENT_SALT);
  }

  if (cleanUpdates.nisn !== undefined || cleanUpdates.username !== undefined) {
    const current = await fetchStudents();
    const existing = current.find((s) => s.id === id);
    const targetNisn = cleanUpdates.nisn !== undefined ? cleanUpdates.nisn : (existing?.nisn || '');
    const targetUsername = cleanUpdates.username !== undefined ? cleanUpdates.username : (existing?.username || targetNisn);
    const validation = await validateStudentUniqueness(targetNisn, targetUsername, id);
    if (!validation.isValid) {
      throw new Error(validation.conflictReason || 'NIS atau Username siswa sudah terdaftar.');
    }
  }

  const sanitized = cleanFirestoreData({
    ...cleanUpdates,
    updatedAt: new Date().toISOString(),
  });

  const ref = doc(db, STUDENTS_COL, id);
  await updateDoc(ref, sanitized);
  invalidateCache(CACHE_KEYS.STUDENTS);
}

export async function deleteStudent(id: string): Promise<void> {
  const ref = doc(db, STUDENTS_COL, id);
  await deleteDoc(ref);
  try {
    const progRef = doc(db, STUDENT_PROGRESS_COL, id);
    await deleteDoc(progRef);
  } catch (err) {
    console.warn('[DataService] Error deleting associated student_progress:', err);
  }
  invalidateCache(CACHE_KEYS.STUDENTS);
  invalidateCache(CACHE_KEYS.ALL_STUDENT_PROGRESS);
  invalidateCache(CACHE_KEYS.STUDENT_PROGRESS(id));
  invalidateCache(CACHE_KEYS.STUDENT_PROGRESS_DETAILS(id));
}

/**
 * Update a student's real-time online presence status in Firestore.
 * When isOnline is true, sets isOnline: true, lastLogin (if not set recently), and lastActive.
 * When isOnline is false, sets isOnline: false and lastActive to current timestamp.
 */
export async function updateStudentOnlineStatus(
  studentId: string,
  isOnline: boolean
): Promise<void> {
  if (!studentId) return;
  try {
    const ref = doc(db, STUDENTS_COL, studentId);
    const now = new Date().toISOString();
    const payload: Record<string, any> = {
      isOnline,
      lastActive: now,
      updatedAt: now,
    };
    if (isOnline) {
      payload.lastLogin = now;
    }
    await updateDoc(ref, payload);
    invalidateCache(CACHE_KEYS.STUDENTS);
  } catch (err) {
    console.warn(`[updateStudentOnlineStatus] Failed to update status for student ${studentId}:`, err);
  }
}

// Throttle tracker to prevent rapid writes for heartbeat
const lastStudentTouchTimestamp: Record<string, number> = {};

/**
 * Periodically touch a student's active session heartbeat.
 * Throttled to at most once every 30 seconds per studentId.
 */
export async function touchStudentActiveSession(studentId: string): Promise<void> {
  if (!studentId) return;
  const now = Date.now();
  const lastTouch = lastStudentTouchTimestamp[studentId] || 0;
  if (now - lastTouch < 30000) {
    return; // Throttled
  }
  lastStudentTouchTimestamp[studentId] = now;

  try {
    const ref = doc(db, STUDENTS_COL, studentId);
    const nowIso = new Date().toISOString();
    await updateDoc(ref, {
      isOnline: true,
      lastActive: nowIso,
      updatedAt: nowIso,
    });
  } catch (err) {
    console.warn(`[touchStudentActiveSession] Heartbeat touch failed for student ${studentId}:`, err);
  }
}

/**
 * Threshold in ms for considering a student actively online.
 * 3.5 minutes allows for slight heartbeat delays or background tab throttling.
 */
export const STUDENT_ONLINE_THRESHOLD_MS = 210000; // 3.5 minutes

/**
 * Calculate accurate real-time online status and human-readable last active text.
 */
export function getStudentOnlineStatus(
  student?: StudentAccount | null,
  progressRecord?: { lastActive?: string; updatedAt?: string } | null
): {
  isOnline: boolean;
  lastActiveText: string;
  statusLabel: 'Online' | 'Offline';
} {
  if (!student) {
    return { isOnline: false, lastActiveText: 'Tidak Aktif', statusLabel: 'Offline' };
  }

  // Determine latest timestamp from student and/or progress
  const candidateTimes = [
    student.lastActive,
    student.lastLogin,
    progressRecord?.lastActive,
    progressRecord?.updatedAt,
    student.updatedAt,
  ].filter(Boolean) as string[];

  let latestMs = 0;
  for (const timeStr of candidateTimes) {
    const ms = new Date(timeStr).getTime();
    if (!isNaN(ms) && ms > latestMs) {
      latestMs = ms;
    }
  }

  const now = Date.now();
  const timeDiff = latestMs > 0 ? Math.max(0, now - latestMs) : Infinity;

  // Student is online if:
  // 1. student.isOnline === true AND latest activity is within the threshold window
  // 2. Or very recent activity within 2 minutes regardless of boolean flag
  const isOnline =
    (student.isOnline === true && timeDiff < STUDENT_ONLINE_THRESHOLD_MS) ||
    (student.isOnline !== false && timeDiff < 120000);

  let lastActiveText = 'Belum pernah login';
  if (isOnline) {
    lastActiveText = 'Sedang aktif sekarang';
  } else if (latestMs > 0) {
    const minutesAgo = Math.floor(timeDiff / 60000);
    if (minutesAgo < 1) {
      lastActiveText = 'Baru saja keluar';
    } else if (minutesAgo < 60) {
      lastActiveText = `${minutesAgo} mnt lalu`;
    } else {
      const hoursAgo = Math.floor(minutesAgo / 60);
      if (hoursAgo < 24) {
        lastActiveText = `${hoursAgo} jam lalu`;
      } else {
        const daysAgo = Math.floor(hoursAgo / 24);
        if (daysAgo === 1) {
          lastActiveText = 'Kemarin';
        } else if (daysAgo < 7) {
          lastActiveText = `${daysAgo} hari lalu`;
        } else {
          lastActiveText = new Date(latestMs).toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'short',
          });
        }
      }
    }
  }

  return {
    isOnline,
    lastActiveText,
    statusLabel: isOnline ? 'Online' : 'Offline',
  };
}

export async function bulkCreateStudents(
  studentsData: Omit<StudentAccount, 'id' | 'createdAt' | 'updatedAt'>[]
): Promise<StudentAccount[]> {
  const existingStudents = (await fetchStudents()) || [];
  const existingNisns = new Set((existingStudents || []).map((s) => (s?.nisn || '').trim()));
  const existingUsernames = new Set(
    (existingStudents || []).map((s) => (s?.username || s?.nisn || '').trim().toLowerCase())
  );

  const seenInBatchNisns = new Set<string>();
  const seenInBatchUsers = new Set<string>();

  // Filter out duplicates within batch or existing DB
  const validData: Omit<StudentAccount, 'id' | 'createdAt' | 'updatedAt'>[] = [];
  for (const stdData of studentsData) {
    const cleanNisn = stdData.nisn.trim();
    const cleanUser = (stdData.username || cleanNisn).trim().toLowerCase();

    if (!cleanNisn) continue;
    if (existingNisns.has(cleanNisn) || seenInBatchNisns.has(cleanNisn)) continue;
    if (existingUsernames.has(cleanUser) || seenInBatchUsers.has(cleanUser)) continue;

    seenInBatchNisns.add(cleanNisn);
    seenInBatchUsers.add(cleanUser);
    validData.push(stdData);
  }

  const createdStudents: StudentAccount[] = [];
  const batchSize = 400;
  for (let i = 0; i < validData.length; i += batchSize) {
    const chunk = validData.slice(i, i + batchSize);
    const batch = writeBatch(db);
    for (const stdData of chunk) {
      const newRef = doc(collection(db, STUDENTS_COL));
      const studentPassword = stdData.password ? String(stdData.password).trim() : 'pass123';
      const passwordHash = await hashCredential(studentPassword, STUDENT_SALT);
      const newStudent: StudentAccount = {
        ...stdData,
        id: newRef.id,
        password: studentPassword,
        passwordHash,
        username: stdData.username || stdData.nisn,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      batch.set(newRef, newStudent);
      createdStudents.push(newStudent);
    }
    await batch.commit();
  }

  invalidateCache(CACHE_KEYS.STUDENTS);

  // Sync any newly introduced classes into master classes
  try {
    const newClasses = Array.from(
      new Set(validData.map((s) => (s.kelas || '').trim()).filter(Boolean))
    );
    if (newClasses.length > 0) {
      const currentMaster = await fetchMasterClasses();
      const merged = Array.from(new Set([...currentMaster, ...newClasses])).sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
      );
      if (merged.length > currentMaster.length) {
        await saveMasterClasses(merged);
      }
    }
  } catch (err) {
    console.warn('Error syncing master classes on bulkCreateStudents:', err);
  }

  return createdStudents;
}

/**
 * Diagnostic & repair routine that inspects all registered students in Firestore,
 * ensuring valid passwords, SHA-256 hashes, and sanitized NISN/Username fields.
 * Guarantees every student on the roster can log in seamlessly.
 */
export async function repairAndSyncAllStudents(): Promise<{ total: number; fixed: number }> {
  try {
    const snapshot = await getDocs(collection(db, STUDENTS_COL));
    if (snapshot.empty) return { total: 0, fixed: 0 };

    let fixedCount = 0;
    const batch = writeBatch(db);
    let batchCount = 0;

    for (const docSnap of snapshot.docs) {
      const data = docSnap.data();
      const docId = docSnap.id;

      const rawNisn = String(data.nisn || data.nis || data.username || docId).trim();
      const rawUser = String(data.username || rawNisn).trim();
      const rawPass = String(data.password || data.pass || 'pass123').trim() || 'pass123';
      const expectedHash = await hashCredential(rawPass, STUDENT_SALT);

      let needsUpdate = false;
      const updates: Record<string, any> = {};

      if (!data.nisn || String(data.nisn).trim() !== rawNisn) {
        updates.nisn = rawNisn;
        needsUpdate = true;
      }
      if (!data.username || String(data.username).trim() !== rawUser) {
        updates.username = rawUser;
        needsUpdate = true;
      }
      if (!data.password || String(data.password).trim() !== rawPass) {
        updates.password = rawPass;
        needsUpdate = true;
      }
      if (!data.passwordHash || data.passwordHash !== expectedHash) {
        updates.passwordHash = expectedHash;
        needsUpdate = true;
      }

      if (needsUpdate) {
        updates.updatedAt = new Date().toISOString();
        batch.update(doc(db, STUDENTS_COL, docId), updates);
        batchCount++;
        fixedCount++;
      }
    }

    if (batchCount > 0) {
      await batch.commit();
    }

    invalidateCache(CACHE_KEYS.STUDENTS);
    return { total: snapshot.size, fixed: fixedCount };
  } catch (err) {
    console.error('Error repairing all student accounts:', err);
    throw err;
  }
}

export async function authenticateStudent(nisnOrUser: string, pass: string): Promise<StudentAccount | null> {
  const cleanInput = String(nisnOrUser || '').trim();
  const cleanLower = cleanInput.toLowerCase();
  const cleanPass = String(pass || '').trim();
  if (!cleanInput || !cleanPass) return null;

  const cleanDigits = cleanInput.replace(/\D/g, '');
  const cleanNumber = !isNaN(Number(cleanInput)) && cleanInput !== '' ? Number(cleanInput) : null;

  try {
    let targetDoc: { id: string; data: any } | null = null;

    // 1. Direct lookup by Document ID (in case ID equals NIS or username)
    try {
      const docById = await getDoc(doc(db, STUDENTS_COL, cleanInput));
      if (docById.exists()) {
        targetDoc = { id: docById.id, data: docById.data() };
      } else if (cleanLower !== cleanInput) {
        const docByIdLower = await getDoc(doc(db, STUDENTS_COL, cleanLower));
        if (docByIdLower.exists()) {
          targetDoc = { id: docByIdLower.id, data: docByIdLower.data() };
        }
      }
    } catch {}

    // 2. Direct Firestore queries by NISN, NIS, or Username
    if (!targetDoc) {
      const queryAttempts = [
        // Exact nisn string
        query(collection(db, STUDENTS_COL), where('nisn', '==', cleanInput)),
        // Exact username
        query(collection(db, STUDENTS_COL), where('username', '==', cleanLower)),
        query(collection(db, STUDENTS_COL), where('username', '==', cleanInput)),
        // nis field (some databases or imports name the field 'nis')
        query(collection(db, STUDENTS_COL), where('nis', '==', cleanInput)),
      ];

      if (cleanNumber !== null) {
        queryAttempts.push(
          query(collection(db, STUDENTS_COL), where('nisn', '==', cleanNumber)),
          query(collection(db, STUDENTS_COL), where('nis', '==', cleanNumber))
        );
      }

      for (const q of queryAttempts) {
        try {
          const snap = await getDocs(q);
          if (!snap.empty) {
            targetDoc = { id: snap.docs[0].id, data: snap.docs[0].data() };
            break;
          }
        } catch {}
      }
    }

    // 3. Robust Fallback: Scan full student collection directly from Firestore
    // Ensures students with leading zeros, special characters, or custom fields are always found!
    if (!targetDoc) {
      try {
        const fullSnap = await getDocs(collection(db, STUDENTS_COL));
        if (!fullSnap.empty) {
          for (const d of fullSnap.docs) {
            const data = d.data();
            const dNisn = String(data.nisn || '').trim();
            const dNis = String(data.nis || '').trim();
            const dUser = String(data.username || '').trim();
            const dNama = String(data.nama || '').trim();

            const matchExact =
              dNisn.toLowerCase() === cleanLower ||
              dNis.toLowerCase() === cleanLower ||
              dUser.toLowerCase() === cleanLower ||
              d.id.toLowerCase() === cleanLower;

            const matchDigits =
              cleanDigits.length >= 3 &&
              (dNisn.replace(/\D/g, '') === cleanDigits ||
                dNis.replace(/\D/g, '') === cleanDigits ||
                dUser.replace(/\D/g, '') === cleanDigits);

            const matchName = dNama.toLowerCase() === cleanLower;

            if (matchExact || matchDigits || matchName) {
              targetDoc = { id: d.id, data };
              break;
            }
          }
        }
      } catch (err) {
        console.warn('Fallback scan failed:', err);
      }
    }

    if (!targetDoc) {
      console.warn(`[authenticateStudent] Student not found for input: "${cleanInput}"`);
      return null;
    }

    const data = targetDoc.data;
    const dbPassword = data.password !== undefined && data.password !== null && String(data.password).trim() !== ''
      ? String(data.password).trim()
      : (data.pass !== undefined && data.pass !== null ? String(data.pass).trim() : '');
    const dbHash = data.passwordHash ? String(data.passwordHash).trim() : '';

    let isPasswordValid = false;

    // A. Plaintext database password match (Highest priority: if database has a password, matching it succeeds)
    if (dbPassword) {
      if (cleanPass === dbPassword || cleanPass.toLowerCase() === dbPassword.toLowerCase()) {
        isPasswordValid = true;
      }
    }

    // B. Check against stored SHA-256 hash
    if (!isPasswordValid && dbHash) {
      isPasswordValid = await verifyCredential(cleanPass, dbHash, STUDENT_SALT);
    }

    // C. Default password fallback ('pass123') if no password/hash set in DB or if default matches
    if (!isPasswordValid && (!dbPassword || dbPassword === 'pass123')) {
      if (cleanPass === 'pass123' || cleanPass === '12345') {
        isPasswordValid = true;
      }
    }

    // D. If input matches default password pass123 and password in DB is empty
    if (!isPasswordValid && !dbPassword && !dbHash && cleanPass === 'pass123') {
      isPasswordValid = true;
    }

    if (isPasswordValid) {
      // Auto-heal: Ensure Firestore has both plaintext and computed hash in sync
      const expectedHash = await hashCredential(cleanPass, STUDENT_SALT);
      const updatesToSync: Record<string, any> = {};

      if (data.passwordHash !== expectedHash) {
        updatesToSync.passwordHash = expectedHash;
      }
      if (!data.password || String(data.password).trim() !== cleanPass) {
        updatesToSync.password = cleanPass;
      }
      if (!data.nisn && data.nis) {
        updatesToSync.nisn = String(data.nis).trim();
      }
      if (!data.username) {
        updatesToSync.username = data.nisn || data.nis || cleanInput;
      }

      const nowIso = new Date().toISOString();
      updatesToSync.isOnline = true;
      updatesToSync.lastActive = nowIso;
      updatesToSync.lastLogin = nowIso;
      updatesToSync.updatedAt = nowIso;
      await updateDoc(doc(db, STUDENTS_COL, targetDoc.id), updatesToSync).catch(console.warn);

      const authenticatedStudent: StudentAccount = {
        id: targetDoc.id,
        nama: data.nama || 'Siswa',
        kelas: data.kelas || '-',
        noAbsen: data.noAbsen ? String(data.noAbsen) : undefined,
        nisn: String(data.nisn || data.nis || cleanInput).trim(),
        username: String(data.username || data.nisn || data.nis || cleanInput).trim(),
        password: dbPassword || cleanPass,
        isOnline: true,
        lastActive: nowIso,
        lastLogin: nowIso,
        createdAt: data.createdAt,
        updatedAt: nowIso,
      };

      return authenticatedStudent;
    }

    console.warn(`[authenticateStudent] Password mismatch for student: "${cleanInput}"`);
    return null;
  } catch (err) {
    console.error('Error authenticating student:', err);
    return null;
  }
}

// Student Progress Persistence
const STUDENT_PROGRESS_COL = 'student_progress';
const PROGRESS_BATCH_LIMIT = 400;

export interface StudentQuizScoreInfo {
  score: number;
  totalQuestions: number;
  percentage: number;
  updatedAt: string;
}

export interface MaterialStudentQuizScoreRecord {
  id: string;
  studentId: string;
  studentName: string;
  studentClass: string;
  studentAbsen?: string;
  score: number;
  totalQuestions: number;
  percentage: number;
  completedAt: string;
  isPassed: boolean;
}

export interface StudentProgressSyncItem {
  studentId: string;
  studentName?: string;
  kelas?: string;
  completedMaterialIds?: string[];
  completedMaterialTimestamps?: Record<string, string>;
  activityLogs?: MaterialActivityLog[];
  scores?: Record<string, number>;
  quizAttempts?: Record<string, StudentQuizScoreInfo>;
}

/**
 * Saves a student's progress record atomically using a Firestore writeBatch.
 * Ensures consistent multi-field updates without partial write states.
 */
export async function saveStudentProgress(
  studentId: string,
  completedMaterialIds: string[],
  studentName?: string,
  kelas?: string,
  completedMaterialTimestamps?: Record<string, string>,
  activityLogs?: MaterialActivityLog[],
  scores?: Record<string, number>,
  quizAttempts?: Record<string, StudentQuizScoreInfo>,
  notes?: Record<string, string>,
  bookmarkedMaterialIds?: string[],
  gamification?: any
): Promise<void> {
  if (!studentId) return;
  try {
    const ref = doc(db, STUDENT_PROGRESS_COL, studentId);
    const payload = cleanFirestoreData({
      studentId,
      completedMaterialIds,
      ...(studentName ? { studentName } : {}),
      ...(kelas ? { kelas } : {}),
      ...(completedMaterialTimestamps ? { completedMaterialTimestamps } : {}),
      ...(activityLogs ? { activityLogs } : {}),
      ...(scores ? { scores } : {}),
      ...(quizAttempts ? { quizAttempts } : {}),
      ...(notes ? { notes } : {}),
      ...(bookmarkedMaterialIds ? { bookmarkedMaterialIds } : {}),
      ...(gamification ? { gamification } : {}),
      updatedAt: new Date().toISOString(),
    });

    const batch = writeBatch(db);
    batch.set(ref, payload, { merge: true });
    await batch.commit();

    invalidateCache(CACHE_KEYS.ALL_STUDENT_PROGRESS);
    setCacheData(CACHE_KEYS.STUDENT_PROGRESS(studentId), completedMaterialIds, `sistem_materi_prog_${studentId}`);
    setCacheData(CACHE_KEYS.STUDENT_PROGRESS_DETAILS(studentId), payload as StudentProgressRecord, `sistem_materi_prog_details_${studentId}`);
    if (scores) {
      setCacheData(CACHE_KEYS.STUDENT_QUIZ_SCORES(studentId), scores, `sistem_materi_scores_${studentId}`);
    } else {
      invalidateCache(CACHE_KEYS.STUDENT_QUIZ_SCORES(studentId));
    }

    try {
      localStorage.setItem(`sistem_materi_prog_${studentId}`, JSON.stringify(completedMaterialIds));
      if (completedMaterialTimestamps) {
        localStorage.setItem(`sistem_materi_prog_times_${studentId}`, JSON.stringify(completedMaterialTimestamps));
        localStorage.setItem(`sistem_materi_timestamps_${studentId}`, JSON.stringify(completedMaterialTimestamps));
      }
      if (activityLogs) {
        localStorage.setItem(`sistem_materi_activity_logs_${studentId}`, JSON.stringify(activityLogs));
        localStorage.setItem(`sistem_materi_activity_${studentId}`, JSON.stringify(activityLogs));
      }
      if (scores) {
        localStorage.setItem(`sistem_materi_scores_${studentId}`, JSON.stringify(scores));
      }
      if (quizAttempts) {
        localStorage.setItem(`sistem_materi_quiz_attempts_${studentId}`, JSON.stringify(quizAttempts));
      }
      if (notes) {
        localStorage.setItem(`sistem_materi_notes_${studentId}`, JSON.stringify(notes));
      }
      if (bookmarkedMaterialIds) {
        localStorage.setItem(`sistem_materi_bookmarks_${studentId}`, JSON.stringify(bookmarkedMaterialIds));
      }
      if (gamification) {
        localStorage.setItem(`sistem_materi_gamification_${studentId}`, JSON.stringify(gamification));
      }
    } catch {}
  } catch (err) {
    console.warn('Error saving student progress to Firestore:', err);
  }
}

/**
 * Saves a student's personal notes and bookmarks to Firestore and localStorage
 */
export async function saveStudentNotesAndBookmarks(
  studentId: string,
  notes?: Record<string, string>,
  bookmarkedMaterialIds?: string[]
): Promise<void> {
  if (!studentId) return;
  try {
    const ref = doc(db, STUDENT_PROGRESS_COL, studentId);
    const payload = cleanFirestoreData({
      studentId,
      ...(notes !== undefined ? { notes } : {}),
      ...(bookmarkedMaterialIds !== undefined ? { bookmarkedMaterialIds } : {}),
      updatedAt: new Date().toISOString(),
    });
    const batch = writeBatch(db);
    batch.set(ref, payload, { merge: true });
    await batch.commit();

    invalidateCache(CACHE_KEYS.ALL_STUDENT_PROGRESS);
    invalidateCache(CACHE_KEYS.STUDENT_PROGRESS_DETAILS(studentId));

    try {
      if (notes !== undefined) {
        localStorage.setItem(`sistem_materi_notes_${studentId}`, JSON.stringify(notes));
      }
      if (bookmarkedMaterialIds !== undefined) {
        localStorage.setItem(`sistem_materi_bookmarks_${studentId}`, JSON.stringify(bookmarkedMaterialIds));
      }
    } catch {}
  } catch (err) {
    console.warn('Error saving student notes & bookmarks to Firestore:', err);
  }
}

/**
 * Saves a student's gamification state to Firestore and localStorage
 */
export async function saveStudentGamification(
  studentId: string,
  gamification: any
): Promise<void> {
  if (!studentId || !gamification) return;
  try {
    const ref = doc(db, STUDENT_PROGRESS_COL, studentId);
    const payload = cleanFirestoreData({
      studentId,
      gamification,
      updatedAt: new Date().toISOString(),
    });
    const batch = writeBatch(db);
    batch.set(ref, payload, { merge: true });
    await batch.commit();

    invalidateCache(CACHE_KEYS.ALL_STUDENT_PROGRESS);
    invalidateCache(CACHE_KEYS.STUDENT_PROGRESS_DETAILS(studentId));

    try {
      localStorage.setItem(`sistem_materi_gamification_${studentId}`, JSON.stringify(gamification));
    } catch {}
  } catch (err) {
    console.warn('Error saving student gamification to Firestore:', err);
  }
}

/**
 * Saves a student's mini quiz score atomically using a Firestore writeBatch,
 * storing ONLY the highest score per material to optimize database size and prevent redundant attempt bloat.
 */
export async function saveStudentQuizScore(
  studentId: string,
  materialId: string,
  score: number,
  totalQuestions: number,
  studentName?: string,
  kelas?: string
): Promise<{ isNewHighest: boolean; highestPercentage: number; highestScore: number; totalQuestions: number }> {
  if (!studentId || !materialId) {
    return { isNewHighest: false, highestPercentage: 0, highestScore: score, totalQuestions };
  }

  const newPercentage = totalQuestions > 0 ? Math.round((score / totalQuestions) * 100) : 0;

  try {
    const ref = doc(db, STUDENT_PROGRESS_COL, studentId);
    const snap = await getDoc(ref);
    let existingScores: Record<string, number> = {};
    let existingAttempts: Record<string, StudentQuizScoreInfo> = {};
    let existingCompleted: string[] = [];
    let existingTimestamps: Record<string, string> = {};
    let existingLogs: MaterialActivityLog[] = [];
    let existingName = studentName || '';
    let existingKelas = kelas || '';

    if (snap.exists()) {
      const data = snap.data();
      existingScores = data.scores || {};
      existingAttempts = data.quizAttempts || {};
      existingCompleted = data.completedMaterialIds || [];
      existingTimestamps = data.completedMaterialTimestamps || {};
      existingLogs = data.activityLogs || [];
      if (!existingName) existingName = data.studentName || '';
      if (!existingKelas) existingKelas = data.kelas || '';
    } else {
      try {
        const localScores = localStorage.getItem(`sistem_materi_scores_${studentId}`);
        if (localScores) existingScores = JSON.parse(localScores);
        const localAttempts = localStorage.getItem(`sistem_materi_quiz_attempts_${studentId}`);
        if (localAttempts) existingAttempts = JSON.parse(localAttempts);
        const localProg = localStorage.getItem(`sistem_materi_prog_${studentId}`);
        if (localProg) existingCompleted = JSON.parse(localProg);
      } catch {}
    }

    const currentHighestPercent = existingScores[materialId] ?? -1;

    // Only update if the new percentage is greater than the recorded highest score
    if (newPercentage > currentHighestPercent) {
      existingScores[materialId] = newPercentage;
      // Overwrite / store ONLY this single highest attempt, automatically replacing any older/lesser score
      existingAttempts[materialId] = {
        score,
        totalQuestions,
        percentage: newPercentage,
        updatedAt: new Date().toISOString(),
      };

      if (!existingCompleted.includes(materialId)) {
        existingCompleted.push(materialId);
        existingTimestamps[materialId] = new Date().toISOString();
      }

      const payload = cleanFirestoreData({
        studentId,
        ...(existingName ? { studentName: existingName } : {}),
        ...(existingKelas ? { kelas: existingKelas } : {}),
        completedMaterialIds: existingCompleted,
        completedMaterialTimestamps: existingTimestamps,
        activityLogs: existingLogs,
        scores: existingScores,
        quizAttempts: existingAttempts,
        updatedAt: new Date().toISOString(),
      });

      const batch = writeBatch(db);
      batch.set(ref, payload, { merge: true });
      await batch.commit();

      invalidateCache(CACHE_KEYS.ALL_STUDENT_PROGRESS);
      invalidateCache(CACHE_KEYS.STUDENT_PROGRESS(studentId));
      invalidateCache(CACHE_KEYS.STUDENT_PROGRESS_DETAILS(studentId));
      invalidateCache(CACHE_KEYS.STUDENT_QUIZ_SCORES(studentId));

      try {
        localStorage.setItem(`sistem_materi_scores_${studentId}`, JSON.stringify(existingScores));
        localStorage.setItem(`sistem_materi_quiz_attempts_${studentId}`, JSON.stringify(existingAttempts));
        localStorage.setItem(`sistem_materi_prog_${studentId}`, JSON.stringify(existingCompleted));
        localStorage.setItem(`sistem_materi_prog_times_${studentId}`, JSON.stringify(existingTimestamps));
        localStorage.setItem(`sistem_materi_timestamps_${studentId}`, JSON.stringify(existingTimestamps));
      } catch {}

      return {
        isNewHighest: true,
        highestPercentage: newPercentage,
        highestScore: score,
        totalQuestions,
      };
    } else {
      // Existing score is higher or equal; keep the higher score
      const currentAttempt = existingAttempts[materialId];
      return {
        isNewHighest: false,
        highestPercentage: currentHighestPercent,
        highestScore: currentAttempt?.score ?? Math.round((currentHighestPercent / 100) * totalQuestions),
        totalQuestions: currentAttempt?.totalQuestions ?? totalQuestions,
      };
    }
  } catch (err) {
    console.warn('Error saving student quiz score to Firestore:', err);
    try {
      let localScores: Record<string, number> = {};
      let localAttempts: Record<string, StudentQuizScoreInfo> = {};
      const ls = localStorage.getItem(`sistem_materi_scores_${studentId}`);
      if (ls) localScores = JSON.parse(ls);
      const la = localStorage.getItem(`sistem_materi_quiz_attempts_${studentId}`);
      if (la) localAttempts = JSON.parse(la);

      const currentHighestPercent = localScores[materialId] ?? -1;
      if (newPercentage > currentHighestPercent) {
        localScores[materialId] = newPercentage;
        localAttempts[materialId] = {
          score,
          totalQuestions,
          percentage: newPercentage,
          updatedAt: new Date().toISOString(),
        };
        localStorage.setItem(`sistem_materi_scores_${studentId}`, JSON.stringify(localScores));
        localStorage.setItem(`sistem_materi_quiz_attempts_${studentId}`, JSON.stringify(localAttempts));
        return { isNewHighest: true, highestPercentage: newPercentage, highestScore: score, totalQuestions };
      }
      const currentAttempt = localAttempts[materialId];
      return {
        isNewHighest: false,
        highestPercentage: currentHighestPercent,
        highestScore: currentAttempt?.score ?? Math.round((currentHighestPercent / 100) * totalQuestions),
        totalQuestions: currentAttempt?.totalQuestions ?? totalQuestions,
      };
    } catch {
      return { isNewHighest: false, highestPercentage: newPercentage, highestScore: score, totalQuestions };
    }
  }
}

/**
 * Synchronizes multiple student progress records in chunked Firestore writeBatches,
 * reducing multiple sequential network round trips into single atomic batch operations.
 */
export async function syncStudentProgressBatch(
  updates: StudentProgressSyncItem[]
): Promise<{ successCount: number; errorCount: number }> {
  if (!Array.isArray(updates) || updates.length === 0) {
    return { successCount: 0, errorCount: 0 };
  }

  const validUpdates = updates.filter((u) => u && u.studentId);
  if (validUpdates.length === 0) return { successCount: 0, errorCount: 0 };

  const now = new Date().toISOString();
  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < validUpdates.length; i += PROGRESS_BATCH_LIMIT) {
    const chunk = validUpdates.slice(i, i + PROGRESS_BATCH_LIMIT);
    const batch = writeBatch(db);

    chunk.forEach((item) => {
      const ref = doc(db, STUDENT_PROGRESS_COL, item.studentId);
      const payload = cleanFirestoreData({
        ...item,
        updatedAt: now,
      });
      batch.set(ref, payload, { merge: true });
    });

    try {
      await batch.commit();
      successCount += chunk.length;

      // Update local storage and invalidate SWR caches for all committed students
      chunk.forEach((item) => {
        invalidateCache(CACHE_KEYS.STUDENT_PROGRESS(item.studentId));
        invalidateCache(CACHE_KEYS.STUDENT_PROGRESS_DETAILS(item.studentId));
        invalidateCache(CACHE_KEYS.STUDENT_QUIZ_SCORES(item.studentId));

        try {
          if (item.completedMaterialIds) {
            localStorage.setItem(`sistem_materi_prog_${item.studentId}`, JSON.stringify(item.completedMaterialIds));
          }
          if (item.completedMaterialTimestamps) {
            localStorage.setItem(`sistem_materi_prog_times_${item.studentId}`, JSON.stringify(item.completedMaterialTimestamps));
            localStorage.setItem(`sistem_materi_timestamps_${item.studentId}`, JSON.stringify(item.completedMaterialTimestamps));
          }
          if (item.activityLogs) {
            localStorage.setItem(`sistem_materi_activity_logs_${item.studentId}`, JSON.stringify(item.activityLogs));
            localStorage.setItem(`sistem_materi_activity_${item.studentId}`, JSON.stringify(item.activityLogs));
          }
          if (item.scores) {
            localStorage.setItem(`sistem_materi_scores_${item.studentId}`, JSON.stringify(item.scores));
          }
          if (item.quizAttempts) {
            localStorage.setItem(`sistem_materi_quiz_attempts_${item.studentId}`, JSON.stringify(item.quizAttempts));
          }
        } catch {}
      });
    } catch (err) {
      console.error('Error committing batch student progress sync:', err);
      errorCount += chunk.length;
    }
  }

  invalidateCache(CACHE_KEYS.ALL_STUDENT_PROGRESS);
  return { successCount, errorCount };
}

/**
 * Resets progress records for multiple students using atomic Firestore writeBatches.
 */
export async function bulkResetStudentProgress(
  studentIds: string[]
): Promise<{ successCount: number; errorCount: number }> {
  if (!Array.isArray(studentIds) || studentIds.length === 0) {
    return { successCount: 0, errorCount: 0 };
  }

  const validIds = studentIds.filter(Boolean);
  if (validIds.length === 0) return { successCount: 0, errorCount: 0 };

  const now = new Date().toISOString();
  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < validIds.length; i += PROGRESS_BATCH_LIMIT) {
    const chunk = validIds.slice(i, i + PROGRESS_BATCH_LIMIT);
    const batch = writeBatch(db);

    chunk.forEach((id) => {
      const ref = doc(db, STUDENT_PROGRESS_COL, id);
      batch.set(
        ref,
        {
          studentId: id,
          completedMaterialIds: [],
          completedMaterialTimestamps: {},
          activityLogs: [],
          scores: {},
          quizAttempts: {},
          updatedAt: now,
        },
        { merge: true }
      );
    });

    try {
      await batch.commit();
      successCount += chunk.length;

      chunk.forEach((id) => {
        invalidateCache(CACHE_KEYS.STUDENT_PROGRESS(id));
        invalidateCache(CACHE_KEYS.STUDENT_PROGRESS_DETAILS(id));
        invalidateCache(CACHE_KEYS.STUDENT_QUIZ_SCORES(id));
        try {
          localStorage.setItem(`sistem_materi_prog_${id}`, JSON.stringify([]));
          localStorage.setItem(`sistem_materi_timestamps_${id}`, JSON.stringify({}));
          localStorage.setItem(`sistem_materi_activity_${id}`, JSON.stringify([]));
          localStorage.setItem(`sistem_materi_scores_${id}`, JSON.stringify({}));
          localStorage.setItem(`sistem_materi_quiz_attempts_${id}`, JSON.stringify({}));
        } catch {}
      });
    } catch (err) {
      console.error('Error committing bulk student progress reset:', err);
      errorCount += chunk.length;
    }
  }

  invalidateCache(CACHE_KEYS.ALL_STUDENT_PROGRESS);
  return { successCount, errorCount };
}

/**
 * Fetches all highest quiz scores and attempt details for a student.
 */
export async function fetchStudentQuizScores(
  studentId: string,
  options?: { forceRevalidate?: boolean; additionalIds?: string[]; studentName?: string }
): Promise<Record<string, StudentQuizScoreInfo>> {
  if (!studentId) return {};
  const candidateIds = Array.from(new Set([studentId, ...(options?.additionalIds || [])].filter(Boolean)));

  return swrFetch(
    CACHE_KEYS.STUDENT_QUIZ_SCORES(studentId),
    async () => {
      let data: any = null;
      for (const sid of candidateIds) {
        const ref = doc(db, STUDENT_PROGRESS_COL, sid);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          data = snap.data();
          break;
        }
      }

      if (data) {
        const attempts = data.quizAttempts || {};
        const scores = data.scores || {};
        const result: Record<string, StudentQuizScoreInfo> = {};
        for (const [matId, val] of Object.entries(scores)) {
          if (attempts[matId]) {
            result[matId] = attempts[matId];
          } else {
            result[matId] = {
              score: Number(val),
              totalQuestions: 10,
              percentage: Number(val),
              updatedAt: data.updatedAt || '',
            };
          }
        }
        try {
          candidateIds.forEach((sid) => {
            localStorage.setItem(`sistem_materi_scores_${sid}`, JSON.stringify(scores));
            localStorage.setItem(`sistem_materi_quiz_attempts_${sid}`, JSON.stringify(result));
          });
        } catch {}
        return result;
      }

      try {
        candidateIds.forEach((sid) => {
          localStorage.setItem(`sistem_materi_scores_${sid}`, JSON.stringify({}));
          localStorage.setItem(`sistem_materi_quiz_attempts_${sid}`, JSON.stringify({}));
        });
      } catch {}
      return {};
    },
    {
      staleTime: options?.forceRevalidate ? 0 : 30_000,
      forceRevalidate: options?.forceRevalidate || false,
      persistKey: `sistem_materi_quiz_attempts_${studentId}`,
    }
  );
}

/**
 * Fetches all student evaluation records for a specific material.
 * Used by Bank Soal Mini Kuis AI and Teacher Evaluation tab.
 */
export async function fetchMaterialStudentQuizScores(
  materialId: string,
  studentsList: StudentAccount[] = []
): Promise<MaterialStudentQuizScoreRecord[]> {
  if (!materialId) return [];

  const allProgress = await fetchAllStudentProgress();
  const studentMap = new Map<string, StudentAccount>();
  for (const s of studentsList) {
    if (s.id) studentMap.set(s.id, s);
    if (s.nisn) studentMap.set(s.nisn, s);
    if (s.nama) studentMap.set(s.nama.toLowerCase().trim(), s);
  }

  const results: MaterialStudentQuizScoreRecord[] = [];

  for (const [studentId, prog] of Object.entries(allProgress)) {
    const hasScore = prog.scores && prog.scores[materialId] !== undefined;
    const hasAttempt = prog.quizAttempts && prog.quizAttempts[materialId] !== undefined;

    if (!hasScore && !hasAttempt) continue;

    const attempt = prog.quizAttempts?.[materialId];
    const percent = attempt?.percentage ?? (hasScore ? Number(prog.scores[materialId]) : 0);
    const totalQ = attempt?.totalQuestions || 10;
    const scoreVal = attempt?.score ?? Math.round((percent / 100) * totalQ);
    const completedTime =
      attempt?.updatedAt ||
      prog.completedMaterialTimestamps?.[materialId] ||
      prog.updatedAt ||
      new Date().toISOString();

    const matchedStudent =
      studentMap.get(studentId) ||
      (prog.studentName ? studentMap.get(prog.studentName.toLowerCase().trim()) : undefined);

    const name = matchedStudent?.nama || prog.studentName || 'Siswa';
    const cls = matchedStudent?.kelas || prog.kelas || '-';
    const absen = matchedStudent?.noAbsen || '-';

    results.push({
      id: studentId,
      studentId,
      studentName: name,
      studentClass: cls,
      studentAbsen: absen,
      score: scoreVal,
      totalQuestions: totalQ,
      percentage: percent,
      completedAt: completedTime,
      isPassed: percent >= DEFAULT_MIN_QUIZ_SCORE,
    });
  }

  results.sort((a, b) => {
    if (a.studentClass !== b.studentClass) return a.studentClass.localeCompare(b.studentClass);
    const numA = parseInt(a.studentAbsen || '0', 10);
    const numB = parseInt(b.studentAbsen || '0', 10);
    if (!isNaN(numA) && !isNaN(numB) && numA !== numB) return numA - numB;
    return a.studentName.localeCompare(b.studentName);
  });

  return results;
}

/**
 * Resets a student's completion, quiz score, and quiz attempts for a specific material.
 * This completely reverts the material to its initial uncompleted state so that
 * the student can redo the quiz and material from scratch.
 */
export async function resetStudentMaterialProgress(
  studentId: string,
  materialId: string,
  additionalStudentIds: string[] = [],
  studentName?: string
): Promise<{ success: boolean; message?: string }> {
  if (!studentId || !materialId) {
    return { success: false, message: 'ID Siswa atau ID Materi tidak valid.' };
  }

  const initialIds = Array.from(new Set([studentId, ...additionalStudentIds].filter(Boolean)));
  const allDocIdsToReset = new Set<string>(initialIds);

  try {
    const allProgressSnap = await getDocs(collection(db, STUDENT_PROGRESS_COL));
    const matchedDocs: { ref: any; id: string; data: any }[] = [];

    allProgressSnap.docs.forEach((docSnap) => {
      const dId = docSnap.id;
      const data = docSnap.data();
      const sId = data.studentId;
      const sNisn = data.nisn;
      const sName = data.studentName;

      const isIdMatch =
        initialIds.includes(dId) ||
        (sId && initialIds.includes(sId)) ||
        (sNisn && initialIds.includes(sNisn));
      const isNameMatch =
        studentName && sName && sName.toLowerCase().trim() === studentName.toLowerCase().trim();

      if (isIdMatch || isNameMatch) {
        allDocIdsToReset.add(dId);
        if (sId) allDocIdsToReset.add(sId);
        if (sNisn) allDocIdsToReset.add(sNisn);
        matchedDocs.push({ ref: docSnap.ref, id: dId, data });
      }
    });

    const finalIds = Array.from(allDocIdsToReset);

    if (matchedDocs.length > 0) {
      const batch = writeBatch(db);
      for (const m of matchedDocs) {
        const data = m.data;
        const existingScores = { ...(data.scores || {}) };
        const existingAttempts = { ...(data.quizAttempts || {}) };
        const existingTimestamps = { ...(data.completedMaterialTimestamps || {}) };
        let existingCompleted: string[] = Array.isArray(data.completedMaterialIds)
          ? [...data.completedMaterialIds]
          : [];
        let existingLogs: MaterialActivityLog[] = Array.isArray(data.activityLogs)
          ? [...data.activityLogs]
          : [];

        delete existingScores[materialId];
        delete existingAttempts[materialId];
        delete existingTimestamps[materialId];
        existingCompleted = existingCompleted.filter((id) => id !== materialId);
        existingLogs = existingLogs.filter((log) => log.materialId !== materialId);

        const payload = cleanFirestoreData({
          ...data,
          completedMaterialIds: existingCompleted,
          completedMaterialTimestamps: existingTimestamps,
          scores: existingScores,
          quizAttempts: existingAttempts,
          activityLogs: existingLogs,
          updatedAt: new Date().toISOString(),
        });

        batch.set(m.ref, payload);
      }
      await batch.commit();
    } else {
      for (const sid of initialIds) {
        const ref = doc(db, STUDENT_PROGRESS_COL, sid);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const data = snap.data();
          const existingScores = { ...(data.scores || {}) };
          const existingAttempts = { ...(data.quizAttempts || {}) };
          const existingTimestamps = { ...(data.completedMaterialTimestamps || {}) };
          let existingCompleted: string[] = Array.isArray(data.completedMaterialIds)
            ? [...data.completedMaterialIds]
            : [];
          let existingLogs: MaterialActivityLog[] = Array.isArray(data.activityLogs)
            ? [...data.activityLogs]
            : [];

          delete existingScores[materialId];
          delete existingAttempts[materialId];
          delete existingTimestamps[materialId];
          existingCompleted = existingCompleted.filter((id) => id !== materialId);
          existingLogs = existingLogs.filter((log) => log.materialId !== materialId);

          const payload = cleanFirestoreData({
            ...data,
            completedMaterialIds: existingCompleted,
            completedMaterialTimestamps: existingTimestamps,
            scores: existingScores,
            quizAttempts: existingAttempts,
            activityLogs: existingLogs,
            updatedAt: new Date().toISOString(),
          });

          const batch = writeBatch(db);
          batch.set(ref, payload);
          await batch.commit();
        }
      }
    }

    for (const sid of finalIds) {
      try {
        const localScores = localStorage.getItem(`sistem_materi_scores_${sid}`);
        if (localScores) {
          const sc = JSON.parse(localScores);
          delete sc[materialId];
          localStorage.setItem(`sistem_materi_scores_${sid}`, JSON.stringify(sc));
        }
        const localAtt = localStorage.getItem(`sistem_materi_quiz_attempts_${sid}`);
        if (localAtt) {
          const at = JSON.parse(localAtt);
          delete at[materialId];
          localStorage.setItem(`sistem_materi_quiz_attempts_${sid}`, JSON.stringify(at));
        }
        const localProg = localStorage.getItem(`sistem_materi_prog_${sid}`);
        if (localProg) {
          let pr: string[] = JSON.parse(localProg);
          pr = pr.filter((id) => id !== materialId);
          localStorage.setItem(`sistem_materi_prog_${sid}`, JSON.stringify(pr));
        }
        const localTimes = localStorage.getItem(`sistem_materi_prog_times_${sid}`);
        if (localTimes) {
          const tm = JSON.parse(localTimes);
          delete tm[materialId];
          localStorage.setItem(`sistem_materi_prog_times_${sid}`, JSON.stringify(tm));
        }
        localStorage.removeItem(`sistem_materi_prog_details_${sid}`);
        localStorage.removeItem(`quiz_res_${materialId}_${sid}`);
        localStorage.removeItem(`quiz_answers_${materialId}_${sid}`);
        localStorage.removeItem(`sistem_materi_quiz_ans_${materialId}_${sid}`);
        localStorage.removeItem(`simpel_quiz_progress_${materialId}_${sid}`);
      } catch {}

      invalidateCache(CACHE_KEYS.STUDENT_PROGRESS(sid));
      invalidateCache(CACHE_KEYS.STUDENT_PROGRESS_DETAILS(sid));
      invalidateCache(CACHE_KEYS.STUDENT_QUIZ_SCORES(sid));
    }

    invalidateCache(CACHE_KEYS.ALL_STUDENT_PROGRESS);
    try {
      localStorage.removeItem('sistem_materi_all_progress_cache');
    } catch {}

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('storage'));
      window.dispatchEvent(
        new CustomEvent('student-material-reset', {
          detail: { studentIds: finalIds, materialId },
        })
      );
    }

    return { success: true };
  } catch (err: any) {
    console.error('Error resetting student material progress:', err);
    return { success: false, message: err?.message || 'Gagal mereset data siswa di database.' };
  }
}

/**
 * Resets all students' completion and quiz score for a specific material.
 */
export async function resetAllStudentsMaterialProgress(
  materialId: string
): Promise<{ success: boolean; count: number; message?: string }> {
  if (!materialId) {
    return { success: false, count: 0, message: 'ID Materi tidak valid.' };
  }

  try {
    const snap = await getDocs(collection(db, STUDENT_PROGRESS_COL));
    let count = 0;
    const batch = writeBatch(db);

    for (const docSnap of snap.docs) {
      const data = docSnap.data();
      const hasScore = data.scores && data.scores[materialId] !== undefined;
      const hasAttempt = data.quizAttempts && data.quizAttempts[materialId] !== undefined;
      const hasCompleted = Array.isArray(data.completedMaterialIds) && data.completedMaterialIds.includes(materialId);

      if (hasScore || hasAttempt || hasCompleted) {
        const existingScores = { ...(data.scores || {}) };
        const existingAttempts = { ...(data.quizAttempts || {}) };
        const existingTimestamps = { ...(data.completedMaterialTimestamps || {}) };
        let existingCompleted: string[] = Array.isArray(data.completedMaterialIds) ? [...data.completedMaterialIds] : [];
        let existingLogs: MaterialActivityLog[] = Array.isArray(data.activityLogs) ? [...data.activityLogs] : [];

        delete existingScores[materialId];
        delete existingAttempts[materialId];
        delete existingTimestamps[materialId];
        existingCompleted = existingCompleted.filter((id) => id !== materialId);
        existingLogs = existingLogs.filter((log) => log.materialId !== materialId);

        const payload = cleanFirestoreData({
          ...data,
          completedMaterialIds: existingCompleted,
          completedMaterialTimestamps: existingTimestamps,
          scores: existingScores,
          quizAttempts: existingAttempts,
          activityLogs: existingLogs,
          updatedAt: new Date().toISOString(),
        });

        batch.set(docSnap.ref, payload);
        count++;

        const sid = docSnap.id;
        try {
          localStorage.removeItem(`sistem_materi_scores_${sid}`);
          localStorage.removeItem(`sistem_materi_quiz_attempts_${sid}`);
          localStorage.removeItem(`sistem_materi_prog_${sid}`);
          localStorage.removeItem(`sistem_materi_prog_times_${sid}`);
          localStorage.removeItem(`sistem_materi_timestamps_${sid}`);
          localStorage.removeItem(`sistem_materi_prog_details_${sid}`);
          localStorage.removeItem(`quiz_res_${materialId}_${sid}`);
          localStorage.removeItem(`quiz_answers_${materialId}_${sid}`);
        } catch {}

        invalidateCache(CACHE_KEYS.STUDENT_PROGRESS(sid));
        invalidateCache(CACHE_KEYS.STUDENT_PROGRESS_DETAILS(sid));
        invalidateCache(CACHE_KEYS.STUDENT_QUIZ_SCORES(sid));
      }
    }

    if (count > 0) {
      await batch.commit();
    }

    invalidateCache(CACHE_KEYS.ALL_STUDENT_PROGRESS);
    try {
      localStorage.removeItem('sistem_materi_all_progress_cache');
    } catch {}

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('storage'));
      window.dispatchEvent(
        new CustomEvent('student-material-reset', {
          detail: { materialId, allStudents: true },
        })
      );
    }

    return { success: true, count };
  } catch (err: any) {
    console.error('Error resetting all students material progress:', err);
    return { success: false, count: 0, message: err?.message || 'Gagal mereset semua data siswa.' };
  }
}

export async function fetchStudentProgress(studentId: string): Promise<string[]> {
  if (!studentId) return [];
  const detailsCached = getCacheData<StudentProgressRecord>(CACHE_KEYS.STUDENT_PROGRESS_DETAILS(studentId));
  if (detailsCached?.completedMaterialIds && Array.isArray(detailsCached.completedMaterialIds)) {
    return detailsCached.completedMaterialIds;
  }
  return swrFetch(
    CACHE_KEYS.STUDENT_PROGRESS(studentId),
    async () => {
      const ref = doc(db, STUDENT_PROGRESS_COL, studentId);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const data = snap.data();
        return data.completedMaterialIds || [];
      }
      return [];
    },
    {
      staleTime: 45_000,
      persistKey: `sistem_materi_prog_${studentId}`,
    }
  );
}

export async function fetchStudentProgressDetails(
  studentId: string,
  options?: { forceRevalidate?: boolean; additionalIds?: string[]; studentName?: string }
): Promise<StudentProgressRecord | null> {
  if (!studentId) return null;
  const candidateIds = Array.from(new Set([studentId, ...(options?.additionalIds || [])].filter(Boolean)));

  return swrFetch(
    CACHE_KEYS.STUDENT_PROGRESS_DETAILS(studentId),
    async () => {
      let snap: any = null;
      let matchedSid = studentId;

      for (const sid of candidateIds) {
        const ref = doc(db, STUDENT_PROGRESS_COL, sid);
        const s = await getDoc(ref);
        if (s.exists()) {
          snap = s;
          matchedSid = sid;
          break;
        }
      }

      if (snap && snap.exists()) {
        const data = snap.data();
        const rec: StudentProgressRecord = {
          studentId: matchedSid,
          studentName: data.studentName || '',
          kelas: data.kelas || '',
          completedMaterialIds: data.completedMaterialIds || [],
          completedMaterialTimestamps: data.completedMaterialTimestamps || {},
          scores: data.scores || {},
          quizAttempts: data.quizAttempts || {},
          activityLogs: data.activityLogs || [],
          notes: data.notes || {},
          bookmarkedMaterialIds: data.bookmarkedMaterialIds || [],
          gamification: data.gamification || undefined,
          updatedAt: data.updatedAt || '',
        };

        try {
          candidateIds.forEach((sid) => {
            localStorage.setItem(`sistem_materi_prog_${sid}`, JSON.stringify(rec.completedMaterialIds));
            localStorage.setItem(`sistem_materi_prog_times_${sid}`, JSON.stringify(rec.completedMaterialTimestamps));
            localStorage.setItem(`sistem_materi_activity_logs_${sid}`, JSON.stringify(rec.activityLogs));
            localStorage.setItem(`sistem_materi_scores_${sid}`, JSON.stringify(rec.scores || {}));
            localStorage.setItem(`sistem_materi_quiz_attempts_${sid}`, JSON.stringify(rec.quizAttempts || {}));
          });
        } catch {}

        return rec;
      }
      return null;
    },
    {
      staleTime: options?.forceRevalidate ? 0 : 45_000,
      forceRevalidate: options?.forceRevalidate || false,
      persistKey: `sistem_materi_prog_details_${studentId}`,
    }
  );
}

/**
 * Real-time subscription to a student's progress and quiz scores.
 * Automatically synchronizes localStorage and emits window events on updates/resets.
 */
export function subscribeStudentProgress(
  candidateIds: string[],
  callback: (record: StudentProgressRecord | null) => void
): () => void {
  const validIds = Array.from(new Set(candidateIds.filter(Boolean)));
  if (validIds.length === 0) return () => {};

  const unsubs: (() => void)[] = [];

  validIds.forEach((sid) => {
    try {
      const ref = doc(db, STUDENT_PROGRESS_COL, sid);
      const unsub = onSnapshot(
        ref,
        (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            const record: StudentProgressRecord = {
              studentId: sid,
              studentName: data.studentName || '',
              kelas: data.kelas || '',
              completedMaterialIds: Array.isArray(data.completedMaterialIds) ? data.completedMaterialIds : [],
              completedMaterialTimestamps: data.completedMaterialTimestamps || {},
              scores: data.scores || {},
              quizAttempts: data.quizAttempts || {},
              activityLogs: Array.isArray(data.activityLogs) ? data.activityLogs : [],
              notes: data.notes || {},
              bookmarkedMaterialIds: Array.isArray(data.bookmarkedMaterialIds) ? data.bookmarkedMaterialIds : [],
              gamification: data.gamification || undefined,
              updatedAt: data.updatedAt || '',
            };

            try {
              validIds.forEach((id) => {
                localStorage.setItem(`sistem_materi_prog_${id}`, JSON.stringify(record.completedMaterialIds));
                localStorage.setItem(`sistem_materi_prog_times_${id}`, JSON.stringify(record.completedMaterialTimestamps));
                localStorage.setItem(`sistem_materi_scores_${id}`, JSON.stringify(record.scores));
                localStorage.setItem(`sistem_materi_quiz_attempts_${id}`, JSON.stringify(record.quizAttempts));
                localStorage.setItem(`sistem_materi_activity_logs_${id}`, JSON.stringify(record.activityLogs));
              });
            } catch {}

            callback(record);

            if (typeof window !== 'undefined') {
              window.dispatchEvent(new Event('storage'));
              window.dispatchEvent(
                new CustomEvent('student-progress-sync', {
                  detail: { studentIds: validIds, record },
                })
              );
            }
          } else {
            callback(null);
          }
        },
        (error) => {
          console.warn('subscribeStudentProgress snapshot error for id:', sid, error);
        }
      );
      unsubs.push(unsub);
    } catch (err) {
      console.warn('Error creating onSnapshot listener for student:', sid, err);
    }
  });

  return () => {
    unsubs.forEach((u) => {
      try {
        u();
      } catch {}
    });
  };
}

export interface LeaderboardSummaryStudent {
  id: string;
  nama: string;
  kelas: string;
  nisn?: string;
  noAbsen?: string;
  exp: number;
  level: number;
  levelTitle: string;
  levelIcon: string;
  completedMaterialsCount: number;
  totalMaterialsCount: number;
  avgQuizScore: number;
  quizzesAttemptedCount: number;
  rank: number;
}

export interface LeaderboardSummaryDoc {
  updatedAt: string;
  totalStudents: number;
  topStudents: LeaderboardSummaryStudent[];
}

/**
 * High-performance Firestore quota optimization:
 * Reads a single pre-calculated aggregate leaderboard document.
 * Eliminates 1,000 document reads down to 1 single document read for students.
 */
export async function fetchLeaderboardSummary(): Promise<LeaderboardSummaryDoc | null> {
  return swrFetch(
    CACHE_KEYS.LEADERBOARD_SUMMARY,
    async () => {
      try {
        const ref = doc(db, SETTINGS_COL, 'leaderboard_summary');
        const snap = await getDoc(ref);
        if (snap.exists()) {
          return snap.data() as LeaderboardSummaryDoc;
        }
      } catch (err) {
        console.warn('Error fetching leaderboard summary:', err);
      }
      return null;
    },
    {
      staleTime: 600_000, // 10 minutes cache
      persistKey: 'sistem_materi_leaderboard_summary_cache',
    }
  );
}

/**
 * Pre-computes top rankings into a single document 'settings/leaderboard_summary'.
 * Allows 1,000+ students to access live rankings with almost zero Firestore read quota.
 */
export async function syncLeaderboardSummary(
  studentsList?: StudentAccount[],
  progressMap?: Record<string, StudentProgressRecord>
): Promise<LeaderboardSummaryDoc | null> {
  try {
    const students = studentsList && studentsList.length > 0 ? studentsList : await fetchStudents();
    const allProgress = progressMap && Object.keys(progressMap).length > 0 ? progressMap : await fetchAllStudentProgress();

    if (!students || students.length === 0) return null;

    const rankedList: LeaderboardSummaryStudent[] = students.map((s) => {
      const prog = allProgress[s.id] || allProgress[s.nisn] || {
        studentId: s.id,
        completedMaterialIds: [],
        scores: {},
      };
      const gamification = calculateStudentGamification(prog);
      const levelInfo = getCurrentLevelInfo(gamification.exp);
      const completedCount = (prog.completedMaterialIds || []).length;
      const rawScores = Object.values(prog.scores || {}).filter((v) => typeof v === 'number');
      const avgScore = rawScores.length > 0 ? Math.round(rawScores.reduce((a, b) => a + Number(b), 0) / rawScores.length) : 0;

      return {
        id: s.id,
        nama: s.nama,
        kelas: s.kelas || '',
        nisn: s.nisn || '',
        noAbsen: s.noAbsen || '',
        exp: gamification.exp,
        level: levelInfo.level,
        levelTitle: levelInfo.title,
        levelIcon: levelInfo.icon,
        completedMaterialsCount: completedCount,
        totalMaterialsCount: 0,
        avgQuizScore: avgScore,
        quizzesAttemptedCount: rawScores.length,
        rank: 1,
      };
    });

    rankedList.sort((a, b) => {
      if (b.exp !== a.exp) return b.exp - a.exp;
      if (b.completedMaterialsCount !== a.completedMaterialsCount) return b.completedMaterialsCount - a.completedMaterialsCount;
      return b.avgQuizScore - a.avgQuizScore;
    });

    rankedList.forEach((item, idx) => {
      item.rank = idx + 1;
    });

    // Top 100 students stored in the lightweight aggregate document
    const topStudents = rankedList.slice(0, 100);

    const summaryDoc: LeaderboardSummaryDoc = {
      updatedAt: new Date().toISOString(),
      totalStudents: students.length,
      topStudents,
    };

    const ref = doc(db, SETTINGS_COL, 'leaderboard_summary');
    await setDoc(ref, summaryDoc, { merge: true });
    setCacheData(CACHE_KEYS.LEADERBOARD_SUMMARY, summaryDoc, 'sistem_materi_leaderboard_summary_cache');
    return summaryDoc;
  } catch (err) {
    console.warn('Error syncing leaderboard summary:', err);
    return null;
  }
}

export async function fetchAllStudentProgress(): Promise<Record<string, StudentProgressRecord>> {
  return swrFetch(
    CACHE_KEYS.ALL_STUDENT_PROGRESS,
    async () => {
      const snap = await getDocs(collection(db, STUDENT_PROGRESS_COL));
      const result: Record<string, StudentProgressRecord> = {};
      snap.docs.forEach((d) => {
        const data = d.data();
        result[d.id] = {
          studentId: d.id,
          studentName: data.studentName || '',
          kelas: data.kelas || '',
          completedMaterialIds: data.completedMaterialIds || [],
          completedMaterialTimestamps: data.completedMaterialTimestamps || {},
          scores: data.scores || {},
          quizAttempts: data.quizAttempts || {},
          activityLogs: data.activityLogs || [],
          notes: data.notes || {},
          bookmarkedMaterialIds: data.bookmarkedMaterialIds || [],
          gamification: data.gamification || undefined,
          updatedAt: data.updatedAt || '',
        };
      });
      return result;
    },
    {
      staleTime: 180_000,
      persistKey: 'sistem_materi_all_progress_cache',
    }
  );
}

export async function resetAllStudentProgress(
  studentId: string,
  studentName?: string,
  kelas?: string,
  additionalStudentIds: string[] = []
): Promise<void> {
  if (!studentId) return;
  const initialIds = Array.from(new Set([studentId, ...additionalStudentIds].filter(Boolean)));
  const allDocIdsToReset = new Set<string>(initialIds);

  try {
    const allProgressSnap = await getDocs(collection(db, STUDENT_PROGRESS_COL));
    const matchedDocs: { ref: any; id: string; data: any }[] = [];

    allProgressSnap.docs.forEach((docSnap) => {
      const dId = docSnap.id;
      const data = docSnap.data();
      const sId = data.studentId;
      const sNisn = data.nisn;
      const sName = data.studentName;

      const isIdMatch =
        initialIds.includes(dId) ||
        (sId && initialIds.includes(sId)) ||
        (sNisn && initialIds.includes(sNisn));
      const isNameMatch =
        studentName && sName && sName.toLowerCase().trim() === studentName.toLowerCase().trim();

      if (isIdMatch || isNameMatch) {
        allDocIdsToReset.add(dId);
        if (sId) allDocIdsToReset.add(sId);
        if (sNisn) allDocIdsToReset.add(sNisn);
        matchedDocs.push({ ref: docSnap.ref, id: dId, data });
      }
    });

    const finalIds = Array.from(allDocIdsToReset);

    if (matchedDocs.length > 0) {
      const batch = writeBatch(db);
      for (const m of matchedDocs) {
        const payload = cleanFirestoreData({
          studentId: m.id,
          completedMaterialIds: [],
          completedMaterialTimestamps: {},
          activityLogs: [],
          scores: {},
          quizAttempts: {},
          ...(studentName ? { studentName } : (m.data.studentName ? { studentName: m.data.studentName } : {})),
          ...(kelas ? { kelas } : (m.data.kelas ? { kelas: m.data.kelas } : {})),
          updatedAt: new Date().toISOString(),
        });
        batch.set(m.ref, payload, { merge: false });
      }
      await batch.commit();
    } else {
      const batch = writeBatch(db);
      for (const sid of initialIds) {
        const ref = doc(db, STUDENT_PROGRESS_COL, sid);
        const payload = cleanFirestoreData({
          studentId: sid,
          completedMaterialIds: [],
          completedMaterialTimestamps: {},
          activityLogs: [],
          scores: {},
          quizAttempts: {},
          ...(studentName ? { studentName } : {}),
          ...(kelas ? { kelas } : {}),
          updatedAt: new Date().toISOString(),
        });
        batch.set(ref, payload, { merge: true });
      }
      await batch.commit();
    }

    for (const sid of finalIds) {
      invalidateCache(CACHE_KEYS.STUDENT_PROGRESS(sid));
      invalidateCache(CACHE_KEYS.STUDENT_PROGRESS_DETAILS(sid));
      invalidateCache(CACHE_KEYS.STUDENT_QUIZ_SCORES(sid));

      try {
        localStorage.setItem(`sistem_materi_prog_${sid}`, JSON.stringify([]));
        localStorage.setItem(`sistem_materi_prog_times_${sid}`, JSON.stringify({}));
        localStorage.setItem(`sistem_materi_timestamps_${sid}`, JSON.stringify({}));
        localStorage.setItem(`sistem_materi_activity_logs_${sid}`, JSON.stringify([]));
        localStorage.setItem(`sistem_materi_activity_${sid}`, JSON.stringify([]));
        localStorage.setItem(`sistem_materi_scores_${sid}`, JSON.stringify({}));
        localStorage.setItem(`sistem_materi_quiz_attempts_${sid}`, JSON.stringify({}));
        localStorage.removeItem(`sistem_materi_prog_details_${sid}`);
      } catch {}
    }

    invalidateCache(CACHE_KEYS.ALL_STUDENT_PROGRESS);
    try {
      localStorage.removeItem('sistem_materi_all_progress_cache');
    } catch {}

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('storage'));
      window.dispatchEvent(
        new CustomEvent('student-material-reset', {
          detail: { studentIds: finalIds, allMaterials: true },
        })
      );
    }
  } catch (err) {
    console.error('Error resetting all student progress:', err);
    throw err;
  }
}

/**
 * Resets/deletes a single student's mini quiz score and attempt record for a specific material using writeBatch.
 */
export async function resetStudentQuizScore(
  studentId: string,
  materialId: string,
  additionalStudentIds: string[] = [],
  studentName?: string
): Promise<void> {
  if (!studentId || !materialId) return;
  const initialIds = Array.from(new Set([studentId, ...additionalStudentIds].filter(Boolean)));
  const allDocIdsToReset = new Set<string>(initialIds);

  try {
    const allProgressSnap = await getDocs(collection(db, STUDENT_PROGRESS_COL));
    const matchedDocs: { ref: any; id: string; data: any }[] = [];

    allProgressSnap.docs.forEach((docSnap) => {
      const dId = docSnap.id;
      const data = docSnap.data();
      const sId = data.studentId;
      const sNisn = data.nisn;
      const sName = data.studentName;

      const isIdMatch =
        initialIds.includes(dId) ||
        (sId && initialIds.includes(sId)) ||
        (sNisn && initialIds.includes(sNisn));
      const isNameMatch =
        studentName && sName && sName.toLowerCase().trim() === studentName.toLowerCase().trim();

      if (isIdMatch || isNameMatch) {
        allDocIdsToReset.add(dId);
        if (sId) allDocIdsToReset.add(sId);
        if (sNisn) allDocIdsToReset.add(sNisn);
        matchedDocs.push({ ref: docSnap.ref, id: dId, data });
      }
    });

    const finalIds = Array.from(allDocIdsToReset);

    if (matchedDocs.length > 0) {
      const batch = writeBatch(db);
      for (const m of matchedDocs) {
        const existingScores = { ...(m.data.scores || {}) };
        const existingAttempts = { ...(m.data.quizAttempts || {}) };
        delete existingScores[materialId];
        delete existingAttempts[materialId];

        batch.update(m.ref, cleanFirestoreData({
          scores: existingScores,
          quizAttempts: existingAttempts,
          updatedAt: new Date().toISOString(),
        }));
      }
      await batch.commit();
    } else {
      for (const sid of initialIds) {
        const ref = doc(db, STUDENT_PROGRESS_COL, sid);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const data = snap.data();
          const existingScores = { ...(data.scores || {}) };
          const existingAttempts = { ...(data.quizAttempts || {}) };
          delete existingScores[materialId];
          delete existingAttempts[materialId];

          const batch = writeBatch(db);
          batch.update(ref, cleanFirestoreData({
            scores: existingScores,
            quizAttempts: existingAttempts,
            updatedAt: new Date().toISOString(),
          }));
          await batch.commit();
        }
      }
    }

    for (const sid of finalIds) {
      invalidateCache(CACHE_KEYS.ALL_STUDENT_PROGRESS);
      invalidateCache(CACHE_KEYS.STUDENT_PROGRESS(sid));
      invalidateCache(CACHE_KEYS.STUDENT_PROGRESS_DETAILS(sid));
      invalidateCache(CACHE_KEYS.STUDENT_QUIZ_SCORES(sid));

      try {
        const ls = localStorage.getItem(`sistem_materi_scores_${sid}`);
        if (ls) {
          const parsed = JSON.parse(ls);
          delete parsed[materialId];
          localStorage.setItem(`sistem_materi_scores_${sid}`, JSON.stringify(parsed));
        }
        const la = localStorage.getItem(`sistem_materi_quiz_attempts_${sid}`);
        if (la) {
          const parsed = JSON.parse(la);
          delete parsed[materialId];
          localStorage.setItem(`sistem_materi_quiz_attempts_${sid}`, JSON.stringify(parsed));
        }
        localStorage.removeItem(`quiz_res_${materialId}_${sid}`);
        localStorage.removeItem(`quiz_answers_${materialId}_${sid}`);
        localStorage.removeItem(`sistem_materi_quiz_ans_${materialId}_${sid}`);
        localStorage.removeItem(`simpel_quiz_progress_${materialId}_${sid}`);
      } catch {}
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('storage'));
      window.dispatchEvent(
        new CustomEvent('student-material-reset', {
          detail: { studentIds: finalIds, materialId },
        })
      );
    }
  } catch (err) {
    console.warn('Error resetting quiz score from Firestore:', err);
  }
}

// Master Classes & Grades Configuration
const MASTER_CONFIG_DOC = 'master_academic_config';

export interface GradeConfig {
  id: string;
  label: string;
  subLabel: string;
}

export const DEFAULT_GRADES: GradeConfig[] = [
  { id: '7', label: 'Kelas 7', subLabel: 'Jenjang SMP' },
  { id: '8', label: 'Kelas 8', subLabel: 'Jenjang SMP' },
  { id: '9', label: 'Kelas 9', subLabel: 'Jenjang SMP' },
  { id: '10', label: 'Kelas 10', subLabel: 'SMA / SMK' },
  { id: '11', label: 'Kelas 11', subLabel: 'SMA / SMK' },
  { id: '12', label: 'Kelas 12', subLabel: 'SMA / SMK' },
];

export const DEFAULT_PRESET_CLASSES = [
  '7.1', '7.2', '7.3', '7.4',
  '8.1', '8.2', '8.3', '8.4',
  '9.1', '9.2', '9.3', '9.4',
  '10A', '10B', '11A', '11B', '12A', '12B',
];

export async function fetchMasterGrades(): Promise<GradeConfig[]> {
  return swrFetch(
    CACHE_KEYS.MASTER_GRADES,
    async () => {
      const ref = doc(db, SETTINGS_COL, MASTER_CONFIG_DOC);
      const snap = await getDoc(ref);
      if (snap.exists() && snap.data().grades && Array.isArray(snap.data().grades)) {
        return snap.data().grades;
      }
      return DEFAULT_GRADES;
    },
    {
      staleTime: 900_000,
      persistKey: 'sistem_materi_master_grades',
    }
  );
}

export async function saveMasterGrades(grades: GradeConfig[]): Promise<void> {
  try {
    const ref = doc(db, SETTINGS_COL, MASTER_CONFIG_DOC);
    await setDoc(ref, { grades, updatedAt: new Date().toISOString() }, { merge: true });
    invalidateCache(CACHE_KEYS.MASTER_GRADES);
  } catch (err) {
    console.warn('Could not save master grades to Firestore:', err);
  }
  try {
    localStorage.setItem('sistem_materi_master_grades', JSON.stringify(grades));
  } catch {}
}

export async function fetchMasterClasses(): Promise<string[]> {
  return swrFetch(
    CACHE_KEYS.MASTER_CLASSES,
    async () => {
      const ref = doc(db, SETTINGS_COL, MASTER_CONFIG_DOC);
      const snap = await getDoc(ref);
      if (snap.exists() && snap.data().customClasses && Array.isArray(snap.data().customClasses)) {
        return snap.data().customClasses;
      }
      return DEFAULT_PRESET_CLASSES;
    },
    {
      staleTime: 900_000,
      persistKey: 'sistem_materi_master_classes',
    }
  );
}

export async function saveMasterClasses(customClasses: string[]): Promise<void> {
  try {
    const ref = doc(db, SETTINGS_COL, MASTER_CONFIG_DOC);
    await setDoc(ref, { customClasses, updatedAt: new Date().toISOString() }, { merge: true });
    invalidateCache(CACHE_KEYS.MASTER_CLASSES);
  } catch (err) {
    console.warn('Could not save master classes to Firestore:', err);
  }
  try {
    localStorage.setItem('sistem_materi_master_classes', JSON.stringify(customClasses));
  } catch {}
}

/**
 * Renames a class in all student documents and teacher assignments that belong to that class.
 */
export async function renameClassInStudents(oldClass: string, newClass: string): Promise<number> {
  const cleanOld = oldClass.trim();
  const cleanNew = newClass.trim();
  if (!cleanOld || !cleanNew || cleanOld === cleanNew) return 0;

  const students = await fetchStudents();
  const targets = students.filter((s) => (s.kelas || '').trim().toLowerCase() === cleanOld.toLowerCase());
  
  if (targets.length > 0) {
    const batch = writeBatch(db);
    targets.forEach((s) => {
      const ref = doc(db, STUDENTS_COL, s.id);
      batch.update(ref, { kelas: cleanNew, updatedAt: new Date().toISOString() });
    });
    await batch.commit();

    // Update local cache
    try {
      const updated = (students || []).map((s) =>
        (s.kelas || '').trim().toLowerCase() === cleanOld.toLowerCase() ? { ...s, kelas: cleanNew } : s
      );
      localStorage.setItem('sistem_materi_students_cache', JSON.stringify(updated));
    } catch {}
  }

  // Also sync teachers' assigned classes
  try {
    const teachers = (await fetchTeachers()) || [];
    const teachersToUpdate = teachers.filter((t) =>
      (t.assignedClasses || []).some((c) => c.trim().toLowerCase() === cleanOld.toLowerCase())
    );
    if (teachersToUpdate.length > 0) {
      const batch = writeBatch(db);
      teachersToUpdate.forEach((t) => {
        const updatedClasses = (t.assignedClasses || []).map((c) =>
          c.trim().toLowerCase() === cleanOld.toLowerCase() ? cleanNew : c
        );
        const ref = doc(db, TEACHERS_COL, t.id);
        batch.update(ref, { assignedClasses: updatedClasses, updatedAt: new Date().toISOString() });
      });
      await batch.commit();

      const updatedAllTeachers = (teachers || []).map((t) => ({
        ...t,
        assignedClasses: (t.assignedClasses || []).map((c) =>
          c.trim().toLowerCase() === cleanOld.toLowerCase() ? cleanNew : c
        ),
      }));
      localStorage.setItem('sistem_materi_teachers_cache', JSON.stringify(updatedAllTeachers));
    }
  } catch (err) {
    console.warn('Error syncing teachers on rename class:', err);
  }

  // Also update master classes list if present
  const masterClasses = (await fetchMasterClasses()) || [];
  const updatedMaster = (masterClasses || []).map((c) => (c.trim().toLowerCase() === cleanOld.toLowerCase() ? cleanNew : c));
  if (!updatedMaster.includes(cleanNew)) {
    updatedMaster.push(cleanNew);
  }
  await saveMasterClasses(updatedMaster);

  return targets.length;
}

/**
 * Deletes a class, with option to delete students inside or move them to another class, and syncs teachers.
 */
export async function deleteClassAndStudents(
  className: string,
  alsoDeleteStudents: boolean = false,
  moveToClass?: string
): Promise<{ affectedStudents: number }> {
  const cleanName = className.trim();
  const students = await fetchStudents();
  const targets = students.filter((s) => (s.kelas || '').trim().toLowerCase() === cleanName.toLowerCase());

  if (targets.length > 0) {
    const batch = writeBatch(db);
    if (alsoDeleteStudents) {
      targets.forEach((s) => {
        const ref = doc(db, STUDENTS_COL, s.id);
        batch.delete(ref);
      });
    } else if (moveToClass) {
      targets.forEach((s) => {
        const ref = doc(db, STUDENTS_COL, s.id);
        batch.update(ref, { kelas: moveToClass.trim(), updatedAt: new Date().toISOString() });
      });
    }
    await batch.commit();

    // Update local cache
    try {
      let updated: StudentAccount[];
      if (alsoDeleteStudents) {
        updated = (students || []).filter((s) => (s.kelas || '').trim().toLowerCase() !== cleanName.toLowerCase());
      } else if (moveToClass) {
        updated = (students || []).map((s) =>
          (s.kelas || '').trim().toLowerCase() === cleanName.toLowerCase() ? { ...s, kelas: moveToClass.trim() } : s
        );
      } else {
        updated = students || [];
      }
      localStorage.setItem('sistem_materi_students_cache', JSON.stringify(updated));
    } catch {}
  }

  // Sync teachers' assigned classes: remove the deleted class or change it to moveToClass
  try {
    const teachers = (await fetchTeachers()) || [];
    const teachersToUpdate = (teachers || []).filter((t) =>
      (t.assignedClasses || []).some((c) => c.trim().toLowerCase() === cleanName.toLowerCase())
    );
    if (teachersToUpdate.length > 0) {
      const batch = writeBatch(db);
      teachersToUpdate.forEach((t) => {
        let updatedClasses: string[];
        if (moveToClass) {
          updatedClasses = (t.assignedClasses || []).map((c) =>
            c.trim().toLowerCase() === cleanName.toLowerCase() ? moveToClass.trim() : c
          );
        } else {
          updatedClasses = (t.assignedClasses || []).filter(
            (c) => c.trim().toLowerCase() !== cleanName.toLowerCase()
          );
        }
        const ref = doc(db, TEACHERS_COL, t.id);
        batch.update(ref, { assignedClasses: updatedClasses, updatedAt: new Date().toISOString() });
      });
      await batch.commit();

      const updatedAllTeachers = (teachers || []).map((t) => {
        let updatedClasses: string[];
        if (moveToClass) {
          updatedClasses = (t.assignedClasses || []).map((c) =>
            c.trim().toLowerCase() === cleanName.toLowerCase() ? moveToClass.trim() : c
          );
        } else {
          updatedClasses = (t.assignedClasses || []).filter(
            (c) => c.trim().toLowerCase() !== cleanName.toLowerCase()
          );
        }
        return { ...t, assignedClasses: updatedClasses };
      });
      localStorage.setItem('sistem_materi_teachers_cache', JSON.stringify(updatedAllTeachers));
    }
  } catch (err) {
    console.warn('Error syncing teachers on delete class:', err);
  }

  // Remove from master classes list
  const masterClasses = (await fetchMasterClasses()) || [];
  const updatedMaster = (masterClasses || []).filter((c) => c.trim().toLowerCase() !== cleanName.toLowerCase());
  await saveMasterClasses(updatedMaster);

  return { affectedStudents: targets.length };
}

/**
 * Deletes a grade level (e.g. Grade 12), with option to delete or reassign students, and syncs teachers.
 */
export async function deleteGradeLevel(
  gradeId: string,
  alsoDeleteStudents: boolean = false
): Promise<{ affectedStudents: number }> {
  const cleanGrade = gradeId.trim().toUpperCase();
  const students = (await fetchStudents()) || [];
  
  const isMatchGrade = (cls: string) => {
    const clean = (cls || '').trim().toUpperCase();
    if (cleanGrade === '7') return /^(KELAS\s*)?(7|VII)(\.|\s|[A-Z]|$)/i.test(clean);
    if (cleanGrade === '8') return /^(KELAS\s*)?(8|VIII)(\.|\s|[A-Z]|$)/i.test(clean);
    if (cleanGrade === '9') return /^(KELAS\s*)?(9|IX)(\.|\s|[A-Z]|$)/i.test(clean);
    if (cleanGrade === '10') return /^(KELAS\s*)?(10|X)(\.|\s|[A-Z]|$)/i.test(clean);
    if (cleanGrade === '11') return /^(KELAS\s*)?(11|XI)(\.|\s|[A-Z]|$)/i.test(clean);
    if (cleanGrade === '12') return /^(KELAS\s*)?(12|XII)(\.|\s|[A-Z]|$)/i.test(clean);
    return clean === cleanGrade;
  };

  const targets = (students || []).filter((s) => isMatchGrade(s.kelas || ''));

  if (targets.length > 0 && alsoDeleteStudents) {
    const batch = writeBatch(db);
    targets.forEach((s) => {
      const ref = doc(db, STUDENTS_COL, s.id);
      batch.delete(ref);
    });
    await batch.commit();

    try {
      const updated = (students || []).filter((s) => !isMatchGrade(s.kelas || ''));
      localStorage.setItem('sistem_materi_students_cache', JSON.stringify(updated));
    } catch {}
  }

  // Remove matching classes from teachers assigned classes
  try {
    const teachers = (await fetchTeachers()) || [];
    const teachersToUpdate = (teachers || []).filter((t) =>
      (t.assignedClasses || []).some((c) => isMatchGrade(c))
    );
    if (teachersToUpdate.length > 0) {
      const batch = writeBatch(db);
      teachersToUpdate.forEach((t) => {
        const updatedClasses = (t.assignedClasses || []).filter((c) => !isMatchGrade(c));
        const ref = doc(db, TEACHERS_COL, t.id);
        batch.update(ref, { assignedClasses: updatedClasses, updatedAt: new Date().toISOString() });
      });
      await batch.commit();

      const updatedAllTeachers = (teachers || []).map((t) => ({
        ...t,
        assignedClasses: (t.assignedClasses || []).filter((c) => !isMatchGrade(c)),
      }));
      localStorage.setItem('sistem_materi_teachers_cache', JSON.stringify(updatedAllTeachers));
    }
  } catch (err) {
    console.warn('Error syncing teachers on delete grade:', err);
  }

  // Remove from master grades list
  const currentGrades = await fetchMasterGrades();
  const updatedGrades = currentGrades.filter((g) => g.id.toUpperCase() !== cleanGrade);
  await saveMasterGrades(updatedGrades);

  // Remove matching master classes
  const masterClasses = await fetchMasterClasses();
  const updatedMasterClasses = masterClasses.filter((c) => !isMatchGrade(c));
  await saveMasterClasses(updatedMasterClasses);

  return { affectedStudents: targets.length };
}

/**
 * Exports all system data including subjects, categories, materials, teachers, students, progress, settings, and theme.
 */
export async function exportAllSystemData(): Promise<SystemBackupData> {
  const [subjects, categories, materials, teachers, students, progressMap, masterGrades, masterClasses, themeConfig] = await Promise.all([
    fetchSubjects(),
    fetchCategories(),
    fetchMaterials(),
    fetchTeachers(),
    fetchStudents(),
    fetchAllStudentProgress(),
    fetchMasterGrades(),
    fetchMasterClasses(),
    fetchThemeConfig(),
  ]);

  let adminSettings: Partial<AdminSettings> = {};
  try {
    const settingsSnap = await getDoc(doc(db, SETTINGS_COL, ADMIN_DOC_ID));
    if (settingsSnap.exists()) {
      adminSettings = settingsSnap.data() as Partial<AdminSettings>;
    }
  } catch {}

  const backupData: SystemBackupData = {
    version: '2.5.0',
    backupDate: new Date().toISOString(),
    systemName: adminSettings.siteTitle || 'Sistem Materi Pembelajaran Digital',
    subjects,
    categories,
    materials,
    teachers,
    students,
    studentProgress: progressMap,
    masterGrades,
    masterClasses,
    adminSettings,
    themeConfig,
  };

  return backupData;
}

/**
 * Restores system data from a backup object with options for merge or clean replacement.
 * Uses safe batch chunking (max 400 ops per batch) to handle large datasets seamlessly.
 */
export async function restoreSystemData(
  backupData: SystemBackupData,
  mode: 'replace' | 'merge' = 'replace'
): Promise<{
  subjectsCount: number;
  categoriesCount: number;
  materialsCount: number;
  teachersCount: number;
  studentsCount: number;
  progressCount: number;
}> {
  if (!backupData || typeof backupData !== 'object') {
    throw new Error('Format file backup tidak valid.');
  }

  const BATCH_LIMIT = 400;

  // 1. If replace mode, clear existing collections
  if (mode === 'replace') {
    await clearAllFirestoreData();

    // Clear teachers
    try {
      const teachersSnap = await getDocs(collection(db, TEACHERS_COL));
      if (!teachersSnap.empty) {
        for (let i = 0; i < teachersSnap.docs.length; i += BATCH_LIMIT) {
          const chunk = teachersSnap.docs.slice(i, i + BATCH_LIMIT);
          const batch = writeBatch(db);
          chunk.forEach((d) => batch.delete(d.ref));
          await batch.commit();
        }
      }
    } catch {}

    // Clear students
    try {
      const studentsSnap = await getDocs(collection(db, STUDENTS_COL));
      if (!studentsSnap.empty) {
        for (let i = 0; i < studentsSnap.docs.length; i += BATCH_LIMIT) {
          const chunk = studentsSnap.docs.slice(i, i + BATCH_LIMIT);
          const batch = writeBatch(db);
          chunk.forEach((d) => batch.delete(d.ref));
          await batch.commit();
        }
      }
    } catch {}

    // Clear student progress
    try {
      const progressSnap = await getDocs(collection(db, STUDENT_PROGRESS_COL));
      if (!progressSnap.empty) {
        for (let i = 0; i < progressSnap.docs.length; i += BATCH_LIMIT) {
          const chunk = progressSnap.docs.slice(i, i + BATCH_LIMIT);
          const batch = writeBatch(db);
          chunk.forEach((d) => batch.delete(d.ref));
          await batch.commit();
        }
      }
    } catch {}
  }

  // 2. Restore Subjects
  if (Array.isArray(backupData.subjects) && backupData.subjects.length > 0) {
    const validSubjects = backupData.subjects.filter((s) => s && s.id);
    for (let i = 0; i < validSubjects.length; i += BATCH_LIMIT) {
      const chunk = validSubjects.slice(i, i + BATCH_LIMIT);
      const batch = writeBatch(db);
      chunk.forEach((s) => {
        const ref = doc(db, SUBJECTS_COL, s.id);
        batch.set(ref, s, { merge: true });
      });
      await batch.commit();
    }
    try {
      localStorage.setItem('sistem_materi_subj_cache', JSON.stringify(validSubjects));
    } catch {}
  }

  // 3. Restore Categories
  if (Array.isArray(backupData.categories) && backupData.categories.length > 0) {
    const validCats = backupData.categories.filter((c) => c && c.id);
    for (let i = 0; i < validCats.length; i += BATCH_LIMIT) {
      const chunk = validCats.slice(i, i + BATCH_LIMIT);
      const batch = writeBatch(db);
      chunk.forEach((c) => {
        const ref = doc(db, CATEGORIES_COL, c.id);
        batch.set(ref, c, { merge: true });
      });
      await batch.commit();
    }
    try {
      localStorage.setItem('sistem_materi_cat_cache', JSON.stringify(validCats));
    } catch {}
  }

  // 4. Restore Materials
  if (Array.isArray(backupData.materials) && backupData.materials.length > 0) {
    const validMats = backupData.materials.filter((m) => m && m.id);
    for (let i = 0; i < validMats.length; i += BATCH_LIMIT) {
      const chunk = validMats.slice(i, i + BATCH_LIMIT);
      const batch = writeBatch(db);
      chunk.forEach((m) => {
        const ref = doc(db, MATERIALS_COL, m.id);
        batch.set(ref, m, { merge: true });
      });
      await batch.commit();
    }
    try {
      localStorage.setItem('sistem_materi_mat_cache', JSON.stringify(validMats));
    } catch {}
  }

  // 5. Restore Teachers
  if (Array.isArray(backupData.teachers) && backupData.teachers.length > 0) {
    const validTeachers = backupData.teachers.filter((t) => t && t.id);
    for (let i = 0; i < validTeachers.length; i += BATCH_LIMIT) {
      const chunk = validTeachers.slice(i, i + BATCH_LIMIT);
      const batch = writeBatch(db);
      chunk.forEach((t) => {
        const ref = doc(db, TEACHERS_COL, t.id);
        batch.set(ref, t, { merge: true });
      });
      await batch.commit();
    }
    try {
      localStorage.setItem('sistem_materi_teachers_cache', JSON.stringify(validTeachers));
    } catch {}
  }

  // 6. Restore Students
  if (Array.isArray(backupData.students) && backupData.students.length > 0) {
    const validStudents = backupData.students.filter((s) => s && s.id);
    for (let i = 0; i < validStudents.length; i += BATCH_LIMIT) {
      const chunk = validStudents.slice(i, i + BATCH_LIMIT);
      const batch = writeBatch(db);
      chunk.forEach((s) => {
        const ref = doc(db, STUDENTS_COL, s.id);
        batch.set(ref, s, { merge: true });
      });
      await batch.commit();
    }
    try {
      localStorage.setItem('sistem_materi_students_cache', JSON.stringify(validStudents));
    } catch {}
  }

  // 7. Restore Student Progress
  let progressCount = 0;
  if (backupData.studentProgress && typeof backupData.studentProgress === 'object') {
    const entries = Object.entries(backupData.studentProgress).filter(([id, p]) => id && p);
    if (entries.length > 0) {
      for (let i = 0; i < entries.length; i += BATCH_LIMIT) {
        const chunk = entries.slice(i, i + BATCH_LIMIT);
        const batch = writeBatch(db);
        chunk.forEach(([studentId, prog]) => {
          const ref = doc(db, STUDENT_PROGRESS_COL, studentId);
          batch.set(ref, prog, { merge: true });
          try {
            localStorage.setItem(`sistem_materi_prog_${studentId}`, JSON.stringify(prog.completedMaterialIds || []));
            if (prog.completedMaterialTimestamps) {
              localStorage.setItem(`sistem_materi_prog_times_${studentId}`, JSON.stringify(prog.completedMaterialTimestamps));
              localStorage.setItem(`sistem_materi_timestamps_${studentId}`, JSON.stringify(prog.completedMaterialTimestamps));
            }
            if (prog.activityLogs) {
              localStorage.setItem(`sistem_materi_activity_logs_${studentId}`, JSON.stringify(prog.activityLogs));
              localStorage.setItem(`sistem_materi_activity_${studentId}`, JSON.stringify(prog.activityLogs));
            }
          } catch {}
        });
        await batch.commit();
      }
      progressCount = entries.length;
    }
  }

  // 8. Restore Master academic config
  if (Array.isArray(backupData.masterGrades) && backupData.masterGrades.length > 0) {
    await saveMasterGrades(backupData.masterGrades);
  }
  if (Array.isArray(backupData.masterClasses) && backupData.masterClasses.length > 0) {
    await saveMasterClasses(backupData.masterClasses);
  }

  // 9. Restore Admin Settings
  if (backupData.adminSettings) {
    try {
      const ref = doc(db, SETTINGS_COL, ADMIN_DOC_ID);
      await setDoc(ref, backupData.adminSettings, { merge: true });
      if (backupData.adminSettings.siteTitle) {
        localStorage.setItem('sistem_materi_site_title', backupData.adminSettings.siteTitle);
      }
    } catch {}
  }

  // 10. Restore Theme Config
  if (backupData.themeConfig) {
    try {
      await saveThemeConfig(backupData.themeConfig);
    } catch {}
  }

  return {
    subjectsCount: backupData.subjects?.length || 0,
    categoriesCount: backupData.categories?.length || 0,
    materialsCount: backupData.materials?.length || 0,
    teachersCount: backupData.teachers?.length || 0,
    studentsCount: backupData.students?.length || 0,
    progressCount,
  };
}

// ----------------------------------------------------
// Theme & Event Configuration Service
// ----------------------------------------------------
const THEME_CONFIG_DOC_ID = 'theme_config';

export async function fetchThemeConfig(): Promise<ThemeConfig> {
  return swrFetch(
    CACHE_KEYS.THEME_CONFIG,
    async () => {
      try {
        const docRef = doc(db, SETTINGS_COL, THEME_CONFIG_DOC_ID);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const data = snap.data() as ThemeConfig;
          return { ...DEFAULT_THEME_CONFIG, ...data };
        }
        return DEFAULT_THEME_CONFIG;
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, `${SETTINGS_COL}/${THEME_CONFIG_DOC_ID}`);
        throw err;
      }
    },
    {
      staleTime: 900_000,
      persistKey: 'sistem_materi_theme_cache',
    }
  );
}

export function subscribeThemeConfig(
  callback: (theme: ThemeConfig) => void,
  onError?: (err: any) => void
): () => void {
  const docRef = doc(db, SETTINGS_COL, THEME_CONFIG_DOC_ID);
  const unsubscribe = onSnapshot(
    docRef,
    (snap) => {
      if (snap.exists()) {
        const data = snap.data() as ThemeConfig;
        const merged = { ...DEFAULT_THEME_CONFIG, ...data };
        setCacheData(CACHE_KEYS.THEME_CONFIG, merged, 'sistem_materi_theme_cache', false);
        callback(merged);
      }
    },
    (error) => {
      console.error('[subscribeThemeConfig] onSnapshot error:', error);
      if (onError) onError(error);
      handleFirestoreError(error, OperationType.GET, `${SETTINGS_COL}/${THEME_CONFIG_DOC_ID}`);
    }
  );
  return unsubscribe;
}


export async function saveThemeConfig(themeConfig: ThemeConfig): Promise<void> {
  const cleanData = cleanFirestoreData({
    ...themeConfig,
    updatedAt: new Date().toISOString()
  });

  const docRef = doc(db, SETTINGS_COL, THEME_CONFIG_DOC_ID);
  await setDoc(docRef, cleanData, { merge: true });
  setCacheData(CACHE_KEYS.THEME_CONFIG, cleanData, 'sistem_materi_theme_cache');
}

// ----------------------------------------------------
// Database Diagnostic Scanner & Junk Cleaner Service
// ----------------------------------------------------

/**
 * Scans all Firestore collections for orphan records, dead references, and corrupted documents.
 */
export async function scanDatabaseJunk(): Promise<DatabaseJunkReport> {
  try {
    const [subjectsSnap, categoriesSnap, materialsSnap, teachersSnap, studentsSnap, progressSnap] = await Promise.all([
      getDocs(collection(db, SUBJECTS_COL)),
      getDocs(collection(db, CATEGORIES_COL)),
      getDocs(collection(db, MATERIALS_COL)),
      getDocs(collection(db, TEACHERS_COL)),
      getDocs(collection(db, STUDENTS_COL)),
      getDocs(collection(db, 'student_progress')),
    ]);

    const subjectIds = new Set(subjectsSnap.docs.map((d) => d.id));
    const categoryIds = new Set(categoriesSnap.docs.map((d) => d.id));
    const materialIds = new Set(materialsSnap.docs.map((d) => d.id));
    const studentIds = new Set(studentsSnap.docs.map((d) => d.id));

    const items: DatabaseJunkItem[] = [];
    let orphanProgressCount = 0;
    let orphanCategoriesCount = 0;
    let orphanMaterialsCount = 0;
    let staleMaterialScoresCount = 0;
    let invalidStudentsCount = 0;
    let invalidTeachersCount = 0;

    // 1. Check Orphan Categories (where subjectId does not exist)
    categoriesSnap.docs.forEach((d) => {
      const cat = d.data();
      if (!cat.subjectId || !subjectIds.has(cat.subjectId)) {
        orphanCategoriesCount++;
        items.push({
          id: d.id,
          type: 'orphan_category',
          title: `Topik Tanpa Mapel: "${cat.name || d.id}"`,
          description: `Topik ini tertaut ke ID Mapel "${cat.subjectId || 'Kosong'}" yang sudah terhapus dari sistem.`,
          collection: CATEGORIES_COL,
          rawDetails: { categoryId: d.id, subjectId: cat.subjectId, name: cat.name },
        });
      }
    });

    // 2. Check Orphan Materials (where categoryId or subjectId is missing)
    materialsSnap.docs.forEach((d) => {
      const mat = d.data();
      const isOrphanCat = !mat.categoryId || !categoryIds.has(mat.categoryId);
      const isOrphanSubj = mat.subjectId && !subjectIds.has(mat.subjectId);
      if (isOrphanCat || isOrphanSubj) {
        orphanMaterialsCount++;
        items.push({
          id: d.id,
          type: 'orphan_material',
          title: `Materi Tanpa Induk: "${mat.title || d.id}"`,
          description: isOrphanCat
            ? `Materi ini terikat ke Topik ID "${mat.categoryId || 'Kosong'}" yang sudah tidak ditemukan.`
            : `Materi ini terikat ke Mapel ID "${mat.subjectId}" yang sudah dihapus.`,
          collection: MATERIALS_COL,
          rawDetails: { materialId: d.id, categoryId: mat.categoryId, subjectId: mat.subjectId, title: mat.title },
        });
      }
    });

    // 3. Check Orphan Student Progress (progress documents of deleted students)
    progressSnap.docs.forEach((d) => {
      const prog = d.data() as StudentProgressRecord;
      const docStudentId = d.id;
      const isStudentMissing = !studentIds.has(docStudentId) && (!prog.studentId || !studentIds.has(prog.studentId));

      if (isStudentMissing) {
        orphanProgressCount++;
        items.push({
          id: d.id,
          type: 'orphan_progress',
          title: `Progres Siswa Terhapus: ID "${docStudentId}"`,
          description: `Rekam nilai/progres (${prog.studentName || 'Tanpa Nama'} - Kelas ${prog.kelas || 'N/A'}) untuk akun siswa yang sudah dihapus.`,
          collection: 'student_progress',
          rawDetails: { docId: d.id, studentName: prog.studentName, kelas: prog.kelas },
        });
      } else {
        // Check for stale scores / quiz attempts referencing dead material IDs
        const staleMatKeys: string[] = [];
        if (prog.scores) {
          Object.keys(prog.scores).forEach((mId) => {
            if (!materialIds.has(mId)) staleMatKeys.push(mId);
          });
        }
        if (prog.completedMaterialIds) {
          prog.completedMaterialIds.forEach((mId) => {
            if (!materialIds.has(mId) && !staleMatKeys.includes(mId)) staleMatKeys.push(mId);
          });
        }
        if (staleMatKeys.length > 0) {
          staleMaterialScoresCount += staleMatKeys.length;
          items.push({
            id: d.id,
            type: 'stale_score',
            title: `Referensi Materi Usang (${prog.studentName || docStudentId})`,
            description: `Terdapat ${staleMatKeys.length} riwayat nilai/kuis pada materi lama yang sudah dihapus dari bank materi.`,
            collection: 'student_progress',
            rawDetails: { docId: d.id, deadMaterialIds: staleMatKeys, studentName: prog.studentName },
          });
        }
      }
    });

    // 4. Check Invalid / Corrupted Student Records
    studentsSnap.docs.forEach((d) => {
      const s = d.data();
      if (!s.nama || !s.nama.trim() || !d.id) {
        invalidStudentsCount++;
        items.push({
          id: d.id,
          type: 'invalid_student',
          title: `Data Siswa Rusak / Tanpa Nama: ID "${d.id}"`,
          description: `Entri siswa tidak memiliki nama lengkap atau mengalami kegagalan simpan dokumen.`,
          collection: STUDENTS_COL,
          rawDetails: { docId: d.id, data: s },
        });
      }
    });

    // 5. Check Invalid / Corrupted Teacher Records
    teachersSnap.docs.forEach((d) => {
      const t = d.data();
      if (!t.name || !t.name.trim() || !t.username || !t.username.trim()) {
        invalidTeachersCount++;
        items.push({
          id: d.id,
          type: 'invalid_teacher',
          title: `Data Guru Rusak: ID "${d.id}"`,
          description: `Akun guru tidak memiliki nama lengkap atau username login yang valid.`,
          collection: TEACHERS_COL,
          rawDetails: { docId: d.id, data: t },
        });
      }
    });

    const totalJunkCount =
      orphanProgressCount +
      orphanCategoriesCount +
      orphanMaterialsCount +
      staleMaterialScoresCount +
      invalidStudentsCount +
      invalidTeachersCount;

    return {
      scannedAt: new Date().toISOString(),
      totalJunkCount,
      orphanProgressCount,
      orphanCategoriesCount,
      orphanMaterialsCount,
      staleMaterialScoresCount,
      invalidStudentsCount,
      invalidTeachersCount,
      items,
      healthy: totalJunkCount === 0,
    };
  } catch (err) {
    console.error('Error scanning database junk:', err);
    return {
      scannedAt: new Date().toISOString(),
      totalJunkCount: 0,
      orphanProgressCount: 0,
      orphanCategoriesCount: 0,
      orphanMaterialsCount: 0,
      staleMaterialScoresCount: 0,
      invalidStudentsCount: 0,
      invalidTeachersCount: 0,
      items: [],
      healthy: true,
    };
  }
}

/**
 * Cleans selected junk items or all identified junk from Firestore and refreshes caches.
 */
export async function cleanDatabaseJunk(
  report?: DatabaseJunkReport,
  selectedItemIds?: string[]
): Promise<{ cleanedCount: number; message: string }> {
  const currentReport = report || (await scanDatabaseJunk());
  const itemsToClean =
    selectedItemIds && selectedItemIds.length > 0
      ? currentReport.items.filter((item) => selectedItemIds.includes(item.id))
      : currentReport.items;

  if (itemsToClean.length === 0) {
    return { cleanedCount: 0, message: 'Database dalam kondisi bersih. Tidak ada item sampah yang perlu dihapus.' };
  }

  const batchSize = 400;
  let totalCleaned = 0;

  // 1. Delete standalone orphan docs (orphan progress, orphan categories, orphan materials, broken accounts)
  const docsToDelete = itemsToClean.filter((item) => item.type !== 'stale_score');
  for (let i = 0; i < docsToDelete.length; i += batchSize) {
    const chunk = docsToDelete.slice(i, i + batchSize);
    const batch = writeBatch(db);
    chunk.forEach((item) => {
      const ref = doc(db, item.collection, item.id);
      batch.delete(ref);
    });
    await batch.commit();
    totalCleaned += chunk.length;
  }

  // 2. Prune dead material references inside student progress documents
  const staleScoreItems = itemsToClean.filter((item) => item.type === 'stale_score');
  for (let i = 0; i < staleScoreItems.length; i += batchSize) {
    const chunk = staleScoreItems.slice(i, i + batchSize);
    const batch = writeBatch(db);
    for (const item of chunk) {
      try {
        const deadIds = new Set<string>(item.rawDetails?.deadMaterialIds || []);
        const ref = doc(db, 'student_progress', item.id);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const prog = snap.data() as StudentProgressRecord;
          const updatedScores = { ...(prog.scores || {}) };
          const updatedQuizAttempts = { ...(prog.quizAttempts || {}) };
          const updatedCompletedTimestamps = { ...(prog.completedMaterialTimestamps || {}) };
          deadIds.forEach((id) => {
            delete updatedScores[id];
            delete updatedQuizAttempts[id];
            delete updatedCompletedTimestamps[id];
          });
          const updatedCompletedIds = (prog.completedMaterialIds || []).filter((id) => !deadIds.has(id));
          const updatedActivityLogs = (prog.activityLogs || []).filter((log) => !deadIds.has(log.materialId));

          batch.update(
            ref,
            cleanFirestoreData({
              scores: updatedScores,
              quizAttempts: updatedQuizAttempts,
              completedMaterialIds: updatedCompletedIds,
              completedMaterialTimestamps: updatedCompletedTimestamps,
              activityLogs: updatedActivityLogs,
              updatedAt: new Date().toISOString(),
            })
          );
          totalCleaned++;
        }
      } catch (err) {
        console.warn('Error pruning stale score reference:', item.id, err);
      }
    }
    await batch.commit();
  }

  // 3. Invalidate and refresh local storage caches
  await purgeLocalCacheAndResync();

  return {
    cleanedCount: totalCleaned,
    message: `Pembersihan berhasil. Sebanyak ${totalCleaned} item sampah database telah dibersihkan secara permanen.`,
  };
}

/**
 * Purges local browser caches and forces fresh re-fetch on next access.
 */
export async function purgeLocalCacheAndResync(): Promise<void> {
  clearAllSWRCache();
  try {
    const keysToRemove = [
      'sistem_materi_subj_cache',
      'sistem_materi_cat_cache',
      'sistem_materi_mat_cache',
      'sistem_materi_students_cache',
      'sistem_materi_teachers_cache',
      'sistem_materi_all_progress_cache',
      'sistem_materi_theme_cache',
      'sistem_materi_master_grades',
      'sistem_materi_master_classes',
    ];
    keysToRemove.forEach((k) => localStorage.removeItem(k));
  } catch {}
}




