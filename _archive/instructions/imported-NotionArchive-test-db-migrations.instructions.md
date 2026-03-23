---
applyTo: "migrations/**"
---

# Running Migrations Against the Test Database

How to run SQL and Python migration scripts against the **NotionArchive_Test** database on the test VM (`ds-app01` / `10.0.0.253`).

---

## Test Database Credentials

| Property | Value |
|----------|-------|
| **Host (from dev machine)** | `10.0.0.253,1434` |
| **Host (from container network)** | `host.containers.internal,1434` |
| **SSH alias** | `ds-app01` |
| **Container name** | `mssql-test-notionarchive` |
| **Database** | `NotionArchive_Test` |
| **User** | `SA` |
| **Password** | `TestPassword123!` |
| **ODBC Driver** | `ODBC Driver 17 for SQL Server` (dev) / `ODBC Driver 18 for SQL Server` (container) |
| **Collation** | `SQL_Latin1_General_CP1_CI_AS` |

---

## Method 1: SSH + sqlcmd (Ad-hoc SQL)

Best for running `.sql` files or quick one-off statements. The `sqlcmd` tool is inside the MSSQL container on the VM.

### One-liner (pipe SQL via stdin)

```powershell
# Single statement
echo "SELECT COUNT(*) FROM dbo.archive_jobs;" | ssh ds-app01 "podman exec -i mssql-test-notionarchive /opt/mssql-tools18/bin/sqlcmd -S localhost -d NotionArchive_Test -U sa -P 'TestPassword123!' -C -b"
```

### Run a local .sql file

```powershell
# Copy file into container, then execute
ssh ds-app01 "podman exec mssql-test-notionarchive mkdir -p /tmp/mig"
podman cp doesn't work over SSH — use scp + podman cp instead:

# Step 1: Copy file to VM
scp migrations/one-time/my_migration.sql ds-app01:/tmp/my_migration.sql

# Step 2: Copy from VM into container
ssh ds-app01 "podman cp /tmp/my_migration.sql mssql-test-notionarchive:/tmp/my_migration.sql"

# Step 3: Execute
ssh ds-app01 "podman exec mssql-test-notionarchive /opt/mssql-tools18/bin/sqlcmd -S localhost -d NotionArchive_Test -U sa -P 'TestPassword123!' -C -b -i /tmp/my_migration.sql"
```

### Heredoc pattern (multi-line SQL from PowerShell)

```powershell
$sql = @"
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.my_table') AND name = 'new_col')
BEGIN
    ALTER TABLE dbo.my_table ADD new_col nvarchar(100) NULL;
    PRINT 'Added column: my_table.new_col';
END
"@

$sql | ssh ds-app01 "podman exec -i mssql-test-notionarchive /opt/mssql-tools18/bin/sqlcmd -S localhost -d NotionArchive_Test -U sa -P 'TestPassword123!' -C -b"
```

### Key sqlcmd flags

| Flag | Meaning |
|------|---------|
| `-S localhost` | Connect to SQL Server inside the container |
| `-d NotionArchive_Test` | Target database |
| `-U sa -P '...'` | Authentication |
| `-C` | Trust server certificate (required for MSSQL 2022) |
| `-b` | Abort on error (returns non-zero exit code) |
| `-I` | Enable quoted identifiers |
| `-i /path/file.sql` | Input file |

---

## Method 2: pyodbc from Dev Machine (Python scripts)

Best for complex migrations with logic, batching, or multi-database operations. Connects directly from the dev machine to the VM over the network.

### Connection string

```python
import pyodbc

TEST_CONN_STR = (
    "DRIVER={ODBC Driver 17 for SQL Server};"
    "SERVER=10.0.0.253,1434;"
    "DATABASE=NotionArchive_Test;"
    "UID=SA;"
    "PWD=TestPassword123!;"
    "TrustServerCertificate=yes;"
)

conn = pyodbc.connect(TEST_CONN_STR)
conn.autocommit = False  # Use transactions for safety
cursor = conn.cursor()
```

### Standard migration script template

```python
"""
Migration: <Brief description>
===============================
Purpose: ...
Target:  NotionArchive_Test on 10.0.0.253:1434
Safety:  DRY_RUN=True by default

Run:     python migrations/<path>/my_migration.py
"""
import pyodbc
import sys

DRY_RUN = True  # Set to False to execute

CONN_STR = (
    "DRIVER={ODBC Driver 17 for SQL Server};"
    "SERVER=10.0.0.253,1434;"
    "DATABASE=NotionArchive_Test;"
    "UID=SA;"
    "PWD=TestPassword123!;"
    "TrustServerCertificate=yes;"
)

def main():
    conn = pyodbc.connect(CONN_STR)
    conn.autocommit = False
    cursor = conn.cursor()

    try:
        # --- Your migration logic here ---
        cursor.execute("SELECT COUNT(*) FROM dbo.my_table")
        count = cursor.fetchone()[0]
        print(f"Current row count: {count}")

        if DRY_RUN:
            print("[DRY RUN] Would execute changes. Set DRY_RUN=False to apply.")
            conn.rollback()
        else:
            conn.commit()
            print("Migration committed.")

    except Exception as e:
        conn.rollback()
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    main()
```

### Running it

```powershell
# Activate venv first (pyodbc is installed there)
& S:\NotionArchive\.venv\Scripts\Activate.ps1

# Dry run (default)
python migrations/one-time/my_migration.py

# Real run (edit DRY_RUN=False in the script, or use env var pattern)
python migrations/one-time/my_migration.py
```

