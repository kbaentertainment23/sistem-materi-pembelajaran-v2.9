import React, { useState } from 'react';
import {
  Database,
  HardDrive,
  Palette,
  KeyRound,
  Target,
  Trash2,
  RefreshCw,
  Download,
  Upload,
  AlertTriangle,
  CheckCircle2,
  Save,
  Image as ImageIcon,
  HelpCircle,
  FileJson,
  Layers,
  Settings,
} from 'lucide-react';
import { DatabaseJunkReport, SystemBackupData } from '../../types';
import { GradeConfig } from '../../lib/dataService';
import {
  downloadJsonBackup,
  exportAllDataToExcel,
  parseBackupJsonFile,
  parseBackupExcelFile,
} from '../../utils/excelImportExport';
import { exportAllSystemData, restoreSystemData } from '../../lib/dataService';

interface SettingsManagerProps {
  // Junk Cleaner
  junkReport: DatabaseJunkReport | null;
  isScanningJunk: boolean;
  isCleaningJunk: boolean;
  onScanJunk: () => Promise<DatabaseJunkReport | null>;
  onCleanJunk: (cleanAll?: boolean, targetIds?: string[]) => Promise<string>;

  // Branding
  siteLogoUrl: string;
  onSaveLogo: (url: string) => Promise<void>;

  // Security PIN
  onSavePin: (pin: string) => Promise<void>;

  // Quiz Settings
  minQuizScore: number;
  onSaveMinQuizScore: (score: number) => Promise<void>;

  // Master Grades & Classes
  masterGrades: GradeConfig[];
  masterClasses: string[];
  onAddMasterClass: (name: string) => Promise<void>;
  onDeleteMasterClass: (name: string) => Promise<void>;

  // Refresh
  onRefreshData: () => Promise<void>;
  showNotify: (type: 'success' | 'error', message: string) => void;
}

