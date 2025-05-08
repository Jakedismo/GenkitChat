import { useState } from 'react';
import { ChatMode, TemperaturePreset, ModelInfo } from '@/types/chat';
// Import model availability constants - adjust path if they live elsewhere
import { availableGeminiModels, availableOpenAIModels } from '@/ai/available-models';

export function useChatSettings() {
  const [chatMode, setChatMode] = useState<ChatMode>(ChatMode.DIRECT_GEMINI); // Default mode

  const [selectedGeminiModelId, setSelectedGeminiModelId] = useState<string>(
    // Safely check array exists and has items before accessing index 0
    (availableGeminiModels && availableGeminiModels.length > 0) ? availableGeminiModels[0].id : ''
  );
  const [selectedOpenAIModelId, setSelectedOpenAIModelId] = useState<string>(
    // Safely check array exists and has items before accessing index 0
    (availableOpenAIModels && availableOpenAIModels.length > 0) ? availableOpenAIModels[0].id : ''
  );

  const [temperaturePreset, setTemperaturePreset] = useState<TemperaturePreset>('normal');
  const [maxTokens, setMaxTokens] = useState<number>(4096); // Consistent default

  // Add state for tool toggles
  const [tavilySearchEnabled, setTavilySearchEnabled] = useState(false);
  const [tavilyExtractEnabled, setTavilyExtractEnabled] = useState(false);
  const [perplexitySearchEnabled, setPerplexitySearchEnabled] = useState(false);
  const [perplexityDeepResearchEnabled, setPerplexityDeepResearchEnabled] = useState(false);

  // Return state values and setters
  return {
    chatMode,
    setChatMode,
    selectedGeminiModelId,
    setSelectedGeminiModelId,
    availableGeminiModels, // Also return the lists for convenience
    selectedOpenAIModelId,
    setSelectedOpenAIModelId,
    availableOpenAIModels, // Also return the lists for convenience
    temperaturePreset,
    setTemperaturePreset,
    maxTokens,
    setMaxTokens,
    // Return tool toggle state and setters
    tavilySearchEnabled,
    setTavilySearchEnabled,
    tavilyExtractEnabled,
    setTavilyExtractEnabled,
    perplexitySearchEnabled,
    setPerplexitySearchEnabled,
    perplexityDeepResearchEnabled,
    setPerplexityDeepResearchEnabled,
  };
}