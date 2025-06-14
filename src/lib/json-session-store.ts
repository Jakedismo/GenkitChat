import { SessionData, SessionStore } from 'genkit/beta'; // Or 'genkit/flow' if types moved
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import * as path from 'node:path';

// Define a directory to store session files.
// IMPORTANT: Ensure this directory is writable by your application
// and ideally outside your source control if sessions are temporary/dev-only.
const SESSIONS_DIR = path.resolve(process.cwd(), '.genkit_sessions');

export class JsonSessionStore<S = Record<string, unknown>> implements SessionStore<S> {
  private sessionsDir: string;

  constructor(sessionsDirectory: string = SESSIONS_DIR) {
    this.sessionsDir = sessionsDirectory;
    // Ensure the directory exists when the store is instantiated.
    // This is an async operation, but constructor cannot be async.
    // So, we'll ensure dir on first get/save, or you can call an init method.
  }

  private async ensureSessionsDir(): Promise<void> {
    try {
      await mkdir(this.sessionsDir, { recursive: true });
    } catch (err) {
      console.error(`[JsonSessionStore] Error ensuring sessions directory '${this.sessionsDir}':`, err);
      // Depending on severity, you might want to throw or handle differently
    }
  }

  private getFilePath(sessionId: string): string {
    // Basic sanitization for sessionId to prevent path traversal issues.
    // Replace non-alphanumeric characters (except hyphen/underscore) with an underscore.
    const sanitizedSessionId = sessionId.replace(/[^\w\-.]/g, '_');
    if (!sanitizedSessionId) {
        throw new Error('[JsonSessionStore] Invalid sessionId provided (empty after sanitization).');
    }
    return path.join(this.sessionsDir, `${sanitizedSessionId}.json`);
  }

  async get(sessionId: string): Promise<SessionData<S> | undefined> {
    if (!sessionId) {
      console.warn('[JsonSessionStore] Attempted to get session with empty ID.');
      return undefined;
    }
    await this.ensureSessionsDir();
    const filePath = this.getFilePath(sessionId);
    try {
      const s = await readFile(filePath, { encoding: 'utf8' });
      const data = JSON.parse(s);
      // Ensure the loaded data has the basic SessionData structure
      if (data && typeof data.id === 'string') {
        // SessionData requires id, and optionally state and threads
        return data as SessionData<S>;
      }
      console.warn(`[JsonSessionStore] Data in ${filePath} does not match SessionData structure (missing id).`);
      return undefined;
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
        // File not found, which is normal for a new session ID
        return undefined;
      }
      console.error(`[JsonSessionStore] Error reading session file ${filePath}:`, error);
      return undefined;
    }
  }

  async save(sessionId: string, sessionData: Omit<SessionData<S>, 'id'>): Promise<void> {
    if (!sessionId) {
      console.warn('[JsonSessionStore] Attempted to save session with empty ID.');
      return;
    }
    await this.ensureSessionsDir();
    const filePath = this.getFilePath(sessionId);
    try {
      // Add the id field to match full SessionData structure for storage
      const fullSessionData: SessionData<S> = {
        id: sessionId,
        ...sessionData
      };
      const s = JSON.stringify(fullSessionData, null, 2); // Pretty print JSON
      await writeFile(filePath, s, { encoding: 'utf8' });
    } catch (error) {
      console.error(`[JsonSessionStore] Error writing session file ${filePath}:`, error);
      // Depending on your error handling strategy, you might want to throw this error
      // throw error;
    }
  }
}

// Optional: Export a default instance for ease of use if only one store is needed
// export const defaultJsonSessionStore = new JsonSessionStore();