// research.flow.ts - Multi-agent research flow using Genkit
import * as genkitBeta from "genkit/beta";
import { Session, SessionStore } from "genkit/beta";
import {
  generateStream,
  MessageData,
  Part,
  ToolRequestPart,
  ToolResponsePart,
  GenerateRequest,
  GenerateStreamResponse,
} from "@genkit-ai/ai";

import { z } from "zod";

import {
  MultiAgentResearchContinuationInputSchema,
  type MultiAgentResearchContinuationInput,
  MultiAgentResearchTurnOutputSchema,
  type MultiAgentResearchTurnOutput,
  MultiAgentResearchStateSchema,
  type MultiAgentResearchState,
  ResearchFlowStreamEventSchema,
  type ResearchFlowStreamEvent,
  // ConversationMessageData is inferred from ConversationMessageSchema in research.types.ts
} from "./research.types";

import { aiInstance } from "../../genkit-server";
import { jsonSessionStore } from "../../lib/genkit-instance";

function getInitialState(
  query: string,
  input: MultiAgentResearchContinuationInput,
): MultiAgentResearchState {
  return {
    iteration: 0,
    originalQuery: query,
    currentResearchTopic: query,
    conversationHistory: [] as MessageData[],
    accumulatedFindings: [],
    clarificationRounds: 0,
    needsClarification: false,
    statusMessage: "Initializing research...",
    orchestratorModelId:
      input.orchestratorModelId || "googleai/gemini-1.5-flash-latest", // Default model
    availableDataTools: input.dataToolsForResearch || [
      "tavilySearch",
      "perplexitySearch",
    ],
    finalReportMarkdown: undefined,
  };
}

