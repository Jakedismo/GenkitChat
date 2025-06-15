import { ensureGenkitInitialized } from '@/lib/server';
import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  console.log('[TEST_API_ROUTE] API route called. Attempting to ensure Genkit is initialized...');
  try {
    await ensureGenkitInitialized();
    console.log('[TEST_API_ROUTE] ensureGenkitInitialized completed.');
    res.status(200).json({ message: 'Genkit initialization process ensured.' });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[TEST_API_ROUTE] Error in ensureGenkitInitialized:', errorMessage);
    res.status(500).json({ message: 'Error ensuring Genkit initialization.', error: errorMessage });
  }
}
