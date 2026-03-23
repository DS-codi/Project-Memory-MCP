---
name: notion-api-connection
description: >
  Use this skill when connecting to the Notion API, creating HTTP clients,
  configuring API keys, handling rate limiting, implementing retry logic,
  managing multi-key rotation, querying databases, paginating results, or
  detecting changes via polling. Based on the production-proven notion_polling
  service and notion_rate_limiter library.
category: backend
tags:
  - notion-api
  - rate-limiting
  - http-client
  - polling
  - multi-key
  - token-bucket
  - async
  - retry
language_targets:
  - python
framework_targets:
  - httpx
  - pydantic
  - apscheduler
---

# Notion API Connection Patterns

This skill captures the proven patterns for connecting to the Notion REST API as implemented in the `notion_polling` service and `notion_rate_limiter` library. These patterns have been validated in production for syncing 12+ Notion databases.

## When to Use This Skill

- Creating a new service that needs to read or write Notion data
- Adding a Notion API client to an existing module
- Configuring rate limiting for Notion requests
- Setting up multi-key API rotation for increased throughput
- Implementing change detection / polling against Notion databases
- Handling pagination for large Notion database queries
- Debugging 429 (rate limit) errors from the Notion API

## Architecture Overview

```
                                ┌─────────────────────────┐
                                │   Notion REST API        │
                                │   api.notion.com/v1      │
                                │   (3 req/s rate limit)   │
                                └────────────┬────────────┘
                                             │
                          ┌──────────────────┼──────────────────┐
                          │                  │                  │
                    ┌─────┴─────┐     ┌──────┴─────┐    ┌──────┴─────┐
                    │ Key 01    │     │ Key 02     │    │ Key 03     │
                    │ canonical │     │ additional │    │ additional │
                    │ write key │     │ pool key   │    │ pool key   │
                    └─────┬─────┘     └──────┬─────┘    └──────┬─────┘
                          │ each has own     │                 │
                          │ TokenBucket      │                 │
                          └──────────────────┼─────────────────┘
                                             │
                                    ┌────────┴────────┐
                                    │    KeyPool       │
                                    │ round-robin read │
                                    │ primary write    │
                                    └────────┬────────┘
                                             │
                                    ┌────────┴────────┐
                                    │ NotionRateLimiter│
                                    │ (token bucket +  │
                                    │  priority queue) │
                                    └────────┬────────┘
                                             │
                            ┌────────────────┼────────────────┐
                            │                │                │
                    ┌───────┴──────┐ ┌───────┴──────┐ ┌──────┴───────┐
                    │ Polling      │ │ Update       │ │ Archival     │
                    │ Adapter      │ │ Adapter      │ │ Adapter      │
                    └──────────────┘ └──────────────┘ └──────────────┘
```

## Key Patterns

### Pattern 1: Rate-Limited Client via Adapter

The recommended way to connect is through the module-specific adapter from `notion_rate_limiter`. Each adapter is a drop-in replacement preserving the original API surface.

```python
# notion_polling uses the polling adapter internally
from notion_rate_limiter.adapters import NotionPollingClient as RateLimitedClient

client = RateLimitedClient(
    api_key="ntn_...",
    max_retries=3,
    timeout=30.0,
)

# All methods are async
results = await client.query_database(database_id, filter_params)
page = await client.get_page(page_id)
await client.close()
```

Available adapters:

| Adapter | Import | Use Case |
|---------|--------|----------|
| `NotionPollingClient` | `notion_rate_limiter.adapters` | Read-heavy polling/sync |
| `NotionUpdateClient` | `notion_rate_limiter.adapters` | Write operations (pages, blocks) |
| `ArchivalNotionClient` | `notion_rate_limiter.adapters` | Archive service |

### Pattern 2: Direct Rate Limiter Usage

For new modules or custom use cases, use `NotionRateLimiter` directly:

```python
from notion_rate_limiter import (
    NotionRateLimiter,
    RateLimiterConfig,
    RequestPriority,
)

config = RateLimiterConfig(
    api_key="ntn_...",
    requests_per_second=2.5,   # Notion limit is 3; 2.5 is safety margin
    burst_size=5,
    timeout_seconds=30.0,
    max_retries=3,
)

async with NotionRateLimiter(config) as limiter:
    # Generic request
    response = await limiter.request(
        method="GET",
        endpoint="pages/abc123",
        priority=RequestPriority.NORMAL,
    )

    # Convenience: query a database
    response = await limiter.query_database(
        database_id="2fc322d6-dcde-80be-839a-c6b32c680936",
        filter_query={"timestamp": "last_edited_time", "last_edited_time": {"after": "2026-01-01T00:00:00Z"}},
        sorts=[{"timestamp": "last_edited_time", "direction": "descending"}],
        page_size=100,
        priority=RequestPriority.NORMAL,
    )

    # Convenience: get a single page
    page = await limiter.get_page("abc123", priority=RequestPriority.HIGH)

    # Convenience: update a page
    updated = await limiter.update_page(
        "abc123",
        properties={"Status": {"status": {"name": "Done"}}},
        priority=RequestPriority.HIGH,
    )
```

