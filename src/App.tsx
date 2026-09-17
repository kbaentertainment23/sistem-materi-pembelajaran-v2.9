import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Atom,
  Compass,
  Rocket,
  Sparkles,
  Lightbulb,
  Calculator,
  BrainCircuit,
} from 'lucide-react';
import { Navbar } from './components/Navbar';
import { SubjectSelector, SubjectSelectorTab } from './components/SubjectSelector';
import { CategoryList } from './components/CategoryList';
import { CategoryDetail } from './components/CategoryDetail';
import { AdminLoginModal } from './components/AdminLoginModal';
import { AdminDashboard } from './components/AdminDashboard';
import { DriveGuideModal } from './components/DriveGuideModal';
import { ExamExitModal } from './components/ExamExitModal';
import { AntiCheatModal } from './components/AntiCheatModal';
import { InitialLoginScreen } from './components/InitialLoginScreen';
import { MobileBottomNav, StudentNavTab } from './components/MobileBottomNav';
import { UserProfileModal } from './components/UserProfileModal';
import { Subject, Category, Material, TeacherAccount, StudentAccount, AuthSession, MaterialActivityLog } from './types';
import { ThemeConfig, DEFAULT_THEME_CONFIG } from './types/theme';
import {
  fetchSubjects,
  fetchCategories,
  fetchMaterials,
  fetchTeachers,
  fetchStudents,
  seedInitialDataIfNeeded,
  getSiteLogoUrl,
  saveStudentProgress,
  fetchStudentProgress,
  fetchStudentProgressDetails,
  fetchAllStudentProgress,
  saveStudentNotesAndBookmarks,
  purgeDemoAccountsAndData,
  fetchThemeConfig,
  fetchStudentQuizScores,
  subscribeStudentProgress,
  getInitialCacheArray,
  getInitialCacheValue,
  CACHE_KEYS,
  subscribeSubjects,
  subscribeCategories,
  subscribeMaterials,
  subscribeTeachers,
  subscribeStudents,
  subscribeThemeConfig,
  subscribeToCache,
  repairAndSyncAllStudents,
  updateStudentOnlineStatus,
  touchStudentActiveSession,
} from './lib/dataService';

import { INITIAL_SUBJECTS, INITIAL_CATEGORIES, INITIAL_MATERIALS } from './utils/initialData';
import { confirmExitExam, useExamSession } from './utils/examSession';
import { filterContentForStudent } from './utils/classFilter';
import { checkCategoryUnlockStatus, checkMaterialUnlockStatus } from './utils/prerequisites';
import { useMobileHardwareBack, useMobileBackModal } from './utils/mobileNavigation';

const pageTransitionVariants = {
  initial: { opacity: 0, y: 14, scale: 0.994 },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.28,
      ease: [0.22, 1, 0.36, 1],
    },
  },
  exit: {
    opacity: 0,
    y: -10,
    scale: 0.994,
    transition: {
      duration: 0.18,
      ease: [0.22, 1, 0.36, 1],
    },
  },
};

