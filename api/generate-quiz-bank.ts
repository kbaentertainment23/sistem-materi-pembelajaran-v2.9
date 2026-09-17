import type { VercelRequest, VercelResponse } from '@vercel/node';
import { generateQuizBankQuestionsWithAI } from './_lib/quizGeneratorCore.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const result = await generateQuizBankQuestionsWithAI(body);
    return res.status(200).json(result);
  } catch (err: any) {
    console.error('Error generating AI quiz bank:', err);
    // Graceful safety net: never return 500 FUNCTION_INVOCATION_FAILED to client
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
      const fallbackResult = await generateQuizBankQuestionsWithAI({
        ...body,
        forceRefresh: false,
      });
      return res.status(200).json({
        ...fallbackResult,
        warning: `AI generation failed: ${err?.message || 'Server error'}. Using curated fallback questions.`,
      });
    } catch {
      return res.status(200).json({
        quizQuestions: [],
        totalCount: 0,
        isFallback: true,
        error: err?.message || 'Gagal menghasilkan bank soal AI.',
      });
    }
  }
}
