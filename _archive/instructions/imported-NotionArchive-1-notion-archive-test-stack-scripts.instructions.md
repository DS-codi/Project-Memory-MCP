---
applyTo: "**/*"
---

# Test Stack Operations — Script Reference

All scripts live in `container/` and target the test environment on **ds-app01** (10.0.0.253).

---

## rebuild-test-stack.ps1

Builds container images locally for the test environment. Does **not** deploy — use `deploy-to-vm-test.ps1` after building.

### Usage

```powershell
.\rebuild-test-stack.ps1 -All                          # Full rebuild (base + all services)
.\rebuild-test-stack.ps1 -Service sync-test             # Rebuild a single service
.\rebuild-test-stack.ps1 -KpiOnly                       # Rebuild only kpi-api + kpi-sync-worker
.\rebuild-test-stack.ps1 -NotionOnly                    # Rebuild base + Notion services (no KPI/infra)
.\rebuild-test-stack.ps1 -All -DryRun                   # Preview without executing
.\rebuild-test-stack.ps1 -All -Exclude polling-test     # Rebuild all except polling + its dependents
.\rebuild-test-stack.ps1 -All -NoCache                  # Force full layer rebuild
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `-All` | switch | Rebuild all images (notion-base, all Notion services, infra, KPI) |
| `-Service <name>` | string | Rebuild a single service. Valid values: `sync-test`, `archival-grpc-test`, `polling-test`, `api-test`, `jit-test`, `notion-update-test`, `gateway-test`, `notion-proxy-test`, `slab-watcher-test`, `nginx-test`, `stonepro-test`, `stonepro-grpc-test`, `kpi-api-test`, `kpi-sync-worker-test` |
| `-KpiOnly` | switch | Rebuild only `kpi-api:test` and `kpi-sync-worker:test` |
| `-NotionOnly` | switch | Rebuild `notion-base:test` plus all Notion service images |
| `-Exclude <services>` | string[] | Exclude services (and their dependents) from the build. Comma-separated service names |
| `-NoCache` | switch | Pass `--no-cache` to podman build, forcing a full layer rebuild |
| `-DryRun` | switch | Preview all build commands without executing them |
| `-Force` | switch | Skip confirmation prompts |

### Notes

- Images are tagged `:test` only — production tags are never created.
- Build logs are saved to `container/image build logs/`.
- Dependency graph is loaded from `dependencies.test.env` — excluding a service also excludes anything that depends on it.

---

## deploy-to-vm-test.ps1

Pushes locally-built `:test` images to the LAN registry (`10.0.0.253:5000`), pulls them on the VM, and optionally restarts containers. Generates a timestamped deploy log.

### Usage

```powershell
.\deploy-to-vm-test.ps1 -RestartAll                    # Push all + full stack restart
.\deploy-to-vm-test.ps1 -Services polling,sync -Restart # Push + restart specific services
.\deploy-to-vm-test.ps1 -DryRun                         # Preview (no changes, still captures image IDs)
.\deploy-to-vm-test.ps1 -RestartAll -DryRun              # Dry-run full deploy (writes log with [DRY RUN])
.\deploy-to-vm-test.ps1 -Services gateway -List          # Show registry tags for gateway image
.\deploy-to-vm-test.ps1 -RestartAll -Exclude kpi-api     # Deploy all except kpi-api + its dependents
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `-Services <keys>` | string[] | Comma-separated service keys to deploy. Omit to deploy all. Valid keys: `polling`, `api`, `archival`, `sync`, `jit`, `update`, `gateway`, `nginx`, `stonepro`, `stonepro-grpc`, `kpi-api`, `kpi-sync-worker`, `notion-proxy`, `slab-watcher` |
| `-Exclude <keys>` | string[] | Exclude services (and their dependents) from the deploy |
| `-Restart` | switch | After pushing, tear down and recreate just the affected containers + their dependents |
| `-RestartAll` | switch | After pushing, full `compose down` + `compose up -d` on the VM |
| `-NoPull` | switch | Push images to registry but skip SSH pull/retag/restart steps |
| `-List` | switch | List tags available in the registry for specified services, then exit |
| `-DryRun` | switch | Preview all operations without executing. Still captures local image IDs and writes a `[DRY RUN]` log |
| `-Force` | switch | Skip confirmation prompts |

### Deploy Phases

1. **Tag + push** — Tags local `:test` images for the registry, pushes them
2. **Targeted cleanup** (when `-Restart`):
   - Phase A: Stop + remove **dependent** containers first (services that depend on the targets)
   - Phase B: Stop + remove + `rmi` the **targeted** containers and their old images
3. **Compose up** — Recreates targeted containers + all dependents via `podman-compose up -d`
4. **Health checks** — Gateway aggregated check + direct endpoint probes (live runs only)

