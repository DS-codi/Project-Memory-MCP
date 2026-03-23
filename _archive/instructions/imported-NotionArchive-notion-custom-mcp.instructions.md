# NotionCustomMCP - Agent Instructions

This document provides comprehensive guidance for AI agents on how to use the NotionCustomMCP (Model Context Protocol) server effectively.

---

## Overview

The `mssql-readonly` MCP server provides **read-only** access to:

1. **MSSQL Databases**:
   - StonePro: Business/ERP database with customer, job, and order data
   - NotionArchive: Archived Notion data including jobs, pieces, and archives

2. **Notion API** (read-only operations):
   - Query Notion databases, pages, and blocks
   - Search across the workspace
   - List users and databases

All operations are READ-ONLY. No modifications to data are allowed.

---

## Available Databases

| Database | Description | Key Data |
|----------|-------------|----------|
| `stonepro` | StonePro Business/ERP database | Customers, Jobs, Orders, Inventory, Production data |
| `notionarchive` | NotionArchive database | Archived Notion data: Jobs, Pieces, Archives, Slabs, Cutouts |

---

## Tool Reference

### 1. Database Discovery Tools

#### `list_databases`
Lists available databases that can be queried.

**Parameters:** None

**Use when:** You need to see which databases are available for querying.

**Example output:**
```json
{
  "databases": [
    {
      "name": "stonepro",
      "description": "StonePro Business/ERP database",
      "contains": "Customers, Jobs, Orders, Inventory, Production data"
    },
    {
      "name": "notionarchive",
      "description": "NotionArchive database",
      "contains": "Archived Notion data: Jobs, Pieces, Archives, Slabs, Cutouts"
    }
  ]
}
```

---

#### `list_tables`
List all tables in the specified database.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `database` | string | ✅ | `stonepro` or `notionarchive` |

**Use when:** You need to explore what tables exist in a database before querying.

**Example output:**
```json
{
  "database": "notionarchive",
  "table_count": 15,
  "view_count": 3,
  "tables": ["dbo.Jobs", "dbo.Pieces", "dbo.Archives"],
  "views": ["dbo.vw_ActiveJobs"]
}
```

---

#### `describe_table`
Get detailed information about a table's structure.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `database` | string | ✅ | `stonepro` or `notionarchive` |
| `table_name` | string | ✅ | Table name (e.g., `dbo.Jobs` or just `Jobs`) |

**Use when:** You need to understand column types, primary keys, and row counts before writing queries.

**Example output:**
```json
{
  "database": "notionarchive",
  "table": "dbo.Jobs",
  "row_count": 1523,
  "column_count": 12,
  "columns": [
    {"name": "JobId", "type": "int", "nullable": false},
    {"name": "JobName", "type": "nvarchar(255)", "nullable": true}
  ],
  "primary_keys": ["JobId"]
}
```

---

#### `search_tables`
Search for tables matching a name pattern.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `database` | string | ✅ | `stonepro` or `notionarchive` |
| `pattern` | string | ✅ | Search pattern (e.g., `Job` finds `Jobs`, `JobDetails`) |

**Use when:** You don't know the exact table name but know part of it.

---

### 2. Query Execution Tools

#### `execute_query`
Execute a read-only SELECT query against the database.

**Parameters:**
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `database` | string | ✅ | - | `stonepro` or `notionarchive` |
| `query` | string | ✅ | - | SQL SELECT query to execute |
| `max_rows` | integer | ❌ | 100 | Maximum rows to return (max 1000) |

**Use when:** You need to retrieve specific data from the database.

**Security notes:**
- ⚠️ Only SELECT queries are allowed
- INSERT, UPDATE, DELETE, DROP, CREATE, ALTER are **blocked**
- EXEC, stored procedures, and system commands are **blocked**
- Multiple statements (using `;`) are **blocked**

**Example:**
```sql
SELECT TOP 10 JobId, JobName, Status 
FROM dbo.Jobs 
WHERE Status = 'Active'
ORDER BY CreatedDate DESC
```

---

#### `get_sample_data`
Get sample rows from a table.

**Parameters:**
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `database` | string | ✅ | - | `stonepro` or `notionarchive` |
| `table_name` | string | ✅ | - | Table name |
| `limit` | integer | ❌ | 10 | Number of rows (max 100) |