### Pattern 3: Synchronous Wrapper (Legacy Code)

For code that cannot use async/await:

```python
from notion_rate_limiter import NotionRateLimiterSync

with NotionRateLimiterSync() as limiter:
    page = limiter.get_page("abc123")
    results = limiter.query_database("db456", filter_query={...})
```

### Pattern 4: Module-Level Singleton

The rate limiter provides a global singleton for shared access:

```python
from notion_rate_limiter import get_rate_limiter, close_rate_limiter

# First call creates the singleton; subsequent calls return same instance
limiter = get_rate_limiter()
response = await limiter.request("GET", "pages/abc123")

# Clean up on shutdown
await close_rate_limiter()
```

### Pattern 5: Configuration via pydantic-settings

The `notion_polling` service uses `pydantic-settings` for environment-based configuration:

```python
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Notion API
    notion_api_key: str = Field(..., description="Notion integration API key")

    # Database IDs — one per Notion database
    notion_jobs_database_id: str = Field(...)
    notion_pieces_database_id: str = Field(...)
    notion_slabs_database_id: str = Field(...)
    # ... (12 databases total)

    # Request tuning
    max_api_retries: int = Field(default=3)
    api_timeout_seconds: int = Field(default=30)

settings = Settings()  # auto-loads from .env
```

### Pattern 6: Database Querying with Automatic Pagination

The standard pagination pattern used by all modules:

```python
async def query_all_pages(
    self,
    database_id: str,
    filter_params: dict | None = None,
    sorts: list | None = None,
) -> list[dict]:
    """Fetch ALL pages from a database, handling Notion's 100-item pagination."""
    all_results = []
    has_more = True
    start_cursor = None

    while has_more:
        response = await self.query_database(
            database_id,
            filter_params,
            sorts,
            start_cursor,
            page_size=100,  # Notion max
        )
        all_results.extend(response.get("results", []))
        has_more = response.get("has_more", False)
        start_cursor = response.get("next_cursor")

    return all_results
```

### Pattern 7: Change Detection via Timestamp Filter

The polling service detects changes by querying for pages modified after the last sync:

```python
async def query_modified_since(
    self,
    database_id: str,
    since_timestamp: datetime,
) -> list[dict]:
    """Get pages edited after a specific time."""
    filter_params = {
        "timestamp": "last_edited_time",
        "last_edited_time": {
            "after": since_timestamp.strftime("%Y-%m-%dT%H:%M:%S.000Z")
        },
    }
    return await self.query_all_pages(database_id, filter_params)
```

### Pattern 8: Batch Page Fetching with Error Tolerance

Fetch multiple pages concurrently with graceful error handling:

```python
async def get_pages_batch(self, page_ids: list[str]) -> list[dict]:
    """Concurrently fetch pages; skip failures gracefully."""
    tasks = [self.get_page(pid) for pid in page_ids]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    pages = []
    for i, result in enumerate(results):
        if isinstance(result, Exception):
            logger.error(f"Failed to fetch page {page_ids[i]}: {result}")
        else:
            pages.append(result)
    return pages
```

### Pattern 9: Multi-Key Rate Multiplexing

For higher throughput, configure multiple API keys. Each key gets its own token bucket (3 req/s each). The `KeyPool` round-robins read requests across all keys while writes use key `01` as the canonical write key.

```python
# Environment variables (in .env)
NOTION_API_KEY_01=ntn_key_01_here
NOTION_API_KEY_02=ntn_key_02_here
NOTION_API_KEY_03=ntn_key_03_here

# The RateLimiterConfig picks these up automatically
config = RateLimiterConfig.from_env()
# config.all_read_keys → [key_01, key_02, key_03]  (non-empty only)
# config.write_key     → key_01 only
```

Canonical naming is `NOTION_API_KEY_01..NN` (zero-padded). Legacy single-key `NOTION_API_KEY` may still be accepted as a fallback in some services, but named slot keys are deprecated.

How the key pool classifies operations:

| HTTP Method | Endpoint Pattern | Classification |
|-------------|-----------------|----------------|
| `GET` | any | **Read** — round-robin across all keys |
| `POST` | `databases/*/query` | **Read** — round-robin across all keys |
| `POST` | `search` | **Read** — round-robin across all keys |
| `POST` | anything else | **Write** — primary key only |
| `PATCH` | any | **Write** — primary key only |
| `DELETE` | any | **Write** — primary key only |

### Pattern 10: Multi-Integration Architecture (notion_polling)

