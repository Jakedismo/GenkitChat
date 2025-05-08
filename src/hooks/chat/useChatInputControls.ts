"use client";

import { useState, useCallback } from "react";

export interface UseChatInputControlsReturn {
  userInput: string;
  setUserInput: React.Dispatch<React.SetStateAction<string>>;
  clearUserInput: () => void;
  handleInputChange: (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => void;
}

export function useChatInputControls(
  initialValue: string = "",
): UseChatInputControlsReturn {
  const [userInput, setUserInput] = useState<string>(initialValue);

  const clearUserInput = useCallback(() => {
    setUserInput("");
  }, []);

  const handleInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setUserInput(event.target.value);
    },
    [],
  );

  return {
    userInput,
    setUserInput,
    clearUserInput,
    handleInputChange,
  };
}