**Use when:** You want to quickly see what data looks like in a table without writing a query.

---

#### `test_connections`
Test connections to both databases.

**Parameters:** None

**Use when:** You need to verify database connectivity before running queries.

---

### 3. Notion API Tools

#### `notion_search`
Search across all Notion pages and databases in the workspace.

**Parameters:**
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `query` | string | ❌ | `""` | Search query (empty returns recent items) |
| `filter_type` | string | ❌ | - | Filter by `page` or `database` |
| `page_size` | integer | ❌ | 20 | Results to return (max 100) |

**Use when:** You need to find pages or databases by name or content.

---

#### `notion_list_databases`
List all Notion databases accessible to the integration.

**Parameters:** None

**Use when:** You need to see what Notion databases are available for querying.

**Example output:**
```json
{
  "database_count": 5,
  "databases": [
    {
      "id": "abc123...",
      "title": "Jobs Database",
      "url": "https://notion.so/...",
      "property_count": 15,
      "property_names": ["Name", "Status", "Customer", "Due Date"]
    }
  ]
}
```

---

#### `notion_get_database_schema`
Get the schema (properties) of a Notion database.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `database_id` | string | ✅ | The Notion database ID |

**Use when:** You need to understand what properties a database has before querying it.

**Returns:** Property names, types, select/multi-select options, relation targets, formula expressions, etc.

---

#### `notion_query_database`
Query a Notion database with optional filtering and sorting.

**Parameters:**
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `database_id` | string | ✅ | - | The Notion database ID |
| `filter_json` | string | ❌ | - | JSON string of Notion filter object |
| `sorts_json` | string | ❌ | - | JSON string of Notion sorts array |
| `page_size` | integer | ❌ | 50 | Results to return (max 100) |

**Use when:** You need to retrieve filtered data from a Notion database.

**Example filter_json:**
```json
{"property": "Status", "select": {"equals": "Done"}}
```

**Example sorts_json:**
```json
[{"property": "Created", "direction": "descending"}]
```

---

#### `notion_get_page`
Get a Notion page by ID.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `page_id` | string | ✅ | The Notion page ID |

**Use when:** You need to retrieve all properties of a specific page.

---

#### `notion_get_page_content`
Get the content blocks of a Notion page.

**Parameters:**
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `page_id` | string | ✅ | - | The Notion page ID |
| `max_blocks` | integer | ❌ | 100 | Maximum blocks to return |

**Use when:** You need to read the actual content (paragraphs, headings, lists, etc.) of a page.

---

#### `notion_list_users`
List all users in the Notion workspace.

**Parameters:** None

**Use when:** You need to see who has access to the workspace or resolve user IDs to names.

---

## Common Workflows

### Exploring a Database

1. **See available databases:**
   ```
   list_databases
   ```

2. **List tables in a database:**
   ```
   list_tables(database: "notionarchive")
   ```

3. **Find tables by name:**
   ```
   search_tables(database: "notionarchive", pattern: "Job")
   ```

4. **Understand table structure:**
   ```
   describe_table(database: "notionarchive", table_name: "dbo.Jobs")
   ```

5. **Preview data:**
   ```
   get_sample_data(database: "notionarchive", table_name: "dbo.Jobs", limit: 5)
   ```

### Querying Specific Data

1. **Write a SELECT query:**
   ```
   execute_query(
     database: "notionarchive",
     query: "SELECT JobId, JobName FROM dbo.Jobs WHERE Status = 'Active'",
     max_rows: 50
   )
   ```

2. **Join multiple tables:**
   ```
   execute_query(
     database: "notionarchive",
     query: "SELECT j.JobName, p.PieceName FROM dbo.Jobs j INNER JOIN dbo.Pieces p ON j.JobId = p.JobId",
     max_rows: 100
   )
   ```

### Working with Notion Data

1. **Find a Notion database:**
   ```
   notion_list_databases
   ```

2. **Check database schema:**
   ```
   notion_get_database_schema(database_id: "abc123...")
   ```

3. **Query with filters:**
   ```
   notion_query_database(
     database_id: "abc123...",
     filter_json: '{"property": "Status", "select": {"equals": "Active"}}',
     sorts_json: '[{"property": "Name", "direction": "ascending"}]'
   )
   ```

