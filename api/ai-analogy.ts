import type { VercelRequest, VercelResponse } from '@vercel/node';
import { generateAIAnalogyAndHintWithAI } from './_lib/quizGeneratorCore';

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
    const result = await generateAIAnalogyAndHintWithAI(body);
    return res.status(200).json(result);
  } catch (err: any) {
    console.error('Error generating AI analogy:', err);
    // Graceful fallback for analogy
    return res.status(200).json({
      analogy: 'Bayangkan konsep ini seperti sistem teratur dalam kehidupan sehari-hari di mana setiap komponen bekerja selaras.',
      hint: 'Fokus pada kata kunci utama dan eliminasi opsi yang kurang relevan.',
      isFallback: true,
    });
  }
}
