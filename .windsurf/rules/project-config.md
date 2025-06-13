---
trigger: always_on
---

---

description:
globs:
alwaysApply: true
---

# project_config_updated.md – Static Long-Term Rules (v2)

This file is **read-only at runtime**.  The Cursor agent MUST NOT edit it.  
It establishes the fixed parameters and conventions that every KuzuMem-MCP tool call must respect.

---

## 1  Repository Identity  

All MCP calls **MUST** include these exact base fields and ensure `branch` reflects the current working branch (e.g. `feature/foo`).

```jsonc
{
  "clientProjectRoot": "/Users/jokkeruokolainen/Documents/Solita/GenAI/Azure/MCP/kuzumem-mcp",
  "repository": "kuzumem-mcp",
  "branch": "the_name_of_the_current_working_branch_you_have_to_check_this"          // ⇐ update when on feature branches
}
```

---

## 2  ID Naming Conventions

| Entity/Artifact | ID Format | Example |
|-----------------|-----------|---------|
| Component | `comp-<CamelName>` | `comp-MemoryService` |
| Decision  | `dec-YYYYMMDD-<slug>` | `dec-20250612-api-versioning` |
| Rule      | `rule-<category>-<slug>` | `rule-security-auth` |
| File      | `file-<path-slug>-v<revision>` | `file-src-db-kuzu-ts-v1` |
| Tag       | `tag-<category>` | `tag-performance` |
| Context Log | `ctx-YYYYMMDD-hhmm-<slug>` | `ctx-20250612-0930-session-summary` |
| Graph Projection | `graph-<algorithm>-<timestamp>` | `graph-pagerank-20250612T094500Z` |
| Relationship CSV | `rel-<from>-<to>-v<revision>` | `rel-AuthService-PaymentService-v1` |

---

## 2a  Memory & Entity Type Reference

| Type | Purpose | Governing MCP Tool |
|------|---------|--------------------|
| Component | System module / service / code unit | `mcp_KuzuMem-MCP_entity` (`entityType: component`) |
| Decision | Architectural or technical decision with rationale | `mcp_KuzuMem-MCP_entity` (`decision`) |
| Rule | Coding standard / architectural constraint | `mcp_KuzuMem-MCP_entity` (`rule`) |
| File | Source file metadata & metrics | `mcp_KuzuMem-MCP_entity` (`file`) |
| Tag | Categorical label for filtering / analysis | `mcp_KuzuMem-MCP_entity` (`tag`) |
| Context | Session log for work progress | `mcp_KuzuMem-MCP_context` |
| Metadata | Repository-level metadata (tech stack etc.) | `mcp_KuzuMem-MCP_memory-bank` (`operation: update-metadata`) |

---

## 3  Tech Stack Baseline

• Node 20 + TypeScript  
• Genkit TypeScript SDK
• .Prompt files for prompts
• NextJS 15+
• TailwindCSS
• ShadCN UI
• Jest + ts-jest
• pnpm workspaces

---

## 4  Engineering Principles

1. Clean Architecture – controllers → services → repositories → db; **no upward imports**.  
2. Dependency inversion on repository boundaries.  
3. All graph mutations behind a **transactional service layer**.  
4. Tests first: each new Component requires unit & integration coverage.

---

## 5  Governance Rules (enforced through MCP)

1. Every new `Component` **must** list `dependsOn`.  
2. Components are **never** deleted; mark `status: deprecated`.  
3. Every `Decision` must carry at least one impact `Tag` (`security`, `performance`, `architecture`).  
4. Every `analyze` / `detect` run **must** persist its results as a `graph-*` entity **and** link (via `file-component` association) to all affected Components.

---

## 6  Mandatory Tooling Cheat-sheet

The JSON snippets below are canonical; copy-paste and fill the blanks.

### 6.1  Initialise / Switch Branch

```jsonc
{
  "tool": {
    "name": "mcp_KuzuMem-MCP_memory-bank",
    "arguments": {
      "operation": "init",
      "clientProjectRoot": "<root>",
      "repository": "kuzumem-mcp",
      "branch": "feature/foo"
    }
  }
}
```

### 6.2  Create New Component

```jsonc
{
  "tool": {
    "name": "mcp_KuzuMem-MCP_entity",
    "arguments": {
      "operation": "create",
      "entityType": "component",
      "id": "comp-Example",
      "name": "Example Component",
      "kind": "service",
      "status": "active",
      "dependsOn": ["comp-Other"]
    }
  }
}
```

### 6.3  Update Session Context

```jsonc
{
  "tool": {
    "name": "mcp_KuzuMem-MCP_context",
    "arguments": {
      "operation": "update",
      "agent": "assistant",
      "summary": "<one-line summary of work>",
      "observation": "<optional details>",
      "repository": "kuzumem-mcp"
    }
  }
}
```

### 6.4  Graph Analysis

```jsonc
{
  "tool": {
    "name": "mcp_KuzuMem-MCP_analyze",
    "arguments": {
      "algorithm": "pagerank",  // or "k-core", "louvain"
      "clientProjectRoot": "<root>",
      "repository": "kuzumem-mcp",
      "graphName": "graph-pagerank-<timestamp>",
      "nodeTypes": ["Component"],
      "relationshipTypes": ["DEPENDS_ON"]
    }
  }
}
```

### 6.5  Pattern Detection

```jsonc
{
  "tool": {
    "name": "mcp_KuzuMem-MCP_detect",
    "arguments": {
      "type": "cycles",   // or "islands", "path", "strongly-connected", "weakly-connected"
      "repository": "kuzumem-mcp",
      "projectedGraphName": "graph-pagerank-<timestamp>",
      "nodeTableNames": ["Component"],
      "relationshipTableNames": ["DEPENDS_ON"]
    }
  }
}
```

### 6.6  Advanced Queries / Traversal

```jsonc
{
  "tool": {
    "name": "mcp_KuzuMem-MCP_query",
    "arguments": {
      "type": "relationships",
      "repository": "kuzumem-mcp",
      "startItemId": "comp-AuthService",
      "depth": 2,
      "relationshipFilter": "DEPENDS_ON"
    }
  }
}
```

### 6.7  Bulk Import

```jsonc
{
  "tool": {
    "name": "mcp_KuzuMem-MCP_bulk-import",
    "arguments": {
      "type": "components",     // or "rules"
      "repository": "kuzumem-mcp",
      "overwrite": false
    }
  }
}
```

---

## 7  Change Control

• This file is authoritative; updates **require** an approved `Decision` (`status: approved`) before merge.  
• The Cursor agent may propose diff patches but **MUST NOT** commit without human review.
