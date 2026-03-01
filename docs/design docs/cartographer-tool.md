# Design Document: CodeCartographer

**Version:** 1.3

**Status:** Proposed

**Author:** \[User/Gemini\]

**Target:** Dependency-free Python Script (Standard Library only) + MCP Server

## 1. Executive Summary

**CodeCartographer** is a lightweight, dependency-free static analysis tool designed to index a software project. Unlike traditional linters that look for errors, CodeCartographer looks for *structure*, *intent*, and *flow*.

It systematically iterates through a project directory to create a "Knowledge Graph" of:

1. **Files & Directories** (Physical structure)
2. **Symbols** (Functions, Classes, Variables)
3. **Architectural Context** (Inferred from folder organization)
4. **Dependency Flow** (Calculated bottom-up from base dependencies to entry points)
5. **MCP Integration** (Exposes the knowledge graph directly to LLMs via the Model Context Protocol)

**The Output:** Instead of a monolithic database, the tool generates a `.cartographer/` directory at the root of the targeted project containing highly structured, categorized JSON files grouped by purpose and use-case, which can then be served dynamically to AI assistants.

## 2. Core Philosophy

1. **Context Over Syntax:** A file named `user_controller.py` in an `/api` folder tells us more about the architecture than the syntax inside it.
2. **Flow Over Static Lists:** Understanding that *File A* is a "Base Dependency" (Tier 0) and *File Z* is an "Entry Point" (Tier 10) is more valuable than just listing them alphabetically.
3. **JSON as the Medium:** Outputting to categorized JSON files makes the data human-readable, easily diffable in version control, and instantly usable by other scripts, IDEs, or CLI tools like `jq`.
4. **AI-Native (MCP):** By wrapping the tool in a Model Context Protocol server, it allows AI assistants to dynamically query the architecture, read specific file contexts, and trace dependencies seamlessly.
5. **Zero-Dependency Core:** The core indexing engine must run on any machine with Python 3.8+ installed, requiring no external packages. (The MCP server wrapper may use the standard `mcp` SDK).

## 3. System Architecture

The application functions as a linear ETL (Extract, Transform, Load) pipeline with a final Graph Resolution step, topped with an MCP Server:

```
[ File System ] 
      │
      ▼
[ 1. Scanner ] ───> (Filters: .gitignore, binary files)
      │
      ▼
[ 2. Parser ] ────> (Engine: Python `ast` + Regex)
      │             (Extracts: Funcs, Classes, Imports)
      ▼
[ 3. Context ] ───> (Applies Heuristics: Path -> Role)
      │             (Infers: Layer, Component Type)
      ▼
[ 4. Graph Resolver ] ──> (Topological Sort & Reverse Walk)
      │                   (Calculates: Depth, Entry Points)
      ▼
[ 5. Exporter ] ──> [ .cartographer/ JSON Directory ]
      │
      ▼
[ 6. MCP Server ] ─> (Exposes resources & tools to AI via stdio)
```

### 3.1 The Modules

* **Scanner:** Recursively walks directories. Handles exclusion logic.
* **Parser:** Extracts symbols and raw `import` statements.
* **Context Engine:** Matches file paths against a "Rules Dictionary" to assign architectural tags.
* **Graph Resolver:** Builds a dependency graph in memory. Identifies "Leaf Nodes" (no dependencies) and walks backwards to find "Entry Points" (roots).
* **Exporter:** Creates the directory structure and serializes the enriched in-memory graph into categorized JSON files.
* **MCP Server:** A lightweight standard I/O server that implements the Model Context Protocol, exposing the generated JSON files as queryable tools and resources.

## 4. Data Model (The JSON Output Structure)

The exporter will generate a `.cartographer/` directory inside the targeted project. The structure is designed for quick contextual lookups.

### Directory Layout

```text
.cartographer/
├── summary.json             # High-level stats, tier counts, project health
├── flow/
│   ├── entry_points.json    # Array of Tier-N files (Top level)
│   ├── base_utils.json      # Array of Tier-0 files (No dependencies)
│   └── dependencies.json    # Full Map: { "fileA": ["fileB", "fileC"] }
├── architecture/
│   ├── interface.json       # Controllers, Endpoints, Views
│   ├── business.json        # Services, Managers
│   └── data.json            # Models, Repositories, DB configs
└── files/
    ├── src_auth_login.json  # Detailed breakdown per file
    └── ...                  # (Name sanitized: slashes replaced by underscores)
```

### Example: `files/src_auth_login.json`
Provides an exhaustive breakdown of a single file, perfect for an LLM or human to read before modifying it.

