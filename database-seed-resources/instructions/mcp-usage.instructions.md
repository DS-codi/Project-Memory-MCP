---
applyTo: "**/*"
---

# Project Memory MCP Usage Guidelines (v2.0)

This workspace uses the **Project Memory MCP** for tracking work across agent sessions.

## Consolidated Tools (v2.0)

| Tool | Actions |
|------|--------|
| `memory_workspace` | `register`, `info`, `list`, `reindex`, `merge`, `scan_ghosts`, `migrate` |
| `memory_plan` | `list`, `get`, `create`, `update`, `archive`, `import`, `find`, `add_note`, `delete`, `consolidate`, `set_goals`, `add_build_script`, `list_build_scripts`, `run_build_script`, `delete_build_script`, `create_from_template`, `list_templates`, `confirm`, `create_program`, `add_plan_to_program`, `upgrade_to_program`, `list_program_plans`, `pause_plan`, `resume_plan`, `search` |
| `memory_steps` | `add`, `update`, `batch_update`, `insert`, `delete`, `reorder`, `move`, `sort`, `set_order`, `replace` |
| `memory_session` | `prep`, `deploy_and_prep`, `list_sessions`, `get_session` |
| `memory_agent` | `init`, `complete`, `handoff`, `validate`, `list`, `get_instructions`, `deploy`, `get_briefing`, `get_lineage`; skill: `list_skills`, `get_skill`, `assign_skill`, `unassign_skill`, `list_workspace_skills`, `create_skill`, `delete_skill`; instruction: `list_instructions`, `get_instruction`, `assign_instruction`, `unassign_instruction`, `list_workspace_instructions`, `create_instruction`, `delete_instruction` |
| `memory_context` | `get`, `store`, `store_initial`, `list`, `append_research`, `list_research`, `generate_instructions`, `workspace_get`, `workspace_set`, `workspace_update`, `workspace_delete`, `knowledge_store`, `knowledge_get`, `knowledge_list`, `knowledge_delete`, `search`, `pull`, `write_prompt`, `dump_context`, `batch_store` |
| `memory_terminal` | `run`, `read_output`, `kill`, `get_allowlist`, `update_allowlist` |
| `memory_filesystem` | `read`, `write`, `search`, `list`, `tree`, `delete`, `move`, `copy`, `append`, `exists` |
| `memory_instructions` | `search` (keyword → excerpts, not full content), `get` (full content by filename), `get_section` (single `##`/`###` by partial heading), `list` (metadata only), `list_workspace` (workspace-assigned, metadata only) |
| `memory_terminal_interactive` | `execute`, `read_output`, `terminate`, `list` |
| `memory_terminal_vscode` | `create`, `send`, `close`, `list` *(extension-side visible VS Code terminals)* |
| `memory_cartographer` | `summary`, `search`, `file_context`, `get_plan_dependencies`, `bounded_traversal`, `db_map_summary`, `db_node_lookup`, `db_edge_lookup`, `context_items_projection` — **codebase cartography and plan dependency graph**; fetch `mcp-tool-cartographer.instructions.md` for full API |

## Required Initialization

Before doing any work, agents MUST:

1. **`memory_agent` (action: `init`)** — pass your agent type, `workspace_id`, `plan_id`
2. **`memory_agent` (action: `validate`)** — confirm you are the correct agent for the current step
3. **Set up your todo list** from the validation response

## Workspace Identity

- **Always obtain `workspace_id` from the `memory_workspace(action: register)` response** — never compute it yourself.
- If you receive a `workspace_id` from a handoff, validate it with `memory_workspace(action: info)` before use.
- Workspace IDs follow the format `{foldername}-{12-hex-sha256}`. Do not construct IDs by hand.
- If a tool returns "workspace not registered", call `memory_workspace(action: register, workspace_path: "...")` first.

## Hub-and-Spoke Model

- **Hub** is the orchestrator — it spawns all spoke agents via `runSubagent`
- **Spokes** complete assigned tasks and return to Hub via `memory_agent(action: handoff, to_agent: "Coordinator")`
- Always call `memory_agent(action: complete)` after handoff
- Spokes MUST NOT call `runSubagent` — use `memory_agent(action: handoff)` to recommend the next agent

## On-Demand Reference Docs

Detailed tool patterns, workflow examples, and best practices are in the DB — pull them as needed:

```
memory_instructions(action: list)                              # see what's available
memory_instructions(action: get, filename: "mcp-tool-agent.instructions.md")
memory_instructions(action: get, filename: "mcp-tool-plan.instructions.md")
memory_instructions(action: get, filename: "mcp-best-practices.instructions.md")
memory_instructions(action: search, query: "terminal authorization")
memory_instructions(action: get, filename: "mcp-tool-cartographer.instructions.md")  # codebase scan, symbol search, plan deps
```