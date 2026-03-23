---
name: datasource-notionarchive-mssql
description: Use this skill when working with the NotionArchive MSSQL database, SQL Server queries, notion_* sync tables, archive_* archival tables, database migrations, pyodbc/pymssql connections, or the sync pipeline. Covers all table schemas, column definitions, sync infrastructure, and the relationship between live Notion data and local SQL storage.
---

# Datasource: NotionArchive (MSSQL)

The NotionArchive SQL Server database is the local mirror of Notion data plus archival storage. It uses **SQL Server 2019+** (production) or **SQL Server 2022** (test containers).

## Connection Details

| Setting | Config Key | Typical Value |
|---------|-----------|---------------|
| Server | `db_server` | `localhost\SQLEXPRESS` (prod) / `localhost,1434` (test) |
| Database | `db_name` | `NotionArchive` / `NotionArchive_Test` |
| Driver | `db_driver` | `ODBC Driver 17 for SQL Server` |
| Auth | — | Windows Auth (prod) or SQL Auth (test: `sa` / `TestPassword123!`) |

Python drivers: `pyodbc` (primary), `pymssql` (fallback). Connection factory in `notion_archival/models/database.py`.

## Live Sync Tables (`notion_*`)

These tables are populated by `notion_sync` from the Notion API:

### `notion_jobs`
Primary table for Production database pages.

| Column | Type | Source |
|--------|------|--------|
| `id` | `int IDENTITY` | Auto PK |
| `notion_page_id` | `nvarchar(50)` | Notion page UUID |
| `job_number` | `nvarchar(50)` | Title property |
| `job_name` | `nvarchar(MAX)` | Rich text |
| `status` | `nvarchar(255)` | Status property |
| `programming` | `nvarchar(255)` | Select |
| `programs` | `nvarchar(255)` | Select |
| `programmer` | `nvarchar(255)` | Select |
| `folder_path` | `nvarchar(MAX)` | Rich text |
| `stone_colour` | `nvarchar(255)` | Relation → lookup |
| `piece_count` | `int` | Rollup value |
| `um` | `float` | Number |
| `sl` | `float` | Number |
| `oc` | `float` | Number |
| `install_date` | `nvarchar(50)` | Date (ISO) |
| `measure_date` | `nvarchar(50)` | Date (ISO) |
| `last_synced` | `datetime2` | Sync timestamp |
| `notion_last_edited` | `datetime2` | Notion edit time |

### `notion_pieces`
Pieces from the Pieces database.

| Column | Type | Source |
|--------|------|--------|
| `id` | `int IDENTITY` | Auto PK |
| `notion_page_id` | `nvarchar(50)` | Notion page UUID |
| `piece_no` | `nvarchar(50)` | Title property |
| `production_id` | `nvarchar(50)` | Relation FK |
| `stone_colour` | `nvarchar(255)` | Relation → lookup |
| `nc_file` | `nvarchar(MAX)` | Rich text |
| `status` | `nvarchar(255)` | Status |
| `edge_profile` | `nvarchar(MAX)` | Multi-select (CSV) |
| `machine` | `nvarchar(255)` | Select |
| `length` | `float` | Number |
| `width` | `float` | Number |
| `thickness` | `float` | Number |
| `area` | `float` | Number (m²) |
| `last_synced` | `datetime2` | Sync timestamp |
| `notion_last_edited` | `datetime2` | Notion edit time |

### `notion_cutouts`
CNC cutout operations linked to pieces.

| Column | Type | Source |
|--------|------|--------|
| `id` | `int IDENTITY` | Auto PK |
| `notion_page_id` | `nvarchar(50)` | Notion page UUID |
| `cutout_name` | `nvarchar(255)` | Title property |
| `piece_id` | `nvarchar(50)` | Relation FK |
| `cutout_type` | `nvarchar(255)` | Select |
| `quantity` | `int` | Number |
| `last_synced` | `datetime2` | Sync timestamp |

### `notion_slabs`
Stone slab inventory from the Slabs database.

| Column | Type | Source |
|--------|------|--------|
| `id` | `int IDENTITY` | Auto PK |
| `notion_page_id` | `nvarchar(50)` | Notion page UUID |
| `slab_name` | `nvarchar(255)` | Title property |
| `stone_colour` | `nvarchar(255)` | Relation → lookup |
| `supplier` | `nvarchar(255)` | Relation → lookup |
| `production_id` | `nvarchar(50)` | Relation FK |
| `length` | `float` | mm |
| `width` | `float` | mm |
| `thickness` | `float` | mm |
| `bundle` | `nvarchar(100)` | Text |
| `lot_number` | `nvarchar(100)` | Text |
| `last_synced` | `datetime2` | Sync timestamp |

### Other `notion_*` tables
- `notion_stone_colours` — material catalogue cache (name, type, supplier, thickness)
- `notion_customers` — customer records cache (name, address, phone, email)
- `notion_suppliers` — supplier records cache
- `notion_install` — install scheduling data (install date, confirmed, status)
- `notion_install_schedule` — legacy install schedule entries

## Archive Tables (`archive_*`)

Archived/completed jobs are moved from `notion_*` to `archive_*` tables. Schemas mirror the live tables with additional metadata:

| Table | Mirrors | Extra Columns |
|-------|---------|--------------|
| `archive_jobs` | `notion_jobs` | `archived_at`, `archived_by`, `archive_reason` |
| `archive_pieces` | `notion_pieces` | `archived_at`, `archived_by` |
| `archive_cutouts` | `notion_cutouts` | `archived_at`, `archived_by` |
| `archive_slabs` | `notion_slabs` | `archived_at`, `archived_by` |
| `archive_customers` | `notion_customers` | `archived_at` |
| `archive_stone_colours` | `notion_stone_colours` | `archived_at` |

## Sync Infrastructure Tables

| Table | Purpose |
|-------|---------|
| `sync_state` | Tracks last sync cursor per database |
| `sync_log` | Sync operation audit log (timestamp, status, record counts) |
| `sync_errors` | Failed sync items with error details |
| `deleted_pages` | Notion pages detected as deleted |
| `rate_limit_log` | API rate limit events |

## System & Auth Tables

| Table | Purpose |
|-------|---------|
| `users` | Application user accounts |
| `user_tokens` | API authentication tokens |
| `settings` | Application settings key-value store |
| `migration_history` | Schema migration tracking |

## Views

| View | Purpose |
|------|---------|
| `vw_active_jobs` | Active (non-archived) jobs with related data |
| `vw_job_pieces` | Jobs joined with their pieces |
| `vw_job_summary` | Aggregated job statistics |

## Domain Models

Python models mirror the database schema:
- `notion_archival/models/domain/job.py` — `Job`, `JobCreate`, `JobUpdate`
- `notion_archival/models/domain/piece.py` — `Piece`
- `notion_archival/models/domain/slab.py` — `Slab`
- `notion_archival/models/domain/cutout.py` — `Cutout`
- `notion_archival/models/domain/customer.py` — `Customer`
- `notion_archival/models/domain/stone_colour.py` — `StoneColour`

## Schema Management

Migrations live in `migrations/consolidated/`. The current consolidated schema is in `migrations/consolidated/001_initial_schema.sql`. Use the migration runner at `migrations/migrate.py`.

## Sync Behavior

1. `notion_sync` polls Notion for changes (via `notion_polling`)
2. Changed pages are fetched and properties translated (`property_translator.py`)
3. Translated rows are upserted into `notion_*` tables (match on `notion_page_id`)
4. Deleted pages are soft-tracked in `deleted_pages`
5. Archival moves completed jobs from `notion_*` → `archive_*` tables