export const SettingsManager: React.FC<SettingsManagerProps> = ({
  junkReport,
  isScanningJunk,
  isCleaningJunk,
  onScanJunk,
  onCleanJunk,
  siteLogoUrl,
  onSaveLogo,
  onSavePin,
  minQuizScore,
  onSaveMinQuizScore,
  masterGrades,
  masterClasses,
  onAddMasterClass,
  onDeleteMasterClass,
  onRefreshData,
  showNotify,
}) => {
  type SettingsSubTab = 'cleaner' | 'backup' | 'branding' | 'security' | 'quiz';
  const [activeSubTab, setActiveSubTab] = useState<SettingsSubTab>('cleaner');

  // Logo State
  const [logoInput, setLogoInput] = useState(siteLogoUrl);
  const [isSavingLogo, setIsSavingLogo] = useState(false);

  // Security PIN State
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [isSavingPin, setIsSavingPin] = useState(false);

  // Quiz Score State
  const [quizScoreInput, setQuizScoreInput] = useState(minQuizScore);
  const [isSavingQuizScore, setIsSavingQuizScore] = useState(false);

  // Backup & Restore State
  const [isBackingUpJson, setIsBackingUpJson] = useState(false);
  const [isBackingUpExcel, setIsBackingUpExcel] = useState(false);
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [parsedRestoreData, setParsedRestoreData] = useState<SystemBackupData | null>(null);
  const [restoreMode, setRestoreMode] = useState<'replace' | 'merge'>('replace');
  const [restoreConfirmKeyword, setRestoreConfirmKeyword] = useState('');
  const [isExecutingRestore, setIsExecutingRestore] = useState(false);

  const handleSaveLogoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingLogo(true);
    try {
      await onSaveLogo(logoInput.trim());
      showNotify('success', 'Logo sekolah berhasil diperbarui!');
    } catch (err: any) {
      showNotify('error', err.message || 'Gagal menyimpan logo');
    } finally {
      setIsSavingLogo(false);
    }
  };

  const handleSavePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPin.trim()) {
      showNotify('error', 'PIN tidak boleh kosong');
      return;
    }
    if (newPin !== confirmPin) {
      showNotify('error', 'Konfirmasi PIN tidak cocok');
      return;
    }
    setIsSavingPin(true);
    try {
      await onSavePin(newPin.trim());
      setNewPin('');
      setConfirmPin('');
    } catch (err: any) {
      showNotify('error', err.message || 'Gagal menyimpan PIN');
    } finally {
      setIsSavingPin(false);
    }
  };

  const handleSaveQuizScoreSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const scoreVal = Number(quizScoreInput);
    if (isNaN(scoreVal) || scoreVal < 1 || scoreVal > 10) {
      showNotify('error', 'Nilai minimal benar kuis harus antara 1 sampai 10');
      return;
    }
    setIsSavingQuizScore(true);
    try {
      await onSaveMinQuizScore(scoreVal);
    } catch (err: any) {
      showNotify('error', err.message || 'Gagal menyimpan nilai kuis');
    } finally {
      setIsSavingQuizScore(false);
    }
  };

  const handleDownloadBackupJson = async () => {
    setIsBackingUpJson(true);
    try {
      const data = await exportAllSystemData();
      downloadJsonBackup(data);
      showNotify('success', 'Cadangan JSON berhasil diunduh!');
    } catch (err) {
      showNotify('error', 'Gagal membuat cadangan JSON');
    } finally {
      setIsBackingUpJson(false);
    }
  };

  const handleDownloadBackupExcel = async () => {
    setIsBackingUpExcel(true);
    try {
      const data = await exportAllSystemData();
      exportAllDataToExcel(data);
      showNotify('success', 'Cadangan Excel (multi-sheet) berhasil diunduh!');
    } catch (err) {
      showNotify('error', 'Gagal membuat cadangan Excel');
    } finally {
      setIsBackingUpExcel(false);
    }
  };

  const handleRestoreFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setRestoreFile(file);
    try {
      let parsed: SystemBackupData;
      if (file.name.toLowerCase().endsWith('.json')) {
        parsed = await parseBackupJsonFile(file);
      } else if (file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls')) {
        parsed = await parseBackupExcelFile(file);
      } else {
        throw new Error('Hanya mendukung format .json atau .xlsx');
      }
      setParsedRestoreData(parsed);
    } catch (err: any) {
      setParsedRestoreData(null);
      showNotify('error', err.message || 'Gagal membaca file cadangan');
    }
  };

  const handleExecuteRestore = async () => {
    if (!parsedRestoreData) return;
    if (restoreConfirmKeyword.trim().toUpperCase() !== 'RESTORE') {
      showNotify('error', 'Ketik kata "RESTORE" untuk konfirmasi');
      return;
    }
    setIsExecutingRestore(true);
    try {
      const res = await restoreSystemData(parsedRestoreData, restoreMode);
      await onRefreshData();
      showNotify(
        'success',
        `Pemulihan sukses! (${res.subjectsCount} mapel, ${res.categoriesCount} topik, ${res.materialsCount} materi, ${res.studentsCount} siswa)`
      );
      setIsRestoreModalOpen(false);
      setRestoreFile(null);
      setParsedRestoreData(null);
      setRestoreConfirmKeyword('');
    } catch (err: any) {
      showNotify('error', err.message || 'Gagal memulihkan database');
    } finally {
      setIsExecutingRestore(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Sub Tabs Navigation */}
      <div className="bg-white p-2 sm:p-2.5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-1.5 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveSubTab('cleaner')}
          className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all flex items-center gap-2 cursor-pointer shrink-0 ${
            activeSubTab === 'cleaner'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Database className="w-4 h-4" />
          <span>Pembersih Database</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('backup')}
          className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all flex items-center gap-2 cursor-pointer shrink-0 ${
            activeSubTab === 'backup'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <HardDrive className="w-4 h-4" />
          <span>Cadangan & Pemulihan</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('branding')}
          className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all flex items-center gap-2 cursor-pointer shrink-0 ${
            activeSubTab === 'branding'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Palette className="w-4 h-4" />
          <span>Logo & Branding</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('security')}
          className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all flex items-center gap-2 cursor-pointer shrink-0 ${
            activeSubTab === 'security'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <KeyRound className="w-4 h-4" />
          <span>PIN Admin</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('quiz')}
          className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all flex items-center gap-2 cursor-pointer shrink-0 ${
            activeSubTab === 'quiz'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Target className="w-4 h-4" />
          <span>Standar Kelulusan Kuis</span>
        </button>
      </div>

      {/* Sub Tab: Cleaner */}
      {activeSubTab === 'cleaner' && (
        <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-xs space-y-5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h4 className="font-extrabold text-base text-slate-900 flex items-center gap-2">
                <Database className="w-5 h-5 text-indigo-600" />
                <span>Pembersih Relasi & Item Sampah Database</span>
              </h4>
              <p className="text-xs text-slate-500 mt-1">
                Pindai materi/topik yatim piatu yang tidak terhubung dengan mata pelajaran aktif atau data siswa tidak valid
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onScanJunk}
                disabled={isScanningJunk}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isScanningJunk ? 'animate-spin' : ''}`} />
                <span>{isScanningJunk ? 'Memindai...' : 'Pindai Database'}</span>
              </button>

              {junkReport && junkReport.items.length > 0 && (
                <button
                  type="button"
                  onClick={() => onCleanJunk(true)}
                  disabled={isCleaningJunk}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{isCleaningJunk ? 'Membersihkan...' : `Bersihkan (${junkReport.items.length}) Item`}</span>
                </button>
              )}
            </div>
          </div>

          {junkReport ? (
            junkReport.healthy ? (
              <div className="p-5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 flex items-center gap-3">
                <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
                <div>
                  <div className="font-bold text-xs">Database Bersih & Optimal!</div>
                  <div className="text-[11px] text-emerald-700 mt-0.5">
                    Tidak ditemukan relasi putus atau materi yatim piatu.
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 space-y-2">
                <div className="font-bold text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <span>Ditemukan {junkReport.totalJunkCount} item yang tidak valid:</span>
                </div>
                <div className="max-h-48 overflow-y-auto space-y-1 text-xs">
                  {(junkReport?.items || []).map((item) => (
                    <div key={item.id} className="p-2.5 bg-white rounded-lg border border-amber-200/60 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                      <div>
                        <div className="font-bold text-slate-800 text-xs">{item.title || item.id}</div>
                        {item.description && (
                          <div className="text-[11px] text-slate-500 mt-0.5">{item.description}</div>
                        )}
                      </div>
                      <span className="text-amber-800 bg-amber-100 px-2 py-0.5 rounded font-mono text-[10px] self-start sm:self-center shrink-0">
                        {item.type}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )
          ) : (
            <div className="p-8 text-center text-slate-400 bg-slate-50 border border-slate-200 border-dashed rounded-xl text-xs">
              Klik "Pindai Database" untuk menganalisis integritas relasi data sekolah
            </div>
          )}
        </div>
      )}

      {/* Sub Tab: Backup & Restore */}
      {activeSubTab === 'backup' && (
        <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-xs space-y-5">
          <div>
            <h4 className="font-extrabold text-base text-slate-900 flex items-center gap-2">
              <HardDrive className="w-5 h-5 text-indigo-600" />
              <span>1-Click Cadangan & Pemulihan Sistem</span>
            </h4>
            <p className="text-xs text-slate-500 mt-1">
              Unduh seluruh database dalam file JSON atau Excel multi-sheet, dan pulihkan kembali kapan saja
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              <div className="font-bold text-xs text-slate-800 flex items-center gap-2">
                <Download className="w-4 h-4 text-indigo-600" />
                <span>Unduh Cadangan Database</span>
              </div>
              <p className="text-[11px] text-slate-500">
                Ekspor seluruh mapel, bab, materi, akun guru, data siswa, dan riwayat progres belajar:
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleDownloadBackupJson}
                  disabled={isBackingUpJson}
                  className="flex-1 py-2 px-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <FileJson className="w-3.5 h-3.5" />
                  <span>{isBackingUpJson ? 'Memproses...' : 'Format .JSON'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleDownloadBackupExcel}
                  disabled={isBackingUpExcel}
                  className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{isBackingUpExcel ? 'Memproses...' : 'Format .XLSX'}</span>
                </button>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              <div className="font-bold text-xs text-slate-800 flex items-center gap-2">
                <Upload className="w-4 h-4 text-indigo-600" />
                <span>Pulihkan Sistem dari File Cadangan</span>
              </div>
              <p className="text-[11px] text-slate-500">
                Unggah file cadangan (.json atau .xlsx) untuk memulihkan seluruh struktur data sekolah:
              </p>
              <input
                type="file"
                accept=".json,.xlsx,.xls"
                onChange={handleRestoreFileChange}
                className="w-full text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer"
              />
              {parsedRestoreData && (
                <div className="pt-2 space-y-2">
                  <input
                    type="text"
                    placeholder='Ketik "RESTORE" untuk konfirmasi'
                    value={restoreConfirmKeyword}
                    onChange={(e) => setRestoreConfirmKeyword(e.target.value)}
                    className="w-full py-1.5 px-3 bg-white border border-rose-300 rounded-xl text-xs font-mono text-slate-900"
                  />
                  <button
                    type="button"
                    onClick={handleExecuteRestore}
                    disabled={isExecutingRestore}
                    className="w-full py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl cursor-pointer disabled:opacity-50"
                  >
                    {isExecutingRestore ? 'Memulihkan Data...' : 'Mulai Pemulihan'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Sub Tab: Branding */}
      {activeSubTab === 'branding' && (
        <form onSubmit={handleSaveLogoSubmit} className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div>
            <h4 className="font-extrabold text-base text-slate-900 flex items-center gap-2">
              <Palette className="w-5 h-5 text-indigo-600" />
              <span>Logo & Identitas Sekolah</span>
            </h4>
            <p className="text-xs text-slate-500 mt-1">
              Atur URL logo sekolah untuk ditampilkan pada header portal siswa dan guru
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">URL Gambar Logo Sekolah</label>
            <input
              type="url"
              placeholder="https://contoh-sekolah.sch.id/logo.png"
              value={logoInput}
              onChange={(e) => setLogoInput(e.target.value)}
              className="w-full py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isSavingLogo}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer disabled:opacity-50"
            >
              {isSavingLogo ? 'Menyimpan...' : 'Simpan Logo'}
            </button>
          </div>
        </form>
      )}

      {/* Sub Tab: Security PIN */}
      {activeSubTab === 'security' && (
        <form onSubmit={handleSavePinSubmit} className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4 max-w-lg">
          <div>
            <h4 className="font-extrabold text-base text-slate-900 flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-indigo-600" />
              <span>Ganti PIN Keamanan Super Admin</span>
            </h4>
            <p className="text-xs text-slate-500 mt-1">
              PIN ini digunakan untuk login ke portal kontrol admin utama
            </p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">PIN Baru (Angka/Karakter)</label>
              <input
                type="password"
                placeholder="Masukkan PIN baru"
                value={newPin}
                onChange={(e) => setNewPin(e.target.value)}
                className="w-full py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-semibold text-slate-800 focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Konfirmasi PIN Baru</label>
              <input
                type="password"
                placeholder="Ulangi PIN baru"
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value)}
                className="w-full py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-semibold text-slate-800 focus:outline-none"
                required
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isSavingPin}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer disabled:opacity-50"
            >
              {isSavingPin ? 'Menyimpan...' : 'Perbarui PIN'}
            </button>
          </div>
        </form>
      )}

      {/* Sub Tab: Quiz Settings */}
      {activeSubTab === 'quiz' && (
        <form onSubmit={handleSaveQuizScoreSubmit} className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4 max-w-lg">
          <div>
            <h4 className="font-extrabold text-base text-slate-900 flex items-center gap-2">
              <Target className="w-5 h-5 text-indigo-600" />
              <span>Standar Minimal Kelulusan Kuis AI</span>
            </h4>
            <p className="text-xs text-slate-500 mt-1">
              Tentukan jumlah minimal jawaban benar (dari total 10 soal) agar siswa dapat membuka materi berikutnya
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Minimal Benar (1 - 10 Soal):
            </label>
            <input
              type="number"
              min={1}
              max={10}
              value={quizScoreInput}
              onChange={(e) => setQuizScoreInput(Number(e.target.value))}
              className="w-32 py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none"
              required
            />
            <span className="text-xs text-slate-500 ml-2">soal benar ({quizScoreInput * 10}%)</span>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isSavingQuizScore}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer disabled:opacity-50"
            >
              {isSavingQuizScore ? 'Menyimpan...' : 'Simpan Standar Kuis'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
