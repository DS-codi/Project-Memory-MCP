# Cartographer Supervisor Report

- Generated at (UTC): 2026-03-23T19:39:27.966Z
- Workspace ID: project-memory-mcp-40f6678f5a9b
- Workspace Path: c:\Users\User\Project_Memory_MCP\Project-Memory-MCP
- Action: summary
- Caller Surface: supervisor

## Request Parameters
```json
{
  "action": "summary",
  "workspace_id": "project-memory-mcp-40f6678f5a9b",
  "agent_type": "Coordinator",
  "caller_surface": "supervisor",
  "write_documentation": true
}
```

## Execution Summary
```json
{
  "status": "ok",
  "elapsed_ms": 18277,
  "warning_count": 0,
  "error_count": 0,
  "marker_count": 1,
  "skipped_path_count": 0,
  "summary_stats": {
    "file_count": 1406,
    "module_count": 1102,
    "symbol_count": 44385,
    "dependency_edge_count": 1694,
    "entry_point_count": 546,
    "architecture_layers": [],
    "has_cycles": true,
    "language_count": 6,
    "language_breakdown": [
      {
        "language": "javascript",
        "file_count": 412
      },
      {
        "language": "python",
        "file_count": 23
      },
      {
        "language": "rust",
        "file_count": 145
      },
      {
        "language": "shell",
        "file_count": 91
      },
      {
        "language": "sql",
        "file_count": 12
      },
      {
        "language": "typescript",
        "file_count": 723
      }
    ]
  }
}
```

## Diagnostics
```json
{
  "warnings": [],
  "errors": [],
  "markers": [
    "summary_minimal_slice"
  ],
  "skipped_paths": []
}
```

## Raw Cartographer Result
```json
{
  "query": "summary",
  "engine": "code_cartography",
  "runtime_slice": "minimal_summary_v1",
  "workspace": {
    "path": "c:\\Users\\User\\Project_Memory_MCP\\Project-Memory-MCP",
    "scope": {},
    "languages": []
  },
  "summary": {
    "file_count": 1406,
    "module_count": 1102,
    "symbol_count": 44385,
    "dependency_edge_count": 1694,
    "entry_point_count": 546,
    "architecture_layers": [],
    "has_cycles": true,
    "language_count": 6,
    "language_breakdown": [
      {
        "language": "javascript",
        "file_count": 412
      },
      {
        "language": "python",
        "file_count": 23
      },
      {
        "language": "rust",
        "file_count": 145
      },
      {
        "language": "shell",
        "file_count": 91
      },
      {
        "language": "sql",
        "file_count": 12
      },
      {
        "language": "typescript",
        "file_count": 723
      }
    ]
  },
  "budget": {
    "timeout_ms": 60000
  },
  "files": [],
  "symbols": [],
  "references": [],
  "architecture_edges": [],
  "datasources": [],
  "tables": [],
  "columns": [],
  "constraints": [],
  "relations": [],
  "query_touchpoints": []
}
```
