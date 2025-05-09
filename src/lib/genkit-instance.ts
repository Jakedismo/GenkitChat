// studio-master/src/lib/genkit-instance.ts
// This file now only exports the JsonSessionStore and related constructs.
// aiInstance and other Genkit configurations have been moved to genkit-server.ts.

// Import the custom JsonSessionStore
import { JsonSessionStore } from './json-session-store';

// Create and export an instance of the JsonSessionStore
// This instance will be passed to session management calls.
export const jsonSessionStore = new JsonSessionStore(); // Uses default .genkit_sessions directory