```json
{
  "file_path": "src/auth/login.py",
  "arch_layer": "Interface",
  "arch_role": "Controller",
  "dependency_tier": 3,
  "is_entry_point": false,
  "dependencies": ["src/services/auth_service.py", "src/models/user.py"],
  "symbols": [
    {
      "name": "login_handler",
      "type": "FUNCTION",
      "inputs": ["request", "db_session"],
      "outputs": ["Response"],
      "mutates_state": false
    }
  ]
}
```

### Example: `architecture/interface.json`
Groups all files belonging to a specific architectural layer.

```json
{
  "layer": "Interface",
  "roles_found": ["Controller", "Endpoint"],
  "files": [
    {
      "path": "src/auth/login.py",
      "tier": 3,
      "role": "Controller"
    },
    {
      "path": "src/api/routes.py",
      "tier": 4,
      "role": "Endpoint"
    }
  ]
}
```

## 5. The Heuristic Engine (Architectural Mapping)

Since code doesn't explicitly state its architecture, we define **Rules** that map **Patterns** to **Roles**.

### Default Ruleset (Configurable)

| Path Pattern (Regex) | Architectural Layer | Role | 
 | ----- | ----- | ----- | 
| `.*/controllers?/.*` | `Interface` | `Controller` | 
| `.*/routes?/.*` | `Interface` | `Endpoint` | 
| `.*/models?/.*` | `Data Persistence` | `Model` | 
| `.*/services?/.*` | `Business Logic` | `Service` | 
| `.*/utils?/.*` | `Cross-Cutting` | `Utility` | 
| `.*/tests?/.*` | `Quality Assurance` | `Test` | 

## 6. Implementation Strategy (Python)

### 6.1 State Detection (The `ast` Approach)
We detect state by looking for assignments to `self` in `__init__`.

### 6.2 Data Categorization
We categorize function arguments as `INPUT` and return statements as `OUTPUT`.

### 6.3 JSON Export Logic
Using Python's standard `os` and `json` libraries:
1. Ensure `.cartographer/` directory exists (`os.makedirs`).
2. Construct dictionaries in memory grouped by the targeted output files.
3. Write using `json.dump(data, file, indent=2)` to ensure it is highly readable and git-friendly.

### 6.4 Bottom-Up Flow Analysis (The "Reverse Walk")
This is the logic used to determine `dependency_tier` and `is_entry_point`.

**The Algorithm:**
1. **Build Adjacency Matrix:** Create a map of `File -> [Imported Files]`.
2. **Identify Leaf Nodes (Tier 0):** Find all files that import *nothing* (or only external libs like `os`, `json`).
   * *Example:* `utils/string_helper.py`, `models/user_model.py`.
3. **Reverse Walk (Iterative):**
   * Mark Tier 0 files.
   * Find all files that *only* depend on Tier 0 files. Mark them Tier 1.
   * Find all files that depend on Tier 1 (and below). Mark them Tier 2.
   * Repeat until all files are marked.
4. **Identify Entry Points:**
   * Any file with `if __name__ == "__main__":` is forced to **Top Tier**.
   * Any file that is **never imported** by another internal file is a potential **Entry Point**.

**Benefit:** This creates a "Gravity Map" of the application. Heavy logic sinks to the bottom (Tier 0), while orchestration logic floats to the top.

## 7. Model Context Protocol (MCP) Integration

To make CodeCartographer an AI-native tool, it will include an MCP server script (`cartographer_mcp.py`) that reads the generated `.cartographer/` JSON files and exposes them to LLMs via standard standard I/O.

### 7.1 MCP Resources
The server will expose the high-level JSON files as direct resources:
* `cartographer://summary`: The high-level project summary.
* `cartographer://architecture/{layer}`: Lists all files in a specific architectural layer (e.g., `interface`, `data`).
* `cartographer://flow/entry_points`: The calculated entry points of the application.

### 7.2 MCP Tools
The server will expose interactive tools for the AI to drill down into the project:
* `get_file_context(filepath: str)`: Returns the exhaustive breakdown of a specific file (functions, classes, inputs, outputs, states).
* `get_dependencies(filepath: str)`: Returns a list of files that the target file imports.
* `get_dependents(filepath: str)`: Returns a list of files that import the target file (useful for impact analysis before refactoring).

## 8. Example Usage & Data Traversal

Because the output is standard JSON, you can easily query the knowledge graph using terminal tools like `jq`, write a simple Python script to consume it, or query it naturally via an MCP-compatible AI assistant.

**Scenario:** "List all Entry Points (Top Tier files) in the project."

```bash
# Using jq in the terminal
cat .cartographer/flow/entry_points.json | jq '.[].file_path'
```

**Scenario:** "What is the detailed context of the user controller before I edit it?"

```bash
# Simply read the generated file card
cat .cartographer/files/src_controllers_user_controller.json
```
