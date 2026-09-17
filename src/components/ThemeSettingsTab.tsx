import React, { useState, useEffect } from 'react';
import {
  Palette,
  Sparkles,
  Save,
  RotateCcw,
  Check,
  CheckCircle2,
  Flag,
  Award,
  ShieldAlert,
  GraduationCap,
  Sliders,
  AlertCircle,
} from 'lucide-react';
import { ThemeConfig, ThemeAccentColor, THEME_PRESETS, DEFAULT_THEME_CONFIG } from '../types/theme';
import { saveThemeConfig, fetchThemeConfig } from '../lib/dataService';

interface ThemeSettingsTabProps {
  currentTheme?: ThemeConfig;
  onThemeUpdated?: (newTheme: ThemeConfig) => void;
}

export const ThemeSettingsTab: React.FC<ThemeSettingsTabProps> = ({
  currentTheme,
  onThemeUpdated,
}) => {
  const [config, setConfig] = useState<ThemeConfig>(currentTheme || DEFAULT_THEME_CONFIG);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    if (currentTheme) {
      setConfig(currentTheme);
    } else {
      fetchThemeConfig().then((data) => setConfig(data));
    }
  }, [currentTheme]);

  const handleSelectPreset = (presetId: string) => {
    const preset = THEME_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setConfig((prev) => ({
      ...prev,
      ...preset.config,
      eventPresetId: presetId,
    }));
  };

  const handleResetToOriginal = async () => {
    setConfig(DEFAULT_THEME_CONFIG);
    setIsSaving(true);
    setSaveError('');
    try {
      await saveThemeConfig(DEFAULT_THEME_CONFIG);
      if (onThemeUpdated) onThemeUpdated(DEFAULT_THEME_CONFIG);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      setSaveError('Gagal mereset tema ke tampilan original.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveTheme = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveError('');
    try {
      await saveThemeConfig(config);
      if (onThemeUpdated) onThemeUpdated(config);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      setSaveError('Gagal menyimpan pengaturan tema ke Firestore.');
    } finally {
      setIsSaving(false);
    }
  };

  const getPresetIcon = (iconName: string) => {
    switch (iconName) {
      case 'Flag':
        return <Flag className="w-5 h-5 text-red-500" />;
      case 'Award':
        return <Award className="w-5 h-5 text-amber-500" />;
      case 'ShieldAlert':
        return <ShieldAlert className="w-5 h-5 text-cyan-500" />;
      case 'Sparkles':
        return <Sparkles className="w-5 h-5 text-emerald-500" />;
      default:
        return <GraduationCap className="w-5 h-5 text-indigo-500" />;
    }
  };

  const accentOptions: { id: ThemeAccentColor; label: string; bgClass: string }[] = [
    { id: 'indigo', label: 'Indigo / Sapphire (Edu Modern)', bgClass: 'bg-indigo-600' },
    { id: 'crimson', label: 'Merah Putih / Crimson (HUT RI)', bgClass: 'bg-red-600' },
    { id: 'amber', label: 'Emas / Amber (Dies Natalis)', bgClass: 'bg-amber-600' },
    { id: 'cyan', label: 'Cyan / Deep Blue (Ujian & Asesmen)', bgClass: 'bg-cyan-600' },
    { id: 'emerald', label: 'Emerald / Hijau (Hari Guru)', bgClass: 'bg-emerald-600' },
    { id: 'purple', label: 'Royal Purple (Prestasi)', bgClass: 'bg-purple-600' },
  ];

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header & Overview */}
      <div className="bg-white p-5 sm:p-6 rounded-2xl sm:rounded-3xl border border-slate-200 shadow-2xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center shadow-md">
              <Palette className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-extrabold text-base sm:text-lg text-slate-900">
                Manajemen Tema &amp; Template Event Sekolah
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Sesuaikan suasana halaman Login dan Dashboard Siswa saat peringatan hari besar (HUT RI, Dies Natalis, Ujian, dll).
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleResetToOriginal}
              disabled={isSaving}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="Kembalikan semua pengaturan tema ke tampilan default standar"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Kembalikan ke Original</span>
            </button>
          </div>
        </div>

        {/* Status Alert */}
        <div className={`p-3.5 rounded-xl border text-xs font-semibold flex items-center justify-between gap-3 ${
          config.isEventActive
            ? 'bg-amber-50/80 border-amber-200 text-amber-900'
            : 'bg-slate-50 border-slate-200 text-slate-700'
        }`}>
          <div className="flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-full ${config.isEventActive ? 'bg-amber-500 animate-pulse' : 'bg-slate-400'}`} />
            <span>
              Status Tema Saat Ini: <strong>{config.isEventActive ? `Event Aktif (${config.title})` : 'Tampilan Original (Netral)'}</strong>
            </span>
          </div>
          <span className="text-[10px] text-slate-500 hidden sm:inline">
            *Tema hanya mempengaruhi halaman Login &amp; Dashboard Siswa. Panel Guru &amp; Admin tetap fokus dan netral.
          </span>
        </div>

        {saveSuccess && (
          <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold rounded-xl flex items-center gap-2 animate-fadeIn">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Pengaturan tema berhasil disimpan &amp; disinkronkan ke seluruh perangkat siswa.</span>
          </div>
        )}

        {saveError && (
          <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold rounded-xl flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{saveError}</span>
          </div>
        )}
      </div>

      {/* Preset 1-Click Selector */}
      <div className="bg-white p-5 sm:p-6 rounded-2xl sm:rounded-3xl border border-slate-200 shadow-2xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-600" />
            <h4 className="font-extrabold text-sm sm:text-base text-slate-900">
              Pilihan Preset Cepat (1-Klik Terapkan)
            </h4>
          </div>
          <span className="text-[11px] font-bold text-slate-400">Pilih salah satu untuk mengisi form otomatis</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {(THEME_PRESETS || []).map((preset) => {
            const isSelected = config.eventPresetId === preset.id && config.isEventActive === (preset.id !== 'default');

            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleSelectPreset(preset.id)}
                className={`p-4 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-3 relative ${
                  isSelected
                    ? 'border-indigo-600 bg-indigo-50/70 shadow-md ring-2 ring-indigo-500/20'
                    : 'border-slate-200 bg-slate-50/50 hover:bg-slate-100/80 hover:border-slate-300'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-white rounded-xl shadow-2xs border border-slate-200/80">
                      {getPresetIcon(preset.iconName)}
                    </div>
                    <div>
                      <div className="font-black text-xs sm:text-sm text-slate-900">{preset.name}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        {preset.id === 'default' ? 'Mode Netral' : 'Tema Peringatan'}
                      </div>
                    </div>
                  </div>

                  {isSelected && (
                    <span className="p-1 bg-indigo-600 text-white rounded-full">
                      <Check className="w-3.5 h-3.5" />
                    </span>
                  )}
                </div>

                <p className="text-[11px] text-slate-600 font-medium leading-relaxed">
                  {preset.description}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Custom Theme Builder Form */}
      <form onSubmit={handleSaveTheme} className="bg-white p-5 sm:p-6 rounded-2xl sm:rounded-3xl border border-slate-200 shadow-2xs space-y-5">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-indigo-600" />
            <h4 className="font-extrabold text-sm sm:text-base text-slate-900">
              Kustomisasi Detail Tema (Custom Builder)
            </h4>
          </div>
          <span className="text-xs text-slate-400 font-medium">Bisa disesuaikan manual</span>
        </div>

        {/* Master Activation Toggle */}
        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between gap-4">
          <div>
            <span className="text-xs sm:text-sm font-extrabold text-slate-900 block">
              Aktifkan Mode Event / Peringatan Khusus
            </span>
            <span className="text-[11px] text-slate-500 block mt-0.5">
              Jika dinonaktifkan, aplikasi akan secara otomatis kembali ke tampilan original default.
            </span>
          </div>

          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={config.isEventActive}
              onChange={(e) => setConfig((prev) => ({ ...prev, isEventActive: e.target.checked }))}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
          </label>
        </div>

        {/* Form Inputs Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
          {/* Judul Event / Peringatan */}
          <div className="space-y-1">
            <label className="block text-xs font-bold text-slate-700">
              Judul Utama Event / Portal <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={config.title}
              onChange={(e) => setConfig((prev) => ({ ...prev, title: e.target.value }))}
              placeholder="mis. Dirgahayu Republik Indonesia"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white"
              required
            />
            <span className="text-[10px] text-slate-400">Tampil sebagai judul di Login dan Header Dashboard Siswa.</span>
          </div>

          {/* Subjudul / Pesan Motivasi */}
          <div className="space-y-1">
            <label className="block text-xs font-bold text-slate-700">
              Subjudul / Pesan Pengantar <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={config.subtitle}
              onChange={(e) => setConfig((prev) => ({ ...prev, subtitle: e.target.value }))}
              placeholder="mis. Semangat Merdeka Belajar Menuju Generasi Emas"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white"
              required
            />
          </div>

          {/* Badge Tag Teks */}
          <div className="space-y-1">
            <label className="block text-xs font-bold text-slate-700">
              Label Badge Utama (Pill Header)
            </label>
            <input
              type="text"
              value={config.badgeText}
              onChange={(e) => setConfig((prev) => ({ ...prev, badgeText: e.target.value }))}
              placeholder="mis. 🇮🇩 Dirgahayu RI • 17 Agustus"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white"
            />
          </div>

          {/* Secondary Badge / Slogan Tambahan */}
          <div className="space-y-1">
            <label className="block text-xs font-bold text-slate-700">
              Slogan / Badge Sekunder (Opsional)
            </label>
            <input
              type="text"
              value={config.customSecondaryBadge || ''}
              onChange={(e) => setConfig((prev) => ({ ...prev, customSecondaryBadge: e.target.value }))}
              placeholder="mis. Nusantara Baru Indonesia Maju"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white"
            />
          </div>
        </div>

        {/* Kutipan Motivasi / Quote */}
        <div className="space-y-1">
          <label className="block text-xs font-bold text-slate-700">
            Kutipan Inspirasi / Motto Event (Opsional)
          </label>
          <input
            type="text"
            value={config.customQuote || ''}
            onChange={(e) => setConfig((prev) => ({ ...prev, customQuote: e.target.value }))}
            placeholder="mis. Bangsa yang besar adalah bangsa yang menghargai jasa pahlawannya."
            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white"
          />
        </div>

        {/* Pilihan Warna Aksen */}
        <div className="space-y-2 pt-2">
          <label className="block text-xs font-bold text-slate-700">
            Warna Aksen &amp; Atmosfer Tema:
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {(accentOptions || []).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setConfig((prev) => ({ ...prev, accentColor: opt.id }))}
                className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-2.5 ${
                  config.accentColor === opt.id
                    ? 'border-indigo-600 bg-indigo-50/60 font-bold ring-2 ring-indigo-500/20'
                    : 'border-slate-200 bg-slate-50/50 hover:bg-slate-100 text-slate-700'
                }`}
              >
                <span className={`w-4 h-4 rounded-full ${opt.bgClass} shrink-0 shadow-2xs`} />
                <span className="text-xs truncate">{opt.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Ornamen Dekorasi Halus */}
        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between gap-4">
          <div>
            <span className="text-xs font-bold text-slate-900 block">
              Tampilkan Ornamen Dekorasi Halus
            </span>
            <span className="text-[10px] text-slate-500 block mt-0.5">
              Menambahkan efek grafis pita, sparkle, atau confetti estetis secara proporsional.
            </span>
          </div>

          <input
            type="checkbox"
            checked={config.showOrnaments}
            onChange={(e) => setConfig((prev) => ({ ...prev, showOrnaments: e.target.checked }))}
            className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 cursor-pointer"
          />
        </div>

        {/* Form Action */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
          <button
            type="submit"
            disabled={isSaving}
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-extrabold text-xs rounded-xl shadow-md shadow-indigo-200 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{isSaving ? 'Menyimpan ke Firestore...' : 'Simpan & Terapkan Tema'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
