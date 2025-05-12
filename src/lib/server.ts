// src/lib/server.ts
// Handles server-side Genkit initialization for API routes
import { startGenkitServer } from '@/genkit-server';

// Track if initialization has been attempted
let initialized = false;
let initializing = false;
let initError: Error | null = null;

// Ensure Genkit server is initialized only once
export async function ensureGenkitInitialized(): Promise<void> {
  // Skip if already initialized or initializing
  if (initialized || initializing) {
    if (initError) {
      console.warn('Previous Genkit initialization failed:', initError);
    }
    return;
  }

  // Only run on server
  if (typeof window !== 'undefined') {
    console.warn('Genkit server cannot be initialized in browser context');
    return;
  }

  try {
    initializing = true;
    console.log('Initializing Genkit server for API routes...');
    
    // Start the Genkit server
    await startGenkitServer();
    
    initialized = true;
    console.log('Genkit initialization complete for API routes');
  } catch (error) {
    initError = error instanceof Error ? error : new Error(String(error));
    console.error('Failed to initialize Genkit server:', initError);
    // Don't throw, allow API routes to handle the error gracefully
  } finally {
    initializing = false;
  }
}

// Export a helper to use in API route handlers
export async function withGenkitServer<T>(
  handler: () => Promise<T>
): Promise<T> {
  await ensureGenkitInitialized();
  return handler();
}