4. **Get page details:**
   ```
   notion_get_page(page_id: "xyz789...")
   ```

### Comparing MSSQL and Notion Data

1. **Get archived data from MSSQL:**
   ```
   execute_query(
     database: "notionarchive",
     query: "SELECT NotionPageId, JobName FROM dbo.Jobs WHERE IsArchived = 1"
   )
   ```

2. **Get live data from Notion:**
   ```
   notion_query_database(database_id: "...")
   ```

3. **Compare the results to find discrepancies**

---

## Error Handling

### Query Validation Errors

If you see "Only SELECT queries are allowed" or similar:
- ✅ Make sure your query starts with `SELECT` or `WITH`
- ✅ Remove any semicolons or multiple statements
- ✅ Don't use INSERT, UPDATE, DELETE, EXEC, or stored procedures

### Database Connection Errors

If queries fail with connection errors:
1. **Test connectivity:**
   ```
   test_connections
   ```

2. **Check which database is failing and report to the user**

### Notion API Errors

Common Notion API errors:
- **"object not found"**: The page/database ID is invalid or not shared with the integration
- **"unauthorized"**: The integration doesn't have access to that resource
- **"rate_limited"**: Too many requests; wait and retry

---

## Configuration

The MCP server uses environment variables from `.env`:

```env
# MSSQL - StonePro
STONEPRO_SERVER=DS-DB01\\SQLSERVER202201
STONEPRO_DATABASE=StonePro
STONEPRO_USERNAME=SA
STONEPRO_PASSWORD=your_password

# MSSQL - NotionArchive
NOTIONARCHIVE_SERVER=DS-DB01\\SQLSERVER202201
NOTIONARCHIVE_DATABASE=NotionArchive
NOTIONARCHIVE_USERNAME=SA
NOTIONARCHIVE_PASSWORD=your_password

# Notion API
NOTION_API_KEY=ntn_your_api_key
NOTION_VERIFY_SSL=true
```

---

## Security Best Practices

1. **All queries are validated** - The server blocks dangerous SQL patterns before execution

2. **Read-only by design** - No way to modify data through this MCP server

3. **Sanitized identifiers** - Table and column names are sanitized to prevent injection

4. **Notion is read-only** - Only GET operations are available; no page creation/modification

5. **Credentials are masked** - Passwords are never exposed in error messages or logs

---

## Quick Reference Card

| Task | Tool | Key Parameters |
|------|------|----------------|
| List databases | `list_databases` | - |
| List tables | `list_tables` | `database` |
| Search tables | `search_tables` | `database`, `pattern` |
| Describe table | `describe_table` | `database`, `table_name` |
| Run SQL query | `execute_query` | `database`, `query`, `max_rows` |
| Get sample data | `get_sample_data` | `database`, `table_name`, `limit` |
| Test connections | `test_connections` | - |
| Search Notion | `notion_search` | `query`, `filter_type` |
| List Notion DBs | `notion_list_databases` | - |
| DB schema | `notion_get_database_schema` | `database_id` |
| Query Notion DB | `notion_query_database` | `database_id`, `filter_json`, `sorts_json` |
| Get page | `notion_get_page` | `page_id` |
| Get page content | `notion_get_page_content` | `page_id`, `max_blocks` |
| List users | `notion_list_users` | - |

---

## VS Code Integration

Add to your `.vscode/mcp.json` or user `mcp.json`:

```json
{
  "servers": {
    "mssql-readonly": {
      "type": "stdio",
      "command": "uv",
      "args": [
        "--directory",
        "c:\\Users\\codi.f\\Custom_MCP\\NotionCustomMCP",
        "--native-tls",
        "run",
        "python",
        "-m",
        "src.server"
      ]
    }
  }
}
```

---

## Project Structure

```
NotionCustomMCP/
├── src/
│   ├── __init__.py
│   ├── server.py          # Main MCP server with all tools
│   ├── config.py          # Configuration management (pydantic-settings)
│   ├── database/
│   │   ├── connection.py  # MSSQL connection manager
│   │   └── queries.py     # Query validation and execution
│   └── notion/
│       └── client.py      # Notion API client wrapper
├── .env                   # Environment variables (DO NOT COMMIT)
├── .env.example           # Template for environment setup
└── pyproject.toml         # Project dependencies
```
