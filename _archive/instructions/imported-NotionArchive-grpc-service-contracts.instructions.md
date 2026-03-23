---
applyTo: "**/grpc_server/**,**/grpc/**,**/routes/**,**/servicer*"
---

# gRPC Service Contracts Reference

Complete reference for every gRPC method across the four core services, plus gateway HTTP routes and KPI API endpoints. Use this when wiring up new callers, writing tests, or integrating services.

## Architecture Pattern

All Python gRPC servicers follow the same **lazy-DI constructor** pattern:

```python
class FooServiceServicer(foo_pb2_grpc.FooServiceServicer):
    def __init__(self, dep_a=None, dep_b=None):
        self._dep_a = dep_a   # inject for tests, None for production
        self._dep_b = dep_b

    @property
    def dep_a(self):
        if self._dep_a is None:
            from some.module import RealDepA
            self._dep_a = RealDepA()
        return self._dep_a
```

- **Testing**: pass mock dependencies via constructor
- **Production**: leave as `None`; lazy properties auto-construct on first access
- **Async bridge**: all servicers use `_run_async(coro)` to call async code from sync gRPC threads

All servicers use the shared `notion_queue.observability.log_rpc` helper for structured logging with `service`, `rpc_method`, `duration_ms`, `outcome`, and optional `correlation_id`.

---

## 1. notion_sync — Sync Service

**File**: `notion_sync/grpc_server/servicer.py`
**Class**: `NotionSyncServiceServicer`
**Proto**: `sync.proto` + `common.proto`

### Constructor Dependencies

| Parameter | Type | Lazy Import |
|-----------|------|-------------|
| `sync_service` | `SyncService` | `notion_sync.services.sync_service` |
| `notion_client` | `NotionClient` | `notion_sync.notion_client` |
| `db_connection` | `DatabaseConnection` | `notion_sync.database.connection.get_connection()` |

### RPCs

#### `Health`
- **Request**: `common_pb2.HealthRequest`
- **Response**: `common_pb2.HealthResponse`
- **Behaviour**: Returns uptime + database connectivity status in `components` dict
- **Error handling**: Returns `status="unhealthy"` on failure

#### `SyncToNotion`
- **Request**: `sync_pb2.SyncToNotionRequest`
  - `job_ids: repeated int` — local job IDs to push
  - `force: bool` — bypass skip logic
- **Response**: `sync_pb2.SyncResponse`
  - `sync_id`, `status`, `items_synced`, `items_failed`, `conflicts_detected`
- **Behaviour**: Validates each job_id against `notion_install` / `notion_jobs` tables, enqueues to `notion_sync_queue` with operation `to_notion`. Does NOT push to Notion directly — downstream workers process the queue.
- **gRPC error**: `INTERNAL` on unhandled exception

#### `SyncFromNotion`
- **Request**: `sync_pb2.SyncFromNotionRequest`
  - `notion_page_ids: repeated string` — specific pages to pull (empty = full sync)
  - `force: bool`
- **Response**: `sync_pb2.SyncResponse`
- **Behaviour**:
  - With page IDs → calls `NotionClient.get_page()` + `SyncService.sync_page()` per page
  - Without page IDs → queries all 7 configured Notion databases via `NotionClient.query_all_pages()` + `SyncService.sync_batch()`
- **Env vars for full sync**: `NOTION_DATABASE_ID_JOB`, `NOTION_DATABASE_ID_PIECE`, `NOTION_DATABASE_ID_SLAB`, `NOTION_DATABASE_ID_CUTOUT`, `NOTION_DATABASE_ID_CUSTOMER`, `NOTION_DATABASE_ID_STONE_COLOUR`, `NOTION_DATABASE_ID_SUPPLIER`

#### `SyncBidirectional`
- **Request**: `sync_pb2.SyncBidirectionalRequest`
  - `force: bool`
- **Response**: `sync_pb2.SyncResponse`
- **Behaviour**: Runs a full from-Notion sync (`_sync_all_databases`). To-Notion direction is handled asynchronously via the queue.

