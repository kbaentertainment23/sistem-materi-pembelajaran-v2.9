import React, { useState, useRef } from 'react';
import {
  FileSpreadsheet,
  Upload,
  Download,
  X,
  CheckCircle2,
  AlertCircle,
  FileCheck,
  RefreshCw,
  Users,
  GraduationCap,
} from 'lucide-react';
import { Subject } from '../types';
import {
  downloadStudentTemplate,
  downloadTeacherTemplate,
  parseStudentExcelFile,
  parseTeacherExcelFile,
  ParsedStudentRow,
  ParsedTeacherRow
} from '../utils/excelImportExport';
import { bulkCreateStudents, bulkCreateTeachers, fetchStudents, fetchTeachers } from '../lib/dataService';

interface ImportExcelModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'students' | 'teachers';
  subjects: Subject[];
  onSuccess: (count: number, message: string) => void;
}

export const ImportExcelModal: React.FC<ImportExcelModalProps> = ({
  isOpen,
  onClose,
  type,
  subjects,
  onSuccess,
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [studentRows, setStudentRows] = useState<ParsedStudentRow[]>([]);
  const [teacherRows, setTeacherRows] = useState<ParsedTeacherRow[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const isStudent = type === 'students';

  const handleDownloadTemplate = () => {
    if (isStudent) {
      downloadStudentTemplate();
    } else {
      downloadTeacherTemplate(subjects);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setIsLoading(true);
    setErrorMsg('');

    try {
      if (isStudent) {
        const [parsedRows, existingStudents] = await Promise.all([
          parseStudentExcelFile(file),
          fetchStudents(),
        ]);

        const existingNisns = new Set((existingStudents || []).map((s) => (s?.nisn || '').trim()).filter(Boolean));
        const existingUsers = new Set(
          (existingStudents || []).map((s) => (s?.username || s?.nisn || '').trim().toLowerCase()).filter(Boolean)
        );

        const markedRows = (parsedRows || []).map((r) => {
          const cleanNisn = (r?.nisn || '').trim();
          const cleanUser = (r?.username || cleanNisn).trim().toLowerCase();
          const errs: string[] = r?.errorMessage ? [r.errorMessage] : [];

          if (cleanNisn && existingNisns.has(cleanNisn)) {
            errs.push('NIS sudah terdaftar di sistem');
          }
          if (cleanUser && existingUsers.has(cleanUser)) {
            errs.push('Username sudah terdaftar di sistem');
          }

          return {
            ...r,
            isValid: r?.isValid && errs.length === 0,
            errorMessage: errs.join(', '),
          };
        });

        setStudentRows(markedRows);
        if (markedRows.length === 0) {
          setErrorMsg('Tidak ada data yang dapat dibaca dalam file Excel/CSV ini.');
        }
      } else {
        const [parsedRows, existingTeachers] = await Promise.all([
          parseTeacherExcelFile(file, subjects),
          fetchTeachers(),
        ]);

        const existingUsers = new Set((existingTeachers || []).map((t) => (t?.username || '').trim().toLowerCase()).filter(Boolean));
        const existingNips = new Set((existingTeachers || []).map((t) => (t?.nip || '').trim()).filter(Boolean));

        const markedRows = (parsedRows || []).map((r) => {
          const cleanUser = (r?.username || '').trim().toLowerCase();
          const cleanNip = (r?.nip || '').trim();
          const errs: string[] = r?.errorMessage ? [r.errorMessage] : [];

          if (cleanUser && existingUsers.has(cleanUser)) {
            errs.push('Username sudah terdaftar di sistem');
          }
          if (cleanNip && existingNips.has(cleanNip)) {
            errs.push('NIP/NIK sudah terdaftar di sistem');
          }

          return {
            ...r,
            isValid: r?.isValid && errs.length === 0,
            errorMessage: errs.join(', '),
          };
        });

        setTeacherRows(markedRows);
        if (markedRows.length === 0) {
          setErrorMsg('Tidak ada data yang dapat dibaca dalam file Excel/CSV ini.');
        }
      }
    } catch (err) {
      console.error('Error parsing excel:', err);
      setErrorMsg('Gagal membaca file Excel. Pastikan format file .xlsx, .xls, atau .csv valid.');
    } finally {
      setIsLoading(false);
    }
  };


  const handleResetFile = () => {
    setSelectedFile(null);
    setStudentRows([]);
    setTeacherRows([]);
    setErrorMsg('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleExecuteImport = async () => {
    setIsImporting(true);
    setErrorMsg('');

    try {
      if (isStudent) {
        const validRows = studentRows.filter(r => r.isValid);
        if (validRows.length === 0) {
          setErrorMsg('Tidak ada data valid yang siap diimport.');
          setIsImporting(false);
          return;
        }

        const payload = validRows.map(r => ({
          nama: r.nama,
          kelas: r.kelas,
          noAbsen: r.noAbsen,
          nisn: r.nisn,
          username: r.username || r.nisn,
          password: r.password || 'pass123',
        }));

        await bulkCreateStudents(payload);
        onSuccess(validRows.length, `Berhasil mengimport ${validRows.length} akun siswa secara masal!`);
      } else {
        const validRows = teacherRows.filter(r => r.isValid);
        if (validRows.length === 0) {
          setErrorMsg('Tidak ada data valid yang siap diimport.');
          setIsImporting(false);
          return;
        }

        const payload = validRows.map(r => ({
          name: r.name,
          nip: r.nip,
          username: r.username,
          password: r.password || 'gurupass123',
          subjectId: r.subjectId,
          assignedClasses: r.assignedClasses || [],
        }));

        await bulkCreateTeachers(payload);
        onSuccess(validRows.length, `Berhasil mengimport ${validRows.length} akun guru secara masal!`);
      }

      handleResetFile();
      onClose();
    } catch (err) {
      console.error('Import error:', err);
      setErrorMsg('Terjadi kesalahan saat menyimpan data ke server. Coba lagi.');
    } finally {
      setIsImporting(false);
    }
  };

  const validStudentsCount = studentRows.filter(r => r.isValid).length;
  const validTeachersCount = teacherRows.filter(r => r.isValid).length;
  const totalCount = isStudent ? studentRows.length : teacherRows.length;
  const validCount = isStudent ? validStudentsCount : validTeachersCount;

  return (
    <div className="fixed inset-0 z-[99999] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col my-auto max-h-[90vh]">
        
        {/* Header */}
        <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold shrink-0 ${
              isStudent ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-400/30' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30'
            }`}>
              {isStudent ? <GraduationCap className="w-5 h-5" /> : <Users className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="font-extrabold text-base sm:text-lg leading-tight">
                {isStudent ? 'Import Masal Akun Siswa' : 'Import Masal Akun Guru'}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {isStudent
                  ? 'Unggah file Excel (.xlsx / .csv) untuk membuat banyak akun siswa sekaligus.'
                  : 'Unggah file Excel (.xlsx / .csv) untuk membuat banyak akun guru sekaligus.'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1">
          
          {/* Step 1: Download Template */}
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50/80 p-4 rounded-2xl border border-blue-200/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-blue-600 text-white rounded-xl shrink-0 mt-0.5 shadow-xs">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-xs sm:text-sm text-blue-950">
                  Unduh Template Excel Resmi ({isStudent ? 'Siswa' : 'Guru'})
                </h4>
                <p className="text-xs text-blue-800/80 mt-0.5">
                  Gunakan format kolom yang terstruktur dan rapi lengkap dengan garis tabel untuk pengisian data masal.
                </p>
              </div>
            </div>

            <button
              onClick={handleDownloadTemplate}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md shadow-blue-600/20 transition-all flex items-center gap-2 shrink-0 cursor-pointer active:scale-95"
            >
              <Download className="w-4 h-4" />
              <span>Unduh Template .xlsx</span>
            </button>
          </div>

          {/* Error Alert */}
          {errorMsg && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Upload Drop Zone / Selected File */}
          {!selectedFile ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-300 hover:border-indigo-500 bg-slate-50/70 hover:bg-indigo-50/30 p-8 rounded-2xl text-center cursor-pointer transition-all group"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx, .xls, .csv"
                onChange={handleFileChange}
                className="hidden"
              />
              <div className="w-12 h-12 mx-auto mb-3 bg-white group-hover:bg-indigo-600 text-indigo-600 group-hover:text-white rounded-2xl shadow-xs border border-slate-200 flex items-center justify-center transition-all">
                <Upload className="w-6 h-6" />
              </div>
              <h4 className="font-extrabold text-sm text-slate-800 group-hover:text-indigo-600 transition-colors">
                Klik atau Tarik File Excel (.xlsx / .csv) Ke Sini
              </h4>
              <p className="text-xs text-slate-500 mt-1">
                Format file yang didukung: Excel (.xlsx, .xls) dan CSV
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-slate-100/90 p-3.5 px-4 rounded-xl border border-slate-200">
                <div className="flex items-center gap-3 min-w-0">
                  <FileCheck className="w-5 h-5 text-emerald-600 shrink-0" />
                  <div className="min-w-0">
                    <p className="font-bold text-xs text-slate-900 truncate">{selectedFile.name}</p>
                    <p className="text-[11px] text-slate-500">
                      Ukuran: {(selectedFile.size / 1024).toFixed(1)} KB • Total dibaca: <strong>{totalCount} baris</strong>
                    </p>
                  </div>
                </div>

                <button
                  onClick={handleResetFile}
                  className="px-3 py-1.5 bg-white hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg border border-slate-200 transition-colors cursor-pointer shrink-0"
                >
                  Ganti File
                </button>
              </div>

              {/* Summary Stats */}
              <div className="flex items-center gap-3">
                <div className="flex-1 bg-emerald-50 border border-emerald-200 p-2.5 px-3 rounded-xl text-emerald-900 text-xs font-bold flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Data Valid (Siap Import):</span>
                  </span>
                  <span className="text-sm font-mono font-black">{validCount}</span>
                </div>

                {totalCount - validCount > 0 && (
                  <div className="flex-1 bg-rose-50 border border-rose-200 p-2.5 px-3 rounded-xl text-rose-900 text-xs font-bold flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <AlertCircle className="w-4 h-4 text-rose-600" />
                      <span>Data Incomplete / Ditolak:</span>
                    </span>
                    <span className="text-sm font-mono font-black">{totalCount - validCount}</span>
                  </div>
                )}
              </div>

              {/* Data Table Preview with Neat Grid Borders */}
              <div className="border border-slate-300 rounded-xl overflow-hidden max-h-[300px] overflow-y-auto shadow-2xs">
                {isLoading ? (
                  <div className="p-8 text-center text-slate-500 space-y-2">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto text-indigo-600" />
                    <p className="text-xs font-bold">Membaca isi file Excel...</p>
                  </div>
                ) : isStudent ? (
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-800 text-white font-bold text-[11px] uppercase tracking-wider">
                        <th className="p-2.5 border border-slate-700 text-center w-12">No</th>
                        <th className="p-2.5 border border-slate-700 text-center w-16">Status</th>
                        <th className="p-2.5 border border-slate-700">Nama Lengkap</th>
                        <th className="p-2.5 border border-slate-700 text-center w-20">Kelas</th>
                        <th className="p-2.5 border border-slate-700 text-center w-20">Absen</th>
                        <th className="p-2.5 border border-slate-700">NIS (Username)</th>
                        <th className="p-2.5 border border-slate-700">Password</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {(studentRows || []).map((row, idx) => (
                        <tr
                          key={idx}
                          className={`hover:bg-slate-50/80 transition-colors ${
                            !row.isValid ? 'bg-rose-50/50' : ''
                          }`}
                        >
                          <td className="p-2 border border-slate-200 text-center font-mono text-slate-500">{idx + 1}</td>
                          <td className="p-2 border border-slate-200 text-center">
                            {row.isValid ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                Valid
                              </span>
                            ) : (
                              <span
                                className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200"
                                title={row.errorMessage}
                              >
                                Eror
                              </span>
                            )}
                          </td>
                          <td className="p-2 border border-slate-200 font-bold text-slate-900">{row.nama || '-'}</td>
                          <td className="p-2 border border-slate-200 text-center font-semibold text-slate-700">{row.kelas || '-'}</td>
                          <td className="p-2 border border-slate-200 text-center font-mono text-slate-600">{row.noAbsen || '-'}</td>
                          <td className="p-2 border border-slate-200 font-mono text-indigo-700 font-bold">{row.nisn || '-'}</td>
                          <td className="p-2 border border-slate-200 font-mono text-slate-600">{row.password}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-800 text-white font-bold text-[11px] uppercase tracking-wider">
                        <th className="p-2.5 border border-slate-700 text-center w-12">No</th>
                        <th className="p-2.5 border border-slate-700 text-center w-16">Status</th>
                        <th className="p-2.5 border border-slate-700">Nama Guru</th>
                        <th className="p-2.5 border border-slate-700">NIP / NIK</th>
                        <th className="p-2.5 border border-slate-700">Username</th>
                        <th className="p-2.5 border border-slate-700">Password</th>
                        <th className="p-2.5 border border-slate-700">Mata Pelajaran</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {(teacherRows || []).map((row, idx) => (
                        <tr
                          key={idx}
                          className={`hover:bg-slate-50/80 transition-colors ${
                            !row.isValid ? 'bg-rose-50/50' : ''
                          }`}
                        >
                          <td className="p-2 border border-slate-200 text-center font-mono text-slate-500">{idx + 1}</td>
                          <td className="p-2 border border-slate-200 text-center">
                            {row.isValid ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                Valid
                              </span>
                            ) : (
                              <span
                                className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200"
                                title={row.errorMessage}
                              >
                                Eror
                              </span>
                            )}
                          </td>
                          <td className="p-2 border border-slate-200 font-bold text-slate-900">{row.name || '-'}</td>
                          <td className="p-2 border border-slate-200 font-mono text-slate-600">{row.nip || '-'}</td>
                          <td className="p-2 border border-slate-200 font-mono text-indigo-700 font-bold">{row.username || '-'}</td>
                          <td className="p-2 border border-slate-200 font-mono text-slate-600">{row.password}</td>
                          <td className="p-2 border border-slate-200 font-semibold text-emerald-700">{row.subjectName}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3.5 bg-slate-100 border-t border-slate-200 flex items-center justify-between shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl border border-slate-300 transition-colors cursor-pointer"
          >
            Batal
          </button>

          <button
            onClick={handleExecuteImport}
            disabled={!selectedFile || validCount === 0 || isImporting}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-40 text-white font-extrabold text-xs rounded-xl shadow-md shadow-indigo-200 transition-all flex items-center gap-2 cursor-pointer disabled:cursor-not-allowed active:scale-95"
          >
            {isImporting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Proses Menyimpan Ke Database...</span>
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                <span>Import {validCount} Akun Sekarang</span>
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
};
