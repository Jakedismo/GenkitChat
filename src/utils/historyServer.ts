import { getCapabilities } from "@/ai/modelCapabilities";
import type { MessageData } from "@genkit-ai/ai";

// Very light token estimator – ~4 characters per token
function estimateTokenCount(text: string): number {
  const clean = text.replace(/\s+/g, " ").trim();
  return Math.ceil(clean.length / 4);
}

/**
 * Trims history array (MessageData) to fit within model-specific context budget.
 * Keeps the newest messages.
 */
export function trimHistoryServer(
  history: MessageData[],
  modelId?: string,
): MessageData[] {
  const { historyTokenLimit } = getCapabilities(modelId);
  const tokenLimit = Math.floor(historyTokenLimit * 0.6); // reuse 60 % ratio

  let total = 0;
  const trimmed: MessageData[] = [];

  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    const text = msg.content?.map((p) => (p as any).text || "").join("") ?? "";
    const tokens = estimateTokenCount(text);
    if (total + tokens > tokenLimit) break;
    total += tokens;
    trimmed.unshift(msg);
  }

  return trimmed;
}
