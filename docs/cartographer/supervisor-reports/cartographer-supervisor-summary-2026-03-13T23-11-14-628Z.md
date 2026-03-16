# Cartographer Supervisor Report

- Generated at (UTC): 2026-03-13T23:11:14.629Z
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
  "elapsed_ms": 35260,
  "warning_count": 0,
  "error_count": 0,
  "marker_count": 1,
  "skipped_path_count": 0,
  "summary_stats": {
    "file_count": 1251,
    "module_count": 987,
    "symbol_count": 32866,
    "dependency_edge_count": 1514,
    "entry_point_count": 507,
    "architecture_layers": [],
    "has_cycles": true,
    "language_count": 6,
    "language_breakdown": [
      {
        "language": "javascript",
        "file_count": 357
      },
      {
        "language": "python",
        "file_count": 22
      },
      {
        "language": "rust",
        "file_count": 124
      },
      {
        "language": "shell",
        "file_count": 68
      },
      {
        "language": "sql",
        "file_count": 10
      },
      {
        "language": "typescript",
        "file_count": 670
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
    "file_count": 1251,
    "module_count": 987,
    "symbol_count": 32866,
    "dependency_edge_count": 1514,
    "entry_point_count": 507,
    "architecture_layers": [],
    "has_cycles": true,
    "language_count": 6,
    "language_breakdown": [
      {
        "language": "javascript",
        "file_count": 357
      },
      {
        "language": "python",
        "file_count": 22
      },
      {
        "language": "rust",
        "file_count": 124
      },
      {
        "language": "shell",
        "file_count": 68
      },
      {
        "language": "sql",
        "file_count": 10
      },
      {
        "language": "typescript",
        "file_count": 670
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
