import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Trophy,
  Award,
  Search,
  Copy,
  RefreshCw,
  Printer,
  CheckCircle2,
  AlertTriangle,
  Clock,
  GraduationCap,
  FileText,
  Filter,
  Check,
  ChevronDown,
  RotateCcw,
  Users,
  BarChart3,
  TrendingUp,
  FileSpreadsheet,
  X,
  ShieldCheck,
  HelpCircle,
  BookOpen,
  ArrowUpDown,
  Send,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Material, Subject, Category, StudentAccount, TeacherAccount, StudentProgressRecord } from '../types';
import {
  fetchAllStudentProgress,
  getMinQuizScoreToUnlock,
  DEFAULT_MIN_QUIZ_SCORE,
  resetStudentQuizScore,
} from '../lib/dataService';

interface MiniQuizResultsProps {
  materials: Material[];
  subjects: Subject[];
  categories: Category[];
  students: StudentAccount[];
  currentTeacher?: TeacherAccount | null;
  isTeacherRole?: boolean;
  onRefreshAllData?: () => Promise<void>;
}

interface FlattenedQuizScoreRow {
  studentKey: string;
  nisn: string;
  nama: string;
  kelas: string;
  noAbsen: string;
  materialId: string;
  materialTitle: string;
  categoryId: string;
  categoryTitle: string;
  subjectId: string;
  subjectName: string;
  score: number; // e.g. 8
  totalQuestions: number; // e.g. 10
  percentage: number; // e.g. 80
  isCompleted: boolean;
  hasAttempted: boolean;
  isPassedKKM: boolean;
  updatedAt: string;
}

