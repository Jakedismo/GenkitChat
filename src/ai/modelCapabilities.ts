// Centralised model capability and parameter mapping utilities
// This is used to ensure we don’t pass unsupported parameters (e.g. temperature)
// and that we use the correct token-limit parameter names per model family.
// Add/update entries here to modify behaviour without touching call-sites.

export interface ModelCapabilities {
  /** true if the model accepts a temperature setting */
  supportsTemperature: boolean;
  /** The parameter name Genkit expects for the maximum tokens for *this* model. */
  maxTokensParam: string; // e.g. "maxOutputTokens" | "max_tokens"
  /** Maximum context tokens allowed for chat history (token-based TTL) */
  historyTokenLimit: number;
}

// Helper to build capability objects with sensible defaults
const def = (partial: Partial<ModelCapabilities>): ModelCapabilities => ({
  supportsTemperature: true,
  maxTokensParam: "maxOutputTokens",
  historyTokenLimit: 800_000, // default conservative large context
  ...partial,
});

/**
 * Capability map keyed by the *base* model id (no version strings).
 * Use prefixes to catch variants, e.g. "openai/gpt-4.1-mini" → "openai/gpt-4.1-mini" entry.
 */
const CAPABILITIES: Record<string, ModelCapabilities> = {
  // Gemini family – huge context but regular param names
  "googleai/gemini-2.5-flash": def({ historyTokenLimit: 800_000 }),
  "googleai/gemini-2.5-pro": def({ historyTokenLimit: 800_000 }),

  // GPT-4.1 full – large context
  "openai/gpt-4.1": def({ historyTokenLimit: 800_000 }),

  // Mini / Nano / o4 – smaller context, no temperature for o4-mini, and different param name
  "openai/gpt-4.1-mini": def({ historyTokenLimit: 120_000 }),
  "openai/gpt-4.1-nano": def({ historyTokenLimit: 120_000 }),
  "openai/o4-mini": def({
    supportsTemperature: false,
    maxTokensParam: "max_tokens",
    historyTokenLimit: 120_000,
  }),
  // Added o3 family (does not support temperature)
  "openai/o3": def({
    supportsTemperature: false,
    maxTokensParam: "max_tokens",
    historyTokenLimit: 120_000,
  }),
  "openai/o3-mini": def({
    supportsTemperature: false,
    maxTokensParam: "max_tokens",
    historyTokenLimit: 120_000,
  }),
};

/**
 * Return capabilities for the given model id. Falls back progressively:
 * 1) exact match, 2) startsWith match for prefix handling, 3) sensible defaults.
 */
export function getCapabilities(modelId?: string): ModelCapabilities {
  if (!modelId) return def({});
  // Direct match first
  if (CAPABILITIES[modelId]) return CAPABILITIES[modelId];
  // Prefix match (use longest matching prefix)
  const entry = Object.entries(CAPABILITIES)
    .filter(([key]) => modelId.startsWith(key))
    .sort((a, b) => b[0].length - a[0].length)[0];
  if (entry) return entry[1];
  return def({});
}
