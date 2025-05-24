 "use client";

import { useState, useEffect, useCallback } from "react";

// Session metadata interface matching the API
interface SessionMetadata {
  sessionId: string;
  created: string;
  lastActivity: string;
  documentCount?: number;
}

// API response interfaces
interface SessionResponse {
  sessionId: string;
  exists: boolean;
  created: string | null;
  lastActivity: string | null;
  documentCount: number;
}

export interface UseChatSessionReturn {
  currentSessionId: string | undefined;
  startNewSession: () => Promise<string>;
  setCurrentSessionId: (sessionId: string | undefined) => void;
  sessionMetadata: SessionMetadata | null;
  isLoading: boolean;
  updateSessionMetadata: (metadata: Partial<SessionMetadata>) => Promise<void>;
}

const SESSION_STORAGE_KEY = 'genkit-chat-session-id';

export function useChatSession(): UseChatSessionReturn {
  const [currentSessionId, setCurrentSessionId] = useState<string | undefined>(undefined);
  const [sessionMetadata, setSessionMetadata] = useState<SessionMetadata | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Load session from localStorage and verify with server
  const loadExistingSession = useCallback(async (sessionId: string): Promise<boolean> => {
    try {
      console.log('[useChatSession] Attempting to load existing session:', sessionId);
      
      const response = await fetch(`/api/genkit-session?sessionId=${encodeURIComponent(sessionId)}`);
      
      if (response.ok) {
        const data: SessionResponse = await response.json();
        console.log('[useChatSession] Session loaded successfully:', data);
        
        const metadata: SessionMetadata = {
          sessionId: data.sessionId,
          created: data.created || new Date().toISOString(),
          lastActivity: data.lastActivity || new Date().toISOString(),
          documentCount: data.documentCount
        };
        
        setSessionMetadata(metadata);
        setCurrentSessionId(sessionId);
        return true;
      } else if (response.status === 404) {
        console.log('[useChatSession] Session not found on server, will create new session');
        return false;
      } else {
        console.error('[useChatSession] Failed to load session:', response.statusText);
        return false;
      }
    } catch (error) {
      console.error('[useChatSession] Error loading session:', error);
      return false;
    }
  }, []);

  // Create a new session via API
  const createNewSession = useCallback(async (sessionId?: string): Promise<string> => {
    try {
      console.log('[useChatSession] Creating new session', sessionId ? `with ID: ${sessionId}` : '');
      
      const response = await fetch('/api/genkit-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(sessionId ? { sessionId } : {}),
      });

      if (response.ok) {
        const data: SessionResponse = await response.json();
        console.log('[useChatSession] New session created:', data);
        
        const metadata: SessionMetadata = {
          sessionId: data.sessionId,
          created: data.created || new Date().toISOString(),
          lastActivity: data.lastActivity || new Date().toISOString(),
          documentCount: data.documentCount
        };
        
        setSessionMetadata(metadata);
        setCurrentSessionId(data.sessionId);
        
        // Store in localStorage for persistence
        localStorage.setItem(SESSION_STORAGE_KEY, data.sessionId);
        
        return data.sessionId;
      } else {
        throw new Error(`Failed to create session: ${response.statusText}`);
      }
    } catch (error) {
      console.error('[useChatSession] Error creating session:', error);
      throw error;
    }
  }, []);

  // Initialize session on mount
  useEffect(() => {
    const initializeSession = async () => {
      setIsLoading(true);
      
      try {
        // Try to get session ID from localStorage
        const storedSessionId = localStorage.getItem(SESSION_STORAGE_KEY);
        
        if (storedSessionId) {
          // Try to load existing session
          const loaded = await loadExistingSession(storedSessionId);
          
          if (!loaded) {
            // Session doesn't exist on server, create new one
            await createNewSession();
          }
        } else {
          // No stored session, create new one
          await createNewSession();
        }
      } catch (error) {
        console.error('[useChatSession] Failed to initialize session:', error);
        // Fallback: clear localStorage and try to create a new session
        localStorage.removeItem(SESSION_STORAGE_KEY);
        try {
          await createNewSession();
        } catch (fallbackError) {
          console.error('[useChatSession] Fallback session creation failed:', fallbackError);
        }
      } finally {
        setIsLoading(false);
      }
    };

    if (!currentSessionId) {
      initializeSession();
    }
  }, [currentSessionId, loadExistingSession, createNewSession]);

  // Start a new session (replace current one)
  const startNewSession = useCallback(async (): Promise<string> => {
    console.log('[useChatSession] Starting new session explicitly');
    setIsLoading(true);
    
    try {
      const newSessionId = await createNewSession();
      console.log('[useChatSession] New session started:', newSessionId);
      return newSessionId;
    } finally {
      setIsLoading(false);
    }
  }, [createNewSession]);

  // Update session metadata
  const updateSessionMetadata = useCallback(async (metadata: Partial<SessionMetadata>): Promise<void> => {
    if (!currentSessionId) {
      console.warn('[useChatSession] Cannot update metadata: no current session');
      return;
    }

    try {
      console.log('[useChatSession] Updating session metadata:', metadata);
      
      const response = await fetch('/api/genkit-session', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId: currentSessionId,
          metadata
        }),
      });

      if (response.ok) {
        const data = await response.json();
        console.log('[useChatSession] Session metadata updated:', data);
        
        // Update local metadata state
        setSessionMetadata(prev => prev ? {
          ...prev,
          ...metadata,
          lastActivity: data.lastActivity || new Date().toISOString()
        } : null);
      } else {
        console.error('[useChatSession] Failed to update session metadata:', response.statusText);
      }
    } catch (error) {
      console.error('[useChatSession] Error updating session metadata:', error);
    }
  }, [currentSessionId]);

  // Custom setter that also updates localStorage
  const setCurrentSessionIdWithStorage = useCallback((sessionId: string | undefined) => {
    setCurrentSessionId(sessionId);
    if (sessionId) {
      localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
    } else {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    }
  }, []);

  return {
    currentSessionId,
    startNewSession,
    setCurrentSessionId: setCurrentSessionIdWithStorage,
    sessionMetadata,
    isLoading,
    updateSessionMetadata,
  };
}