async function processResearchTurnInternal(
  input: MultiAgentResearchContinuationInput,
  sendChunk: (event: ResearchFlowStreamEvent) => void,
  context: any,
): Promise<MultiAgentResearchTurnOutput> {
  const { logger, registry } = context;
  let activeSession: Session<MultiAgentResearchState>;
  let currentState: MultiAgentResearchState;

  // Session loading/creation logic
  if (input.sessionId) {
    logger.info(`[P RTI] Loading session: ${input.sessionId}`);
    try {
      const loadedSession = await aiInstance.loadSession<MultiAgentResearchState>(input.sessionId, { store: jsonSessionStore });
      if (!loadedSession || !loadedSession.state) {
        throw new Error("Session not found or state is empty.");
      }
      activeSession = loadedSession;
      currentState = activeSession.state!;
      if (input.userResponseToClarification) {
        currentState.conversationHistory.push({ role: 'user', content: [{ text: input.userResponseToClarification }] } as MessageData);
        currentState.needsClarification = false;
        sendChunk({ type: "status", message: "User clarification received.", agent: "System" });
      }
    } catch (error: any) {
      logger.error(`[P RTI] Load session ${input.sessionId} error: ${error.message}`);
      sendChunk({ type: "error", message: `Session load failed. Starting new.`, agent: "System" });
      if (!input.userQuery) return { sessionId: input.sessionId || "error-no-query", nextAction: "error", error: "Query missing for new session." };
      currentState = getInitialState(input.userQuery, input);
      activeSession = await aiInstance.createSession<MultiAgentResearchState>({ state: currentState, store: jsonSessionStore, name: `research-${Date.now()}` });
      currentState = activeSession.state!;
      sendChunk({ type: "status", message: `New session created: ${activeSession.id}`, agent: "System" });
    }
  } else {
    if (!input.userQuery) return { sessionId: "error-no-query", nextAction: "error", error: "Query is required." };
    currentState = getInitialState(input.userQuery, input);
    activeSession = await aiInstance.createSession<MultiAgentResearchState>({ state: currentState, store: jsonSessionStore, name: `research-${Date.now()}` });
    currentState = activeSession.state!;
    sendChunk({ type: "status", message: `New session created: ${activeSession.id}`, agent: "System" });
  }

  if (!activeSession) return { sessionId: input.sessionId || "error-no-active-session", nextAction: "error", error: "Session could not be established." };

  currentState.iteration++;
  logger.info(`[P RTI] Orchestrator Iteration ${currentState.iteration} for session ${activeSession.id}`);

  const orchestratorPromptAction = await registry.loadAction({ name: `/prompt/orchestrator_agent` }) as any | undefined;
  if (!orchestratorPromptAction || !orchestratorPromptAction.definition) {
    return { sessionId: activeSession.id, nextAction: "error", error: "Orchestrator prompt action or its definition is missing." };
  }
  const orchestratorPromptDef = orchestratorPromptAction.definition as any;
  const orchestratorModelName = orchestratorPromptDef.model?.name || currentState.orchestratorModelId;
  const orchestratorModel = await registry.loadModel({ name: orchestratorModelName }) as any | undefined;
  if (!orchestratorModel) {
    return { sessionId: activeSession.id, nextAction: "error", error: `Orchestrator model '${orchestratorModelName}' not found.` };
  }

  let orchestratorMessages: MessageData[] = [];
  if (orchestratorPromptDef.system) {
    orchestratorMessages.push({ role: 'system', content: [{ text: orchestratorPromptDef.system }] } as MessageData);
  }
  orchestratorMessages = [
    ...orchestratorMessages,
    // Explicitly map to ensure role type is narrowed if that's the issue
    ...currentState.conversationHistory.map(msg => ({
        role: msg.role as 'user' | 'model' | 'system' | 'tool', // Cast to specific literals
        content: msg.content,
        // Conditionally spread metadata only if it exists to avoid undefined property
        ...(msg.metadata && { metadata: msg.metadata }) 
    } as MessageData))
  ];

  const orchestratorPromptRenderInput = { userQuery: currentState.originalQuery, researchTopic: currentState.currentResearchTopic, availableDataTools: currentState.availableDataTools, resolvedModelId: orchestratorModelName };
  try {
    const renderedOutput = await aiInstance.runAction(orchestratorPromptAction, orchestratorPromptRenderInput);
    const renderedMessages = renderedOutput?.messages;
    if (renderedMessages && Array.isArray(renderedMessages) && renderedMessages.length > 0) {
      orchestratorMessages = [...orchestratorMessages, ...renderedMessages as MessageData[]];
    } else {
      logger.warn("[P RTI] Orchestrator prompt action did not return messages. Constructing a default user message.");
      orchestratorMessages.push({ role: 'user', content: [{ text: `Current research topic: \\"${currentState.currentResearchTopic}\\". Original query: \\"${currentState.originalQuery}\\". Available tools: ${currentState.availableDataTools.join(', ')}.` }] } as MessageData);
    }
  } catch (e: any) {
    logger.error(`[P RTI] Error running orchestrator prompt action to get messages: ${e.message}. Using fallback user message.`);
    orchestratorMessages.push({ role: 'user', content: [{ text: `Current research topic: \\"${currentState.currentResearchTopic}\\". Original query: \\"${currentState.originalQuery}\\". Available tools: ${currentState.availableDataTools.join(', ')}.` }] } as MessageData);
  }

  const orchestratorRequest: GenerateRequest = {
    messages: orchestratorMessages,
    tools: orchestratorPromptDef.tools as any[] || [],
    config: { temperature: 0.5, ...(orchestratorPromptDef.config || {}) },
  };

  sendChunk({ type: "status", message: `Orchestrator turn ${currentState.iteration}...`, agent: "Orchestrator" });
  let orchestratorStreamResult: GenerateStreamResponse<any>;
  try {
    orchestratorStreamResult = await orchestratorModel.generateStream(orchestratorRequest);
  } catch (genError: any) {
    logger.error("[P RTI] generateStream for orchestrator failed:", genError);
    return { sessionId: activeSession.id, nextAction: "error", error: `Orchestrator LLM call failed: ${genError.message}` };
  }

  let orchestratorPendingToolRequests: ToolRequestPart[] = [];
  let orchestratorResponseContent: Part[] = [];
  for await (const chunk of orchestratorStreamResult.stream) {
    if (chunk.text) orchestratorResponseContent.push({ text: chunk.text });
    if (chunk.toolRequests && chunk.toolRequests.length > 0) {
      for (const toolReq of chunk.toolRequests) {
        orchestratorPendingToolRequests.push(toolReq);
        orchestratorResponseContent.push(toolReq);
        sendChunk({ type: "tool_request", agent: "Orchestrator", toolName: toolReq.toolRequest.name, input: toolReq.toolRequest.input });
      }
    }
    if (chunk.text) sendChunk({ type: "status", message: chunk.text, agent: "Orchestrator", isPartial: true });
  }

  if (orchestratorResponseContent.length > 0) {
    currentState.conversationHistory.push({ role: 'model', content: orchestratorResponseContent } as MessageData);
  } else {
    sendChunk({ type: "status", message: "Orchestrator provided no actionable output.", agent: "System" });
  }
  await activeSession.updateState(currentState);

  if (orchestratorPendingToolRequests.length > 0) {
    sendChunk({ type: "status", message: `Orchestrator delegating to: ${orchestratorPendingToolRequests.map((tr) => tr.toolRequest.name).join(", ")}`, agent: "System" });
    const toolResponsesForOrchestrator: ToolResponsePart[] = [];
    let textThisSpecialistTurn = ""; 

    for (const orchestratorToolRequest of orchestratorPendingToolRequests) {
      const specialistAgentName = orchestratorToolRequest.toolRequest.name;
      const specialistAgentInitialInput = orchestratorToolRequest.toolRequest.input as any;
      logger.info(`[P RTI] Invoking specialist: ${specialistAgentName}`);
      let specialistFinalTextOutput: string = "";
      const MAX_SPECIALIST_ITERATIONS = 3; let iter = 0;

      try {
        const specialistPromptAction = await registry.loadAction({ name: `/prompt/${specialistAgentName}` }) as any | undefined;
        if (!specialistPromptAction || !specialistPromptAction.definition) throw new Error(`Specialist prompt action/definition '${specialistAgentName}' not found.`);
        const specialistPromptDef = specialistPromptAction.definition as any;
        const specialistModelName = specialistPromptDef.model?.name || currentState.orchestratorModelId;
        const specialistModel = await registry.loadModel({ name: specialistModelName }) as any | undefined;
        if (!specialistModel) throw new Error(`Model '${specialistModelName}' for '${specialistAgentName}' not found.`);

        let specialistHistory: MessageData[] = [];
        let currentSpecialistRunInput = { ...specialistAgentInitialInput, resolvedModelId: specialistModelName, researchTopic: currentState.currentResearchTopic, accumulatedFindingsText: currentState.accumulatedFindings.join('\\n---\\n') };

        if (specialistPromptDef.system) {
          specialistHistory.push({role: 'system', content: [{text: specialistPromptDef.system}]} as MessageData);
        }
        try {
          const renderedSpecialistOutput = await aiInstance.runAction(specialistPromptAction, currentSpecialistRunInput);
          const renderedSpecialistMessages = renderedSpecialistOutput?.messages;
          if (renderedSpecialistMessages && Array.isArray(renderedSpecialistMessages) && renderedSpecialistMessages.length > 0) {
            specialistHistory = [...specialistHistory, ...renderedSpecialistMessages as MessageData[]];
          } else {
             specialistHistory.push({role: 'user', content: [{text: `Task for ${specialistAgentName}: ${JSON.stringify(currentSpecialistRunInput)}`}]} as MessageData);
          }
        } catch (e:any) {
            logger.warn(`[P RTI] Could not run specialist prompt action ${specialistAgentName} to get initial messages: ${e.message}. Using fallback.`);
            specialistHistory.push({role: 'user', content: [{text: `Task for ${specialistAgentName}: ${JSON.stringify(currentSpecialistRunInput)}`}]} as MessageData);
        }

        for (iter = 0; iter < MAX_SPECIALIST_ITERATIONS; iter++) {
          logger.info(`[P RTI] Specialist ${specialistAgentName} iter ${iter + 1}`);
          textThisSpecialistTurn = ""; 
          const specialistRequest: GenerateRequest = {
            messages: specialistHistory,
            tools: specialistPromptDef.tools || [],
            config: specialistPromptDef.config,
          };
          sendChunk({ type: "status", message: `Specialist ${specialistAgentName} (Iter ${iter + 1}/${MAX_SPECIALIST_ITERATIONS})...`, agent: specialistAgentName, isPartial: true });
          const specialistStreamResult = await specialistModel.generateStream(specialistRequest);
          let toolRequestsThisSpecialistTurn: ToolRequestPart[] = [];
          let specialistModelResponseContent: Part[] = [];

          for await (const chunk of specialistStreamResult.stream) {
            if (chunk.text) { textThisSpecialistTurn += chunk.text; specialistModelResponseContent.push({ text: chunk.text }); sendChunk({ type: "status", message: `  ${chunk.text}`, agent: specialistAgentName, isPartial: true }); }
            if (chunk.toolRequests && chunk.toolRequests.length > 0) {
              for (const toolReq of chunk.toolRequests) {
                toolRequestsThisSpecialistTurn.push(toolReq);
                specialistModelResponseContent.push(toolReq);
                logger.info(`[P RTI] Specialist ${specialistAgentName} tool req: ${toolReq.toolRequest.name}`);
                sendChunk({type: "tool_request", agent: specialistAgentName, toolName: toolReq.toolRequest.name, input: toolReq.toolRequest.input});
              }
            }
          }
          if (specialistModelResponseContent.length > 0) {
            specialistHistory.push({role: 'model', content: specialistModelResponseContent} as MessageData);
          }

          if (toolRequestsThisSpecialistTurn.length > 0) {
            const specialistToolResponses: ToolResponsePart[] = [];
            for (const toolRequest of toolRequestsThisSpecialistTurn) {
              let toolExecutionOutput: any;
              try {
                const toolActionName = toolRequest.toolRequest.name.startsWith('/') ? toolRequest.toolRequest.name : `/tool/${toolRequest.toolRequest.name}`;
                const toolAction = await registry.loadAction({name: toolActionName}) as any | undefined;
                if (!toolAction) throw new Error (`Tool action '${toolActionName}' not found.`);
                toolExecutionOutput = await aiInstance.runAction(toolAction, toolRequest.toolRequest.input);
                logger.info(`[P RTI] Tool ${toolRequest.toolRequest.name} executed by specialist.`);
              } catch (toolError: any) {
                logger.error(`[P RTI] Tool ${toolRequest.toolRequest.name} err for ${specialistAgentName}: ${toolError.message}`);
                toolExecutionOutput = { error: `Tool ${toolRequest.toolRequest.name} execution failed: ${toolError.message}` };
              }
              specialistToolResponses.push({ toolResponse: { name: toolRequest.toolRequest.name, output: toolExecutionOutput, ref: toolRequest.toolRequest.ref } } as ToolResponsePart);
              sendChunk({type: "tool_response", agent: "System", toolName: toolRequest.toolRequest.name, output: toolExecutionOutput});
            }
            if (specialistToolResponses.length > 0) {
              specialistHistory.push({ role: 'tool', content: specialistToolResponses } as MessageData);
            }
          } else {
            specialistFinalTextOutput = textThisSpecialistTurn;
            logger.info(`[P RTI] Specialist ${specialistAgentName} iter ${iter + 1} final text.`);
            break;
          }
        }
        if (!specialistFinalTextOutput && iter === MAX_SPECIALIST_ITERATIONS) {
          specialistFinalTextOutput = textThisSpecialistTurn || "Specialist max iterations.";
        }
      } catch (error: any) {
        logger.error(`[P RTI] Specialist ${specialistAgentName} main err: ${error.message}`);
        specialistFinalTextOutput = JSON.stringify({ error: `Err in ${specialistAgentName}: ${error.message}` });
      }
      toolResponsesForOrchestrator.push({ toolResponse: { name: orchestratorToolRequest.toolRequest.name, output: specialistFinalTextOutput, ref: orchestratorToolRequest.toolRequest.ref } } as ToolResponsePart);
      if (specialistAgentName === 'clarification_agent') { currentState.needsClarification = true; currentState.statusMessage = `Clarify: ${specialistFinalTextOutput}`; sendChunk({ type: "clarification_needed", question: specialistFinalTextOutput, agent: "ClarificationAgent" }); }
      else if (specialistAgentName === 'report_writer_agent') { currentState.finalReportMarkdown = specialistFinalTextOutput; currentState.statusMessage = "Report generated."; sendChunk({ type: "status", message: currentState.statusMessage || "", agent: "ReportWriterAgent" }); }
      else if (specialistAgentName.toLowerCase().includes('research')) { if (specialistFinalTextOutput && !specialistFinalTextOutput.includes("max iterations")) currentState.accumulatedFindings.push(specialistFinalTextOutput); }
      sendChunk({ type: "tool_response", agent: "System", toolName: orchestratorToolRequest.toolRequest.name, output: specialistFinalTextOutput });
    }

    if (toolResponsesForOrchestrator.length > 0) {
      currentState.conversationHistory.push({ role: 'tool', content: toolResponsesForOrchestrator } as MessageData);
    }
    await activeSession.updateState(currentState);
    if (currentState.needsClarification) return { sessionId: activeSession.id, nextAction: "awaiting_user_clarification", outputForUI: { type: "clarification_needed", question: currentState.statusMessage!.replace("Clarify: ", ""), agent: "ClarificationAgent" } };
    if (currentState.finalReportMarkdown) { sendChunk({ type: "final_report", markdown: currentState.finalReportMarkdown, agent: "ReportWriterAgent" }); return { sessionId: activeSession.id, nextAction: "report_ready", outputForUI: { type: "final_report", markdown: currentState.finalReportMarkdown, agent: "ReportWriterAgent" }, finalReportMarkdown: currentState.finalReportMarkdown }; }
    return { sessionId: activeSession.id, nextAction: "processing", outputForUI: { type: "status", message: "Specialists processed. Orchestrator to eval.", agent: "System" } };
  } else { 
    const orchestratorFinalTextOnly = orchestratorResponseContent.filter(p => p.text).map(p => p.text).join("").trim();
    if (orchestratorFinalTextOnly) {
        currentState.finalReportMarkdown = orchestratorFinalTextOnly;
        sendChunk({ type: "status", message: "Orchestrator provided final answer directly.", agent: "Orchestrator" });
        sendChunk({ type: "final_report", markdown: currentState.finalReportMarkdown, agent: "Orchestrator" });
        await activeSession.updateState(currentState);
        return { sessionId: activeSession.id, nextAction: "report_ready", outputForUI: { type: "final_report", markdown: currentState.finalReportMarkdown, agent: "Orchestrator" }, finalReportMarkdown: currentState.finalReportMarkdown };
    } else {
        sendChunk({ type: "status", message: "Orchestrator finished turn without explicit actions or report.", agent: "System" });
        await activeSession.updateState(currentState);
        return { sessionId: activeSession.id, nextAction: "completed_no_report", outputForUI: { type: "status", message: "Research turn complete, no explicit report generated.", agent: "System" } };
    }
  }
}

export const multiAgentResearchFlow = aiInstance.defineFlow(
  {
    name: "multiAgentResearchFlow",
    inputSchema: MultiAgentResearchContinuationInputSchema,
    outputSchema: MultiAgentResearchTurnOutputSchema,
    streamSchema: ResearchFlowStreamEventSchema,
  },
  async (
    input: z.infer<typeof MultiAgentResearchContinuationInputSchema>,
    {
      context,
      sendChunk,
    }: { context: any; sendChunk: (event: ResearchFlowStreamEvent) => void },
  ) => {
    context.logger.info(
      `[MARF] Invoked. Session: ${input.sessionId || "(new)"}. Query: '${input.userQuery || "N/A"}'. Clarification: '${input.userResponseToClarification || "N/A"}'`,
    );
    const result = await processResearchTurnInternal(input, sendChunk, context);
    context.logger.info(
      `[MARF] Turn completed for session ${result.sessionId}. Next action: ${result.nextAction}`,
    );
    return result;
  },
);
