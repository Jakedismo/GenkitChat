# Genkit DotPrompt Files

This directory stores `.prompt` files used by the Genkit AI framework within this application. These files define the behavior, inputs, outputs, and configurations for various AI prompts and agents, following the [DotPrompt conventions](https://firebase.google.com/docs/genkit/dotprompt).

## Overview

DotPrompt files allow for modular and version-controlled prompt management. They typically consist of:

- **YAML Frontmatter**: Defines metadata such as:
  - `name`: A unique identifier for the prompt, especially when used as a tool by other prompts/agents.
  - `description`: A human-readable explanation of the prompt's purpose, crucial for discoverability by orchestrating agents.
  - `model`: Specifies the AI model to be used (often using a template variable like `{{modelId}}` for dynamic assignment).
  - `tools`: An array of tool names (which can be other prompts/agents by their `name`, or actual data-gathering functions) that this prompt can utilize.
  - `input.schema`: Defines the expected input variables and their types (e.g., using Zod-like syntax or Picoschema).
  - `output.schema`: (Optional) Defines the expected structure of the output if the prompt is designed to produce structured data.
- **Handlebars Template Body**: The actual prompt text, which can include:
  - `{{role "system"}}`, `{{role "user"}}`, `{{role "model"}}` to define multi-turn message structures.
  - Placeholders (e.g., `{{variableName}}`) for dynamic input.
  - Inclusion of partials (e.g., `{{>partialName arg=value}}`).

## Partials

Partials are reusable snippets of prompt templates, prefixed with an underscore (`_`).

- **`_assistant_intro.prompt`**:
  - Purpose: Provides a standard introductory phrase for an assistant-type agent.
  - Usage: `{{>_assistant_intro description="your agent's role description"}}`
  - Example: "You are a helpful assistant."

- **`_source_listing.prompt`**:
  - Purpose: Formats a list of sources or references.
  - Usage: `{{>_source_listing sources=array_of_source_strings}}`
  - Example: "Sources to Cite:\n- Source 1\n- Source 2"

- **`_tool_directive.prompt`**:
  - Purpose: Provides a flexible way to list tools, either as available options or as a directive to use specific tools.
  - Usage: `{{>_tool_directive directivePrefix="Instruction about tools:" tools=array_of_tool_names}}`
  - Example: "You must use the following tools:\n- tool_A\n- tool_B"

## Core Application Prompts

### Basic Chat Prompts

These prompts define system messages for different "creativity" presets in the direct chat modes.

- **`basic_chat_creative.prompt`**: System prompt for the "Creative" preset.
- **`basic_chat_normal.prompt`**: System prompt for the "Normal" preset.
- **`basic_chat_precise.prompt`**: System prompt for the "Precise" preset.

### RAG (Retrieval Augmented Generation) Prompt

- **`rag_assistant.prompt`**:
  - Purpose: Defines the system and user prompt structure for answering queries based on retrieved documents in the RAG chat mode.
  - Key Inputs: `query`, `modelId`.
  - Utilizes: `_assistant_intro.prompt`.

## Multi-Agent System Prompts

These prompts define the individual agents for the multi-agent research and reporting system. They are designed to be orchestrated, with some agents acting as "tools" for others.

- **`orchestrator_agent.prompt`**:
  - `name: orchestrator_agent`
  - Description: Main orchestrating agent. Interprets user queries, delegates to specialist agents, and compiles the final report.
  - Tools (Specialist Agents it uses): `research_specialist_agent`, `clarification_agent`, `report_writer_agent`, `citation_checker_agent`, `fact_verifier_agent`, `summarization_agent`.
  - Key Inputs: `userQuery`, `researchTopic`, `availableDataTools`, `modelId`.
  - Utilizes: `_assistant_intro.prompt`, `_tool_directive.prompt`.

- **`research_specialist_agent.prompt`**:
  - `name: research_specialist_agent`
  - Description: Specialist agent for conducting in-depth research using available data gathering tools.
  - Tools (Data-gathering): `tavilyExtract`, `perplexityDeepResearch`.
  - Key Inputs: `researchTask`, `researchTopic`, `toolsToUse`, `modelId`.
  - Utilizes: `_assistant_intro.prompt`, `_tool_directive.prompt`.

- **`clarification_agent.prompt`**:
  - `name: clarification_agent`
  - Description: Specialist agent that analyzes user queries for ambiguity and crafts clarifying questions.
  - Tools: None (primarily formulates questions).
  - Key Inputs: `userQuery`, `currentContext`, `modelId`.
  - Utilizes: `_assistant_intro.prompt`.

- **`report_writer_agent.prompt`**:
  - `name: report_writer_agent`
  - Description: Specialist agent that synthesizes research findings and sources into a structured Markdown report.
  - Tools: None.
  - Key Inputs: `researchTopic`, `researchFindings`, `sources`, `modelId`.
  - Utilizes: `_assistant_intro.prompt`, `_source_listing.prompt`.

- **`citation_checker_agent.prompt`**:
  - `name: citation_checker_agent`
  - Description: Specialist agent to verify if a cited source supports claims in a text segment.
  - Tools: None (assumes intrinsic ability to access/evaluate source content or content is provided).
  - Key Inputs: `textSegment`, `citedSourceURL`, `modelId`.
  - Utilizes: `_assistant_intro.prompt`.

- **`fact_verifier_agent.prompt`**:
  - `name: fact_verifier_agent`
  - Description: Specialist agent for verifying the factual accuracy of statements.
  - Tools (Data-gathering): `tavilySearch`, `perplexitySearch`.
  - Key Inputs: `statement`, `modelId`.
  - Utilizes: `_assistant_intro.prompt`.

- **`summarization_agent.prompt`**:
  - `name: summarization_agent`
  - Description: Specialist agent for condensing text into a summary of a specified length/format.
  - Tools: None.
  - Key Inputs: `textToSummarize`, `summaryLengthRequirement`, `modelId`.
  - Utilizes: `_assistant_intro.prompt`.

## Usage in Code

These `.prompt` files are loaded and executed by Genkit flows (e.g., in `src/lib/genkit-instance.ts` for basic/RAG chat, and planned for `src/ai/research-agents/` for the multi-agent system). The `aiInstance.prompt('prompt_name_without_extension')` method is used to load them. The `promptDir` option in the Genkit configuration (`src/lib/genkit-instance.ts`) is set to this directory.
