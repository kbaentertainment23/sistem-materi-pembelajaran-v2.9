import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import {
  generateQuizQuestionsWithAI,
  generateQuizBankQuestionsWithAI,
  generateAIAnalogyAndHintWithAI,
  getGeminiApiKey,
} from './src/server/quizGeneratorCore';

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  // Basic CORS headers
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
      return;
    }
    next();
  });

  // API routes FIRST
  app.get('/api/health', (req, res) => {
    const key = getGeminiApiKey();
    res.json({
      status: 'ok',
      hasGeminiKey: !!key,
      keyLength: key ? key.length : 0,
    });
  });

  // 10-Question Mini Quiz generation endpoint using semantic content analysis
  app.post('/api/generate-quiz', async (req, res) => {
    try {
      const { title, targetGrade } = req.body || {};
      if (!title || typeof title !== 'string' || !title.trim()) {
        res.status(400).json({ error: 'Parameter "title" (judul materi) wajib diisi.' });
        return;
      }

      console.log(`[Quiz Controller] Generating 10-question quiz via semantic content analysis for "${title.trim()}" (Grade: ${targetGrade || 'smp-7'}).`);
      const result = await generateQuizQuestionsWithAI(req.body);
      res.json(result);
    } catch (err: any) {
      console.error('[Quiz Controller] Error in /api/generate-quiz:', err);
      // Zero-Crash Policy: Always return 200 with curated fallback
      try {
        const fallbackResult = await generateQuizQuestionsWithAI({
          ...(req.body || {}),
          forceRefresh: false,
        });
        res.status(200).json({
          ...fallbackResult,
          warning: `AI generation note: ${err?.message || 'Server note'}. Menggunakan bank soal kurasi.`,
        });
      } catch {
        res.status(200).json({
          quizQuestions: [],
          flashcards: [],
          isFallback: true,
          error: err?.message || 'Gagal membuat kuis otomatis dari AI.',
        });
      }
    }
  });

  // 30-Question Bank Soal generation endpoint using semantic content analysis (C2-C4)
  app.post('/api/generate-quiz-bank', async (req, res) => {
    try {
      const { title, targetGrade } = req.body || {};
      if (!title || typeof title !== 'string' || !title.trim()) {
        res.status(400).json({ error: 'Parameter "title" (judul materi) wajib diisi untuk bank soal.' });
        return;
      }

      console.log(`[Quiz Bank Controller] Generating 30-item C2-C4 bank questions via semantic content analysis for "${title.trim()}" (Grade: ${targetGrade || 'smp-7'}).`);
      const result = await generateQuizBankQuestionsWithAI(req.body);
      res.json(result);
    } catch (err: any) {
      console.error('[Quiz Bank Controller] Error in /api/generate-quiz-bank:', err);
      // Zero-Crash Policy: Always return 200 with curated fallback
      try {
        const fallbackResult = await generateQuizBankQuestionsWithAI({
          ...(req.body || {}),
          forceRefresh: false,
        });
        res.status(200).json({
          ...fallbackResult,
          warning: `AI generation note: ${err?.message || 'Server note'}. Menggunakan bank soal kurasi.`,
        });
      } catch {
        res.status(200).json({
          quizQuestions: [],
          totalCount: 0,
          isFallback: true,
          error: err?.message || 'Gagal menghasilkan bank soal AI.',
        });
      }
    }
  });

  // Lightweight Quiz Analogy and Hint endpoint (< 200 tokens)
  app.post('/api/ai-analogy', async (req, res) => {
    try {
      const { questionText } = req.body || {};
      if (!questionText || typeof questionText !== 'string' || !questionText.trim()) {
        res.status(400).json({ error: 'Parameter "questionText" wajib diisi.' });
        return;
      }

      const result = await generateAIAnalogyAndHintWithAI(req.body);
      res.json(result);
    } catch (err: any) {
      console.error('[Analogy Controller] Error in /api/ai-analogy:', err);
      // Zero-Crash Policy: Fallback analogy
      res.status(200).json({
        analogy: 'Bayangkan konsep ini seperti sistem teratur dalam kehidupan sehari-hari di mana setiap komponen bekerja selaras.',
        hint: 'Fokus pada kata kunci utama dan eliminasi opsi yang kurang relevan.',
        isFallback: true,
      });
    }
  });

  // Dedicated PWA routes with required headers for Chrome & mobile browsers
  app.get('/sw.js', (req, res) => {
    const swPath = process.env.NODE_ENV === 'production'
      ? path.join(process.cwd(), 'dist', 'sw.js')
      : path.join(process.cwd(), 'public', 'sw.js');
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Service-Worker-Allowed', '/');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.sendFile(swPath);
  });

  app.get('/manifest.json', (req, res) => {
    const manifestPath = process.env.NODE_ENV === 'production'
      ? path.join(process.cwd(), 'dist', 'manifest.json')
      : path.join(process.cwd(), 'public', 'manifest.json');
    res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.sendFile(manifestPath);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    // In Express v5, wildcard route requires '*all'
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
