---
applyTo: "**/notion/**,**/*notion*.*"
---

# Notion Dev Containers MCP - Agent Instructions

This document provides comprehensive guidance for AI agents on how to use the Notion Dev Containers MCP (Model Context Protocol) server effectively.

---

## Overview

The `notion-dev-containers` MCP server provides tools for managing containerized Notion services running via Podman/Docker. It enables agents to:

- Monitor container status and health
- View and search container logs
- Start, stop, and restart services
- Execute commands inside containers
- Manage the entire container stack

---

## Available Services

The MCP server manages the following containerized services:

| Service | Container Name | Port | Description |
|---------|---------------|------|-------------|
| `polling` | notion-polling | 8080 | Polls Notion API for changes, syncs to MSSQL |
| `api` | notion-api | 8000 | FastAPI REST service for write operations |
| `archival-grpc` | notion-archival-grpc | 50051 (gRPC) | gRPC server for archival operations |
| `notion-sync` | notion-sync | 50054 (gRPC) | Queue worker for sync operations |
| `notion-jit` | notion-jit | 50055 (gRPC) | JIT (Just-In-Time) refresh service |
| `gateway` | gateway | 8000 | FastAPI gateway service |
| `nginx-gateway` | nginx-gateway | 80 | Nginx reverse proxy |
| `redis` | notion-redis | 6379 | Redis cache for gateway |
| `stonepro-service` | stonepro-service | 8080 | StonePro ERP integration |

---

## Tool Reference

### 1. Monitoring & Status Tools

#### `list_services`
Lists all services and their current status at a glance.

**Parameters:** None

**Use when:** You need a quick overview of which containers are running, stopped, or have errors.

**Example output:**
```markdown
# Notion Container Services Status

## 🟢 Running
- **polling** (notion-polling): ✅ healthy
- **api** (notion-api): ✅ healthy

## 🔴 Stopped
- **redis** (notion-redis): exited

## ⚪ Not Found
- **gateway** (gateway): container not created
```

---

#### `service_status`
Get detailed status for a specific service including health, ports, and resource usage.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `service` | string | ✅ | Service name (see Available Services table) |

**Use when:** You need deep diagnostic info about a specific service—its health state, uptime, port mappings, and CPU/memory usage.

---

#### `health_check_all`
Run health checks on all services and return a summary.

**Parameters:** None

**Use when:** You want to quickly determine the overall health of the container stack without needing port or resource details.

**Example output:**
```markdown
# Health Check Summary

**Summary:** 5 healthy, 2 unhealthy, 2 unknown

🟢 **polling**: healthy
🟢 **api**: healthy
🔴 **redis**: stopped
⚪ **gateway**: not deployed
```

---

#### `get_resource_usage`
Get CPU and memory usage for a specific service.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `service` | string | ✅ | Service name |

**Use when:** You need to check if a service is consuming excessive resources or to diagnose performance issues.

**Example output:**
```markdown
# Resource Usage: polling

- **CPU:** 2.34%
- **Memory:** 156.2MiB / 2GiB (7.62%)
- **Network I/O:** 1.2MB / 456KB
- **Block I/O:** 12MB / 4MB
```

---

### 2. Log Tools

#### `get_logs`
Get logs from a container service with optional filtering.

**Parameters:**
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `service` | string | ✅ | - | Service name |
| `lines` | integer | ❌ | 100 | Number of log lines to retrieve |
| `filter` | string | ❌ | - | Regex pattern to filter logs |
| `since` | string | ❌ | - | Show logs since timestamp (e.g., `10m`, `1h`, `2024-01-01`) |

**Use when:** You need to inspect logs from a specific service, especially when debugging issues.

**Best practices:**
- Start with `lines: 50` for quick checks
- Use `filter` with regex like `"error|exception|failed"` to find problems
- Use `since: "10m"` to focus on recent activity

---

#### `search_logs`
Search logs across multiple services for a pattern.

**Parameters:**
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `pattern` | string | ✅ | - | Regex pattern to search for |
| `services` | array | ❌ | all | List of services to search |
| `lines` | integer | ❌ | 500 | Lines to search per service |

**Use when:** You need to find occurrences of errors, warnings, or specific events across the entire stack.

**Example patterns:**
- `"error|exception"` - Find all errors
- `"request.*failed"` - Find failed requests
- `"notion.*api"` - Find Notion API related logs
- `"status.*5[0-9]{2}"` - Find HTTP 5xx errors

---

### 3. Service Control Tools

#### `start_service`
Start a stopped container service.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `service` | string | ✅ | Service name to start |

**Use when:** A service is stopped and needs to be started.

---

#### `stop_service`
Stop a running container service.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `service` | string | ✅ | Service name to stop |

**Use when:** You need to gracefully stop a service (e.g., before maintenance or to free resources).

---

#### `restart_service`
Restart a container service.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `service` | string | ✅ | Service name to restart |

**Use when:** A service is behaving unexpectedly and needs a fresh start, or after configuration changes.

---

#### `rebuild_service`
Rebuild a service's container image.

**Parameters:**
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `service` | string | ✅ | - | Service name to rebuild |
| `no_cache` | boolean | ❌ | false | Build without using cache |

**Use when:** Code changes have been made and the container image needs to be rebuilt. Use `no_cache: true` if you suspect caching issues.

⚠️ **Note:** Rebuilding takes time. The service will be unavailable during the rebuild.

---

### 4. Compose Management Tools

#### `compose_up`
Start all services using podman-compose.

**Parameters:**
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `detach` | boolean | ❌ | true | Run in detached mode |

**Use when:** You need to bring up the entire container stack at once.

