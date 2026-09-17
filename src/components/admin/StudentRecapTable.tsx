import React, { useState, useMemo, useEffect } from 'react';
import {
  BarChart3,
  Search,
  Filter,
  Download,
  RefreshCw,
  Eye,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  UserCheck,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  Award,
  Layers,
  GraduationCap,
  Wifi,
} from 'lucide-react';
import { StudentAccount, Material, Category, Subject, TeacherAccount } from '../../types';
import * as XLSX from 'xlsx';
import { ConfirmResetModal } from './ConfirmResetModal';
import { getStudentOnlineStatus } from '../../lib/dataService';

interface StudentRecapTableProps {
  students: StudentAccount[];
  materials: Material[];
  categories: Category[];
  subjects: Subject[];
  studentProgressMap: Record<string, { completedMaterialIds: string[]; quizScores?: Record<string, number>; lastActive?: string }>;
  isTeacherRole?: boolean;
  currentTeacher?: TeacherAccount | null;
  isLoading?: boolean;
  onRefresh: () => Promise<void>;
  onResetStudentProgress?: (studentId: string, studentName: string) => Promise<void>;
  onViewStudentDetail?: (student: StudentAccount) => void;
}

export const StudentRecapTable: React.FC<StudentRecapTableProps> = ({
  students = [],
  materials = [],
  categories = [],
  subjects = [],
  studentProgressMap = {},
  isTeacherRole = false,
  currentTeacher = null,
  isLoading = false,
  onRefresh,
  onResetStudentProgress,
  onViewStudentDetail,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState<string>('all');
  const [selectedClassFilter, setSelectedClassFilter] = useState<string>('all');
  const [progressTierFilter, setProgressTierFilter] = useState<'all' | 'completed' | 'in_progress' | 'not_started'>('all');
  const [statusAccessFilter, setStatusAccessFilter] = useState<'all' | 'online' | 'offline'>('all');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);

  // Periodic tick to automatically refresh relative timestamps and active indicators every 30s
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => {
      setTick((t) => t + 1);
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // Modal confirmation for resetting student progress
  const [resetTargetStudent, setResetTargetStudent] = useState<StudentAccount | null>(null);

  // Normalize and filter allowed students if teacher has assigned classes
  const teacherAssignedClasses = useMemo(() => {
    return isTeacherRole && Array.isArray(currentTeacher?.assignedClasses)
      ? currentTeacher.assignedClasses.map((c) => (c || '').trim()).filter(Boolean)
      : [];
  }, [isTeacherRole, currentTeacher]);

  const normalizeClass = (cls: string = ''): string => {
    return (cls || '').trim().toLowerCase().replace(/^kelas\s+/i, '');
  };

  const allowedStudents = useMemo(() => {
    const list = students || [];
    if (!isTeacherRole || teacherAssignedClasses.length === 0) {
      return list;
    }
    return list.filter((s) => {
      if (!s) return false;
      const norm = normalizeClass(s.kelas);
      return teacherAssignedClasses.some(
        (ac) => normalizeClass(ac) === norm || (ac || '').trim().toLowerCase() === (s.kelas || '').trim().toLowerCase()
      );
    });
  }, [students, isTeacherRole, teacherAssignedClasses]);

  // Unique classes for filter
  const uniqueClasses = useMemo(() => {
    const set = new Set<string>();
    (allowedStudents || []).forEach((s) => {
      if (s?.kelas) set.add(s.kelas.trim());
    });
    return Array.from(set).sort();
  }, [allowedStudents]);

  // Target materials based on selected subject
  const effectiveSubjectId = isTeacherRole && currentTeacher?.subjectId ? currentTeacher.subjectId : selectedSubjectFilter;

  const targetMaterials = useMemo(() => {
    let targetCats = categories || [];
    if (effectiveSubjectId !== 'all') {
      targetCats = targetCats.filter((c) => (c?.subjectId || 'informatika') === effectiveSubjectId);
    }
    const catIds = new Set(targetCats.map((c) => c?.id).filter(Boolean));
    return (materials || []).filter((m) => m && catIds.has(m.categoryId) && m.isPublished !== false);
  }, [categories, materials, effectiveSubjectId]);

  // Computed student rows with progress info
  const processedData = useMemo(() => {
    const totalMatCount = targetMaterials.length;

    return (allowedStudents || []).map((s) => {
      const prog = (studentProgressMap && (studentProgressMap[s.id] || (s.nisn ? studentProgressMap[s.nisn] : undefined))) || { completedMaterialIds: [] };
      const completedIds = prog.completedMaterialIds || [];
      const doneCount = targetMaterials.filter((m) => completedIds.includes(m.id)).length;
      const percent = totalMatCount > 0 ? Math.round((doneCount / totalMatCount) * 100) : 0;

      // Calculate average quiz score if available
      let avgScore: number | null = null;
      if (prog.quizScores && Object.keys(prog.quizScores).length > 0) {
        const scores = Object.values(prog.quizScores).filter((v) => typeof v === 'number');
        if (scores.length > 0) {
          avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
        }
      }

      const onlineInfo = getStudentOnlineStatus(s, prog);

      return {
        student: s,
        doneCount,
        totalMatCount,
        percent,
        avgScore,
        lastActive: prog.lastActive,
        isOnline: onlineInfo.isOnline,
        lastActiveText: onlineInfo.lastActiveText,
        statusLabel: onlineInfo.statusLabel,
      };
    });
  }, [allowedStudents, targetMaterials, studentProgressMap]);

  // Filtered rows
  const filteredData = useMemo(() => {
    return processedData.filter((item) => {
      const s = item.student;
      const matchesSearch =
        !searchQuery ||
        s.nama.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (s.nisn && s.nisn.includes(searchQuery)) ||
        (s.kelas && s.kelas.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesClass =
        selectedClassFilter === 'all' ||
        s.kelas?.toLowerCase() === selectedClassFilter.toLowerCase();

      let matchesTier = true;
      if (progressTierFilter === 'completed') {
        matchesTier = item.percent === 100;
      } else if (progressTierFilter === 'in_progress') {
        matchesTier = item.percent > 0 && item.percent < 100;
      } else if (progressTierFilter === 'not_started') {
        matchesTier = item.percent === 0;
      }

      let matchesAccess = true;
      if (statusAccessFilter === 'online') {
        matchesAccess = item.isOnline;
      } else if (statusAccessFilter === 'offline') {
        matchesAccess = !item.isOnline;
      }

      return matchesSearch && matchesClass && matchesTier && matchesAccess;
    });
  }, [processedData, searchQuery, selectedClassFilter, progressTierFilter, statusAccessFilter]);

  // Overall Statistics
  const overallStats = useMemo(() => {
    if (processedData.length === 0) return { avgProgress: 0, completedCount: 0, activeCount: 0, onlineCount: 0 };
    const totalPercent = processedData.reduce((sum, item) => sum + item.percent, 0);
    const avgProgress = Math.round(totalPercent / processedData.length);
    const completedCount = processedData.filter((i) => i.percent === 100).length;
    const activeCount = processedData.filter((i) => i.percent > 0).length;
    const onlineCount = processedData.filter((i) => i.isOnline).length;
    return { avgProgress, completedCount, activeCount, onlineCount };
  }, [processedData]);

  // Pagination calculations
  const totalPages = Math.ceil(filteredData.length / pageSize) || 1;
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredData.slice(start, start + pageSize);
  }, [filteredData, currentPage, pageSize]);

  const handleExportExcel = () => {
    try {
      const exportRows = (filteredData || []).map((item, idx) => ({
        No: idx + 1,
        'Nama Siswa': item.student.nama,
        'NIS': item.student.nisn || '-',
        'Kelas': item.student.kelas || '-',
        'Status Akses': item.isOnline ? 'ONLINE (Sedang Akses)' : 'OFFLINE',
        'Materi Selesai': `${item.doneCount} / ${item.totalMatCount}`,
        'Persentase Progres': `${item.percent}%`,
        'Rata-rata Nilai Kuis': item.avgScore !== null ? item.avgScore : '-',
        'Aktivitas / Login Terakhir': item.lastActiveText || '-',
      }));

      const worksheet = XLSX.utils.json_to_sheet(exportRows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Rekap Nilai Siswa');
      XLSX.writeFile(workbook, `Rekap_Nilai_Siswa_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (err) {
      console.error('Export error:', err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-5 rounded-2xl shadow-lg border border-indigo-900/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <span className="p-2 bg-indigo-500/20 rounded-xl text-indigo-300 border border-indigo-500/30">
              <BarChart3 className="w-5 h-5" />
            </span>
            <h3 className="font-extrabold text-base sm:text-lg tracking-tight">
              Pemantauan & Rekapitulasi Progres Siswa
            </h3>
          </div>
          <p className="text-xs text-slate-300">
            {isTeacherRole && currentTeacher?.assignedSubject
              ? `Mata Pelajaran: ${currentTeacher.assignedSubject}`
              : 'Pantau ketuntasan modul ajar dan nilai kuis per siswa secara realtime'}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading}
            className="px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>{isLoading ? 'Memuat...' : 'Refresh Data'}</span>
          </button>

          <button
            type="button"
            onClick={handleExportExcel}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-md shadow-emerald-950/40 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Ekspor Excel</span>
          </button>
        </div>
      </div>

      {/* Analytics Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="p-4 bg-white rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-500 block">Rata-Rata Ketuntasan</span>
            <span className="text-2xl font-black text-indigo-600 mt-1 block">{overallStats.avgProgress}%</span>
            <span className="text-[11px] text-slate-400">Dari total {targetMaterials.length} bahan ajar aktif</span>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <TrendingUp className="w-6 h-6" />
          </div>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-500 block">Siswa Tuntas 100%</span>
            <span className="text-2xl font-black text-emerald-600 mt-1 block">{overallStats.completedCount}</span>
            <span className="text-[11px] text-slate-400">Telah menyelesaikan seluruh modul</span>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-500 block">Siswa Aktif Belajar</span>
            <span className="text-2xl font-black text-blue-600 mt-1 block">{overallStats.activeCount}</span>
            <span className="text-[11px] text-slate-400">Dari total {allowedStudents.length} siswa</span>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <UserCheck className="w-6 h-6" />
          </div>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-500 block">Siswa Sedang Online</span>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-2xl font-black text-emerald-600 block">{overallStats.onlineCount}</span>
              {overallStats.onlineCount > 0 ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  Aktif
                </span>
              ) : (
                <span className="text-[10px] font-medium text-slate-400">0 Aktif</span>
              )}
            </div>
            <span className="text-[11px] text-slate-400">Sedang mengakses sistem sekarang</span>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <Wifi className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="p-4 bg-white rounded-2xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Cari nama siswa, NIS, atau kelas..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full pl-9 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {!isTeacherRole && (
            <select
              value={selectedSubjectFilter}
              onChange={(e) => {
                setSelectedSubjectFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none"
            >
              <option value="all">Semua Mata Pelajaran</option>
              {(subjects || []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}

          <select
            value={selectedClassFilter}
            onChange={(e) => {
              setSelectedClassFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none"
          >
            <option value="all">Semua Kelas</option>
            {(uniqueClasses || []).map((c) => (
              <option key={c} value={c}>
                Kelas {c}
              </option>
            ))}
          </select>

          <select
            value={progressTierFilter}
            onChange={(e) => {
              setProgressTierFilter(e.target.value as any);
              setCurrentPage(1);
            }}
            className="py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none"
          >
            <option value="all">Semua Status Progres</option>
            <option value="completed">Tuntas (100%)</option>
            <option value="in_progress">Sedang Belajar (1-99%)</option>
            <option value="not_started">Belum Mulai (0%)</option>
          </select>

          <select
            value={statusAccessFilter}
            onChange={(e) => {
              setStatusAccessFilter(e.target.value as any);
              setCurrentPage(1);
            }}
            className="py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none"
          >
            <option value="all">Semua Status Akses</option>
            <option value="online">🟢 Sedang Online ({overallStats.onlineCount})</option>
            <option value="offline">⚪ Sedang Offline ({processedData.length - overallStats.onlineCount})</option>
          </select>
        </div>
      </div>

      {/* Table Content */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        {filteredData.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            <BarChart3 className="w-12 h-12 mx-auto mb-2 text-slate-300" />
            <p className="text-sm font-semibold">Tidak ada data progres siswa yang cocok</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">No</th>
                  <th className="py-3 px-4">Siswa</th>
                  <th className="py-3 px-4">Kelas</th>
                  <th className="py-3 px-4">Modul Selesai</th>
                  <th className="py-3 px-4">Persentase Ketuntasan</th>
                  <th className="py-3 px-4 text-center">Rata-Rata Kuis</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {(paginatedData || []).map((item, idx) => {
                  const s = item.student;
                  const rowNumber = (currentPage - 1) * pageSize + idx + 1;
                  const is100 = item.percent === 100;
                  const isStarted = item.percent > 0;

                  return (
                    <tr key={s.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">{rowNumber}</td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900 text-xs sm:text-sm">{s.nama}</div>
                        {s.nisn && <div className="text-[10px] text-slate-400 font-mono">NIS: {s.nisn}</div>}
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg font-bold text-[10px]">
                          {s.kelas || '-'}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-800">
                        {item.doneCount} <span className="text-slate-400">/ {item.totalMatCount}</span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden max-w-[140px]">
                            <div
                              className={`h-full rounded-full transition-all duration-300 ${
                                is100
                                  ? 'bg-emerald-500'
                                  : isStarted
                                  ? 'bg-indigo-600'
                                  : 'bg-slate-300'
                              }`}
                              style={{ width: `${item.percent}%` }}
                            />
                          </div>
                          <span
                            className={`font-mono font-bold text-xs ${
                              is100 ? 'text-emerald-600' : isStarted ? 'text-indigo-600' : 'text-slate-400'
                            }`}
                          >
                            {item.percent}%
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center">
                        {item.avgScore !== null ? (
                          <span className="inline-flex items-center px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full font-mono font-bold text-[11px]">
                            {item.avgScore}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px]">-</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {item.isOnline ? (
                          <div className="inline-flex flex-col items-center">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/80 shadow-2xs">
                              <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                              </span>
                              Online
                            </span>
                            <span className="text-[10px] text-emerald-600 font-medium mt-0.5 whitespace-nowrap">Sedang Akses</span>
                          </div>
                        ) : (
                          <div className="inline-flex flex-col items-center">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-500 border border-slate-200/80">
                              <span className="inline-block h-1.5 w-1.5 rounded-full bg-slate-400"></span>
                              Offline
                            </span>
                            <span className="text-[10px] text-slate-400 font-medium mt-0.5 whitespace-nowrap">{item.lastActiveText}</span>
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {onViewStudentDetail && (
                            <button
                              type="button"
                              onClick={() => onViewStudentDetail(s)}
                              className="p-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg transition-colors cursor-pointer"
                              title="Lihat Rincian Selesai"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {onResetStudentProgress && (
                            <button
                              type="button"
                              id={`btn-reset-student-${s.id}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setResetTargetStudent(s);
                              }}
                              className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg transition-colors cursor-pointer"
                              title="Reset Progres Siswa"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {filteredData.length > 0 && (
          <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
            <div className="flex items-center gap-2">
              <span>Menampilkan</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="py-1 px-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <span>dari <strong>{filteredData.length}</strong> siswa</span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1.5 bg-white border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <span className="px-3 font-semibold text-slate-700">
                Halaman {currentPage} dari {totalPages}
              </span>

              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-1.5 bg-white border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Confirmation Modal before Resetting */}
      {resetTargetStudent && (
        <ConfirmResetModal
          isOpen={!!resetTargetStudent}
          title="Konfirmasi Reset Progres Siswa"
          studentName={resetTargetStudent.nama}
          studentClass={resetTargetStudent.kelas}
          extraInfo={resetTargetStudent.nis ? `NIS: ${resetTargetStudent.nis}` : undefined}
          description={`Apakah Anda yakin ingin mereset seluruh progres belajar siswa "${resetTargetStudent.nama}"? Nilai kuis dan status selesai semua materi akan kembali ke 0. Tindakan ini hanya dijalankan setelah Anda mengklik tombol konfirmasi.`}
          confirmText="Ya, Reset Progres"
          onConfirm={async () => {
            if (onResetStudentProgress && resetTargetStudent) {
              await onResetStudentProgress(resetTargetStudent.id, resetTargetStudent.nama);
            }
            setResetTargetStudent(null);
          }}
          onClose={() => setResetTargetStudent(null)}
        />
      )}
    </div>
  );
};