#### `GetSyncMapping`
- **Request**: `sync_pb2.GetSyncMappingRequest`
  - `entity_type: string`
- **Response**: `sync_pb2.SyncMappingResponse`
  - `mappings: repeated SyncMapping`
- **Status**: Returns empty list (mapping table query not yet wired — TODO enhancement)

#### `UpdateSyncMapping`
- **Request**: `sync_pb2.UpdateSyncMappingRequest`
  - `mapping: SyncMapping` (contains `local_id`, `notion_id`)
- **Response**: `common_pb2.OperationResult`
- **Status**: Returns success with "queued" message (persist logic not yet wired — TODO enhancement)

#### `GetSyncConflicts`
- **Request**: `sync_pb2.GetSyncConflictsRequest`
  - `unresolved_only: bool`
- **Response**: `sync_pb2.SyncConflictsResponse`
  - `conflicts: repeated SyncConflict`
- **Status**: Returns empty list (conflicts table query not yet wired — TODO enhancement)

#### `ResolveSyncConflict`
- **Request**: `sync_pb2.ResolveSyncConflictRequest`
  - `conflict_id: string`, `resolution: string`
- **Response**: `common_pb2.OperationResult`
- **Status**: Returns success message (resolution logic not yet wired — TODO enhancement)

---

## 2. notion_jit — JIT Refresh Service

**File**: `notion_jit/grpc_server/servicer.py`
**Class**: `NotionJITServiceServicer`
**Proto**: `jit.proto` + `common.proto`

### Constructor Dependencies

| Parameter | Type | Lazy Import |
|-----------|------|-------------|
| `jit_service` | `JITRefreshService` | `notion_jit.JITRefreshService` (configured via `JITConfig.from_env()`) |
| `staleness_tracker` | `StalenessTracker` | Reuses `jit_service.staleness` |
| `memory_cache` | `MemoryCache` | Reuses `jit_service.cache` |

### RPCs

#### `Health`
- **Request**: `common_pb2.HealthRequest`
- **Response**: `common_pb2.HealthResponse`
- **Components checked**: `jit_service` initialization

#### `RefreshData`
- **Request**: `jit_pb2.RefreshDataRequest`
  - `entity_type: string` — required (e.g. `"job"`, `"piece"`, `"slab"`)
  - `entity_id: string` — required (Notion page ID)
  - `force: bool` — bypass cache
- **Response**: `jit_pb2.RefreshDataResponse`
  - `refreshed: bool`, `was_stale: bool`, `error: ErrorDetail`
- **Behaviour**: Checks staleness → calls `JITRefreshService.get_entity()` (cache lookup → Notion API fetch → cache update)
- **Validation**: Returns `INVALID_ARGUMENT` if `entity_id` or `entity_type` missing

#### `BatchRefresh`
- **Request**: `jit_pb2.BatchRefreshRequest`
  - `entity_type: string` — required
  - `entity_ids: repeated string` — required
- **Response**: `jit_pb2.BatchRefreshResponse`
  - `total`, `refreshed`, `skipped`, `failed: int`
  - `results: repeated BatchRefreshResult` (per-entity detail with `entity_id`, `refreshed`, `was_stale`, `error`)
- **Behaviour**: Pre-checks staleness per entity → calls `JITRefreshService.get_entities()` (uses `BatchAggregator` internally for efficient API usage)
- **Empty list**: Returns `total=0` immediately

#### `CheckStaleness`
- **Request**: `jit_pb2.CheckStalenessRequest`
  - `entity_type: string`, `entity_id: string`
- **Response**: `jit_pb2.StalenessResponse`
  - `is_stale: bool`, `age_seconds: int` (-1 if never synced), `max_age_seconds: int`, `last_refreshed: Timestamp`
- **Behaviour**: Uses `StalenessTracker.is_stale()` + `get_last_sync()`. Max age threshold comes from `JITConfig.get_staleness_for_entity()`.

#### `InvalidateCache`
- **Request**: `jit_pb2.InvalidateCacheRequest`
  - `entity_type: string`, `entity_id: string` — required
