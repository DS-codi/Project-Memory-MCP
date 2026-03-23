---
name: datasource-notion-api
description: Use this skill when working with Notion API integration, Notion databases, Notion property types, page queries, database relations, or the notion-client SDK. Covers all 8 Notion databases (Production, Install, Pieces, Cutouts, Slabs, Stone Colours, Customers, Suppliers), their property schemas, relationships, and the property translation pipeline.
---

# Datasource: Notion API

The live Notion workspace is the source of truth for active jobs. The system uses the `notion-client` Python SDK and the Notion REST API v2022-06-28.

## Notion Databases

| Database | Config Key | Entity | Description |
|----------|-----------|--------|-------------|
| **Production** | `notion_db_production` | Jobs | Active production orders with ~70 properties |
| **Install** | `notion_db_install` | Installs | Installation scheduling, parent of Production |
| **Pieces** | `notion_db_pieces` | Pieces | Individual stone pieces per job (~50 properties) |
| **Cutouts** | `notion_db_cutouts` | Cutouts | CNC operations on pieces (~21 properties) |
| **Slabs** | `notion_db_slabs` | Slabs | Raw stone inventory (~25 properties) |
| **Stone Colours** | `notion_db_stone_colours` | Colours | Material catalogue (READ-ONLY, never modify) |
| **Customers** | `notion_db_customers` | Customers | Customer records (READ-ONLY, never modify) |
| **Suppliers** | `notion_db_suppliers` | Suppliers | Supplier records |

## Database Relationships (Relations in Notion)

```
Install (parent)
  └── Production (jobs) ← title property is the job number
        ├── Pieces ← related via "Pieces in Job" relation
        │     └── Cutouts ← related via piece_id
        ├── Slabs ← related via production_id
        └── Stone Colours ← related via colour_id (lookup)
              └── Customers ← related via customer relation on Install
```

## Key Notion Property Types

| Type | MSSQL Storage | Example Properties |
|------|--------------|-------------------|
| `title` | `nvarchar(MAX)` | Job (number), Piece No, NC File |
| `rich_text` | `nvarchar(MAX)` | Job Name, Notes, Suburb |
| `number` | `float` | UM, SL, OC, WJ Priority |
| `select` | `nvarchar(255)` | Status, Programming, Machine |
| `multi_select` | `nvarchar(MAX)` as CSV | Edge Profile, Job Type |
| `date` | `nvarchar(50)` (ISO string) | Install Date, Measure Date |
| `checkbox` | `bit` | Offcuts, Quick Edit |
| `relation` | `nvarchar(MAX)` as JSON or FK | Colour, Production, Customer |
| `formula` | NOT stored (computed) | Location, various KPIs |
| `rollup` | NOT stored (computed) | Aggregated counts |
| `status` | `nvarchar(MAX)` | Status (with groups) |

**Important:** Formula and Rollup properties are NEVER synced to MSSQL. They are computed by Notion. If you need their values, use views that calculate from related tables.

## Production Database Properties (Key Columns)

The Production database has ~70 properties. The most important:

- **Job** (title): Job number string, e.g. "1309803" or "1314402F"
- **Job Name** (rich_text): Description/address
- **Install Date** (formula → from Install relation)
- **Status** (status): Active status with groups
- **Programming** (select): Saw, CNC, Saw/WJ, Ready, etc.
- **Programs** (select): Not started, Started, Complete
- **P** (rollup): Piece count from relation
- **UM** (number): UM count
- **Colour** (relation): → Stone Colours database
- **Pieces in Job** (relation): → Pieces database
- **Slabs for Job** (relation): → Slabs database
- **Programmer** (select): Assigned programmer name
- **Folder in O: Drive** (rich_text): Network share path

## Notion API Integration Config

Integration tokens and database IDs are configured in `ArchiveSettings` (see `notion_archival/models/config.py`). Environment variable prefix: `NOTION_ARCHIVE_`.

Multi-integration support exists via `IntegrationConfig` — multiple tokens with different permissions (read, read_write, full) and rate limits.

## Test Workspace

The system has a dedicated Notion test workspace (see `notion-deletion-safety.instructions.md` for IDs). Test database IDs all begin with `2fc322d6-dcde-`. **Never run destructive operations against production.**

## Property Translation

`notion_sync/translator/property_translator.py` handles converting Notion's complex property JSON into flat MSSQL-compatible values. Property mappings are defined per-entity in `notion_sync/mappings/` (e.g., `job_mapping.py`, `piece_mapping.py`, `slab_mapping.py`).