export const MiniQuizResults: React.FC<MiniQuizResultsProps> = ({
  materials = [],
  subjects = [],
  categories = [],
  students = [],
  currentTeacher,
  isTeacherRole = false,
  onRefreshAllData,
}) => {
  // Progress State
  const [progressMap, setProgressMap] = useState<Record<string, StudentProgressRecord>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [minQuizScore, setMinQuizScore] = useState<number>(DEFAULT_MIN_QUIZ_SCORE);

  // Filters State
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>(() => {
    if (isTeacherRole && currentTeacher?.subjectId) {
      return currentTeacher.subjectId;
    }
    return 'all';
  });

  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [selectedMaterialId, setSelectedMaterialId] = useState<string>('all');
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<'all' | 'passed' | 'remedial' | 'not_attempted'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<'nama' | 'absen' | 'score' | 'date'>('absen');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // View Mode: 'table' (Detail per Materi) or 'matrix' (Matriks Transkrip Kelas)
  const [viewMode, setViewMode] = useState<'table' | 'matrix'>('table');

  // Copy Feedback Toast & Modals
  const [copySuccessToast, setCopySuccessToast] = useState<string>('');
  const [isCopyMenuOpen, setIsCopyMenuOpen] = useState(false);
  const [resetConfirmTarget, setResetConfirmTarget] = useState<FlattenedQuizScoreRow | null>(null);
  const [isResetting, setIsResetting] = useState(false);

  // Load KKM and Student Progress from Firestore
  const loadData = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setIsRefreshing(true);
    else setIsLoading(true);

    try {
      const [kkmVal, allProg] = await Promise.all([
        getMinQuizScoreToUnlock().catch(() => DEFAULT_MIN_QUIZ_SCORE),
        fetchAllStudentProgress().catch(() => ({})),
      ]);
      setMinQuizScore(kkmVal);
      setProgressMap(allProg || {});
    } catch (err) {
      console.error('Error loading quiz results data:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // If teacher role changes or mounts, ensure subject filter is locked to teacher's subject
  useEffect(() => {
    if (isTeacherRole && currentTeacher?.subjectId) {
      setSelectedSubjectId(currentTeacher.subjectId);
    }
  }, [isTeacherRole, currentTeacher?.subjectId]);

  // Subjects available
  const availableSubjects = useMemo(() => {
    if (isTeacherRole && currentTeacher?.subjectId) {
      const filtered = subjects.filter((s) => s.id === currentTeacher.subjectId);
      if (filtered.length > 0) return filtered;
      return [
        {
          id: currentTeacher.subjectId,
          name: currentTeacher.subjectId.toUpperCase(),
          icon: 'BookOpen',
          order: 1,
          createdAt: '',
          updatedAt: '',
        },
      ];
    }
    return subjects;
  }, [isTeacherRole, currentTeacher?.subjectId, subjects]);

  // Subject lookup map
  const subjectMap = useMemo(() => {
    const map: Record<string, Subject> = {};
    (subjects || []).forEach((s) => {
      if (s?.id) map[s.id] = s;
    });
    return map;
  }, [subjects]);

  // Category lookup map
  const categoryMap = useMemo(() => {
    const map: Record<string, Category> = {};
    (categories || []).forEach((c) => {
      if (c?.id) map[c.id] = c;
    });
    return map;
  }, [categories]);

  // Filtered categories based on selected subject
  const filteredCategories = useMemo(() => {
    if (selectedSubjectId === 'all') return categories || [];
    return (categories || []).filter((c) => (c.subjectId || 'informatika') === selectedSubjectId);
  }, [categories, selectedSubjectId]);

  // Filtered materials (all materials with quizzes)
  const filteredMaterials = useMemo(() => {
    return (materials || []).filter((m) => {
      const cat = categoryMap[m.categoryId];
      const subjId = cat?.subjectId || 'informatika';
      if (selectedSubjectId !== 'all' && subjId !== selectedSubjectId) return false;
      if (selectedCategoryId !== 'all' && m.categoryId !== selectedCategoryId) return false;
      return true;
    });
  }, [materials, categoryMap, selectedSubjectId, selectedCategoryId]);

  // When changing category filter, reset material filter if not in category
  useEffect(() => {
    if (selectedCategoryId !== 'all' && selectedMaterialId !== 'all') {
      const mat = (materials || []).find((m) => m.id === selectedMaterialId);
      if (mat && mat.categoryId !== selectedCategoryId) {
        setSelectedMaterialId('all');
      }
    }
  }, [selectedCategoryId, selectedMaterialId, materials]);

  // Extract unique classes from student list & progress records
  const classList = useMemo(() => {
    const set = new Set<string>();
    (students || []).forEach((s) => {
      if (s?.kelas && s.kelas.trim()) set.add(s.kelas.trim());
    });
    Object.values(progressMap || {}).forEach((p: StudentProgressRecord) => {
      if (p?.kelas && p.kelas.trim()) set.add(p.kelas.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [students, progressMap]);

  // If teacher has assigned classes, filter quick class list or prioritize
  const teacherAssignedClasses = useMemo(() => {
    return currentTeacher?.assignedClasses || [];
  }, [currentTeacher]);

  // Flattened dataset of Student x Material Quiz Scores
  const allScoreRows: FlattenedQuizScoreRow[] = useMemo(() => {
    const rows: FlattenedQuizScoreRow[] = [];

    // Map student accounts by multiple lookup keys (nisn, nama, id)
    const studentAccountMap = new Map<string, StudentAccount>();
    (students || []).forEach((st) => {
      if (!st) return;
      if (st.nisn) studentAccountMap.set(st.nisn.trim().toLowerCase(), st);
      if (st.nama) studentAccountMap.set(st.nama.trim().toLowerCase(), st);
      if (st.id) studentAccountMap.set(st.id.trim().toLowerCase(), st);
    });

    // Gather all students to evaluate: combined from `students` list and progress documents
    const evaluatedStudentsMap = new Map<string, { nisn: string; nama: string; kelas: string; noAbsen: string; studentId: string }>();

    // 1. Add all registered students
    (students || []).forEach((st) => {
      if (!st) return;
      const key = st.nisn ? st.nisn.trim() : st.nama?.trim() || st.id;
      evaluatedStudentsMap.set(key, {
        nisn: st.nisn || '',
        nama: st.nama || '',
        kelas: st.kelas || '',
        noAbsen: st.noAbsen || '',
        studentId: st.nisn || st.id || st.nama || '',
      });
    });

    // 2. Add any additional students in progressMap that might not be in students roster
    Object.entries(progressMap || {}).forEach(([progStudentId, prog]: [string, StudentProgressRecord]) => {
      const matchingAccount =
        studentAccountMap.get(progStudentId.toLowerCase()) ||
        (prog.studentName ? studentAccountMap.get(prog.studentName.toLowerCase()) : null);

      const nisn = matchingAccount?.nisn || progStudentId;
      const nama = matchingAccount?.nama || prog.studentName || progStudentId;
      const kelas = matchingAccount?.kelas || prog.kelas || '';
      const noAbsen = matchingAccount?.noAbsen || '';

      const key = nisn ? nisn.trim() : nama.trim();
      if (!evaluatedStudentsMap.has(key)) {
        evaluatedStudentsMap.set(key, {
          nisn,
          nama,
          kelas,
          noAbsen,
          studentId: progStudentId,
        });
      }
    });

    const evaluatedStudentsList = Array.from(evaluatedStudentsMap.values());

    // Target materials to include in evaluation
    const targetMaterials = filteredMaterials;

    evaluatedStudentsList.forEach((st) => {
      // Find progress record for this student
      const prog =
        progressMap[st.studentId] ||
        progressMap[st.nisn] ||
        (st.nama ? progressMap[st.nama] : undefined);

      const studentScores = prog?.scores || {};
      const studentAttempts = prog?.quizAttempts || {};
      const completedIds = prog?.completedMaterialIds || [];

      targetMaterials.forEach((mat) => {
        const cat = categoryMap[mat.categoryId];
        const subj = subjectMap[cat?.subjectId || 'informatika'];

        const attempt = studentAttempts[mat.id];
        const rawScore = studentScores[mat.id];
        const hasAttempted = attempt !== undefined || rawScore !== undefined;
        const totalQ = attempt?.totalQuestions || (mat.quizQuestions && mat.quizQuestions.length > 0 ? mat.quizQuestions.length : 10);
        
        let scoreVal = 0;
        let percentageVal = 0;

        if (attempt) {
          scoreVal = attempt.score ?? Math.round((attempt.percentage / 100) * totalQ);
          percentageVal = attempt.percentage ?? Math.round((scoreVal / totalQ) * 100);
        } else if (rawScore !== undefined) {
          percentageVal = Number(rawScore);
          scoreVal = Math.round((percentageVal / 100) * totalQ);
        }

        const isCompleted = completedIds.includes(mat.id);
        const isPassedKKM = hasAttempted && scoreVal >= minQuizScore;
        const updatedAt = attempt?.updatedAt || prog?.completedMaterialTimestamps?.[mat.id] || prog?.updatedAt || '';

        rows.push({
          studentKey: st.studentId,
          nisn: st.nisn,
          nama: st.nama,
          kelas: st.kelas,
          noAbsen: st.noAbsen,
          materialId: mat.id,
          materialTitle: mat.title,
          categoryId: mat.categoryId,
          categoryTitle: cat?.title || 'Topik Materi',
          subjectId: subj?.id || 'informatika',
          subjectName: subj?.name || 'Informatika',
          score: scoreVal,
          totalQuestions: totalQ,
          percentage: percentageVal,
          isCompleted,
          hasAttempted,
          isPassedKKM,
          updatedAt,
        });
      });
    });

    return rows;
  }, [students, progressMap, filteredMaterials, categoryMap, subjectMap, minQuizScore]);

  // Filtered dataset according to active filters
  const filteredScoreRows = useMemo(() => {
    return allScoreRows.filter((row) => {
      // 1. Material Filter
      if (selectedMaterialId !== 'all' && row.materialId !== selectedMaterialId) {
        return false;
      }

      // 2. Class Filter
      if (selectedClass !== 'all' && row.kelas.trim().toLowerCase() !== selectedClass.trim().toLowerCase()) {
        return false;
      }

      // 3. Status KKM Filter
      if (selectedStatusFilter === 'passed' && !row.isPassedKKM) return false;
      if (selectedStatusFilter === 'remedial' && (!row.hasAttempted || row.isPassedKKM)) return false;
      if (selectedStatusFilter === 'not_attempted' && row.hasAttempted) return false;

      // 4. Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchNama = row.nama.toLowerCase().includes(q);
        const matchNisn = row.nisn.toLowerCase().includes(q);
        const matchAbsen = row.noAbsen.toLowerCase().includes(q);
        const matchKelas = row.kelas.toLowerCase().includes(q);
        const matchMat = row.materialTitle.toLowerCase().includes(q);
        if (!matchNama && !matchNisn && !matchAbsen && !matchKelas && !matchMat) return false;
      }

      return true;
    });
  }, [allScoreRows, selectedMaterialId, selectedClass, selectedStatusFilter, searchQuery]);

  // Sorted rows
  const sortedScoreRows = useMemo(() => {
    return [...filteredScoreRows].sort((a, b) => {
      let comp = 0;
      if (sortBy === 'nama') {
        comp = a.nama.localeCompare(b.nama, 'id');
      } else if (sortBy === 'absen') {
        const aNum = parseInt(a.noAbsen, 10);
        const bNum = parseInt(b.noAbsen, 10);
        if (!isNaN(aNum) && !isNaN(bNum)) comp = aNum - bNum;
        else comp = a.noAbsen.localeCompare(b.noAbsen);
        if (comp === 0) comp = a.nama.localeCompare(b.nama, 'id');
      } else if (sortBy === 'score') {
        comp = a.percentage - b.percentage;
      } else if (sortBy === 'date') {
        comp = new Date(a.updatedAt || 0).getTime() - new Date(b.updatedAt || 0).getTime();
      }
      return sortDirection === 'asc' ? comp : -comp;
    });
  }, [filteredScoreRows, sortBy, sortDirection]);

  // Summary Metrics for current filtered view
  const metrics = useMemo(() => {
    const attemptedRows = filteredScoreRows.filter((r) => r.hasAttempted);
    const passedRows = attemptedRows.filter((r) => r.isPassedKKM);
    const remedialRows = attemptedRows.filter((r) => !r.isPassedKKM);
    const notAttemptedRows = filteredScoreRows.filter((r) => !r.hasAttempted);

    const totalScores = attemptedRows.reduce((acc, r) => acc + r.percentage, 0);
    const avgScore = attemptedRows.length > 0 ? Math.round((totalScores / attemptedRows.length) * 10) / 10 : 0;
    const passPercentage = attemptedRows.length > 0 ? Math.round((passedRows.length / attemptedRows.length) * 100) : 0;

    let highestScore = 0;
    let lowestScore = 100;
    if (attemptedRows && attemptedRows.length > 0) {
      highestScore = Math.max(...attemptedRows.map((r) => r.percentage));
      lowestScore = Math.min(...attemptedRows.map((r) => r.percentage));
    } else {
      lowestScore = 0;
    }

    return {
      totalRecords: filteredScoreRows.length,
      attemptedCount: attemptedRows.length,
      passedCount: passedRows.length,
      remedialCount: remedialRows.length,
      notAttemptedCount: notAttemptedRows.length,
      avgScore,
      passPercentage,
      highestScore,
      lowestScore,
    };
  }, [filteredScoreRows]);

  // Class Counts Helper for Quick Tabs
  const classCountMap = useMemo(() => {
    const map: Record<string, { total: number; attempted: number; passed: number }> = {};
    allScoreRows.forEach((r) => {
      const k = r.kelas.trim() || 'Lainnya';
      if (!map[k]) map[k] = { total: 0, attempted: 0, passed: 0 };
      map[k].total += 1;
      if (r.hasAttempted) {
        map[k].attempted += 1;
        if (r.isPassedKKM) map[k].passed += 1;
      }
    });
    return map;
  }, [allScoreRows]);

  // Toast Helper
  const showToast = (msg: string) => {
    setCopySuccessToast(msg);
    setTimeout(() => {
      setCopySuccessToast('');
    }, 3500);
  };

  // 1. Copy as Excel / Spreadsheet (TSV format)
  const handleCopyForExcel = () => {
    if (sortedScoreRows.length === 0) {
      showToast('Tidak ada data nilai untuk disalin.');
      return;
    }

    const headers = [
      'No',
      'NIS',
      'No Absen',
      'Nama Siswa',
      'Kelas',
      'Mata Pelajaran',
      'Topik',
      'Materi Kuis',
      'Nilai Akhir',
      'Standar KKM',
      'Status Kelulusan',
      'Waktu Penyelesaian',
    ];

    const rows = (sortedScoreRows || []).map((r, i) => [
      i + 1,
      r.nisn || '-',
      r.noAbsen || '-',
      r.nama,
      r.kelas || '-',
      r.subjectName,
      r.categoryTitle,
      r.materialTitle,
      r.hasAttempted ? r.percentage : 0,
      `${Math.round((minQuizScore / r.totalQuestions) * 100)}`,
      r.hasAttempted ? (r.isPassedKKM ? 'LULUS KKM' : 'BELUM KKM / REMEDIAL') : 'BELUM MENGERJAKAN',
      r.updatedAt ? new Date(r.updatedAt).toLocaleString('id-ID') : '-',
    ]);

    const tsvContent = [headers.join('\t'), ...rows.map((row) => row.join('\t'))].join('\n');

    navigator.clipboard
      .writeText(tsvContent)
      .then(() => {
        showToast('✓ Format Spreadsheet/Excel berhasil disalin! Silakan Paste (Ctrl+V) langsung ke Excel / Google Sheets.');
        setIsCopyMenuOpen(false);
      })
      .catch(() => {
        showToast('Gagal menyalin ke clipboard.');
      });
  };

  // 2. Copy as WhatsApp / Teacher Report
  const handleCopyForWhatsApp = () => {
    if (sortedScoreRows.length === 0) {
      showToast('Tidak ada data nilai untuk disalin.');
      return;
    }

    const subjName =
      selectedSubjectId !== 'all'
        ? subjectMap[selectedSubjectId]?.name || selectedSubjectId
        : 'Semua Mata Pelajaran';
    const matName =
      selectedMaterialId !== 'all'
        ? materials.find((m) => m.id === selectedMaterialId)?.title || 'Materi Kuis'
        : 'Semua Materi Kuis';
    const className = selectedClass !== 'all' ? `Kelas ${selectedClass}` : 'Semua Kelas';

    let text = `📊 *REKAPITULASI HASIL MINI KUIS SISWA*\n`;
    text += `📚 Mata Pelajaran: *${subjName}*\n`;
    text += `📖 Materi: *${matName}*\n`;
    text += `👥 Kelompok: *${className}*\n`;
    text += `🎯 Standar KKM: *Minimal Nilai ${Math.round((minQuizScore / 10) * 100)}*\n`;
    text += `📅 Tanggal Ekspor: *${new Date().toLocaleDateString('id-ID', { dateStyle: 'full' })}*\n`;
    text += `──────────────────────\n`;
    text += `📈 *RINGKASAN KELAS:*\n`;
    text += `• Total Partisipasi: ${metrics.attemptedCount} / ${metrics.totalRecords} Siswa\n`;
    text += `• Rata-rata Nilai: *${metrics.avgScore}* / 100\n`;
    text += `• Lulus KKM: *${metrics.passedCount} Siswa (${metrics.passPercentage}%)* ✓\n`;
    text += `• Perlu Remedial: *${metrics.remedialCount} Siswa* ⚠️\n`;
    text += `──────────────────────\n`;
    text += `📋 *DAFTAR NILAI SISWA:*\n\n`;

    sortedScoreRows.forEach((r, idx) => {
      const noStr = String(idx + 1).padStart(2, '0');
      const absenStr = r.noAbsen ? `[Abs: ${r.noAbsen}] ` : '';
      if (r.hasAttempted) {
        const icon = r.isPassedKKM ? '✅' : '⚠️';
        const statusStr = r.isPassedKKM ? 'LULUS KKM' : 'REMEDIAL';
        text += `${noStr}. ${absenStr}*${r.nama}* (${r.kelas || '-'}) ➔ Nilai: *${r.percentage}* ${icon} [${statusStr}]\n`;
      } else {
        text += `${noStr}. ${absenStr}*${r.nama}* (${r.kelas || '-'}) ➔ ⏳ _Belum Mengerjakan_\n`;
      }
    });

    text += `\n──────────────────────\n`;
    text += `_Laporan otomatis digenerate dari Sistem Pembelajaran Digital & Evaluasi Kuis_`;

    navigator.clipboard
      .writeText(text)
      .then(() => {
        showToast('✓ Laporan WhatsApp berhasil disalin! Siap dibagikan ke grup kelas / wali murid.');
        setIsCopyMenuOpen(false);
      })
      .catch(() => {
        showToast('Gagal menyalin ke clipboard.');
      });
  };

  // 3. Copy Individual Student Row
  const handleCopySingleStudent = (r: FlattenedQuizScoreRow) => {
    let text = `📋 *HASIL EVALUASI MINI KUIS*\n`;
    text += `👤 Nama: *${r.nama}*\n`;
    text += `🆔 NIS: ${r.nisn || '-'}\n`;
    text += `🏫 Kelas: *${r.kelas}* | No Absen: *${r.noAbsen || '-'}*\n`;
    text += `📖 Materi: *${r.materialTitle}*\n`;
    text += `🏆 Nilai Akhir: *${r.percentage} / 100*\n`;
    text += `🎯 Standar KKM: Minimal Nilai ${Math.round((minQuizScore / 10) * 100)}\n`;
    text += `📌 Status: *${r.hasAttempted ? (r.isPassedKKM ? 'LULUS KKM (TUNTAS ✓)' : 'BELUM MENCAPAI KKM (PERLU REMEDIAL ⚠️)') : 'Belum Mengerjakan'}*\n`;
    if (r.updatedAt) {
      text += `⏱️ Waktu: ${new Date(r.updatedAt).toLocaleString('id-ID')}\n`;
    }

    navigator.clipboard
      .writeText(text)
      .then(() => {
        showToast(`✓ Nilai siswa ${r.nama} berhasil disalin!`);
      })
      .catch(() => {
        showToast('Gagal menyalin nilai siswa.');
      });
  };

  // Export to Excel File (.xlsx)
  const handleExportToExcel = () => {
    if (sortedScoreRows.length === 0) {
      showToast('Tidak ada data nilai untuk diekspor.');
      return;
    }

    const dataRows = (sortedScoreRows || []).map((r, i) => ({
      'No': i + 1,
      'NIS': r.nisn || '',
      'No Absen': r.noAbsen || '',
      'Nama Siswa': r.nama,
      'Kelas': r.kelas || '',
      'Mata Pelajaran': r.subjectName,
      'Topik / Kategori': r.categoryTitle,
      'Judul Materi': r.materialTitle,
      'Nilai Akhir': r.hasAttempted ? r.percentage : 0,
      'Standar KKM': Math.round((minQuizScore / 10) * 100),
      'Status Kelulusan': r.hasAttempted ? (r.isPassedKKM ? 'LULUS KKM' : 'BELUM KKM (REMEDIAL)') : 'BELUM MENGERJAKAN',
      'Tanggal Pengerjaan': r.updatedAt ? new Date(r.updatedAt).toLocaleString('id-ID') : '-',
    }));

    const ws = XLSX.utils.json_to_sheet(dataRows);

    // Styling column widths
    ws['!cols'] = [
      { wch: 6 }, // No
      { wch: 16 }, // NIS
      { wch: 10 }, // No Absen
      { wch: 28 }, // Nama
      { wch: 10 }, // Kelas
      { wch: 18 }, // Mapel
      { wch: 22 }, // Topik
      { wch: 30 }, // Materi
      { wch: 14 }, // Nilai Akhir
      { wch: 14 }, // KKM
      { wch: 24 }, // Status
      { wch: 22 }, // Tanggal
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Rekap Nilai Mini Kuis');

    const cleanClass = selectedClass !== 'all' ? `_${selectedClass}` : '';
    const cleanDate = new Date().toISOString().split('T')[0];
    const fileName = `Rekap_Nilai_MiniKuis${cleanClass}_${cleanDate}.xlsx`;

    XLSX.writeFile(wb, fileName);
    showToast(`✓ File Excel "${fileName}" berhasil diunduh!`);
  };

  // Print Report Handler
  const handlePrint = () => {
    window.print();
  };

  // Confirm Reset Score for Student
  const handleExecuteResetScore = async () => {
    if (!resetConfirmTarget) return;
    setIsResetting(true);
    try {
      const candidateIds = [
        resetConfirmTarget.studentKey,
        resetConfirmTarget.studentId,
        resetConfirmTarget.nisn,
      ].filter(Boolean) as string[];

      await resetStudentQuizScore(
        resetConfirmTarget.studentKey,
        resetConfirmTarget.materialId,
        candidateIds,
        resetConfirmTarget.nama
      );
      showToast(`✓ Nilai kuis materi "${resetConfirmTarget.materialTitle}" untuk ${resetConfirmTarget.nama} berhasil direset.`);
      setResetConfirmTarget(null);
      await loadData(true);
      if (onRefreshAllData) await onRefreshAllData();
    } catch (err) {
      console.error('Error resetting score:', err);
      showToast('Gagal mereset nilai kuis siswa.');
    } finally {
      setIsResetting(false);
    }
  };

  // Matrix View Data Preparation (Students in class x Materials)
  const matrixData = useMemo(() => {
    // Collect distinct students for selected class & search query
    const studentMap = new Map<string, { nisn: string; nama: string; kelas: string; noAbsen: string; studentId: string }>();

    allScoreRows.forEach((r) => {
      if (selectedClass !== 'all' && r.kelas.trim().toLowerCase() !== selectedClass.trim().toLowerCase()) return;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        if (!r.nama.toLowerCase().includes(q) && !r.nisn.toLowerCase().includes(q) && !r.noAbsen.toLowerCase().includes(q)) return;
      }
      if (!studentMap.has(r.studentKey)) {
        studentMap.set(r.studentKey, {
          nisn: r.nisn,
          nama: r.nama,
          kelas: r.kelas,
          noAbsen: r.noAbsen,
          studentId: r.studentKey,
        });
      }
    });

    const studentsInMatrix = Array.from(studentMap.values()).sort((a, b) => {
      const aNum = parseInt(a.noAbsen, 10);
      const bNum = parseInt(b.noAbsen, 10);
      if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
      return a.nama.localeCompare(b.nama, 'id');
    });

    // Materials in matrix
    const matrixMaterials = filteredMaterials;

    // Build row per student
    const studentMatrixRows = (studentsInMatrix || []).map((st) => {
      const prog =
        progressMap[st.studentId] ||
        progressMap[st.nisn] ||
        (st.nama ? progressMap[st.nama] : undefined);

      const scores = prog?.scores || {};
      const attempts = prog?.quizAttempts || {};

      let completedCount = 0;
      let totalAttempted = 0;
      let scoreSum = 0;

      const materialScores: Record<string, { score: number; total: number; percentage: number; isPassed: boolean; hasAttempted: boolean }> = {};

      matrixMaterials.forEach((m) => {
        const attempt = attempts[m.id];
        const rawScore = scores[m.id];
        const hasAttempted = attempt !== undefined || rawScore !== undefined;

        const totalQ = attempt?.totalQuestions || (m.quizQuestions?.length ? m.quizQuestions.length : 10);
        let scoreVal = 0;
        let percentageVal = 0;

        if (attempt) {
          scoreVal = attempt.score ?? Math.round((attempt.percentage / 100) * totalQ);
          percentageVal = attempt.percentage ?? Math.round((scoreVal / totalQ) * 100);
        } else if (rawScore !== undefined) {
          percentageVal = Number(rawScore);
          scoreVal = Math.round((percentageVal / 100) * totalQ);
        }

        const isPassed = hasAttempted && scoreVal >= minQuizScore;
        if (hasAttempted) {
          totalAttempted += 1;
          scoreSum += percentageVal;
          if (isPassed) completedCount += 1;
        }

        materialScores[m.id] = {
          score: scoreVal,
          total: totalQ,
          percentage: percentageVal,
          isPassed,
          hasAttempted,
        };
      });

      const avgScore = totalAttempted > 0 ? Math.round((scoreSum / totalAttempted) * 10) / 10 : 0;
      const completionRate = matrixMaterials.length > 0 ? Math.round((completedCount / matrixMaterials.length) * 100) : 0;

      return {
        student: st,
        materialScores,
        totalAttempted,
        completedCount,
        totalMaterials: matrixMaterials.length,
        avgScore,
        completionRate,
      };
    });

    return {
      materials: matrixMaterials,
      rows: studentMatrixRows,
    };
  }, [allScoreRows, selectedClass, searchQuery, filteredMaterials, progressMap, minQuizScore]);

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* Toast Notification */}
      {copySuccessToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-5 py-3.5 rounded-2xl shadow-2xl border border-emerald-500/40 flex items-center gap-3 animate-bounce">
          <div className="w-8 h-8 rounded-xl bg-emerald-500 text-white flex items-center justify-center font-black shrink-0">
            <Check className="w-5 h-5" />
          </div>
          <div>
            <div className="font-extrabold text-sm text-emerald-300">Pemberitahuan Sistem</div>
            <div className="text-xs text-slate-200 font-medium">{copySuccessToast}</div>
          </div>
        </div>
      )}

      {/* Top Header Card */}
      <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white p-5 sm:p-7 rounded-3xl shadow-xl border border-indigo-900/60 relative z-30">
        {/* Subtle decorative glow container with overflow hidden */}
        <div className="absolute inset-0 rounded-3xl overflow-hidden pointer-events-none">
          <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl" />
          <div className="absolute -bottom-10 -left-10 w-72 h-72 bg-purple-500/10 rounded-full blur-2xl" />
        </div>

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="p-2 bg-gradient-to-tr from-amber-500 to-yellow-400 text-slate-950 rounded-xl shadow-md font-black">
              <Trophy className="w-5 h-5" />
            </span>
            <div className="px-3.5 py-1.5 rounded-xl bg-indigo-950/80 border border-indigo-500/40 flex items-center gap-2 text-xs font-bold text-indigo-200 shadow-inner">
              <ShieldCheck className="w-4 h-4 text-amber-400" />
              <span>
                Standar KKM: <strong className="text-white font-extrabold">{Math.round((minQuizScore / 10) * 100)}</strong> / 100
              </span>
            </div>

            {/* Refresh Button Moved to Top Bar */}
            <button
              type="button"
              onClick={() => loadData(true)}
              disabled={isRefreshing || isLoading}
              className="px-3 py-1.5 rounded-xl bg-indigo-950/90 hover:bg-indigo-900/90 text-indigo-200 hover:text-white font-bold text-xs border border-indigo-500/40 shadow-xs flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
              title="Perbarui Data Nilai dari Server"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-indigo-400 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>{isRefreshing ? 'Mempurbarui...' : 'Segarkan Data'}</span>
            </button>
          </div>

          {/* Action Header Buttons */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {/* Print Button */}
            <button
              type="button"
              onClick={handlePrint}
              className="px-4 py-2.5 rounded-2xl bg-slate-800/90 hover:bg-slate-700 text-white font-bold text-xs border border-slate-700 shadow-xs flex items-center gap-2 transition-all cursor-pointer"
              title="Cetak Laporan / Simpan PDF"
            >
              <Printer className="w-4 h-4 text-sky-400" />
              <span className="hidden sm:inline">Cetak / PDF</span>
            </button>

            {/* Export Excel Button */}
            <button
              type="button"
              onClick={handleExportToExcel}
              className="px-4 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs shadow-md shadow-emerald-900/30 flex items-center gap-2 transition-all cursor-pointer border border-emerald-400/40"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Ekspor Excel</span>
            </button>

            {/* Copy Dropdown Menu */}
            <div className="relative z-50">
              <button
                type="button"
                onClick={() => setIsCopyMenuOpen(!isCopyMenuOpen)}
                className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-black text-xs shadow-md shadow-indigo-900/40 flex items-center gap-2 transition-all cursor-pointer border border-indigo-400/40"
              >
                <Copy className="w-4 h-4" />
                <span>Salin Nilai</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isCopyMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {isCopyMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-[9998]"
                    onClick={() => setIsCopyMenuOpen(false)}
                  />
                  <div className="absolute right-0 top-full mt-2 w-72 bg-white text-slate-900 rounded-2xl shadow-2xl border border-slate-200 p-2 z-[9999] animate-fadeIn">
                    <div className="px-3 py-2 text-[11px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-100 mb-1">
                      Pilih Format Salin (Clipboard)
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        handleCopyForExcel();
                        setIsCopyMenuOpen(false);
                      }}
                      className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-indigo-50 flex items-start gap-2.5 transition-all text-xs font-bold text-slate-800 cursor-pointer"
                    >
                      <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-extrabold text-slate-900">Salin Format Excel / Spreadsheet</div>
                        <div className="text-[11px] text-slate-500 font-normal">Format tab berkolom, tinggal Paste di Excel/Sheets</div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        handleCopyForWhatsApp();
                        setIsCopyMenuOpen(false);
                      }}
                      className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-emerald-50 flex items-start gap-2.5 transition-all text-xs font-bold text-slate-800 mt-1 cursor-pointer"
                    >
                      <Send className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-extrabold text-slate-900">Salin Format WhatsApp</div>
                        <div className="text-[11px] text-slate-500 font-normal">Format pesan rapi ber-emoji untuk grup WA / wali murid</div>
                      </div>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Card 1: Total Evaluasi / Siswa */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-slate-200/90 shadow-xs flex items-center justify-between gap-3">
          <div className="space-y-1">
            <span className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
              Partisipasi Kuis
            </span>
            <div className="text-2xl sm:text-3xl font-black text-slate-900">
              {metrics.attemptedCount}
              <span className="text-xs sm:text-sm font-bold text-slate-400 ml-1">
                / {metrics.totalRecords} Siswa
              </span>
            </div>
            <div className="text-[11px] font-bold text-indigo-600 flex items-center gap-1">
              <Users className="w-3.5 h-3.5" />
              <span>{metrics.totalRecords > 0 ? Math.round((metrics.attemptedCount / metrics.totalRecords) * 100) : 0}% Terdata</span>
            </div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-black shrink-0 border border-indigo-100">
            <Users className="w-6 h-6" />
          </div>
        </div>

        {/* Card 2: Rata-rata Nilai */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-slate-200/90 shadow-xs flex items-center justify-between gap-3">
          <div className="space-y-1">
            <span className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
              Rata-rata Nilai
            </span>
            <div className="text-2xl sm:text-3xl font-black text-slate-900">
              {metrics.avgScore}
              <span className="text-xs sm:text-sm font-bold text-slate-400 ml-1">/ 100</span>
            </div>
            <div className="text-[11px] font-bold text-emerald-600 flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Tertinggi: {metrics.highestScore} Poin</span>
            </div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center font-black shrink-0 border border-amber-100">
            <Award className="w-6 h-6" />
          </div>
        </div>

        {/* Card 3: Lulus KKM */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-slate-200/90 shadow-xs flex items-center justify-between gap-3">
          <div className="space-y-1">
            <span className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
              Lulus KKM (Tuntas)
            </span>
            <div className="text-2xl sm:text-3xl font-black text-emerald-600">
              {metrics.passedCount}
              <span className="text-xs sm:text-sm font-bold text-emerald-700/70 ml-1">
                ({metrics.passPercentage}%)
              </span>
            </div>
            <div className="text-[11px] font-bold text-emerald-700 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Target KKM $\ge$ {Math.round((minQuizScore / 10) * 100)}%</span>
            </div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-black shrink-0 border border-emerald-100">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </div>

        {/* Card 4: Belum KKM / Perlu Remedial */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-slate-200/90 shadow-xs flex items-center justify-between gap-3">
          <div className="space-y-1">
            <span className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
              Perlu Remedial
            </span>
            <div className="text-2xl sm:text-3xl font-black text-rose-600">
              {metrics.remedialCount}
              <span className="text-xs sm:text-sm font-bold text-rose-700/70 ml-1">
                Siswa
              </span>
            </div>
            <div className="text-[11px] font-bold text-rose-600 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Nilai di bawah KKM ({Math.round((minQuizScore / 10) * 100)})</span>
            </div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center font-black shrink-0 border border-rose-100">
            <AlertTriangle className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Main Filter & Controls Panel */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs p-4 sm:p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-black">
              <Filter className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900">Filter & Pilihan Kelas</h3>
              <p className="text-xs text-slate-500">Pilih mata pelajaran, topik materi, dan kelas yang ingin ditampilkan</p>
            </div>
          </div>

          {/* View Mode Switcher */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-2xl self-start sm:self-auto border border-slate-200">
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'table'
                  ? 'bg-white text-indigo-900 shadow-xs border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileText className="w-3.5 h-3.5 text-indigo-600" />
              <span>Tabel Detail Nilai</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('matrix')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'matrix'
                  ? 'bg-white text-indigo-900 shadow-xs border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5 text-purple-600" />
              <span>Matriks Transkrip Kelas</span>
            </button>
          </div>
        </div>

        {/* Filters Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* Filter 1: Mata Pelajaran */}
          <div>
            <label className="block text-xs font-extrabold text-slate-700 mb-1.5">
              Mata Pelajaran
            </label>
            <select
              value={selectedSubjectId}
              onChange={(e) => {
                setSelectedSubjectId(e.target.value);
                setSelectedCategoryId('all');
                setSelectedMaterialId('all');
              }}
              disabled={isTeacherRole && availableSubjects.length === 1}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all disabled:opacity-75"
            >
              {!isTeacherRole && <option value="all">Semua Mata Pelajaran</option>}
              {(availableSubjects || []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* Filter 2: Topik / Kategori */}
          <div>
            <label className="block text-xs font-extrabold text-slate-700 mb-1.5">
              Topik Pembelajaran
            </label>
            <select
              value={selectedCategoryId}
              onChange={(e) => {
                setSelectedCategoryId(e.target.value);
                setSelectedMaterialId('all');
              }}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
            >
              <option value="all">Semua Topik ({(filteredCategories || []).length})</option>
              {(filteredCategories || []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </div>

          {/* Filter 3: Materi Kuis Spesifik */}
          <div>
            <label className="block text-xs font-extrabold text-slate-700 mb-1.5">
              Materi Kuis
            </label>
            <select
              value={selectedMaterialId}
              onChange={(e) => setSelectedMaterialId(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
            >
              <option value="all">Semua Materi Kuis ({(filteredMaterials || []).length})</option>
              {(filteredMaterials || []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </select>
          </div>

          {/* Filter 4: Status Kelulusan KKM */}
          <div>
            <label className="block text-xs font-extrabold text-slate-700 mb-1.5">
              Status Kelulusan KKM
            </label>
            <select
              value={selectedStatusFilter}
              onChange={(e) => setSelectedStatusFilter(e.target.value as any)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
            >
              <option value="all">Semua Status Kelulusan</option>
              <option value="passed">Lulus KKM (Tuntas ✓)</option>
              <option value="remedial">Belum KKM (Perlu Remedial ⚠️)</option>
              <option value="not_attempted">Belum Mengerjakan (⏳)</option>
            </select>
          </div>
        </div>

        {/* Quick Class Selector Tabs / Pills */}
        <div className="space-y-2 pt-1">
          <div className="flex items-center justify-between text-xs font-extrabold text-slate-700">
            <span className="flex items-center gap-1.5">
              <GraduationCap className="w-4 h-4 text-indigo-600" />
              <span>Pilih Kelas Peserta Didik:</span>
            </span>
            <span className="text-[11px] text-slate-500 font-medium">
              Menampilkan {selectedClass === 'all' ? 'seluruh kelas' : `Kelas ${selectedClass}`}
            </span>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin">
            <button
              type="button"
              onClick={() => setSelectedClass('all')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 shrink-0 cursor-pointer border ${
                selectedClass === 'all'
                  ? 'bg-indigo-600 text-white border-indigo-700 shadow-xs'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <span>Semua Kelas</span>
              <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono ${
                selectedClass === 'all' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
              }`}>
                {classList.length} Kelas
              </span>
            </button>

            {(classList || []).map((cls) => {
              const info = classCountMap[cls];
              const isAssigned = teacherAssignedClasses.includes(cls);
              return (
                <button
                  key={cls}
                  type="button"
                  onClick={() => setSelectedClass(cls)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 shrink-0 cursor-pointer border ${
                    selectedClass === cls
                      ? 'bg-indigo-600 text-white border-indigo-700 shadow-xs'
                      : isAssigned
                      ? 'bg-indigo-50/90 text-indigo-900 border-indigo-200 hover:bg-indigo-100'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <span>Kelas {cls}</span>
                  {info && (
                    <span className={`px-1.5 py-0.2 text-[10px] font-mono rounded-md ${
                      selectedClass === cls
                        ? 'bg-white/20 text-white'
                        : info.passed === info.total && info.total > 0
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-slate-200 text-slate-700'
                    }`}>
                      {info.attempted}/{info.total}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Search Bar & Sort Options */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari berdasarkan nama siswa, NIS, atau no absen..."
              className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-500 transition-all placeholder:text-slate-400"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-bold text-slate-500 flex items-center gap-1">
              <ArrowUpDown className="w-3.5 h-3.5" />
              <span>Urutkan:</span>
            </span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:bg-white"
            >
              <option value="absen">No. Absen</option>
              <option value="nama">Nama Siswa (A-Z)</option>
              <option value="score">Nilai Tertinggi</option>
              <option value="date">Waktu Pengerjaan</option>
            </select>
            <button
              type="button"
              onClick={() => setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')}
              className="p-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-slate-700 text-xs font-bold transition-all"
              title="Balik Urutan"
            >
              {sortDirection === 'asc' ? '↑ Naik' : '↓ Turun'}
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area: Mode 1 (Detailed Table) or Mode 2 (Matrix Table) */}
      {isLoading ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center space-y-3">
          <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <h4 className="font-black text-slate-800 text-base">Memuat Rekapitulasi Nilai Siswa...</h4>
          <p className="text-xs text-slate-500">Mengambil data nilai mini kuis & progres belajar dari database terpadu</p>
        </div>
      ) : viewMode === 'table' ? (
        /* MODE 1: DETAIL TABLE PER MATERI */
        <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="px-5 sm:px-6 py-4 bg-slate-50/80 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <h4 className="font-extrabold text-sm text-slate-800">
                Daftar Hasil Nilai ({sortedScoreRows.length} Entri Ditampilkan)
              </h4>
            </div>
            <div className="text-xs text-slate-500 font-medium">
              Klik ikon salin di setiap baris untuk menyalin hasil siswa ke clipboard
            </div>
          </div>

          {sortedScoreRows.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center font-black mx-auto">
                <HelpCircle className="w-7 h-7" />
              </div>
              <h4 className="font-extrabold text-slate-800 text-base">Tidak Ada Data Nilai yang Sesuai</h4>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Belum ada catatan nilai mini kuis dengan kombinasi filter atau kata kunci pencarian yang dipilih.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100/90 text-slate-700 font-black border-b border-slate-200 uppercase tracking-wider text-[10px]">
                    <th className="py-3.5 px-4 w-12 text-center">No</th>
                    <th className="py-3.5 px-4">Identitas Siswa</th>
                    <th className="py-3.5 px-3 text-center">Kelas</th>
                    <th className="py-3.5 px-3 text-center">Absen</th>
                    <th className="py-3.5 px-4">Materi Kuis</th>
                    <th className="py-3.5 px-4 text-center">Nilai Akhir</th>
                    <th className="py-3.5 px-4 text-center">Status KKM</th>
                    <th className="py-3.5 px-4">Waktu Pengerjaan</th>
                    <th className="py-3.5 px-4 text-center w-28">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {(sortedScoreRows || []).map((r, idx) => (
                    <tr
                      key={`${r.studentKey}_${r.materialId}_${idx}`}
                      className="hover:bg-indigo-50/40 transition-colors group"
                    >
                      {/* No */}
                      <td className="py-3.5 px-4 text-center text-slate-400 font-mono font-bold">
                        {idx + 1}
                      </td>

                      {/* Identitas Siswa */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 text-white font-black text-xs flex items-center justify-center shrink-0 shadow-2xs">
                            {r.nama ? r.nama.charAt(0).toUpperCase() : 'S'}
                          </div>
                          <div>
                            <div className="font-extrabold text-slate-900 text-xs sm:text-sm group-hover:text-indigo-600 transition-colors">
                              {r.nama}
                            </div>
                            <div className="text-[11px] text-slate-500 font-mono">
                              NIS: {r.nisn || '-'}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Kelas */}
                      <td className="py-3.5 px-3 text-center">
                        <span className="px-2 py-0.5 rounded-lg bg-slate-100 font-extrabold text-slate-800 text-xs border border-slate-200">
                          {r.kelas || '-'}
                        </span>
                      </td>

                      {/* No Absen */}
                      <td className="py-3.5 px-3 text-center font-mono font-extrabold text-slate-700">
                        {r.noAbsen ? `#${r.noAbsen}` : '-'}
                      </td>

                      {/* Materi Kuis */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900 text-xs line-clamp-1">
                          {r.materialTitle}
                        </div>
                        <div className="text-[10px] text-slate-500 line-clamp-1">
                          {r.categoryTitle} • {r.subjectName}
                        </div>
                      </td>

                      {/* Nilai Akhir (100 Poin) */}
                      <td className="py-3.5 px-4 text-center">
                        {r.hasAttempted ? (
                          <div className="inline-flex items-baseline gap-0.5">
                            <span className={`text-base font-black ${
                              r.isPassedKKM ? 'text-emerald-600' : 'text-rose-600'
                            }`}>
                              {r.percentage}
                            </span>
                            <span className="text-[10px] font-bold text-slate-400">/100</span>
                          </div>
                        ) : (
                          <span className="text-[11px] font-bold text-slate-400 italic">Belum Kuis</span>
                        )}
                      </td>

                      {/* Status KKM */}
                      <td className="py-3.5 px-4 text-center">
                        {r.hasAttempted ? (
                          r.isPassedKKM ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              <span>Lulus KKM</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-rose-100 text-rose-800 border border-rose-300 shadow-2xs">
                              <AlertTriangle className="w-3 h-3 text-rose-600" />
                              <span>Remedial</span>
                            </span>
                          )
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                            <Clock className="w-3 h-3 text-slate-400" />
                            <span>Belum Ada</span>
                          </span>
                        )}
                      </td>

                      {/* Waktu Pengerjaan */}
                      <td className="py-3.5 px-4 text-slate-600">
                        {r.updatedAt ? (
                          <div className="space-y-0.5">
                            <div className="font-bold text-[11px] text-slate-800">
                              {new Date(r.updatedAt).toLocaleDateString('id-ID', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              })}
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              {new Date(r.updatedAt).toLocaleTimeString('id-ID', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })} WIB
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[11px] italic">-</span>
                        )}
                      </td>

                      {/* Aksi */}
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* Copy Button */}
                          <button
                            type="button"
                            onClick={() => handleCopySingleStudent(r)}
                            className="p-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 transition-all cursor-pointer border border-indigo-200"
                            title="Salin Hasil Nilai Siswa Ini"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>

                          {/* Reset Button */}
                          {r.hasAttempted && (
                            <button
                              type="button"
                              onClick={() => setResetConfirmTarget(r)}
                              className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 transition-all cursor-pointer border border-rose-200"
                              title="Reset Nilai Kuis (Izinkan Ulang)"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        /* MODE 2: MATRIX TRANSKRIP KELAS */
        <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden space-y-4">
          <div className="px-5 sm:px-6 py-4 bg-slate-50/80 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-purple-600" />
                <h4 className="font-extrabold text-sm text-slate-800">
                  Matriks Transkrip Nilai Siswa per Kelas
                </h4>
              </div>
              <p className="text-xs text-slate-500 font-medium">
                Tabel nilai seluruh materi kuis untuk kelas yang sedang difilter
              </p>
            </div>

            <div className="text-xs font-bold text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-xl border border-indigo-200 shrink-0">
              {matrixData.rows.length} Siswa • {matrixData.materials.length} Materi Kuis
            </div>
          </div>

          {matrixData.rows.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center font-black mx-auto">
                <HelpCircle className="w-7 h-7" />
              </div>
              <h4 className="font-extrabold text-slate-800 text-base">Tidak Ada Siswa Terdaftar di Kelas Ini</h4>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Pilih filter kelas lain pada tab di atas untuk melihat matriks nilai kuis peserta didik.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 font-black border-b border-slate-200 uppercase tracking-wider text-[10px]">
                    <th className="py-3.5 px-3 w-10 text-center sticky left-0 bg-slate-100 z-10">No</th>
                    <th className="py-3.5 px-4 min-w-[200px] sticky left-10 bg-slate-100 z-10">Nama Siswa</th>
                    <th className="py-3.5 px-3 text-center">Kelas</th>
                    <th className="py-3.5 px-3 text-center">Absen</th>

                    {/* Columns per Material */}
                    {(matrixData?.materials || []).map((m, idx) => (
                      <th
                        key={m.id}
                        className="py-3.5 px-3 text-center min-w-[130px] border-l border-slate-200/80"
                        title={m.title}
                      >
                        <div className="line-clamp-1 font-black text-slate-800 text-[11px]">
                          {idx + 1}. {m.title}
                        </div>
                        <div className="text-[9px] text-slate-500 font-normal">
                          KKM: {Math.round((minQuizScore / 10) * 100)}
                        </div>
                      </th>
                    ))}

                    <th className="py-3.5 px-4 text-center min-w-[110px] bg-indigo-50/80 text-indigo-950 font-black border-l border-indigo-200">
                      Rata-rata Nilai
                    </th>
                    <th className="py-3.5 px-4 text-center min-w-[110px] bg-emerald-50/80 text-emerald-950 font-black border-l border-emerald-200">
                      Tuntas KKM
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {(matrixData?.rows || []).map((row, idx) => (
                    <tr key={row.student.studentId} className="hover:bg-indigo-50/30 transition-colors">
                      {/* No */}
                      <td className="py-3 px-3 text-center text-slate-400 font-mono font-bold sticky left-0 bg-white z-10 border-r border-slate-100">
                        {idx + 1}
                      </td>

                      {/* Nama Siswa */}
                      <td className="py-3 px-4 sticky left-10 bg-white z-10 border-r border-slate-100">
                        <div className="font-extrabold text-slate-900 text-xs">
                          {row.student.nama}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          NIS: {row.student.nisn || '-'}
                        </div>
                      </td>

                      {/* Kelas */}
                      <td className="py-3 px-3 text-center">
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-700 font-bold rounded-md text-[11px]">
                          {row.student.kelas || '-'}
                        </span>
                      </td>

                      {/* No Absen */}
                      <td className="py-3 px-3 text-center font-mono font-extrabold text-slate-700">
                        {row.student.noAbsen ? `#${row.student.noAbsen}` : '-'}
                      </td>

                      {/* Material Score Cells */}
                      {(matrixData?.materials || []).map((m) => {
                        const cell = row.materialScores[m.id];
                        if (!cell || !cell.hasAttempted) {
                          return (
                            <td key={m.id} className="py-3 px-3 text-center border-l border-slate-100">
                              <span className="text-slate-300 font-mono text-[11px]">-</span>
                            </td>
                          );
                        }

                        return (
                          <td key={m.id} className="py-3 px-3 text-center border-l border-slate-100">
                            <div className={`px-2.5 py-1 rounded-xl text-xs font-black inline-flex items-center justify-center min-w-[36px] ${
                              cell.isPassed
                                ? 'bg-emerald-100/90 text-emerald-800 border border-emerald-300/80'
                                : 'bg-rose-100/90 text-rose-800 border border-rose-300/80'
                            }`}>
                              <span>{cell.percentage}</span>
                            </div>
                          </td>
                        );
                      })}

                      {/* Rata-rata Nilai */}
                      <td className="py-3 px-4 text-center font-black text-xs text-indigo-900 bg-indigo-50/40 border-l border-indigo-100">
                        {row.totalAttempted > 0 ? (
                          <div className="inline-flex items-baseline gap-0.5">
                            <span className="text-sm">{row.avgScore}</span>
                            <span className="text-[10px] text-slate-400">/100</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">Belum Ada</span>
                        )}
                      </td>

                      {/* Tuntas KKM Progress */}
                      <td className="py-3 px-4 text-center bg-emerald-50/40 border-l border-emerald-100">
                        <div className="font-black text-xs text-emerald-800">
                          {row.completedCount} / {row.totalMaterials}
                        </div>
                        <div className="w-16 bg-slate-200 rounded-full h-1.5 mx-auto mt-1 overflow-hidden">
                          <div
                            className="bg-emerald-500 h-1.5 rounded-full transition-all"
                            style={{ width: `${row.completionRate}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Confirmation Modal for Resetting Student Quiz Score */}
      {resetConfirmTarget && (
        <div className="fixed inset-0 z-[99999] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center font-black shrink-0">
                <RotateCcw className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-extrabold text-base text-slate-900">Reset Nilai Mini Kuis?</h4>
                <p className="text-xs text-slate-500">Konfirmasi penghapusan riwayat nilai siswa</p>
              </div>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2 text-xs">
              <div>
                <span className="text-slate-500 font-medium">Nama Siswa:</span>
                <strong className="block text-slate-900 font-extrabold text-sm">{resetConfirmTarget.nama}</strong>
              </div>
              <div className="flex items-center justify-between">
                <span>Kelas: <strong>{resetConfirmTarget.kelas}</strong></span>
                <span>Nilai Saat Ini: <strong className="text-rose-600">{resetConfirmTarget.percentage} Poin</strong></span>
              </div>
              <div>
                <span className="text-slate-500 font-medium">Materi Kuis:</span>
                <strong className="block text-slate-800 font-bold">{resetConfirmTarget.materialTitle}</strong>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed font-normal">
              Nilai kuis materi ini akan dihapus dari database. Siswa bersangkutan akan dapat mengerjakan kembali kuis ini dari awal seperti baru.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setResetConfirmTarget(null)}
                disabled={isResetting}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-all cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleExecuteResetScore}
                disabled={isResetting}
                className="px-4 py-2 rounded-xl text-xs font-black bg-rose-600 hover:bg-rose-500 text-white shadow-md shadow-rose-900/30 transition-all cursor-pointer flex items-center gap-1.5"
              >
                {isResetting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Mereset...</span>
                  </>
                ) : (
                  <>
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Ya, Reset Nilai</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
