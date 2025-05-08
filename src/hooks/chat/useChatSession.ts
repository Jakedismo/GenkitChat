"use client";

import { useState, useEffect, useCallback } from "react";
import { v4 as uuidv4 } from "uuid";

export interface UseChatSessionReturn {
  currentSessionId: string | undefined;
  startNewSession: () => string; // Renamed for clarity, explicitly returns the new ID
  setCurrentSessionId: (sessionId: string | undefined) => void; // Allow external setting if needed
}

export function useChatSession(): UseChatSessionReturn {
  const [currentSessionId, setCurrentSessionId] = useState<string | undefined>(
    undefined,
  );

  // Effect to initialize session ID on mount if not already set
  useEffect(() => {
    if (!currentSessionId) {
      const newSessionId = uuidv4();
      setCurrentSessionId(newSessionId);
      console.log(
        "[useChatSession] New chat session initialized on mount:",
        newSessionId,
      );
    }
  }, [currentSessionId]); // Re-run if currentSessionId becomes undefined

  const startNewSession = useCallback((): string => {
    const newSessionId = uuidv4();
    setCurrentSessionId(newSessionId);
    console.log("[useChatSession] New session started explicitly:", newSessionId);
    return newSessionId;
  }, []);

  return {
    currentSessionId,
    startNewSession,
    setCurrentSessionId, // Exporting setter for flexibility, e.g., loading a session
  };
}