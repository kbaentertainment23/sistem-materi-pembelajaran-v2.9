import React, { useState } from 'react';
import {
  Link as LinkIcon,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Play,
  FileText,
  Video,
  Presentation,
  HelpCircle,
  Sparkles,
  RefreshCw,
  Eye
} from 'lucide-react';
import { parseEmbedUrl, ParsedUrlResult } from '../../utils/urlParser';

export const LinkTesterTab: React.FC = () => {
  const [inputUrl, setInputUrl] = useState('');
  const [testedResult, setTestedResult] = useState<{
    originalUrl: string;
    embedUrl: string;
    detectedType: string;
    isValid: boolean;
    message?: string;
  } | null>(null);

  const handleTestLink = (urlToTest?: string) => {
    const url = (urlToTest || inputUrl).trim();
    if (!url) return;

    const parsed: ParsedUrlResult = parseEmbedUrl(url);
    const isValid = parsed.isValid && (parsed.embedUrl.startsWith('http://') || parsed.embedUrl.startsWith('https://'));

    setTestedResult({
      originalUrl: url,
      embedUrl: parsed.embedUrl || url,
      detectedType: parsed.type,
      isValid,
      message: parsed.message,
    });
  };

  const sampleLinks = [
    {
      title: 'Google Drive PDF',
      url: 'https://drive.google.com/file/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs/view?usp=sharing',
      type: 'pdf',
    },
    {
      title: 'YouTube Video',
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      type: 'video',
    },
    {
      title: 'Google Docs Dokumen',
      url: 'https://docs.google.com/document/d/195j9eDD3ccgjQRttHh9EBg3SC8Ko5qWA/edit',
      type: 'doc',
    },
    {
      title: 'Google Slides Presentasi',
      url: 'https://docs.google.com/presentation/d/1_sample_slide/edit',
      type: 'slide',
    },
  ];

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header Card */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-sky-50 text-sky-600 rounded-xl border border-sky-100 shrink-0">
            <LinkIcon className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-extrabold text-base sm:text-lg text-slate-900">
              Uji Coba & Generator Tautan Bahan Ajar
            </h3>
            <p className="text-xs text-slate-500 font-medium">
              Uji format tautan Google Drive, YouTube, Canva, Docs, atau Form sebelum disimpan ke bahan ajar siswa
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-3 py-1 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-full border border-emerald-200 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
            Auto-Converter Aktif
          </span>
        </div>
      </div>

      {/* Input & Tester Section */}
      <div className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
        <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wide">
          Masukkan Tautan (URL) yang ingin diuji:
        </label>
        
        <div className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <LinkIcon className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="url"
              placeholder="Contoh: https://drive.google.com/file/d/.../view atau https://youtu.be/..."
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleTestLink();
              }}
              className="w-full pl-9 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
            />
          </div>

          <button
            type="button"
            onClick={() => handleTestLink()}
            disabled={!inputUrl.trim()}
            className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-extrabold text-xs sm:text-sm rounded-xl transition-all shadow-md shadow-indigo-100 flex items-center justify-center gap-2 shrink-0 cursor-pointer"
          >
            <Eye className="w-4 h-4" />
            <span>Uji Sekarang</span>
          </button>
        </div>

        {/* Quick Sample Links */}
        <div className="pt-2">
          <p className="text-[11px] font-bold text-slate-500 mb-2">Contoh Format Tautan Siap Uji:</p>
          <div className="flex flex-wrap gap-2">
            {(sampleLinks || []).map((sample, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  setInputUrl(sample.url);
                  handleTestLink(sample.url);
                }}
                className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors border border-slate-200/80 flex items-center gap-1.5 cursor-pointer"
              >
                <span>{sample.title}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Test Result & Live Preview */}
      {testedResult && (
        <div className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4 animate-fadeIn">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <h4 className="font-extrabold text-sm sm:text-base text-slate-900">
                Hasil Analisis & Konversi Tautan
              </h4>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-1 rounded-full text-xs font-extrabold bg-indigo-50 text-indigo-700 border border-indigo-200">
                Tipe Terdeteksi: {testedResult.detectedType.toUpperCase()}
              </span>
              <a
                href={testedResult.originalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center gap-1 transition-colors"
              >
                <span>Buka Link Asli</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 space-y-1">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
                URL Asli dari Guru:
              </span>
              <p className="text-xs font-mono font-medium text-slate-700 break-all select-all">
                {testedResult.originalUrl}
              </p>
            </div>

            <div className="p-3.5 bg-indigo-50/70 rounded-xl border border-indigo-100 space-y-1">
              <span className="text-[10px] font-extrabold text-indigo-500 uppercase tracking-wider block">
                URL Embed Otomatis (Untuk Portal Siswa):
              </span>
              <p className="text-xs font-mono font-bold text-indigo-900 break-all select-all">
                {testedResult.embedUrl}
              </p>
            </div>
          </div>

          {/* Interactive Iframe Preview Frame */}
          <div className="space-y-2 pt-2">
            <span className="text-xs font-extrabold text-slate-700 block">
              Pratinjau Layar Siswa (Live Iframe Viewer):
            </span>
            <div className="w-full h-80 sm:h-96 rounded-2xl overflow-hidden border border-slate-200 bg-slate-900 relative shadow-inner">
              <iframe
                src={testedResult.embedUrl}
                title="Link Preview Simulator"
                className="w-full h-full border-0 bg-white"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