- **Response**: `common_pb2.OperationResult`
- **Behaviour**: Calls `JITRefreshService.invalidate()` which clears both in-memory cache and staleness tracker record

#### `GetCacheStats`
- **Request**: `jit_pb2.GetCacheStatsRequest` (no fields)
- **Response**: `jit_pb2.CacheStatsResponse`
  - `total_entries`, `total_size_bytes` (always 0), `hits`, `misses`, `hit_rate: float`
- **Behaviour**: Reads from `MemoryCache.get_stats()`

---

## 3. notion_update — Update Service

**File**: `notion_update/grpc_server/servicer.py`
**Class**: `UpdateServiceServicer`
**Proto**: `update.proto` + `common.proto`

### Constructor Dependencies

| Parameter | Type | Lazy Import |
|-----------|------|-------------|
| `page_creation_service` | `PageCreationService` | `notion_update.src.services.page_creation_service` |
| `archival_service` | `ArchivalService` | `notion_update.src.services.archival_service` |
| `archive_api_service` | `ArchiveAPIService` | `notion_update.src.services.archive_api_service` |
| `notion_client` | `NotionClient` | `notion_update.src.notion.client` |
| `db_connection` | `DatabaseConnection` | `notion_update.src.database.connection.db` |

### RPCs

#### `CreateJob`
- **Request**: `update_pb2.CreateJobRequest`
  - `job_name: string` — required
  - `job_number: int`
  - `properties: repeated PropertyValue` (name/value pairs)
- **Response**: `update_pb2.CreateJobResponse`
  - `job_id: int` (0 until DB sync), `notion_page_id: string`, `error: ErrorDetail`
- **Behaviour**: Calls `PageCreationService.create_page(database="jobs", properties=...)`
- **Validation**: Returns `INVALID_ARGUMENT` if `job_name` missing

#### `UpdateJob`
- **Request**: `update_pb2.UpdateJobRequest`
  - `job_id: int` — required
  - `properties: repeated PropertyValue` (name/value/type tuples)
- **Response**: `update_pb2.UpdateJobResponse`
  - `success: bool`, `error: ErrorDetail`
- **Behaviour**: Resolves `notion_page_id` via `notion_jobs` table → builds Notion property payload via `_build_notion_property()` → calls `NotionClient.update_page()`
- **Property types supported**: `title`, `rich_text`, `number`, `select`, `multi_select`, `date`, `checkbox`, `url`, `email`, `phone_number`, `relation`

#### `DeleteJob`
- **Request**: `update_pb2.DeleteJobRequest`
  - `job_id: int` — required
  - `archive_only: bool` — if true, archives without deleting from Notion
- **Response**: `common_pb2.OperationResult`
- **Behaviour**: Resolves page ID → calls `ArchivalService.archive_page(entity_type="job", delete_from_notion=!archive_only)`

#### `CreatePiece`
- **Request**: `update_pb2.CreatePieceRequest`
  - `job_id: int` — required (parent job)
  - `piece_name: string`
  - `properties: repeated PropertyValue`
- **Response**: `update_pb2.CreatePieceResponse`
  - `piece_id: int`, `notion_page_id: string`, `error: ErrorDetail`
- **Behaviour**: Resolves parent job page ID → calls `PageCreationService.create_page(database="pieces", relations={"Production": [job_page_id]})`

#### `UpdatePiece`
- **Request**: `update_pb2.UpdatePieceRequest`
  - `piece_id: int` — required
  - `properties: repeated PropertyValue`
- **Response**: `update_pb2.UpdatePieceResponse`
  - `success: bool`, `error: ErrorDetail`
- **Behaviour**: Same pattern as UpdateJob but resolves via `notion_pieces` table

#### `DeletePiece`
- **Request**: `update_pb2.DeletePieceRequest`
  - `piece_id: int` — required
- **Response**: `common_pb2.OperationResult`
- **Behaviour**: Always does full delete (archive + trash in Notion)

