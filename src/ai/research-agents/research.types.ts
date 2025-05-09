import { string, z } from "zod";
import { Role } from "@genkit-ai/ai"; // For Role enum

// Schema for a Text Part
export const TextPartSchema = z.object({
  text: z.string(),
});
export type TextPart = z.infer<typeof TextPartSchema>;

// Schema for a ToolRequest Part (mirrors ToolRequestPart from @genkit-ai/ai)
export const ZodToolRequestPartSchema = z.object({
  name: z.string(),
  input: z.any().optional(),
  ref: z.string().optional(), // Optional reference for an LLM to identify the request
});
export type ZodToolRequestPart = z.infer<typeof ZodToolRequestPartSchema>;

// Schema for a ToolResponse Part (mirrors ToolResponsePart from @genkit-ai/ai)
export const ZodToolResponsePartSchema = z.object({
  name: z.string(), // Should match the name in the corresponding ToolRequestPart
  output: z.any(),
  ref: z.string().optional(), // Optional reference for an LLM to identify the response
});
export type ZodToolResponsePart = z.infer<typeof ZodToolResponsePartSchema>;

// GenkitPartSchema: A union of the direct Part types.
// A message's content array will hold these directly.
export const GenkitPartSchema = z.union([
  TextPartSchema,
  ZodToolRequestPartSchema,
  ZodToolResponsePartSchema,
  // Potentially add other part schemas if needed: e.g., MediaPartSchema, DataPartSchema
]);
export type GenkitPart = z.infer<typeof GenkitPartSchema>;

// Schema for a single message in conversation history (aligns with MessageData from @genkit-ai/ai)
export const ConversationMessageSchema = z.object({
  role: z.nativeEnum(Role), // 'user', 'model', 'tool', 'system'
  content: z.array(GenkitPartSchema),
});
export type ConversationMessageData = z.infer<typeof ConversationMessageSchema>;

// Zod schema for MultiAgentResearchState
export const MultiAgentResearchStateSchema = z.object({
  iteration: z.number().int().min(0),
  originalQuery: z.string(),
  currentResearchTopic: z.string(),
  conversationHistory: z.array(ConversationMessageSchema),
  accumulatedFindings: z.array(z.string()).default([]),
  clarificationRounds: z.number().int().min(0).default(0),
  needsClarification: z.boolean().default(false),
  statusMessage: z.string().optional(),
  finalReportMarkdown: z.string().optional(),
  orchestratorModelId: z.string(),
  availableDataTools: z.array(z.string()),
});
export type MultiAgentResearchState = z.infer<
  typeof MultiAgentResearchStateSchema
>;

// Zod schema for events streamed back to the client
export const ResearchFlowStreamEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("status"),
    message: z.string(),
    agent: z.string(),
    isPartial: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("clarification_needed"),
    question: z.string(),
    agent: z.string(),
  }),
  z.object({
    type: z.literal("interim_findings"),
    findings: z.string(),
    agent: z.string(),
  }),
  z.object({
    type: z.literal("final_report"),
    markdown: z.string(),
    agent: z.string(),
  }),
  z.object({
    type: z.literal("error"),
    message: z.string(),
    agent: z.string().optional(),
  }),
  z.object({
    type: z.literal("tool_request"),
    agent: z.string(),
    toolName: z.string(),
    input: z.any().optional(),
  }),
  z.object({
    type: z.literal("tool_response"),
    agent: z.string(),
    toolName: z.string(),
    output: z.any().optional(),
  }),
]);
export type ResearchFlowStreamEvent = z.infer<
  typeof ResearchFlowStreamEventSchema
>;

// Input for each turn/continuation of the research flow
export const MultiAgentResearchContinuationInputSchema = z
  .object({
    userQuery: z.string().optional(),
    sessionId: z.string().optional(),
    userResponseToClarification: z.string().optional(),
    orchestratorModelId: z.string().optional(),
    dataToolsForResearch: z.array(z.string()).optional(),
  })
  .refine((data) => data.userQuery || data.sessionId, {
    message:
      "Either userQuery (for new session) or sessionId (for existing session) must be provided.",
  });
export type MultiAgentResearchContinuationInput = z.infer<
  typeof MultiAgentResearchContinuationInputSchema
>;

// Output of each turn/continuation of the research flow
export const MultiAgentResearchTurnOutputSchema = z.object({
  sessionId: z.string(),
  nextAction: z.enum([
    "processing",
    "awaiting_user_clarification",
    "report_ready",
    "error",
    "completed_no_report",
  ]),
  outputForUI: ResearchFlowStreamEventSchema.optional(),
  finalReportMarkdown: z.string().optional(),
  error: z.string().optional(),
});
export type MultiAgentResearchTurnOutput = z.infer<
  typeof MultiAgentResearchTurnOutputSchema
>;

// --- Schemas for overall flow (potentially for a long-running flow model) ---
// These are currently NOT USED by the multiAgentResearchFlow as it's turn-based.

// Input for the main research flow (if it were a single, long-running invocation)
export const MultiAgentResearchInputSchema = z.object({
  userQuery: z.string(),
  orchestratorModelId: z.string().optional(),
  dataToolsForResearch: z.array(z.string()).optional(),
});
export type MultiAgentResearchInput = z.infer<
  typeof MultiAgentResearchInputSchema
>;

// Output of the main research flow (if it were a single, long-running invocation)
export const MultiAgentResearchOutputSchema = z.object({
  sessionId: z.string(),
  status: z.enum([
    "completed",
    "awaiting_clarification",
    "error",
    "max_iterations_reached",
  ]),
  finalReportMarkdown: z.string().optional(),
  history: z.array(ConversationMessageSchema).optional(),
  error: z.string().optional(),
});
export type MultiAgentResearchOutput = z.infer<
  typeof MultiAgentResearchOutputSchema
>;
