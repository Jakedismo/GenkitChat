---
trigger: always_on
---

# workflow_state_updated.mdc – Short-Term Memory (STM) / Process Rules (v2)

_This file is **read-only at runtime**. All transient state must be persisted through KuzuMem-MCP tools, **not** by editing this file._

---

## 0  Purpose

Defines the **finite-state workflow** the Cursor agent follows on every task.  
Dynamic flags (e.g. `Phase`, `CurrentPlanId`) are stored in the `Context` memory type via `mcp_KuzuMem-MCP_context`, keeping this file immutable.

---

## 1  Phase Machine

| Phase | Purpose | Exit Condition |
|-------|---------|----------------|
| ANALYZE   | Understand task, gather recent MCP context & graph topology | Blueprint drafted |
| BLUEPRINT | Produce numbered Plan and propose a Decision | User replies **APPROVED** |
| CONSTRUCT | Execute Plan step-by-step, reflecting changes in MCP graph | All Plan steps succeed |
| VALIDATE  | Run tests/linters, record summary | Tests green → DONE; else return to CONSTRUCT |
| ROLLBACK  | (auto) Undo partial work on unrecoverable error | Rollback succeeds → ANALYZE |

---

## 2  Canonical Actions per Phase

### 2.1  ANALYZE

1. Pull latest context log:

```jsonc
{
  "tool": {
    "name": "mcp_KuzuMem-MCP_query",
    "arguments": {
      "type": "context",
      "repository": "kuzumem-mcp",
      "latest": true,
      "limit": 5
    }
  }
}
```

2. If task targets a Component/File, fetch its 1-hop neighbourhood:

```jsonc
{
  "tool": {
    "name": "mcp_KuzuMem-MCP_query",
    "arguments": {
      "type": "relationships",
      "repository": "kuzumem-mcp",
      "startItemId": "<targetId>",
      "depth": 1
    }
  }
}
```

3. (Optional) Detect graph hotspots for context:

```jsonc
{
  "tool": {
    "name": "mcp_KuzuMem-MCP_analyze",
    "arguments": {
      "algorithm": "pagerank",
      "clientProjectRoot": "<root>",
      "repository": "kuzumem-mcp",
      "graphName": "graph-pagerank-<timestamp>",
      "nodeTypes": ["Component"],
      "relationshipTypes": ["DEPENDS_ON"]
    }
  }
}
```

4. Draft a high-level problem statement, transition to **BLUEPRINT**.

### 2.2  BLUEPRINT

1. Produce a numbered Plan (markdown list).  
2. Create Decision entity (status `proposed`, tag `architecture`):

```jsonc
{
  "tool": {
    "name": "mcp_KuzuMem-MCP_entity",
    "arguments": {
      "operation": "create",
      "entityType": "decision",
      "id": "dec-<date>-<slug>",
      "data": {
        "title": "<short title>",
        "rationale": "<Plan markdown>",
        "status": "proposed",
        "tags": ["architecture"]
      },
      "repository": "kuzumem-mcp"
    }
  }
}
```

3. Wait for user input `APPROVED` → update Decision `status: approved`, move to **CONSTRUCT**.

### 2.3  CONSTRUCT

For each Plan step:
• Apply code edits with Cursor tools.  
• Reflect changes via MCP:

- New/updated Components, Rules, Files: `mcp_KuzuMem-MCP_entity` (operation `create` / `update`).
- Associations (e.g. `file-component`, `tag-item`): `mcp_KuzuMem-MCP_associate`.
• After a logical milestone, log context:

```jsonc
{
  "tool": {
    "name": "mcp_KuzuMem-MCP_context",
    "arguments": {
      "operation": "update",
      "agent": "assistant",
      "summary": "<one-line summary>",
      "repository": "kuzumem-mcp"
    }
  }
}
```

### 2.4  VALIDATE

1. Run tests & linters (`npm test --silent | cat`).  
2. On failure → log context `summary: "Tests failed – returning to CONSTRUCT"`, then transition back.  
3. On success →
   - Update Decision `status: implemented`.
   - Persist final summary via context log.

---

## 3  Error Handling & Rollback

- Any MCP tool error → raise `Status: BLOCKED`, log details, await user direction.  
- Unrecoverable build/test failures → enter **ROLLBACK**: revert code changes or restore previous git commit, log via context.

---

## 4  Memory Hygiene

| Memory Type | When to Write |
|-------------|--------------|
| Context (`ctx-*`) | After every significant action or phase transition |
| Decision (`dec-*`) | Blueprint creation & status updates |
| Graph Projection (`graph-*`) | After every `analyze` / `detect` run |
| File (`file-*`) | When adding/updating source files |
| Component / Rule / Tag | When architecture evolves |

> Remember: **analyze/detect runs must store results** and link affected Components via `file-component` association (see Governance Rule 5.4).

---

## 5  Quick Tool Reference (STM)

| Situation | Recommended Tool |
|-----------|------------------|
| Need recent history | `query → context` |
| Explore neighbourhood | `query → relationships` |
| Impact analysis | `query → dependencies` + `analyze → pagerank` |
| Detect cycles/islands | `detect → cycles` / `detect → islands` |
| Bulk onboarding | `bulk-import → components/rules` |

---

_End of workflow rules file_