#### `BatchUpdate`
- **Request**: `update_pb2.BatchUpdateRequest`
  - `job_updates: repeated UpdateJobRequest`
  - `piece_updates: repeated UpdatePieceRequest`
- **Response**: `update_pb2.BatchUpdateResponse`
  - `total`, `succeeded`, `failed: int`
  - `results: repeated BatchUpdateResult` (per-entity with `entity_type`, `entity_id`, `success`, `error`)
- **Behaviour**: Processes all job updates then all piece updates sequentially

#### `Health`
- **Request**: `common_pb2.HealthRequest`
- **Response**: `common_pb2.HealthResponse`
- **Components checked**: Database connectivity via `SELECT 1`

---

## 4. stonepro_service — StonePro ERP Integration

**File**: `stonepro_service/grpc_server/servicer.py`
**Class**: `StoneproServiceServicer`
**Proto**: `stonepro.proto` + `common.proto`

### Constructor Dependencies

| Parameter | Type | Lazy Import |
|-----------|------|-------------|
| `job_service` | `JobService` | `app.services.job_service` (requires `DatabaseManager`) |
| `sync_service` | `SyncService` | `app.services.sync_service` |
| `db_manager` | `DatabaseManager` | `app.core.database` |

### Data Conversion

`_job_to_proto(job)` converts a Job model to `StoneproJob` protobuf:
- Maps `doc_refno` → `job_number`, `subject` → `job_name`, `customer_name`, `status_name`
- Properties dict includes: `subject`, `external_refno`, `edge_profile`, `notes`, `address`, `city`, `state`, `total_net`, `installer_notes`, `templater_notes`
- `created_at` → `common_pb2.Timestamp`

### RPCs

#### `GetStoneproJob`
- **Request**: `stonepro_pb2.GetStoneproJobRequest`
  - `job_number: string` — required, must be numeric
- **Response**: `stonepro_pb2.StoneproJobResponse`
  - `job: StoneproJob`, `error: ErrorDetail`
- **Behaviour**: Parses int → calls `JobService.get_by_job_number()` → converts via `_job_to_proto()`
- **Validation**: `INVALID_ARGUMENT` if missing or non-numeric

#### `ListStoneproJobs`
- **Request**: `stonepro_pb2.ListStoneproJobsRequest`
  - `status_filter: string` (optional, numeric status code)
  - `pagination: PaginationRequest` (`page`, `page_size`)
- **Response**: `stonepro_pb2.ListStoneproJobsResponse`
  - `jobs: repeated StoneproJob`
  - `pagination: PaginationResponse` (`total`, `page`, `page_size`, `has_next`)
- **Behaviour**: Uses `JobSearchFilters` → `JobService.search(limit, offset)` → paginated results

#### `SearchStoneproJobs`
- **Request**: `stonepro_pb2.SearchStoneproJobsRequest`
  - `query: string` — required
  - `pagination: PaginationRequest`
- **Response**: `stonepro_pb2.ListStoneproJobsResponse`
- **Behaviour**: If query is numeric → searches by `doc_refno`. Otherwise → searches by `subject` (job name). Uses same `JobService.search()` path.

#### `SyncToStonepro`
- **Request**: `stonepro_pb2.SyncToStoneproRequest`
  - `job_ids: repeated int` — StonePro DOC_REFNO values
  - `force: bool`
- **Response**: `stonepro_pb2.SyncResponse`
  - `sync_id`, `status`, `items_synced`, `items_failed`
- **Behaviour**: For each job_id → reads job from StonePro → transforms via `SyncService.transform_job()`. Status is `"completed"` or `"partial"`.

#### `SyncFromStonepro`
- **Request**: `stonepro_pb2.SyncFromStoneproRequest`
  - `job_numbers: repeated string`
  - `force: bool`
- **Response**: `stonepro_pb2.SyncResponse`
- **Behaviour**: Parses each job number as int → reads from StonePro → transforms. Non-numeric values increment `failed` count.

