// src/lib/server.ts
// Handles server-side Genkit initialization for API routes
import { startGenkitServer } from '@/genkit-server';

// Ensure Genkit server is initialized only once
export async function ensureGenkitInitialized(): Promise<void> {
  // Only run on server
  if (typeof window !== 'undefined') {
    console.warn('Genkit server cannot be initialized in browser context');
    return;
  }

  try {
    // Start the Genkit server (it handles its own singleton logic)
    await startGenkitServer();
    console.log('Genkit initialization complete for API routes');
  } catch (error) {
    // Log the error.
    console.error('Failed to ensure Genkit server initialization for API routes:', error instanceof Error ? error.message : String(error));
    // Re-throw the error to ensure initialization failures are propagated to the caller
    // and are not masked. This allows upstream code (e.g., API routes) to be aware
    // of critical Genkit initialization failures.
    throw error;
  }
}

// Export a helper to use in API route handlers
export async function withGenkitServer<T>(
  handler: () => Promise<T>
): Promise<T> {
  await ensureGenkitInitialized();
  return handler();
}