### Run Log

Every run (including dry-run) generates a timestamped log file: `deploy-test-YYYYMMDD-HHmmss.log`

Log sections:
- `PRE-DEPLOY VM STATE` — All containers with image IDs before any changes
- `DEPENDENTS STOPPED` — Containers stopped because they depend on targets
- `IMAGES REMOVED FROM VM` — Old images removed + prune results
- `IMAGES PUSHED` — Local image IDs pushed to registry
- `FINAL CONTAINER IMAGE IDs ON VM` — Post-deploy container state
- `HEALTH CHECKS` — Gateway aggregated + direct probe results

### Dependency Management

Dependencies are loaded from `dependencies.test.env` (single source of truth shared with `rebuild-test-stack.ps1`). When deploying specific services:
- All transitive dependents are automatically stopped before the target
- All dependents are recreated alongside the target during compose up

---

## health-check-test.ps1

Standalone health check for the test stack. Three-phase check: container state, gateway aggregated health, and direct endpoint probes.

### Usage

```powershell
.\health-check-test.ps1                                # Full check (all 3 phases)
.\health-check-test.ps1 -Quick                          # Skip gateway aggregated check
.\health-check-test.ps1 -Json                           # Output results as JSON
.\health-check-test.ps1 -RetryCount 3 -RetryDelay 10    # Retry gateway check 3 times
.\health-check-test.ps1 -Timeout 15                     # 15s HTTP timeout
```

### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `-Target` | string | `ds-app01` | SSH target host |
| `-GatewayUrl` | string | `http://10.0.0.253:8002` | Gateway service base URL |
| `-NginxUrl` | string | `http://10.0.0.253:8082` | Nginx frontend base URL |
| `-Quick` | switch | | Skip the gateway aggregated check (Phase 2) |
| `-Json` | switch | | Output structured results as JSON |
| `-Timeout` | int | `10` | HTTP request timeout in seconds |
| `-RetryCount` | int | `1` | Number of retries for the gateway aggregated check |
| `-RetryDelay` | int | `5` | Seconds between retries |

### Check Phases

| Phase | What it checks | Method |
|-------|----------------|--------|
| 1. Container state | All 16 expected containers exist and are running/healthy | SSH + `podman ps` |
| 2. Gateway aggregated | All gRPC services, database, KPI API via one endpoint | `GET /health/services/detailed` on gateway (port 8002) |
| 3. Direct probes | nginx, gateway, api, notion-proxy, stonepro, kpi-api, kpi-sync-worker | Direct HTTP `GET /health` on each service port |

### Direct Probe Endpoints

| Service | Endpoint |
|---------|----------|
| nginx | `http://10.0.0.253:8082/health` |
| gateway | `http://10.0.0.253:8002/health` |
| api | `http://10.0.0.253:8001/health` |
| notion-proxy | `http://10.0.0.253:50080/health` |
| stonepro | `http://10.0.0.253:8003/api/v1/health` |
| kpi-api | `http://10.0.0.253:8101/health` |
| kpi-sync-worker | `http://10.0.0.253:8102/health` |

---

## logs-test.ps1

Retrieves container logs from the test stack via SSH. Each container's logs are saved to a separate file under a timestamped folder at the project root (`logs/<YYYYMMDD_HHmm>-logs/<container>.log`). The terminal shows a compact summary table instead of raw log output.

### Usage

```powershell
.\logs-test.ps1                                        # Save all containers to logs/<ts>-logs/
.\logs-test.ps1 -Tail                                  # Last 50 combined lines (all containers, terminal)
.\logs-test.ps1 -Tail -Lines 100                       # Last 100 combined lines
.\logs-test.ps1 -Tail -Grep "ERROR"                    # Combined view, only errors
.\logs-test.ps1 -Lines 100                             # Last 100 lines from all, saved per file
.\logs-test.ps1 -Lines 0                               # ALL lines (careful!)
.\logs-test.ps1 -Containers "proxy,polling"             # Specific containers (auto-prints to terminal)
.\logs-test.ps1 -Containers proxy -Follow               # Tail one container in real time
.\logs-test.ps1 -Grep "ERROR|WARN" -Lines 200           # Filter for errors/warnings
.\logs-test.ps1 -Since 1h                               # Only last hour of logs
.\logs-test.ps1 -Print                                   # Save AND print all to terminal
.\logs-test.ps1 -LogsDir C:\temp\logs                    # Custom output directory
```

### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `-Target` | string | `ds-app01` | SSH target host |
| `-Containers` | string | (all) | Comma-separated container names. **Must be quoted when specifying multiple** (e.g. `"kpi,gateway"`). Supports short aliases (see below) |
| `-Lines` | int | `50` | Number of log lines per container (batch) or total combined lines (tail). `0` = all |
| `-Since` | string | | Only show logs since this duration (`1h`, `30m`, `2h30m`) |
| `-Tail` | switch | | **Combined terminal view**: merge timestamped logs from all containers chronologically, print last `-Lines` combined lines. No files saved |
| `-Follow` | switch | | Tail logs in real time. **Single container only**. Terminal output only (no file saved) |
| `-Grep` | string | | Filter log lines by regex pattern (applied after retrieval) |
| `-Print` | switch | | Also print log contents to terminal. Auto-enabled when targeting ≤ 3 containers |
| `-NoColor` | switch | | Disable colored output |
| `-LogsDir` | string | `<project-root>/logs` | Override the base logs directory |

### Modes

| Mode | Trigger | Output | Use case |
|------|---------|--------|----------|
| **Batch** (default) | No `-Tail` or `-Follow` | Per-container files + summary table | Full log capture for later review |
| **Tail** | `-Tail` | Combined chronological view in terminal | Quick "what just happened" glance |
| **Follow** | `-Follow` | Real-time stream in terminal | Live monitoring of one container |

**Tail mode** output looks like:

```
  [gateway]        09:18:04 INFO  Server started on port 8000
  [notion-proxy]   09:18:05 INFO  Proxy ready, upstream: notion-api
  [polling]        09:18:06 INFO  Poll cycle starting, interval=300s
  [gateway]        09:18:07 WARN  Slow upstream response: 2.3s
```

Lines are tagged with `[container-name]` (with `-test` suffix stripped), prefixed with `HH:MM:SS`, and sorted chronologically.

### Output Structure

```
NotionArchive/
  logs/
    20260224_0935-logs/
      redis-test.log
      notion-proxy-test.log
      notion-polling-test.log
      gateway-test.log
      ...
    20260224_1042-logs/
      ...
```

Each run creates a new timestamped folder. One `.log` file per container. The terminal displays a summary table:

```
  Container                       Status     Lines   File
  ────────────────────────────────────────────────────────────────
  redis-test                       OK              50   logs\20260224_0935-logs\redis-test.log
  notion-proxy-test                2E 1W           50   logs\20260224_0935-logs\notion-proxy-test.log
  gateway-test                     OK              50   logs\20260224_0935-logs\gateway-test.log
```

Status column shows `OK`, error/warning counts (`2E`, `3W`), `EMPTY`, `NOT FOUND`, or `ERROR`.

### Container Aliases

Short names resolve to full container names automatically:

| Alias | Container |
|-------|-----------|
| `proxy`, `notion-proxy` | notion-proxy-test |
| `polling`, `notion-polling` | notion-polling-test |
| `api`, `notion-api` | notion-api-test |
| `gateway` | gateway-test |
| `nginx` | nginx-gateway-test |
| `archival`, `archival-grpc` | notion-archival-grpc-test |
| `sync`, `notion-sync` | notion-sync-test |
| `jit`, `notion-jit` | notion-jit-test |
| `update`, `notion-update` | notion-update-grpc-test |
| `stonepro` | stonepro-service-test |
| `stonepro-grpc` | stonepro-grpc-test |
| `kpi`, `kpi-api` | kpi-api-test |
| `kpi-sync`, `kpi-worker`, `kpi-sync-worker` | kpi-sync-worker-test |
| `slab`, `slab-watcher` | slab-scan-watcher-test |
| `redis` | redis-test |
| `kpi-redis` | kpi-redis-test |
| `mssql`, `mssql-na` | mssql-test-notionarchive |
| `mssql-sp` | mssql-test-stonepro |
| `ngrok` | ngrok-tunnel-test |

### Log Level Coloring

When output is colorized (default), log lines are highlighted:
- **Red** — lines containing `ERROR`, `FATAL`, `CRITICAL`, `PANIC`
- **Yellow** — lines containing `WARN`, `WARNING`

---

## Shared Configuration

### dependencies.test.env

Single source of truth for compose service dependency mapping, used by both `deploy-to-vm-test.ps1` and `rebuild-test-stack.ps1`. Format:

```env
DEPENDS_<service_underscored>=<comma-separated-deps>
```

Underscores in service names are converted to hyphens at parse time. Example: `DEPENDS_polling_test=archival-grpc-test,notion-proxy-test,redis-test`

### Common Workflow

```
1. Build images        →  .\rebuild-test-stack.ps1 -All
2. Deploy to VM        →  .\deploy-to-vm-test.ps1 -RestartAll
3. Check health        →  .\health-check-test.ps1
4. View logs           →  .\logs-test.ps1 -Grep "ERROR" -Lines 100
5. Tail a service      →  .\logs-test.ps1 -Containers "proxy" -Follow
```