#### `GetJobMapping`
- **Request**: `stonepro_pb2.GetJobMappingRequest`
  - `notion_archive_id: int` (oneof) — NotionArchive MSSQL `notion_jobs.id`
  - `stonepro_job_number: string` (oneof) — StonePro `DOC_REFNO`
- **Response**: `stonepro_pb2.JobMappingResponse`
  - `mapping: JobMapping` (`notion_archive_id`, `stonepro_job_number`, `notion_page_id`)
  - `error: ErrorDetail`
- **Behaviour**: Queries `notion_jobs` table by `id` or `job_number`. Returns cross-reference mapping between all three systems (Notion page ID, MSSQL ID, StonePro job number).

#### `Health`
- **Request**: `common_pb2.HealthRequest`
- **Response**: `common_pb2.HealthResponse`
- **Components checked**: Database health via `DatabaseManager.health_check()`

---

## 5. Gateway HTTP Routes — Notion

**File**: `gateway-service/src/api/routes/notion.py`
**Framework**: FastAPI
**Auth**: `require_api_key` dependency (X-API-Key header)

### `GET /notion/databases`
- **Permission**: `jobs:read`
- **Response**: `List[NotionDatabase]` — `id` (table name), `title`, `record_count`, `last_synced`
- **Behaviour**: Queries local MSSQL mirror tables directly (`notion_production`, `notion_install`, `notion_pieces`, `notion_cutouts`, `notion_slabs`, `notion_stone_colours`, `notion_customers`, `notion_suppliers`). Does NOT call gRPC.
- **Query**: `SELECT COUNT(*) FROM [table]` + `SELECT MAX(synced_at) FROM [table]`

### `GET /notion/pages/{page_id}`
- **Permission**: `jobs:read`
- **Response**: `Dict[str, Any]` — page details with `source` field (`"grpc"` or `"database"`)
- **Behaviour**:
  1. Attempt gRPC call to archival service (`list_jobs` with `search_query=page_id`)
  2. Fallback to direct MSSQL query on `notion_production WHERE notion_page_id = ?`
  3. 404 if not found in either
- **Dependencies**: `get_archival_grpc_client()` from `dependencies.py`

### `POST /notion/refresh`
- **Permission**: `sync:execute`
- **Query params**: `database_id: Optional[str]`, `page_id: Optional[str]`
- **Response**: `RefreshResponse` — `status`, `message`, `database_id`, `operation_id`
- **Behaviour**:
  - If `page_id` provided → JIT service gRPC call (`refresh_data` with `entity_type="page"`, `force=True`)
  - Otherwise → polling service gRPC call (`trigger_poll` with `poll_type=database_id or "all"`)
- **Dependencies**: `get_jit_grpc_client()`, `get_polling_grpc_client()`

---

## 6. KPI API Report Routes (Rust)

**File**: `kpi_service/kpi_api/src/routes/reports.rs`
**Framework**: Axum (Rust)
**Repository**: `kpi_service/kpi_repository/src/reports.rs` (`ReportsRepository`)

### `GET /api/kpi/dashboard/summary`
- **Response**: `DashboardSummaryResponse`
  - `overdue_count`, `today_count`, `on_track_percentage`, `per_department: Vec<DepartmentSummary>`, `timestamp`
- **Repository method**: `get_dashboard_summary(today: NaiveDate)` → per-department overdue/today/pending counts via MSSQL CROSS APPLY unpivot
- **Data source**: `kpi_schedule_data` table

### `GET /api/kpi/reports/compliance`
- **Query params**: `weeks: Option<u32>` (default 4), `department: Option<String>`
- **Response**: `ComplianceReportResponse`
  - `overall_compliance_rate`, `weeks: Vec<WeeklyCompliance>`, `per_department: Vec<DepartmentCompliance>`
- **Repository methods**: `get_compliance_data(start_date, end_date)` + `get_overdue_count(start_date, end_date)`
- **Aggregation**: Weekly buckets built via `aggregate_weekly()` helper
- **Data source**: `kpi_schedule_data` table with date-range filtering

