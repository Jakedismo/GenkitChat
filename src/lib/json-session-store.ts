import { SessionStore, SessionData } from 'genkit/beta'; // Or 'genkit/flow' if types moved
import { readFile, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { ensureDir } from 'fs-extra'; // For ensuring directory exists

// Define a directory to store session files.
// IMPORTANT: Ensure this directory is writable by your application
// and ideally outside your source control if sessions are temporary/dev-only.
const SESSIONS_DIR = path.resolve(process.cwd(), '.genkit_sessions');

export class JsonSessionStore<S = any> implements SessionStore<S> {
  private sessionsDir: string;

  constructor(sessionsDirectory: string = SESSIONS_DIR) {
    this.sessionsDir = sessionsDirectory;
    // Ensure the directory exists when the store is instantiated.
    // This is an async operation, but constructor cannot be async.
    // So, we'll ensure dir on first get/save, or you can call an init method.
  }

  private async ensureSessionsDir(): Promise<void> {
    try {
      await ensureDir(this.sessionsDir);
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
      if (data && typeof data.state !== 'undefined' && Array.isArray(data.messages)) {
        return data as SessionData<S>;
      }
      console.warn(`[JsonSessionStore] Data in ${filePath} does not match SessionData structure.`);
      return undefined;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // File not found, which is normal for a new session ID
        return undefined;
      }
      console.error(`[JsonSessionStore] Error reading session file ${filePath}:`, error);
      return undefined;
    }
  }

  async save(sessionId: string, sessionData: SessionData<S>): Promise<void> {
    if (!sessionId) {
      console.warn('[JsonSessionStore] Attempted to save session with empty ID.');
      return;
    }
    await this.ensureSessionsDir();
    const filePath = this.getFilePath(sessionId);
    try {
      const s = JSON.stringify(sessionData, null, 2); // Pretty print JSON
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