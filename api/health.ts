import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const configuredVar = process.env.GEMINI_API_KEY
      ? 'GEMINI_API_KEY'
      : process.env.GEMINI_KEY
      ? 'GEMINI_KEY'
      : process.env.GOOGLE_API_KEY
      ? 'GOOGLE_API_KEY'
      : process.env.VITE_GEMINI_API_KEY
      ? 'VITE_GEMINI_API_KEY'
      : process.env.GEMINI_APIKEY
      ? 'GEMINI_APIKEY'
      : process.env.GOOGLE_GEMINI_API_KEY
      ? 'GOOGLE_GEMINI_API_KEY'
      : null;

    const rawKey = configuredVar ? process.env[configuredVar] : null;
    const cleanKey = rawKey ? rawKey.trim().replace(/^["']|["']$/g, '') : null;

    return res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: 'vercel-serverless',
      hasGeminiKey: !!cleanKey,
      keyVariableDetected: configuredVar || 'NONE',
      keyLength: cleanKey ? cleanKey.length : 0,
      hint: !cleanKey
        ? 'Silakan tambahkan variabel GEMINI_API_KEY atau GEMINI_KEY di Settings > Environment Variables pada dashboard Vercel Anda, lalu lakukan Redeploy.'
        : 'Kunci API Gemini terdeteksi dan siap digunakan di Vercel.',
    });
  } catch (err: any) {
    return res.status(500).json({
      status: 'error',
      message: err?.message || 'Gagal memproses health check.',
    });
  }
}