### `GET /api/kpi/reports/trends`
- **Query params**: `days: Option<u32>` (default 30), `department: Option<String>`
- **Response**: `TrendDataResponse`
  - `daily_trends: Vec<DailyTrend>`, `department_trends: Vec<DepartmentTrend>`
- **Repository methods**: `get_daily_trend_data(start_date, end_date)` + `get_department_trend_data(start_date, end_date)`
- **Data source**: `kpi_schedule_data` table with date-range filtering

---

## 7. Queue Observability Infrastructure

**File**: `notion_queue/observability.py` — shared `log_rpc` helper
**File**: `notion_queue/operation_result_sink.py` — dual SQL+log sink
**Migration**: `migrations/one-time/add_observability_tables.sql`

### `log_rpc()` (shared helper)
All 4 gRPC servicers delegate to this. Parameters:
- `service: str`, `method: str`, `start_time: float`
- `success: bool`, `outcome: str` (`"success"`, `"failure"`, `"partial"`)
- `correlation_id: Optional[str]`, `error: Optional[str]`
- `**extra` — arbitrary context forwarded to structlog

### `OperationResultSink`
- `record(result: ProcessingResult)` — writes to `operation_result` SQL table + structlog
- Columns: `correlation_id`, `entity_type`, `outcome`, `service`, `method`, `duration_ms`, `error_message`

### `make_ack_callback(sink, service, method)`
Factory that returns a callback compatible with `QueueWorkerService(ack_callback=...)`.

### Queue Model Changes
- `SyncQueueItem.correlation_id` — auto-generated UUID in `__post_init__`
- `QueueItem.correlation_id` — populated from SQL via `from_row()`
- `ProcessingResult.outcome` — `"success"` / `"failure"` / `"partial"`

---

## Common Protobuf Types

### `common_pb2.HealthRequest` / `HealthResponse`
```
HealthResponse { status, version, uptime_seconds, components: map<string, string> }
```

### `common_pb2.OperationResult`
```
OperationResult { success: bool, message: string }
```

### `common_pb2.ErrorDetail`
```
ErrorDetail { code: string, message: string }
```

### `common_pb2.Timestamp`
```
Timestamp { seconds: int64, nanos: int32 }
```

### `common_pb2.PaginationRequest` / `PaginationResponse`
```
PaginationRequest { page: int32, page_size: int32 }
PaginationResponse { total: int32, page: int32, page_size: int32, has_next: bool }
```

---

## Testing Patterns

All servicer tests follow this pattern:

```python
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

def make_servicer(**overrides):
    """Create servicer with mock dependencies."""
    defaults = {
        "sync_service": MagicMock(),
        "notion_client": MagicMock(),
        "db_connection": MagicMock(),
    }
    defaults.update(overrides)
    return NotionSyncServiceServicer(**defaults)

def test_sync_from_notion_specific_pages():
    mock_client = MagicMock()
    mock_client.get_page.return_value = {"id": "page-1"}
    mock_sync = MagicMock()
    mock_sync.sync_page.return_value = MagicMock(is_success=True)

    svc = make_servicer(notion_client=mock_client, sync_service=mock_sync)
    request = sync_pb2.SyncFromNotionRequest(notion_page_ids=["page-1"])
    response = svc.SyncFromNotion(request, MagicMock())

    assert response.items_synced == 1
```

### Test file locations
| Service | Test file |
|---------|-----------|
| notion_sync | `tests/unit/notion_sync/test_sync_grpc_servicer.py` |
| notion_jit | `tests/unit/notion_jit/test_jit_grpc_servicer.py` |
| notion_update | `tests/unit/notion_update/test_update_grpc_servicer.py` |
| stonepro_service | `tests/unit/stonepro_service/test_stonepro_grpc_servicer.py` |
| gateway routes | `gateway-service/tests/test_notion_routes.py` |
| kpi reports | `kpi_service/kpi_api/src/routes/reports.rs` (inline `#[cfg(test)]`) |
| queue observability | `notion_queue/tests/test_observability.py` |