The `notion_polling` service supports an optional multi-integration layer on top of the rate limiter. This uses `MultiIntegrationNotionClient` from `notion_archival` which routes requests to different Notion integrations based on operation type.

```python
# In notion_polling/src/main.py startup:
try:
    from notion_polling_multi_integration import initialize_polling_with_multi_integration
    await initialize_polling_with_multi_integration()
    logger.info("Multi-integration support initialized")
except Exception as e:
    # Graceful degradation — works fine without it
    logger.warning(f"Multi-integration failed, using single integration: {e}")
```

This is **optional** — the service works correctly with a single API key.

## Request Priority Levels

| Priority | Value | Use Case |
|----------|-------|----------|
| `CRITICAL` | 1 | Webhook responses, UI-blocking operations |
| `HIGH` | 2 | User-initiated actions, JIT refresh |
| `NORMAL` | 3 | Standard polling and sync (default) |
| `LOW` | 4 | Background reconciliation, bulk operations |

## HTTP Client Details

The low-level HTTP client uses `httpx.AsyncClient`:

```python
# Headers set automatically by NotionHTTPClient
headers = {
    "Authorization": f"Bearer {api_key}",
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json",
    "User-Agent": "notion-rate-limiter/notion-archival",
}

# SSL verification is OFF by default (for corporate networks with SSL inspection)
# Override via RateLimiterConfig.ssl_verify
```

**API Base URL:** `https://api.notion.com/v1/`
**API Version:** `2022-06-28` (hardcoded; update in `notion_rate_limiter/client.py`)

## Token Bucket Rate Limiting

Settings tuned for Notion's documented limits:

| Parameter | Default | Notion Limit | Notes |
|-----------|---------|--------------|-------|
| `requests_per_second` | 2.5 | 3.0 | Safety margin to avoid 429s |
| `burst_size` | 5 | ~10 tolerated | Max concurrent burst |
| `retry_base_delay` | 1.0s | — | Exponential backoff start |
| `retry_max_delay` | 60.0s | — | Backoff ceiling |
| `max_retries` | 3 | — | Per-request retry limit |

Cross-process coordination uses file-based state at `locks/notion_rate_limiter.lock` and `locks/notion_rate_limiter_state_{keyhash}.json` so multiple services (polling + update + archival) share the rate limit.

## Error Handling

The rate limiter provides typed exceptions:

```python
from notion_rate_limiter import (
    NotionAPIError,          # Base API error (has status_code, response_body)
    NotionAuthError,         # 401/403 — bad or expired API key
    NotionNotFoundError,     # 404 — page/database doesn't exist
    NotionConflictError,     # 409 — conflict
    NotionValidationError,   # 400 — bad request body
    RateLimitExceededError,  # 429 — rate limited (has retry_after)
    RequestTimeoutError,     # Timeout
)

try:
    response = await limiter.get_page("abc123")
except RateLimitExceededError as e:
    logger.warning(f"Rate limited, retry after {e.retry_after}s")
except NotionNotFoundError:
    logger.warning("Page not found — may have been deleted")
except NotionAuthError:
    logger.error("API key invalid or integration not shared with page")
except NotionAPIError as e:
    logger.error(f"Notion error {e.status_code}: {e}")
```

## Environment Variables Reference

### Required

| Variable | Example | Description |
|----------|---------|-------------|
| `NOTION_API_KEY_01` | `ntn_1346940...` | Canonical write key and first discovered integration |
| `NOTION_JOBS_DATABASE_ID` | `2fc322d6-dcde-80be-...` | Jobs/Production database |
| `NOTION_PIECES_DATABASE_ID` | `2fc322d6-dcde-8088-...` | Pieces database |

### Optional (Multi-Key)

| Variable | Description |
|----------|-------------|
| `NOTION_API_KEY_02..NN` | Additional discovered keys for round-robin read multiplexing |

Backward compatibility note: `NOTION_API_KEY` can be used as transitional fallback where supported, but new configuration should use numbered keys.

### Rate Limiter Tuning

| Variable | Default | Description |
|----------|---------|-------------|
| `NOTION_RATE_LIMITER_REQUESTS_PER_SECOND` | `2.5` | Target req/s |
| `NOTION_RATE_LIMITER_BURST_SIZE` | `5` | Token bucket capacity |
| `NOTION_RATE_LIMITER_TIMEOUT_SECONDS` | `30.0` | Request timeout |
| `NOTION_RATE_LIMITER_MAX_RETRIES` | `3` | Retry attempts |
| `NOTION_RATE_LIMITER_SSL_VERIFY` | `false` | SSL cert verification |

### Polling Intervals

| Variable | Default | Description |
|----------|---------|-------------|
| `POLL_INTERVAL_JOBS` | `30` | Seconds between job polls |
| `POLL_INTERVAL_PIECES` | `30` | Seconds between piece polls |
| `POLL_INTERVAL_SLABS` | `60` | Seconds between slab polls |
| `POLL_INTERVAL_CUSTOMERS` | `300` | Seconds between customer polls |
| `POLL_INTERVAL_STONE_COLOURS` | `300` | Seconds between colour polls |