export default function App() {
  const examSession = useExamSession();
  const [subjects, setSubjects] = useState<Subject[]>(() =>
    getInitialCacheArray<Subject>(CACHE_KEYS.SUBJECTS, 'sistem_materi_subj_cache')
  );

  const [categories, setCategories] = useState<Category[]>(() =>
    getInitialCacheArray<Category>(CACHE_KEYS.CATEGORIES, 'sistem_materi_cat_cache')
  );

  const [materials, setMaterials] = useState<Material[]>(() =>
    getInitialCacheArray<Material>(CACHE_KEYS.MATERIALS, 'sistem_materi_mat_cache')
  );

  const [siteLogoUrl, setSiteLogoUrl] = useState<string>(() =>
    getInitialCacheValue<string>(CACHE_KEYS.SITE_LOGO, 'sistem_materi_logo_url', '')
  );

  const [themeConfig, setThemeConfig] = useState<ThemeConfig>(() =>
    getInitialCacheValue<ThemeConfig>(CACHE_KEYS.THEME_CONFIG, 'sistem_materi_theme_cache', DEFAULT_THEME_CONFIG)
  );

  const [isLoading, setIsLoading] = useState(false);


  // Search & Navigation - ALWAYS start at Halaman Mata Pelajaran (subjects) on initial load!
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  // Admin & Teacher Auth Sessions & Modals
  const [authSession, setAuthSession] = useState<AuthSession | null>(() => {
    try {
      const saved = localStorage.getItem('sistem_materi_auth_session');
      if (saved) return JSON.parse(saved);
    } catch {}
    if (localStorage.getItem('sistem_materi_admin_auth') === 'true') {
      return { role: 'admin' };
    }
    return null;
  });

  const [viewMode, setViewMode] = useState<'dashboard' | 'student_preview'>('dashboard');

  const [isAdmin, setIsAdmin] = useState<boolean>(() => {
    return authSession?.role === 'admin' || localStorage.getItem('sistem_materi_admin_auth') === 'true';
  });
  const [teachers, setTeachers] = useState<TeacherAccount[]>(() =>
    getInitialCacheArray<TeacherAccount>(CACHE_KEYS.TEACHERS, 'sistem_materi_teachers_cache')
  );
  const [students, setStudents] = useState<StudentAccount[]>([]);
  const [isAdminLoginOpen, setIsAdminLoginOpen] = useState(false);
  const [isAdminDashboardOpen, setIsAdminDashboardOpen] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);

  // Student progress & notes persistence (Keyed by student ID)
  const [completedMaterialIds, setCompletedMaterialIds] = useState<string[]>(() => {
    if (authSession?.student) {
      try {
        const saved = localStorage.getItem(`sistem_materi_prog_${authSession.student.id}`);
        return saved ? JSON.parse(saved) : [];
      } catch {
        return [];
      }
    }
    return [];
  });

  const [completedMaterialTimestamps, setCompletedMaterialTimestamps] = useState<Record<string, string>>(() => {
    if (authSession?.student) {
      try {
        const saved = localStorage.getItem(`sistem_materi_prog_times_${authSession.student.id}`);
        return saved ? JSON.parse(saved) : {};
      } catch {
        return {};
      }
    }
    return {};
  });

  const [activityLogs, setActivityLogs] = useState<MaterialActivityLog[]>(() => {
    if (authSession?.student) {
      try {
        const saved = localStorage.getItem(`sistem_materi_activity_logs_${authSession.student.id}`);
        return saved ? JSON.parse(saved) : [];
      } catch {
        return [];
      }
    }
    return [];
  });

  const [userNotes, setUserNotes] = useState<Record<string, string>>(() => {
    if (authSession?.student) {
      try {
        const saved = localStorage.getItem(`sistem_materi_notes_${authSession.student.id}`);
        return saved ? JSON.parse(saved) : {};
      } catch {
        return {};
      }
    }
    return {};
  });

  const [bookmarkedMaterialIds, setBookmarkedMaterialIds] = useState<string[]>(() => {
    if (authSession?.student) {
      try {
        const saved = localStorage.getItem(`sistem_materi_bookmarks_${authSession.student.id}`);
        return saved ? JSON.parse(saved) : [];
      } catch {
        return [];
      }
    }
    return [];
  });

  const [allStudentProgress, setAllStudentProgress] = useState<Record<string, any>>({});
  const [subjectSelectorTab, setSubjectSelectorTab] = useState<SubjectSelectorTab>('subjects');
  const [mobileNavTab, setMobileNavTab] = useState<StudentNavTab>('materials');
  const [isMobileProfileOpen, setIsMobileProfileOpen] = useState(false);

  // Sync student progress on account switch or login with real-time onSnapshot synchronization
  useEffect(() => {
    if (authSession?.student) {
      const studentId = authSession.student.id;
      const candidateIds = [
        authSession.student.id,
        authSession.student.nisn,
        authSession.student.username,
        authSession.student.nama,
      ].filter(Boolean) as string[];

      // Load local cache for this student immediately
      try {
        const localProg = localStorage.getItem(`sistem_materi_prog_${studentId}`);
        setCompletedMaterialIds(localProg ? JSON.parse(localProg) : []);

        const localTimes = localStorage.getItem(`sistem_materi_prog_times_${studentId}`);
        setCompletedMaterialTimestamps(localTimes ? JSON.parse(localTimes) : {});

        const localLogs = localStorage.getItem(`sistem_materi_activity_logs_${studentId}`);
        setActivityLogs(localLogs ? JSON.parse(localLogs) : []);

        const localNotes = localStorage.getItem(`sistem_materi_notes_${studentId}`);
        setUserNotes(localNotes ? JSON.parse(localNotes) : {});

        const localBookmarks = localStorage.getItem(`sistem_materi_bookmarks_${studentId}`);
        setBookmarkedMaterialIds(localBookmarks ? JSON.parse(localBookmarks) : []);
      } catch {
        setCompletedMaterialIds([]);
        setCompletedMaterialTimestamps({});
        setActivityLogs([]);
        setUserNotes({});
        setBookmarkedMaterialIds([]);
      }

      // Initial fresh sync from Firestore DB
      fetchStudentProgressDetails(studentId, { forceRevalidate: true, additionalIds: candidateIds })
        .then((details) => {
          if (details) {
            setCompletedMaterialIds(details.completedMaterialIds || []);
            setCompletedMaterialTimestamps(details.completedMaterialTimestamps || {});
            setActivityLogs(details.activityLogs || []);
            if (details.notes) {
              setUserNotes(details.notes);
            }
            if (details.bookmarkedMaterialIds) {
              setBookmarkedMaterialIds(details.bookmarkedMaterialIds);
            }
          } else {
            setCompletedMaterialIds([]);
            setCompletedMaterialTimestamps({});
            setActivityLogs([]);
          }
        })
        .catch(console.warn);

      fetchStudentQuizScores(studentId, { forceRevalidate: true, additionalIds: candidateIds })
        .catch(console.warn);

      // Real-time listener: when teacher resets progress or quiz, student screen updates instantly!
      const unsubProgress = subscribeStudentProgress(candidateIds, (record) => {
        if (record) {
          setCompletedMaterialIds(record.completedMaterialIds || []);
          setCompletedMaterialTimestamps(record.completedMaterialTimestamps || {});
          setActivityLogs(record.activityLogs || []);
          if (record.notes) setUserNotes(record.notes);
          if (record.bookmarkedMaterialIds) setBookmarkedMaterialIds(record.bookmarkedMaterialIds);
        } else {
          setCompletedMaterialIds([]);
          setCompletedMaterialTimestamps({});
          setActivityLogs([]);
        }
      });

      const handleResetEvent = (e: Event) => {
        const customEvent = e as CustomEvent;
        const detail = customEvent?.detail;
        const shouldReset =
          !detail ||
          detail.allStudents ||
          (detail.studentIds && detail.studentIds.some((id: string) => candidateIds.includes(id))) ||
          (detail.studentId && candidateIds.includes(detail.studentId));

        if (shouldReset) {
          if (detail?.materialId) {
            setCompletedMaterialIds((prev) => prev.filter((id) => id !== detail.materialId));
            setCompletedMaterialTimestamps((prev) => {
              const next = { ...prev };
              delete next[detail.materialId];
              return next;
            });
          } else {
            setCompletedMaterialIds([]);
            setCompletedMaterialTimestamps({});
            setActivityLogs([]);
          }
          fetchStudentProgressDetails(studentId, { forceRevalidate: true, additionalIds: candidateIds }).then((details) => {
            if (details) {
              setCompletedMaterialIds(details.completedMaterialIds || []);
              setCompletedMaterialTimestamps(details.completedMaterialTimestamps || {});
              setActivityLogs(details.activityLogs || []);
            } else {
              setCompletedMaterialIds([]);
              setCompletedMaterialTimestamps({});
              setActivityLogs([]);
            }
          });
          fetchStudentQuizScores(studentId, { forceRevalidate: true, additionalIds: candidateIds }).catch(console.warn);
        }
      };

      window.addEventListener('student-material-reset', handleResetEvent);

      return () => {
        unsubProgress();
        window.removeEventListener('student-material-reset', handleResetEvent);
      };
    } else {
      setCompletedMaterialIds([]);
      setCompletedMaterialTimestamps({});
      setActivityLogs([]);
      setUserNotes({});
      setBookmarkedMaterialIds([]);
    }
  }, [authSession?.student?.id, authSession?.student?.nisn]);

  // Load Data from Firestore in parallel
  const loadData = async (showLoading = false, force = false) => {
    if (showLoading && categories.length === 0) {
      setIsLoading(true);
    }
    try {
      const isStaff = authSession?.role === 'admin' || authSession?.role === 'teacher';
      const [subjData, catData, matData, logoData, teacherData, themeData] = await Promise.all([
        fetchSubjects({ forceRevalidate: force }),
        fetchCategories({ forceRevalidate: force }),
        fetchMaterials(undefined, { forceRevalidate: force }),
        getSiteLogoUrl(),
        fetchTeachers({ forceRevalidate: force }),
        fetchThemeConfig(),
      ]);
      if (Array.isArray(subjData)) setSubjects(subjData);
      if (Array.isArray(catData)) setCategories(catData);
      if (Array.isArray(matData)) setMaterials(matData);
      if (logoData !== undefined) {
        setSiteLogoUrl(logoData);
      }
      if (Array.isArray(teacherData)) setTeachers(teacherData);
      if (themeData) {
        setThemeConfig(themeData);
      }
      try {
        localStorage.setItem('sistem_materi_teachers_cache', JSON.stringify(teacherData));
      } catch {}

      // Quota Optimization: Only load full student directory and progress when user is admin or teacher
      if (isStaff) {
        const [studentData, progressData] = await Promise.all([
          fetchStudents(),
          fetchAllStudentProgress().catch(() => ({})),
        ]);
        setStudents(studentData);
        if (progressData) {
          setAllStudentProgress(progressData);
        }
      }
    } catch (err) {
      console.error('Error loading data from Firestore:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Reactive SWR Cache Listener:
  // When background HTTP revalidation completes in swrFetch, update React state immediately
  // without requiring page refreshes!
  useEffect(() => {
    const unsubSubj = subscribeToCache<Subject[]>(CACHE_KEYS.SUBJECTS, (newData) => {
      if (Array.isArray(newData)) setSubjects(newData);
    });
    const unsubCat = subscribeToCache<Category[]>(CACHE_KEYS.CATEGORIES, (newData) => {
      if (Array.isArray(newData)) setCategories(newData);
    });
    const unsubMat = subscribeToCache<Material[]>(CACHE_KEYS.MATERIALS, (newData) => {
      if (Array.isArray(newData)) setMaterials(newData);
    });
    const unsubTeach = subscribeToCache<TeacherAccount[]>(CACHE_KEYS.TEACHERS, (newData) => {
      if (Array.isArray(newData)) setTeachers(newData);
    });

    return () => {
      unsubSubj();
      unsubCat();
      unsubMat();
      unsubTeach();
    };
  }, []);

  useEffect(() => {
    loadData(false);
    seedInitialDataIfNeeded().catch(console.warn);
    repairAndSyncAllStudents().catch(console.warn);
  }, []);

  // Staff-Only Real-time Listeners: Curriculum, Teachers & Students listeners only active for Admin/Teacher
  // This saves thousands of real-time WebSocket connections and avoids quota exhaustion for 1,000+ students.
  useEffect(() => {
    const isStaff = authSession?.role === 'admin' || authSession?.role === 'teacher';
    if (!isStaff) return;

    const unsubCat = subscribeCategories((data) => {
      setCategories(data);
    });
    const unsubMat = subscribeMaterials((data) => {
      setMaterials(data);
    });
    const unsubSubj = subscribeSubjects((data) => {
      setSubjects(data);
    });
    const unsubTheme = subscribeThemeConfig((data) => {
      setThemeConfig(data);
    });
    const unsubTeach = subscribeTeachers((data) => {
      setTeachers(data);
    });
    const unsubStud = subscribeStudents((data) => {
      setStudents(data);
    });

    fetchStudents().then(setStudents).catch(console.warn);
    fetchAllStudentProgress().then((prog) => {
      if (prog) {
        setAllStudentProgress(prog);
      }
    }).catch(console.warn);

    return () => {
      unsubCat();
      unsubMat();
      unsubSubj();
      unsubTheme();
      unsubTeach();
      unsubStud();
    };
  }, [authSession?.role]);

  // Real-time synchronization of teacher session with database updates
  useEffect(() => {
    if (authSession?.role === 'teacher' && authSession.teacher?.id && Array.isArray(teachers) && teachers.length > 0) {
      const freshTeacher = teachers.find((t) => t.id === authSession.teacher?.id);
      if (freshTeacher) {
        const currentT = authSession.teacher;
        const isDifferent =
          freshTeacher.name !== currentT.name ||
          freshTeacher.username !== currentT.username ||
          (freshTeacher.password && freshTeacher.password !== currentT.password) ||
          freshTeacher.nip !== currentT.nip ||
          freshTeacher.subjectId !== currentT.subjectId ||
          JSON.stringify(freshTeacher.assignedClasses || []) !== JSON.stringify(currentT.assignedClasses || []);

        if (isDifferent) {
          const updatedSession: AuthSession = {
            ...authSession,
            teacher: {
              ...freshTeacher,
              password: freshTeacher.password || currentT.password,
            },
          };
          setAuthSession(updatedSession);
          try {
            localStorage.setItem('sistem_materi_auth_session', JSON.stringify(updatedSession));
          } catch {}
        }
      }
    }
  }, [teachers, authSession]);

  // On-demand loading for Leaderboard: only fetch full student directory if user is Staff (admin/teacher)
  // Student users utilize the pre-aggregated 1-document leaderboard cache inside <Leaderboard />
  useEffect(() => {
    const isStaff = authSession?.role === 'admin' || authSession?.role === 'teacher';
    if (isStaff && subjectSelectorTab === 'leaderboard') {
      if (students.length === 0) {
        fetchStudents().then(setStudents).catch(console.warn);
      }
      if (Object.keys(allStudentProgress).length === 0) {
        fetchAllStudentProgress().then((prog) => {
          if (prog) setAllStudentProgress(prog);
        }).catch(console.warn);
      }
    }
  }, [subjectSelectorTab, authSession?.role, students.length, allStudentProgress]);

  // Ensure leftover subject/category selection keys are cleared on mount so dashboard always starts on Mata Pelajaran
  useEffect(() => {
    try {
      localStorage.removeItem('sistem_materi_selected_subject_id');
      localStorage.removeItem('sistem_materi_selected_category_id');
    } catch {}
  }, []);

  // Ensure selectedSubjectId stays in sync with selectedCategoryId
  useEffect(() => {
    if (selectedCategoryId && categories.length > 0) {
      const cat = categories.find((c) => c.id === selectedCategoryId);
      if (cat && cat.subjectId && cat.subjectId !== selectedSubjectId) {
        setSelectedSubjectId(cat.subjectId);
      }
    }
  }, [selectedCategoryId, categories, selectedSubjectId]);

  // Always scroll immediately to the very top whenever view changes across all navigation levels
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    if (typeof document !== 'undefined') {
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    }
  }, [selectedSubjectId, selectedCategoryId, viewMode]);

  const handleSelectSubject = (subjectId: string) => {
    confirmExitExam(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      setSelectedSubjectId(subjectId);
      setSelectedCategoryId(null);
    });
  };

  const handleBackToSubjects = () => {
    confirmExitExam(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      if (typeof window !== 'undefined' && window.history.state?.appNavLevel === 'category_list') {
        window.history.back();
      } else {
        setSelectedSubjectId(null);
        setSelectedCategoryId(null);
      }
    });
  };

  const handleSelectCategory = (catId: string | null) => {
    confirmExitExam(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      if (catId) {
        const isStaff = authSession?.role === 'admin' || authSession?.role === 'teacher';
        if (!isStaff) {
          const targetCat = studentVisibleCategories.find((c) => c.id === catId);
          if (targetCat) {
            const unlockStatus = checkCategoryUnlockStatus(
              targetCat,
              studentVisibleCategories,
              studentVisibleMaterials,
              completedMaterialIds,
              authSession
            );
            if (!unlockStatus.isUnlocked) {
              return;
            }
          }
        }
        setSelectedCategoryId(catId);
      } else {
        if (typeof window !== 'undefined' && window.history.state?.appNavLevel === 'category_detail') {
          window.history.back();
        } else {
          setSelectedCategoryId(null);
        }
      }
    });
  };

  const handleDirectOpenMaterial = (subjectId: string, categoryId: string, materialId: string) => {
    confirmExitExam(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      const isStaff = authSession?.role === 'admin' || authSession?.role === 'teacher';
      let targetMatId = materialId;

      if (!isStaff) {
        const targetCat = studentVisibleCategories.find((c) => c.id === categoryId);
        if (targetCat) {
          const unlockStatus = checkCategoryUnlockStatus(
            targetCat,
            studentVisibleCategories,
            studentVisibleMaterials,
            completedMaterialIds,
            authSession
          );
          if (!unlockStatus.isUnlocked) {
            return;
          }
        }

        // Verify if target material itself is unlocked
        const targetMat = studentVisibleMaterials.find((m) => m.id === materialId);
        if (targetMat) {
          const matUnlockStatus = checkMaterialUnlockStatus(
            targetMat,
            studentVisibleMaterials,
            studentVisibleCategories,
            completedMaterialIds,
            authSession
          );
          if (!matUnlockStatus.isUnlocked) {
            // Find the active unlocked material in that category instead
            const catMats = studentVisibleMaterials
              .filter((m) => m.categoryId === categoryId && m.isPublished !== false)
              .sort((a, b) => (a.order || 0) - (b.order || 0));

            let fallbackMatId = catMats[0]?.id || materialId;
            for (const m of catMats) {
              const status = checkMaterialUnlockStatus(
                m,
                studentVisibleMaterials,
                studentVisibleCategories,
                completedMaterialIds,
                authSession
              );
              if (status.isUnlocked) {
                fallbackMatId = m.id;
              } else {
                break;
              }
            }
            targetMatId = fallbackMatId;
          }
        }
      }
      setSelectedSubjectId(subjectId);
      setSelectedCategoryId(categoryId);
      try {
        localStorage.setItem(`sistem_materi_active_mat_${categoryId}`, targetMatId);
      } catch {}
    });
  };

  // Support Android physical / gesture Back Button & browser back navigation
  useMobileHardwareBack({
    selectedSubjectId,
    selectedCategoryId,
    onBackToSubjects: () => {
      setSelectedSubjectId(null);
      setSelectedCategoryId(null);
    },
    onBackToCategories: () => {
      setSelectedCategoryId(null);
    },
  });

  // Intercept top-level modals for mobile hardware back button
  useMobileBackModal('app-guide-modal', isGuideOpen, () => setIsGuideOpen(false));
  useMobileBackModal('app-admin-login-modal', isAdminLoginOpen, () => setIsAdminLoginOpen(false));
  useMobileBackModal('app-admin-dashboard-modal', isAdminDashboardOpen, () => setIsAdminDashboardOpen(false));

  // Save student progress to localStorage & Firestore per student ID
  const handleToggleCompleted = (materialId: string) => {
    const isNowCompleted = !completedMaterialIds.includes(materialId);
    const nextIds = isNowCompleted
      ? [...completedMaterialIds, materialId]
      : completedMaterialIds.filter((id) => id !== materialId);

    const nowIso = new Date().toISOString();
    const nextTimes = { ...completedMaterialTimestamps };
    let nextLogs = [...activityLogs];

    if (isNowCompleted) {
      nextTimes[materialId] = nowIso;
      const targetMat = materials.find((m) => m.id === materialId);
      const targetCat = categories.find((c) => c.id === targetMat?.categoryId);
      const targetSubj = subjects.find((s) => s.id === targetCat?.subjectId);
      const newLogEntry: MaterialActivityLog = {
        materialId,
        materialTitle: targetMat?.title || 'Materi Pembelajaran',
        categoryId: targetCat?.id,
        categoryTitle: targetCat?.title,
        subjectId: targetSubj?.id,
        subjectName: targetSubj?.name,
        completedAt: nowIso,
        type: targetMat?.type,
      };
      nextLogs = [newLogEntry, ...nextLogs.filter((l) => l.materialId !== materialId)];
    } else {
      delete nextTimes[materialId];
      nextLogs = nextLogs.filter((l) => l.materialId !== materialId);
    }

    setCompletedMaterialIds(nextIds);
    setCompletedMaterialTimestamps(nextTimes);
    setActivityLogs(nextLogs);

    if (authSession?.student) {
      const studentId = authSession.student.id;
      try {
        localStorage.setItem(`sistem_materi_prog_${studentId}`, JSON.stringify(nextIds));
        localStorage.setItem(`sistem_materi_prog_times_${studentId}`, JSON.stringify(nextTimes));
        localStorage.setItem(`sistem_materi_activity_logs_${studentId}`, JSON.stringify(nextLogs));
      } catch {}
      saveStudentProgress(studentId, nextIds, authSession.student.nama, authSession.student.kelas, nextTimes, nextLogs);
    } else {
      try {
        localStorage.setItem('sistem_materi_completed', JSON.stringify(nextIds));
      } catch {}
    }
  };

  const handleSaveNote = (materialId: string, noteText: string) => {
    setUserNotes((prev) => {
      const next = { ...prev, [materialId]: noteText };
      if (authSession?.student) {
        const studentId = authSession.student.id;
        try {
          localStorage.setItem(`sistem_materi_notes_${studentId}`, JSON.stringify(next));
        } catch {}
        saveStudentNotesAndBookmarks(studentId, next, undefined);
      } else {
        try {
          localStorage.setItem('sistem_materi_notes', JSON.stringify(next));
        } catch {}
      }
      return next;
    });
  };

  const handleToggleBookmark = (materialId: string) => {
    setBookmarkedMaterialIds((prev) => {
      const next = prev.includes(materialId)
        ? prev.filter((id) => id !== materialId)
        : [...prev, materialId];
      if (authSession?.student) {
        const studentId = authSession.student.id;
        try {
          localStorage.setItem(`sistem_materi_bookmarks_${studentId}`, JSON.stringify(next));
        } catch {}
        saveStudentNotesAndBookmarks(studentId, undefined, next);
      } else {
        try {
          localStorage.setItem('sistem_materi_bookmarks', JSON.stringify(next));
        } catch {}
      }
      return next;
    });
  };

  // Auth Handlers (Admin / Teacher / Student)
  const handleAuthLoginSuccess = async (session: AuthSession) => {
    setAuthSession(session);
    setViewMode('dashboard');
    try {
      localStorage.setItem('sistem_materi_auth_session', JSON.stringify(session));
    } catch {}

    // ALWAYS reset selection on login so student starts at "Pilih Mata Pelajaran"!
    setSelectedSubjectId(null);
    localStorage.removeItem('sistem_materi_selected_subject_id');
    setSelectedCategoryId(null);
    localStorage.removeItem('sistem_materi_selected_category_id');

    // Trigger fresh load on login to immediately sync any newly added topics/subjects
    loadData(false, true).catch(console.warn);

    if (session.student) {
      const studentId = session.student.id;
      const candidateIds = [
        session.student.id,
        session.student.nisn,
        session.student.username,
        session.student.nama,
      ].filter(Boolean) as string[];

      // Mark student online immediately in Firestore
      updateStudentOnlineStatus(studentId, true).catch(console.warn);

      // Load local cache for this student immediately
      try {
        const local = localStorage.getItem(`sistem_materi_prog_${studentId}`);
        setCompletedMaterialIds(local ? JSON.parse(local) : []);
        const localTimes = localStorage.getItem(`sistem_materi_prog_times_${studentId}`);
        setCompletedMaterialTimestamps(localTimes ? JSON.parse(localTimes) : {});
        const localLogs = localStorage.getItem(`sistem_materi_activity_logs_${studentId}`);
        setActivityLogs(localLogs ? JSON.parse(localLogs) : []);
      } catch {
        setCompletedMaterialIds([]);
        setCompletedMaterialTimestamps({});
        setActivityLogs([]);
      }

      // Sync latest progress & quiz scores fresh from Firestore
      try {
        const [details] = await Promise.all([
          fetchStudentProgressDetails(studentId, { forceRevalidate: true, additionalIds: candidateIds }),
          fetchStudentQuizScores(studentId, { forceRevalidate: true, additionalIds: candidateIds }),
        ]);
        if (details) {
          setCompletedMaterialIds(details.completedMaterialIds || []);
          setCompletedMaterialTimestamps(details.completedMaterialTimestamps || {});
          setActivityLogs(details.activityLogs || []);
          if (details.notes) setUserNotes(details.notes);
          if (details.bookmarkedMaterialIds) setBookmarkedMaterialIds(details.bookmarkedMaterialIds);
        } else {
          setCompletedMaterialIds([]);
          setCompletedMaterialTimestamps({});
          setActivityLogs([]);
        }
      } catch (err) {
        console.warn('Failed to sync student progress on login:', err);
      }
    } else {
      setCompletedMaterialIds([]);
      setCompletedMaterialTimestamps({});
      setActivityLogs([]);
    }

    if (session.role === 'admin') {
      setIsAdmin(true);
      localStorage.setItem('sistem_materi_admin_auth', 'true');
    } else {
      setIsAdmin(false);
      localStorage.removeItem('sistem_materi_admin_auth');
    }
  };

  const handleAdminLogout = () => {
    // If student is logging out, mark them offline in Firestore
    if (authSession?.role === 'student' && authSession?.student?.id) {
      updateStudentOnlineStatus(authSession.student.id, false).catch(console.warn);
    }
    setAuthSession(null);
    setIsAdmin(false);
    setViewMode('dashboard');
    setSelectedSubjectId(null);
    setSelectedCategoryId(null);
    setCompletedMaterialIds([]);
    setCompletedMaterialTimestamps({});
    setActivityLogs([]);
    setUserNotes({});
    localStorage.removeItem('sistem_materi_auth_session');
    localStorage.removeItem('sistem_materi_admin_auth');
    localStorage.removeItem('sistem_materi_selected_subject_id');
    localStorage.removeItem('sistem_materi_selected_category_id');
  };

  // Real-time student presence & heartbeat: keeps online status fresh in Firestore
  useEffect(() => {
    if (authSession?.role !== 'student' || !authSession?.student?.id) {
      return;
    }
    const studentId = authSession.student.id;

    // Immediately mark student as online when session is active
    updateStudentOnlineStatus(studentId, true).catch(console.warn);

    // Heartbeat every 45 seconds to keep active status fresh
    const heartbeatInterval = setInterval(() => {
      touchStudentActiveSession(studentId).catch(console.warn);
    }, 45000);

    // Throttled user activity listeners (interaction triggers touch)
    let lastActivityTime = Date.now();
    const handleUserActivity = () => {
      const now = Date.now();
      if (now - lastActivityTime > 30000) {
        lastActivityTime = now;
        touchStudentActiveSession(studentId).catch(console.warn);
      }
    };

    window.addEventListener('click', handleUserActivity, { passive: true });
    window.addEventListener('keydown', handleUserActivity, { passive: true });
    window.addEventListener('touchstart', handleUserActivity, { passive: true });

    // When tab becomes visible again, touch presence
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        touchStudentActiveSession(studentId).catch(console.warn);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    // When window is closed or navigated away, attempt best-effort offline signal
    const handleUnload = () => {
      updateStudentOnlineStatus(studentId, false).catch(() => {});
    };
    window.addEventListener('beforeunload', handleUnload);
    window.addEventListener('pagehide', handleUnload);

    return () => {
      clearInterval(heartbeatInterval);
      window.removeEventListener('click', handleUserActivity);
      window.removeEventListener('keydown', handleUserActivity);
      window.removeEventListener('touchstart', handleUserActivity);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('beforeunload', handleUnload);
      window.removeEventListener('pagehide', handleUnload);
    };
  }, [authSession?.role, authSession?.student?.id]);

  // Class-based content filtering for students
  const {
    filteredSubjects: studentVisibleSubjects,
    filteredCategories: studentVisibleCategories,
    filteredMaterials: studentVisibleMaterials,
  } = useMemo(() => {
    const safeTeachers = Array.isArray(teachers) ? teachers : [];
    const safeSubjects = Array.isArray(subjects) ? subjects : [];
    const safeCategories = Array.isArray(categories) ? categories : [];
    const safeMaterials = Array.isArray(materials) ? materials : [];

    if (authSession?.role === 'student' && authSession.student) {
      const filtered = filterContentForStudent(
        authSession.student,
        safeTeachers,
        safeSubjects,
        safeCategories,
        safeMaterials
      );
      return {
        filteredSubjects: Array.isArray(filtered.filteredSubjects) ? filtered.filteredSubjects : [],
        filteredCategories: Array.isArray(filtered.filteredCategories) ? filtered.filteredCategories : [],
        filteredMaterials: Array.isArray(filtered.filteredMaterials) ? filtered.filteredMaterials : [],
      };
    }
    const isStaff = authSession?.role === 'admin' || authSession?.role === 'teacher';
    if (!isStaff) {
      return {
        filteredSubjects: safeSubjects,
        filteredCategories: safeCategories.filter((c) => c && c.isPublished !== false),
        filteredMaterials: safeMaterials.filter((m) => m && m.isPublished),
      };
    }
    return {
      filteredSubjects: safeSubjects,
      filteredCategories: safeCategories,
      filteredMaterials: safeMaterials,
    };
  }, [authSession, teachers, subjects, categories, materials]);

  // Auto-reset selected subject & category if student has no access to them
  useEffect(() => {
    if (authSession?.role === 'student') {
      if (selectedSubjectId && !studentVisibleSubjects.some((s) => s.id === selectedSubjectId)) {
        setSelectedSubjectId(null);
        setSelectedCategoryId(null);
        localStorage.removeItem('sistem_materi_selected_subject_id');
        localStorage.removeItem('sistem_materi_selected_category_id');
      } else if (selectedCategoryId && !studentVisibleCategories.some((c) => c.id === selectedCategoryId)) {
        setSelectedCategoryId(null);
        localStorage.removeItem('sistem_materi_selected_category_id');
      }
    }
  }, [authSession?.role, selectedSubjectId, selectedCategoryId, studentVisibleSubjects, studentVisibleCategories]);

  const currentSubject = (studentVisibleSubjects || []).find((s) => s && s.id === selectedSubjectId);
  const selectedCategory = (studentVisibleCategories || []).find((c) => c && c.id === selectedCategoryId);

  // Per-Subject Progress Calculation
  const activeSubjectCats = currentSubject
    ? (studentVisibleCategories || []).filter((c) => c && (c.subjectId === currentSubject.id || (!c.subjectId && currentSubject.id === 'informatika')))
    : [];
  const activeSubjectCatIds = (activeSubjectCats || []).map((c) => c?.id).filter(Boolean);
  const activeSubjectMaterials = currentSubject
    ? (studentVisibleMaterials || []).filter((m) => m && activeSubjectCatIds.includes(m.categoryId) && m.isPublished)
    : [];
  const activeSubjectCompletedCount = (activeSubjectMaterials || []).filter((m) =>
    (completedMaterialIds || []).includes(m.id)
  ).length;

  // Optimistic Save Handlers (instant real-time UI response)
  const handleSaveCategoryOptimistic = (cat: Category, isNew = false) => {
    setCategories((prev) => {
      const safePrev = prev || [];
      const exists = safePrev.some((c) => c && c.id === cat.id);
      const updated = exists ? safePrev.map((c) => (c && c.id === cat.id ? cat : c)) : [...safePrev, cat];
      const sorted = [...updated].sort((a, b) => (a?.order || 0) - (b?.order || 0));
      try {
        localStorage.setItem('sistem_materi_cat_cache', JSON.stringify(sorted));
      } catch {}
      return sorted;
    });
  };

  const handleSaveMaterialOptimistic = (mat: Material, isNew = false) => {
    setMaterials((prev) => {
      const safePrev = prev || [];
      const exists = safePrev.some((m) => m && m.id === mat.id);
      const updated = exists ? safePrev.map((m) => (m && m.id === mat.id ? mat : m)) : [...safePrev, mat];
      const sorted = [...updated].sort((a, b) => (a?.order || 0) - (b?.order || 0));
      try {
        localStorage.setItem('sistem_materi_mat_cache', JSON.stringify(sorted));
      } catch {}
      return sorted;
    });
  };

  const handleSaveSubjectOptimistic = (subj: Subject, isNew = false) => {
    setSubjects((prev) => {
      const safePrev = prev || [];
      const exists = safePrev.some((s) => s && s.id === subj.id);
      const updated = exists ? safePrev.map((s) => (s && s.id === subj.id ? subj : s)) : [...safePrev, subj];
      const sorted = [...updated].sort((a, b) => (a?.order || 0) - (b?.order || 0));
      try {
        localStorage.setItem('sistem_materi_subj_cache', JSON.stringify(sorted));
      } catch {}
      return sorted;
    });
  };

  // Optimistic Delete Handlers
  const handleDeleteSubjectOptimistic = (id: string) => {
    setSubjects((prev) => {
      const updated = prev.filter((s) => s.id !== id);
      try {
        localStorage.setItem('sistem_materi_subj_cache', JSON.stringify(updated));
      } catch {}
      return updated;
    });
    setCategories((prev) => {
      const updated = prev.filter((c) => c.subjectId !== id);
      try {
        localStorage.setItem('sistem_materi_cat_cache', JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  const handleDeleteMaterialOptimistic = (id: string) => {
    setMaterials((prev) => {
      const updated = prev.filter((m) => m.id !== id);
      try {
        localStorage.setItem('sistem_materi_mat_cache', JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  const handleDeleteCategoryOptimistic = (id: string) => {
    setCategories((prev) => {
      const updated = prev.filter((c) => c.id !== id);
      try {
        localStorage.setItem('sistem_materi_cat_cache', JSON.stringify(updated));
      } catch {}
      return updated;
    });
    setMaterials((prev) => {
      const updated = prev.filter((m) => m.categoryId !== id);
      try {
        localStorage.setItem('sistem_materi_mat_cache', JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  if (!authSession) {
    return (
      <InitialLoginScreen
        onLoginSuccess={handleAuthLoginSuccess}
        siteLogoUrl={siteLogoUrl}
        themeConfig={themeConfig}
      />
    );
  }

  if ((authSession.role === 'admin' || authSession.role === 'teacher') && viewMode === 'dashboard') {
    return (
      <>
        <AdminDashboard
          isOpen={true}
          onClose={handleAdminLogout}
          onLogout={handleAdminLogout}
          onSwitchToStudentView={() => setViewMode('student_preview')}
          subjects={subjects}
          categories={categories}
          materials={materials}
          teachers={teachers}
          students={students}
          authSession={authSession}
          onRefreshData={() => loadData(false, true)}
          onOpenGuide={() => setIsGuideOpen(true)}
          onSaveSubjectOptimistic={handleSaveSubjectOptimistic}
          onSaveCategoryOptimistic={handleSaveCategoryOptimistic}
          onSaveMaterialOptimistic={handleSaveMaterialOptimistic}
          onDeleteSubjectOptimistic={handleDeleteSubjectOptimistic}
          onDeleteMaterialOptimistic={handleDeleteMaterialOptimistic}
          onDeleteCategoryOptimistic={handleDeleteCategoryOptimistic}
          siteLogoUrl={siteLogoUrl}
          onUpdateSiteLogoUrl={(newUrl) => setSiteLogoUrl(newUrl)}
          currentTheme={themeConfig}
          onThemeUpdated={(newTheme) => setThemeConfig(newTheme)}
        />
        <DriveGuideModal
          isOpen={isGuideOpen}
          onClose={() => setIsGuideOpen(false)}
        />
      </>
    );
  }

  return (
    <div className="min-h-screen min-h-[100dvh] w-full bg-slate-50/90 text-slate-800 font-sans antialiased flex flex-col selection:bg-indigo-500 selection:text-white relative overflow-x-clip bg-grid-pattern pb-[env(safe-area-inset-bottom,0px)]">
        
        {/* Student Preview Mode Banner for Admin/Teacher */}
        {(authSession.role === 'admin' || authSession.role === 'teacher') && viewMode === 'student_preview' && (
          <div className="sticky top-0 z-50 bg-indigo-900 text-white px-4 py-2.5 text-xs font-bold flex items-center justify-between shadow-md border-b border-indigo-700">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-300 animate-pulse shrink-0" />
              <span>Mode Pratinjau Siswa — Anda sedang melihat tampilan portal siswa.</span>
            </div>
            <button
              onClick={() => setViewMode('dashboard')}
              className="px-3 py-1 bg-amber-400 hover:bg-amber-500 text-slate-950 font-black rounded-lg transition-colors cursor-pointer text-xs shrink-0 shadow-xs"
            >
              Kembali ke Halaman {authSession.role === 'teacher' ? 'Guru' : 'Admin'}
            </button>
          </div>
        )}
        
        {/* Decorative Educational Background Ornaments & Glows */}
        {!examSession.isActive && (
          <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
            {/* Soft Radial Ambient Color Glows */}
            <div className="absolute -top-24 -left-20 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl" />
            <div className="absolute top-1/3 -right-20 w-80 h-80 bg-sky-500/10 rounded-full blur-3xl" />
            <div className="absolute -bottom-20 left-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />

            {/* Floating Educational Doodles & Badges */}
            <div className="hidden lg:block">
              <div className="absolute top-28 left-8 text-indigo-400/25 animate-float">
                <Atom className="w-14 h-14" />
              </div>
              <div className="absolute top-44 right-12 text-sky-400/25 animate-float-delayed">
                <Rocket className="w-12 h-12" />
              </div>
              <div className="absolute top-1/2 left-6 text-purple-400/20 animate-float-delayed">
                <Calculator className="w-11 h-11" />
              </div>
              <div className="absolute top-2/3 right-10 text-emerald-400/20 animate-float">
                <BrainCircuit className="w-12 h-12" />
              </div>
              <div className="absolute bottom-28 left-14 text-amber-400/25 animate-float">
                <Lightbulb className="w-12 h-12" />
              </div>
              <div className="absolute bottom-20 right-20 text-rose-400/20 animate-float-delayed">
                <Compass className="w-11 h-11" />
              </div>
            </div>
          </div>
        )}

        {/* Navbar with subtle Admin login button top-right */}
        {!examSession.isActive && (
          <Navbar
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            isAdmin={isAdmin}
            authSession={authSession}
            onOpenAdminLogin={() => setIsAdminLoginOpen(true)}
            onOpenAdminDashboard={() => setIsAdminDashboardOpen(true)}
            onLogoutAdmin={handleAdminLogout}
            completedCount={activeSubjectCompletedCount}
            totalMaterialsCount={activeSubjectMaterials.length}
            selectedSubjectName={currentSubject?.name}
            onGoHome={handleBackToSubjects}
            logoUrl={siteLogoUrl}
            onOpenLeaderboard={() => {
              setSelectedSubjectId(null);
              setSelectedCategoryId(null);
              setSubjectSelectorTab('leaderboard');
              setMobileNavTab('leaderboard');
            }}
          />
        )}

        {/* Main Content View Container */}
        <main className={examSession.isActive ? "flex-1 w-full relative z-10 p-0 m-0" : "flex-1 w-full max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 pb-24 md:pb-6 relative z-10"}>
          <AnimatePresence mode="wait">
            {isLoading ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="py-24 flex flex-col items-center justify-center space-y-4"
              >
                <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                <p className="text-sm sm:text-base font-semibold text-slate-500">Menghubungkan ke Database Firestore...</p>
              </motion.div>
            ) : selectedCategory ? (
              <motion.div
                key={`category-detail-${selectedCategory.id}`}
                variants={pageTransitionVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                onAnimationStart={() => {
                  window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
                }}
              >
                <CategoryDetail
                  category={selectedCategory}
                  subjectName={subjects.find((s) => s.id === (selectedCategory.subjectId || selectedSubjectId))?.name}
                  materials={studentVisibleMaterials.filter((m) => m.categoryId === selectedCategory.id)}
                  allCategories={studentVisibleCategories}
                  allMaterials={studentVisibleMaterials}
                  completedMaterialIds={completedMaterialIds}
                  onToggleCompleted={handleToggleCompleted}
                  userNotes={userNotes}
                  onSaveNote={handleSaveNote}
                  bookmarkedMaterialIds={bookmarkedMaterialIds}
                  onToggleBookmark={handleToggleBookmark}
                  onBackToHome={() => handleSelectCategory(null)}
                  authSession={authSession}
                />
              </motion.div>
            ) : selectedSubjectId ? (
              <motion.div
                key={`category-list-${selectedSubjectId}`}
                variants={pageTransitionVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                onAnimationStart={() => {
                  window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
                }}
              >
                <CategoryList
                  currentSubject={currentSubject}
                  categories={studentVisibleCategories}
                  materials={studentVisibleMaterials}
                  searchQuery={searchQuery}
                  completedMaterialIds={completedMaterialIds}
                  onSelectCategory={(catId) => handleSelectCategory(catId)}
                  onBackToSubjects={handleBackToSubjects}
                  onOpenGuide={() => setIsGuideOpen(true)}
                  authSession={authSession}
                />
              </motion.div>
            ) : (
              <motion.div
                key="subject-selector"
                variants={pageTransitionVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                onAnimationStart={() => {
                  window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
                }}
              >
                <SubjectSelector
                  subjects={studentVisibleSubjects}
                  categories={studentVisibleCategories}
                  materials={studentVisibleMaterials}
                  teachers={teachers}
                  completedMaterialIds={completedMaterialIds}
                  completedMaterialTimestamps={completedMaterialTimestamps}
                  activityLogs={activityLogs}
                  searchQuery={searchQuery}
                  onSelectSubject={handleSelectSubject}
                  onDirectOpenMaterial={handleDirectOpenMaterial}
                  onOpenGuide={() => setIsGuideOpen(true)}
                  authSession={authSession}
                  themeConfig={themeConfig}
                  bookmarkedMaterialIds={bookmarkedMaterialIds}
                  onToggleBookmark={handleToggleBookmark}
                  userNotes={userNotes}
                  onSaveNote={handleSaveNote}
                  students={students}
                  allStudentProgress={allStudentProgress}
                  activeTab={subjectSelectorTab}
                  onTabChange={(t) => {
                    setSubjectSelectorTab(t);
                    if (t === 'subjects') setMobileNavTab('materials');
                    else if (t === 'bookmarks') setMobileNavTab('bookmarks');
                    else if (t === 'leaderboard') setMobileNavTab('leaderboard');
                    else if (t === 'activity_log') setMobileNavTab('results');
                  }}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* Footer */}
        {!examSession.isActive && (
          <footer className="bg-white/80 backdrop-blur-md border-t border-slate-200/70 py-3 sm:py-4 text-center text-xs sm:text-sm text-slate-500 mt-auto relative z-10 pb-20 md:pb-4">
            <div className="w-full px-3 sm:px-6 lg:px-8 flex items-center justify-center">
              <p className="font-medium text-slate-500 text-xs sm:text-sm">
                © {new Date().getFullYear()} <span className="font-extrabold text-indigo-700 tracking-wider">SIMPEL</span> — Sistem Informasi Materi Pembelajaran Elektronik
              </p>
            </div>
          </footer>
        )}

        {/* Mobile Bottom Navigation for Students */}
        {authSession && (authSession.role === 'student' || viewMode === 'student_preview') && (
          <MobileBottomNav
            activeTab={mobileNavTab}
            onTabChange={(tab) => {
              setMobileNavTab(tab);
              if (tab === 'materials') {
                setSelectedSubjectId(null);
                setSelectedCategoryId(null);
                setSubjectSelectorTab('subjects');
              } else if (tab === 'bookmarks') {
                setSelectedSubjectId(null);
                setSelectedCategoryId(null);
                setSubjectSelectorTab('bookmarks');
              } else if (tab === 'leaderboard') {
                setSelectedSubjectId(null);
                setSelectedCategoryId(null);
                setSubjectSelectorTab('leaderboard');
              } else if (tab === 'results') {
                setSelectedSubjectId(null);
                setSelectedCategoryId(null);
                setSubjectSelectorTab('activity_log');
              } else if (tab === 'profile') {
                setIsMobileProfileOpen(true);
              }
            }}
            completedCount={completedMaterialIds.length}
            totalMaterialsCount={studentVisibleMaterials.length}
            bookmarkedCount={bookmarkedMaterialIds.length}
            authSession={authSession}
            examActive={examSession.isActive}
          />
        )}

        {/* Mobile Profile Modal */}
        <UserProfileModal
          isOpen={isMobileProfileOpen}
          onClose={() => setIsMobileProfileOpen(false)}
          authSession={authSession}
          isAdmin={isAdmin}
          completedCount={completedMaterialIds.length}
          totalMaterialsCount={studentVisibleMaterials.length}
          onLogout={handleAdminLogout}
          onOpenAdminDashboard={() => {
            setIsMobileProfileOpen(false);
            setIsAdminDashboardOpen(true);
          }}
        />

        {/* Modals */}
        <DriveGuideModal
          isOpen={isGuideOpen}
          onClose={() => setIsGuideOpen(false)}
        />

        <ExamExitModal />
        <AntiCheatModal />

      </div>
  );
}
