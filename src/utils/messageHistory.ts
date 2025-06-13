import { getCapabilities } from "@/ai/modelCapabilities";
import type { ChatMessage } from "@/types/chat";

// Frontend-safe interface for message history
export interface MessageHistoryItem {
  role: "user" | "model";
  content: Array<{ text: string }>;
}

// Model-specific token limits (conservative estimates with buffer for system prompts)
const MODEL_TOKEN_LIMITS: Record<string, number> = {
  // Gemini models
  "googleAI/gemini-2.5-flash": 1000000,
  "googleAI/gemini-2.5-pro": 1000000,

  // OpenAI models
  "openai/gpt-4.1": 1000000,
  "openai/gpt-4.1-mini": 200000,
  "openai/gpt-4.1-nano": 200000,
  "openai/o4-mini": 200000,

  // Default fallback
  default: 8000,
};

// Configuration constants (can be made configurable via props if needed)
const HISTORY_TOKEN_RATIO = 0.6; // Maximum percentage of context window to use for history
const MAX_HISTORY_MESSAGES = 50; // Maximum number of messages to keep in history
const ENABLE_HISTORY_TRIMMING = true; // Whether to enable automatic history trimming

/**
 * Estimates token count for text using a simple approximation
 * Rule of thumb: ~4 characters per token for most models
 */
function estimateTokenCount(text: string): number {
  // Remove extra whitespace and calculate rough token estimate
  const cleanText = text.replace(/\s+/g, " ").trim();
  return Math.ceil(cleanText.length / 4);
}

/**
 * Gets the effective token limit for conversation history based on model
 */
function getHistoryTokenLimit(modelId?: string): number {
  const caps = getCapabilities(modelId);
  return Math.floor(caps.historyTokenLimit * HISTORY_TOKEN_RATIO);
}

/**
 * Trims conversation history to fit within token limits using a sliding window approach
 * Preserves the most recent messages while staying under the token limit
 */
function trimHistoryByTokens(
  history: MessageHistoryItem[],
  modelId?: string,
): MessageHistoryItem[] {
  // Skip trimming if disabled or no history
  if (!ENABLE_HISTORY_TRIMMING || history.length === 0) return history;

  // Override using capability util to ensure synced limits
  const tokenLimit = getCapabilities(modelId).historyTokenLimit * HISTORY_TOKEN_RATIO;

  // Apply message count limit first
  let workingHistory = history;
  if (history.length > MAX_HISTORY_MESSAGES) {
    workingHistory = history.slice(-MAX_HISTORY_MESSAGES);
    console.log(
      `[messageHistory] Applied message count limit: ${history.length} -> ${workingHistory.length} messages`,
    );
  }

  let totalTokens = 0;
  const trimmedHistory: MessageHistoryItem[] = [];

  // Start from the most recent messages and work backwards
  for (let i = workingHistory.length - 1; i >= 0; i--) {
    const message = workingHistory[i];
    const messageText = message.content.map((c) => c.text).join("");
    const messageTokens = estimateTokenCount(messageText);

    // If adding this message would exceed the limit, stop
    if (totalTokens + messageTokens > tokenLimit) {
      break;
    }

    totalTokens += messageTokens;
    trimmedHistory.unshift(message); // Add to beginning to maintain order
  }

  // Log if we had to trim the history
  if (trimmedHistory.length < workingHistory.length) {
    console.log(
      `[messageHistory] Trimmed conversation history from ${workingHistory.length} to ${trimmedHistory.length} messages (${totalTokens}/${tokenLimit} tokens)`,
    );
  }

  return trimmedHistory;
}

/**
 * Converts ChatMessage array to MessageHistoryItem format for conversation history
 * Includes token-aware trimming to prevent context window overflow
 * This function is frontend-safe and doesn't import any server dependencies
 */
export function convertChatMessagesToHistory(
  messages: ChatMessage[],
  modelId?: string,
): MessageHistoryItem[] {
  const history = messages.map((message): MessageHistoryItem => {
    // Convert sender to role format expected by AI models
    const role = message.sender === "user" ? "user" : "model";

    // Extract text content from various formats
    let textContent = "";
    if (typeof message.text === "string") {
      textContent = message.text;
    } else if (Array.isArray(message.text)) {
      textContent = message.text.join("");
    } else if (message.text && typeof message.text === "object") {
      textContent = message.text.text || JSON.stringify(message.text);
    } else {
      textContent = String(message.text || "");
    }

    return {
      role,
      content: [{ text: textContent }],
    };
  });

  // Apply token-aware trimming
  return trimHistoryByTokens(history, modelId);
}

/**
 * Utility function to get token statistics for debugging
 */
export function getHistoryTokenStats(
  messages: ChatMessage[],
  modelId?: string,
): {
  totalMessages: number;
  processedMessages: number;
  estimatedTokens: number;
  tokenLimit: number;
  withinLimit: boolean;
  trimmingEnabled: boolean;
  messageLimit: number;
} {
  const history = convertChatMessagesToHistory(messages, modelId);
  const totalTokens = history.reduce((sum, msg) => {
    const text = msg.content.map((c) => c.text).join("");
    return sum + estimateTokenCount(text);
  }, 0);

  const tokenLimit = getHistoryTokenLimit(modelId);

  return {
    totalMessages: messages.length,
    processedMessages: history.length,
    estimatedTokens: totalTokens,
    tokenLimit,
    withinLimit: totalTokens <= tokenLimit,
    trimmingEnabled: ENABLE_HISTORY_TRIMMING,
    messageLimit: MAX_HISTORY_MESSAGES,
  };
}

/**
 * Configuration utility to get current history management settings
 */
export function getHistoryConfig(): {
  tokenRatio: number;
  maxMessages: number;
  trimmingEnabled: boolean;
} {
  return {
    tokenRatio: HISTORY_TOKEN_RATIO,
    maxMessages: MAX_HISTORY_MESSAGES,
    trimmingEnabled: ENABLE_HISTORY_TRIMMING,
  };
}