## File Structure

```
notion_rate_limiter/            # Shared rate limiter library
├── __init__.py                 # Public API exports
├── client.py                   # NotionHTTPClient (httpx-based)
├── config.py                   # RateLimiterConfig (pydantic)
├── exceptions.py               # Typed exception hierarchy
├── key_pool.py                 # Multi-key round-robin pool
├── limiter.py                  # NotionRateLimiter (main class)
├── token_bucket.py             # Token bucket algorithm
├── cross_process.py            # File-based cross-process locking
├── request_queue.py            # Priority request queue
├── metrics.py                  # Request metrics & health checks
├── INTEGRATION_GUIDE.md        # Migration guide
└── adapters/
    ├── __init__.py
    ├── polling_adapter.py      # NotionPollingClient
    ├── update_adapter.py       # NotionUpdateClient
    └── archival_adapter.py     # ArchivalNotionClient

notion_polling/src/
├── config.py                   # Settings (pydantic-settings, loads .env)
├── main.py                     # Service entry point
├── notion/
│   └── client.py               # NotionClient (delegates to rate limiter)
├── poller/
│   ├── change_detector.py      # Detects changes via timestamp filters
│   └── scheduler.py            # APScheduler-based polling loop
└── notion_polling_multi_integration.py  # Optional multi-integration layer
```

## Common Pitfalls

1. **Never exceed 3 req/s per API key.** Notion's documented limit is 3 requests/second per integration. The rate limiter defaults to 2.5 req/s for safety. If you bypass the rate limiter, you **will** get 429 errors.

2. **Always clean up clients on shutdown.** Call `await client.close()` or use the async context manager. Failing to close leaves `httpx` connections open and may cause resource leaks.

3. **Don't use `notion-client` SDK directly.** This workspace uses raw HTTP via `httpx` through the rate limiter — not the `notion-client` Python SDK. The SDK has its own retry logic that conflicts with the shared rate limiter.

4. **Pagination is required.** Notion returns max 100 items per query. Always use `query_all_pages()` or handle `has_more` / `next_cursor` manually.

5. **SSL verification is disabled by default.** The workspace runs behind corporate SSL inspection. If deploying externally, set `ssl_verify=True` in `RateLimiterConfig`.

6. **Multi-key rotation only helps reads.** Writes always go through the primary key. Adding more keys only increases read throughput (database queries, page fetches).

7. **Cross-process lock files must be writable.** The `locks/` directory must exist and be writable by all services sharing the rate limit. The rate limiter creates it automatically, but container deployments may need volume mounts.

8. **Test workspace IDs start with `2fc322d6-dcde-`.** Production IDs have different prefixes. Always verify your `.env` points to the correct workspace before running destructive operations.

## Complete Working Example

Minimal service that polls a single Notion database for changes:

```python
import asyncio
from datetime import datetime, timezone, timedelta
from notion_rate_limiter import NotionRateLimiter, RateLimiterConfig, RequestPriority

async def poll_for_changes():
    config = RateLimiterConfig(
        api_key="ntn_your_key_here",
        requests_per_second=2.5,
        burst_size=5,
    )

    async with NotionRateLimiter(config) as limiter:
        database_id = "your-database-id"
        since = datetime.now(timezone.utc) - timedelta(minutes=5)

        # Query modified pages
        response = await limiter.query_database(
            database_id=database_id,
            filter_query={
                "timestamp": "last_edited_time",
                "last_edited_time": {
                    "after": since.strftime("%Y-%m-%dT%H:%M:%S.000Z"),
                },
            },
            sorts=[{"timestamp": "last_edited_time", "direction": "descending"}],
            priority=RequestPriority.NORMAL,
        )

        if response.is_success:
            pages = response.data.get("results", [])
            print(f"Found {len(pages)} modified pages")

            # Handle pagination
            while response.data.get("has_more"):
                response = await limiter.query_database(
                    database_id=database_id,
                    filter_query={
                        "timestamp": "last_edited_time",
                        "last_edited_time": {
                            "after": since.strftime("%Y-%m-%dT%H:%M:%S.000Z"),
                        },
                    },
                    start_cursor=response.data["next_cursor"],
                    priority=RequestPriority.NORMAL,
                )
                pages.extend(response.data.get("results", []))

            # Process each changed page
            for page in pages:
                page_id = page["id"]
                last_edited = page["last_edited_time"]
                title_prop = page.get("properties", {}).get("Name", {})
                print(f"  Page {page_id[:8]}... edited at {last_edited}")

if __name__ == "__main__":
    asyncio.run(poll_for_changes())
```