---

#### `compose_down`
Stop and remove all containers.

**Parameters:**
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `volumes` | boolean | ❌ | false | Also remove volumes |

**Use when:** You need to tear down the entire stack. Use `volumes: true` only if you want to clear all persisted data.

⚠️ **Caution:** Using `volumes: true` will delete all data in container volumes!

---

### 5. Container Interaction Tools

#### `exec_command`
Execute a command inside a running container.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `service` | string | ✅ | Service name |
| `command` | string | ✅ | Shell command to execute |

**Use when:** You need to run diagnostic commands, check file contents, or interact with the container's internal environment.

**Example commands:**
- `ls -la /app` - List application files
- `cat /app/config.py` - View configuration
- `pip list` - List installed Python packages
- `env | grep NOTION` - Check Notion-related env vars
- `ps aux` - View running processes
- `df -h` - Check disk usage

---

#### `get_env`
Get environment variables from a running container (sensitive values are masked).

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `service` | string | ✅ | Service name |

**Use when:** You need to verify environment configuration. Note that values containing "password", "secret", "key", or "token" are automatically masked for security.

---

#### `get_ports`
Get port mappings for a service.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `service` | string | ✅ | Service name |

**Use when:** You need to know which host ports are mapped to a container's internal ports.

---

## Common Workflows

### Debugging a Service Issue

1. **Check overall status:**
   ```
   list_services
   ```

2. **Get detailed status for the problematic service:**
   ```
   service_status(service: "polling")
   ```

3. **Check recent logs for errors:**
   ```
   get_logs(service: "polling", lines: 100, filter: "error|exception|failed")
   ```

4. **If needed, restart the service:**
   ```
   restart_service(service: "polling")
   ```

### Finding Errors Across All Services

1. **Search all logs for errors:**
   ```
   search_logs(pattern: "error|exception|traceback", lines: 500)
   ```

2. **Narrow down to specific services if needed:**
   ```
   search_logs(pattern: "connection refused", services: ["api", "gateway"])
   ```

### Deploying Code Changes

1. **Rebuild the affected service:**
   ```
   rebuild_service(service: "api", no_cache: false)
   ```

2. **Restart to pick up changes:**
   ```
   restart_service(service: "api")
   ```

3. **Verify it's healthy:**
   ```
   service_status(service: "api")
   ```

### Starting Fresh

1. **Tear everything down:**
   ```
   compose_down(volumes: false)
   ```

2. **Bring everything up:**
   ```
   compose_up(detach: true)
   ```

3. **Verify health:**
   ```
   health_check_all
   ```

### Investigating Resource Issues

1. **Check resource usage:**
   ```
   get_resource_usage(service: "archival-grpc")
   ```

2. **If high CPU, check what's running:**
   ```
   exec_command(service: "archival-grpc", command: "ps aux | head -20")
   ```

---

## Error Handling

### Container Runtime Unavailable

If you see "Container runtime unavailable" or similar errors:

1. **On Windows:** The Podman VM may not be running. The user needs to run:
   ```
   podman machine start
   ```

2. **Check if Podman is installed:** The runtime might not be installed at all.

### Service Not Found

If a service shows as "not found":
- The container hasn't been created yet
- Run `compose_up` to create all containers

### Compose Command Failures

If compose commands fail with "command not found":
- `podman-compose` may not be installed
- The user can either install it (`pip install podman-compose`) or set `COMPOSE_CMD=podman compose`

---

## Environment Variables

The MCP server behavior can be customized via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `CONTAINER_RUNTIME` | `podman` | Container runtime (`podman` or `docker`) |
| `COMPOSE_CMD` | `podman compose` (Windows) / `podman-compose` (Linux) | Compose command |
| `COMPOSE_FILE` | `podman-compose.yml` | Compose file name |
| `MCP_CONTAINER_CMD_TIMEOUT` | `10` | Timeout for container commands (seconds) |
| `MCP_COMPOSE_TIMEOUT` | `120` | Timeout for compose commands (seconds) |

---

## Best Practices for Agents

1. **Always start with `list_services` or `health_check_all`** to understand the current state before taking action.

2. **Use filtered log queries** instead of fetching thousands of lines—be specific with regex patterns.

3. **Check status after actions** - After starting, stopping, or restarting a service, verify with `service_status`.

4. **Be cautious with `compose_down(volumes: true)`** - This deletes all persistent data.

5. **Use `search_logs` for cross-service debugging** - It's more efficient than checking each service individually.

6. **Mask sensitive data** - The `get_env` tool masks passwords automatically, but be careful when using `exec_command` with commands that might expose secrets.

7. **Timeouts** - Compose operations can take time (up to 120 seconds). Be patient with `compose_up` and `rebuild_service`.

---

## Quick Reference Card

| Task | Tool | Key Parameters |
|------|------|----------------|
| See all service states | `list_services` | - |
| Deep-dive one service | `service_status` | `service` |
| Quick health check | `health_check_all` | - |
| View logs | `get_logs` | `service`, `lines`, `filter` |
| Search all logs | `search_logs` | `pattern`, `services` |
| Start service | `start_service` | `service` |
| Stop service | `stop_service` | `service` |
| Restart service | `restart_service` | `service` |
| Rebuild image | `rebuild_service` | `service`, `no_cache` |
| Run command in container | `exec_command` | `service`, `command` |
| Check env vars | `get_env` | `service` |
| Check ports | `get_ports` | `service` |
| Check resources | `get_resource_usage` | `service` |
| Start all services | `compose_up` | `detach` |
| Stop all services | `compose_down` | `volumes` |