---

## Method 3: Consolidated Migration Runner (Full rebuild)

The `migrations/consolidated/run_all.ps1` script runs ALL base schema scripts (00-15) in order against a **local** Podman MSSQL container. This is for rebuilding the test DB from scratch, not for incremental changes.

```powershell
cd S:\NotionArchive\migrations\consolidated

# Dry run — validate files only
.\run_all.ps1 -SaPassword 'TestPassword123!' -DryRun

# Execute full rebuild
.\run_all.ps1 -SaPassword 'TestPassword123!'

# Custom container name (if not using the default)
.\run_all.ps1 -SaPassword 'TestPassword123!' -ContainerName 'mssql-test-notionarchive'
```

> **Note:** `run_all.ps1` targets a **local** Podman container (default: `notionarchive-mssql`). For the remote test VM container (`mssql-test-notionarchive` on `ds-app01`), use the SSH method or pyodbc instead.

---

## Migration File Locations

| Location | Purpose | Convention |
|----------|---------|------------|
| `migrations/consolidated/` | Base schema (00-15) + incremental (16+) | Numbered sequentially, SQL files |
| `migrations/one-time/` | Ad-hoc schema changes | Descriptive names, idempotent SQL |
| `migrations/production-schema-migration/` | Prod→Test data rescue scripts | Numbered Python scripts with `DRY_RUN` |
| `migrations/notion-inventory-upgrade/` | Inventory feature migration | Numbered SQL + runner script |

---

## Writing Idempotent SQL Migrations

All SQL migrations should be **safe to re-run**. Use these guard patterns:

### Add a column

```sql
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.my_table') AND name = 'new_column'
)
BEGIN
    ALTER TABLE dbo.[my_table] ADD [new_column] nvarchar(100) NULL;
    PRINT 'Added column: my_table.new_column';
END
GO
```

### Create a table

```sql
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'my_new_table')
BEGIN
    CREATE TABLE dbo.[my_new_table] (
        [id] bigint IDENTITY(1,1) NOT NULL,
        [name] nvarchar(200) NOT NULL,
        CONSTRAINT [PK_my_new_table] PRIMARY KEY CLUSTERED ([id])
    );
    PRINT 'Created table: my_new_table';
END
GO
```

### Add a foreign key

```sql
IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_child_parent_id'
)
BEGIN
    ALTER TABLE dbo.[child_table]
        ADD CONSTRAINT [FK_child_parent_id]
        FOREIGN KEY ([parent_id]) REFERENCES dbo.[parent_table]([id]);
    PRINT 'Added FK: FK_child_parent_id';
END
GO
```

### Add an index

```sql
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.my_table') AND name = 'IX_my_table_column'
)
BEGIN
    CREATE NONCLUSTERED INDEX [IX_my_table_column]
        ON dbo.[my_table] ([column_name]);
    PRINT 'Created index: IX_my_table_column';
END
GO
```

### Create or alter a stored procedure

```sql
CREATE OR ALTER PROCEDURE dbo.[usp_my_procedure]
AS
BEGIN
    SET NOCOUNT ON;
    -- procedure body
END
GO
PRINT 'Created/Updated SP: usp_my_procedure';
GO
```

---

## Quick Verification Queries

After running a migration, verify it applied correctly:

```sql
-- Check if a column exists
SELECT c.name, t.name AS type, c.max_length, c.is_nullable
FROM sys.columns c JOIN sys.types t ON c.user_type_id = t.user_type_id
WHERE c.object_id = OBJECT_ID('dbo.my_table') AND c.name = 'new_column';

-- Check if a table exists and its row count
SELECT t.name, p.rows
FROM sys.tables t JOIN sys.partitions p ON t.object_id = p.object_id
WHERE p.index_id IN (0,1) AND t.name = 'my_table';

-- Check FK constraints on a table
SELECT fk.name, OBJECT_NAME(fk.parent_object_id) AS child_table,
       COL_NAME(fkc.parent_object_id, fkc.parent_column_id) AS child_column,
       OBJECT_NAME(fk.referenced_object_id) AS parent_table,
       COL_NAME(fkc.referenced_object_id, fkc.referenced_column_id) AS parent_column
FROM sys.foreign_keys fk
JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
WHERE fk.parent_object_id = OBJECT_ID('dbo.my_table');

-- Check indexes on a table
SELECT i.name, i.type_desc, STRING_AGG(COL_NAME(ic.object_id, ic.column_id), ', ') AS columns
FROM sys.indexes i JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
WHERE i.object_id = OBJECT_ID('dbo.my_table')
GROUP BY i.name, i.type_desc;
```

---

## Safety Checklist

- [ ] **DRY_RUN first** — Python scripts default to `DRY_RUN=True`. Always run dry first.
- [ ] **Idempotent** — Use `IF NOT EXISTS` guards so re-runs are safe.
- [ ] **Transaction-wrapped** — Python scripts use `conn.autocommit = False` + explicit `commit()`/`rollback()`.
- [ ] **Test only** — Never point migration scripts at the production database (`DS-DB01\SQLSERVER202201` / `NotionArchive`) without explicit authorisation.
- [ ] **Verify after** — Run a verification query to confirm the change applied.
- [ ] **StonePro untouched** — Migrations target `NotionArchive_Test` only. The StonePro database (`stonepro_test` on port 1435) is a separate concern.
