# Multi-Agent Research System - Agent Logic

This directory (`src/ai/research-agents/`) contains the TypeScript implementation for the multi-agent research and reporting system. It orchestrates the interactions between various AI agents (defined as DotPrompt files in `../prompts/`) to fulfill complex research queries.

## Core Components

### 1. `research.types.ts`

This file defines the core data structures and TypeScript types used throughout the multi-agent research flow. Key definitions include:

*   **`MultiAgentResearchState`**: An interface representing the complete state of an ongoing research task. This includes the original query, current research topic, full conversation history (including user inputs, agent messages, tool requests, and tool responses), accumulated findings, status messages, and the final report. This state is designed to be persisted using Genkit sessions.
*   **`ResearchFlowStreamEvent`**: A discriminated union type defining the various events that can be streamed back to the client/UI during the research process. This allows for real-time updates on status, clarification questions, interim findings, and the final report.
*   **`MultiAgentResearchContinuationInputSchema` / `MultiAgentResearchContinuationInput`**: Zod schema and type for the input to each turn of the research flow. It includes the user's query (for new sessions) or responses to clarifications, an optional `sessionId` to resume existing tasks, and other configuration parameters.
*   **`MultiAgentResearchTurnOutputSchema` / `MultiAgentResearchTurnOutput`**: Zod schema and type for the output of each turn processing. It indicates the `sessionId`, the `nextAction` required (e.g., awaiting user input, continuing processing, report ready), and any direct `outputForUI` like a question or status.

### 2. `research.flow.ts` (Conceptual: `processResearchTurn` function)

This file contains the primary orchestration logic, currently conceptualized around a `processResearchTurn` function. This function is responsible for:

*   **Session Management**:
    *   Loading an existing research session using `aiInstance.loadSession<MultiAgentResearchState>(sessionId)` if a `sessionId` is provided.
    *   Creating a new session using `aiInstance.createSession<MultiAgentResearchState>()` for new research tasks.
    *   Persisting the `MultiAgentResearchState` at the end of each turn or before awaiting user input, using `session.updateState(currentState)`.
*   **Orchestration Loop (Turn-Based)**:
    *   It manages an iterative process, invoking the `orchestrator_agent.prompt` using Genkit's `generateStream()` API for interactive, streaming responses.
    *   It constructs the input and message history for the `orchestrator_agent` based on the current session state.
*   **Tool Invocation (Agent Delegation)**:
    *   It processes `toolRequest` chunks from the `orchestrator_agent`'s stream. These requests signify a delegation to a specialist agent (e.g., `research_specialist_agent`, `clarification_agent`).
    *   It then loads the corresponding specialist agent's DotPrompt file (e.g., `await aiInstance.prompt(toolRequest.name)`).
    *   It executes the specialist agent (conceptually using `generate()` or `generateStream()`), providing the necessary input. Specialist agents may themselves use data-gathering tools (like Tavily, Perplexity), which are declared in their respective `.prompt` files and handled by Genkit.
    *   The output from the specialist agent is formatted as a `toolResponse` and added to the conversation history.
*   **Interactive Clarification Workflow**:
    *   If the `orchestrator_agent` (after consulting the `clarification_agent`) produces a question for the user, `processResearchTurn` identifies this.
    *   It streams the question to the client via a `streamingCallback`.
    *   It then returns an output indicating that the flow is `awaiting_user_clarification`, effectively pausing the server-side process for that session until the user responds.
*   **Streaming to Client**: It uses a `streamingCallback` function (expected to be provided by the calling API route) to send `ResearchFlowStreamEvent` updates to the client, enabling real-time feedback on the research progress, clarifying questions, and the final report.
*   **State Progression**: Manages the evolution of `MultiAgentResearchState` across multiple turns and agent interactions.

**Note**: The `research.flow.ts` currently contains a detailed conceptual sketch. Its full implementation requires careful integration with Genkit's specific behaviors for `generateStream`, tool execution (especially for prompts-as-tools), and session lifecycle management. A Genkit flow (`defineFlow`) would typically wrap or utilize the `processResearchTurn` logic to make it an addressable flow within the Genkit ecosystem.

### 3. `index.ts`

This file serves as a convenient entry point for the `research-agents` module, re-exporting key elements like the main orchestration flow function/definition (e.g., `processResearchTurn` or a wrapped `multiAgentResearchFlow`) and primary types from `research.types.ts`. This simplifies imports for other parts of the application, such as the API route that will invoke this agent system.

## Overall Design

The system is designed to be:
-   **Modular**: Agents are defined declaratively in `../prompts/`.
-   **Stateful & Resumable**: Leverages Genkit session persistence to handle multi-turn interactions and pauses for user input.
-   **Streaming**: Uses `generateStream` for interactive communication with the UI.
-   **Orchestrated**: A central logic (`processResearchTurn`) manages the sequence of agent invocations and data flow.