#!/usr/bin/env python3
"""
Supervisor Zero-Downtime Upgrade Orchestrator
=============================================
Launched as a detached process by POST /api/fallback/services/supervisor/upgrade.

Steps:
  1. Verify supervisor is running (TCP Status request on port 45470)
  2. Stop MCP via supervisor control channel
  3. Start temporary standalone MCP on port 3457 (keeps MCP available during build)
  4. Build supervisor (cargo build --release -p supervisor)
  5. Stop temporary standalone MCP
  6. Start new supervisor as independent detached process
  7. Verify all managed services came back up (HTTP health checks)
  8. Write upgrade-report.json + text summary to network share
"""

import argparse
import json
import os
import socket
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

# ─── Constants ───────────────────────────────────────────────────────────────

SUPERVISOR_TCP_PORT = 45470
SERVICES = {
    "mcp":                  3457,
    "interactive_terminal": 3458,
    "dashboard":            3459,
    "fallback_api":         3465,
    "cli_mcp":              3466,
}
HEALTH_TIMEOUT_S = 30
BUILD_TIMEOUT_S  = 600   # 10 min max for cargo build

NETWORK_SHARE = r"D:\folder\folder-in-a-folder\shared-folder-in-a-folder"

# Windows process-creation flags
DETACHED_PROCESS        = 0x00000008
CREATE_NEW_PROCESS_GROUP = 0x00000200


# ─── Helpers ─────────────────────────────────────────────────────────────────

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def now_ms() -> int:
    return int(time.time() * 1000)

def log(msg: str, log_file=None):
    line = f"[{now_iso()}] {msg}"
    print(line, flush=True)
    if log_file:
        log_file.write(line + "\n")
        log_file.flush()


def send_supervisor_request(request: dict, timeout_s: float = 5.0) -> dict:
    """Send one NDJSON request to the supervisor TCP port and return the response."""
    payload = json.dumps(request).encode() + b"\n"
    with socket.create_connection(("127.0.0.1", SUPERVISOR_TCP_PORT), timeout=timeout_s) as sock:
        sock.sendall(payload)
        buf = b""
        sock.settimeout(timeout_s)
        while True:
            chunk = sock.recv(4096)
            if not chunk:
                break
            buf += chunk
            if b"\n" in buf:
                break
    line = buf.split(b"\n")[0].decode()
    return json.loads(line)


def http_get_ok(port: int, path: str = "/health", timeout_s: float = 3.0) -> bool:
    """Return True if GET http://127.0.0.1:<port><path> responds with HTTP 2xx."""
    import urllib.request, urllib.error
    url = f"http://127.0.0.1:{port}{path}"
    try:
        with urllib.request.urlopen(url, timeout=timeout_s) as resp:
            return 200 <= resp.status < 300
    except Exception:
        return False


def wait_for_http(port: int, path: str = "/health", timeout_s: float = 30.0) -> bool:
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        if http_get_ok(port, path):
            return True
        time.sleep(1.0)
    return False


def wait_for_file(file_path: Path, timeout_s: float = 30.0) -> bool:
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        if file_path.exists():
            return True
        time.sleep(0.5)
    return False


def make_step(step_n: int, name: str) -> dict:
    return {"step": step_n, "name": name, "status": "pending", "elapsed_ms": 0, "detail": ""}


def finish_step(step: dict, ok: bool, detail: str, start_ms: int) -> None:
    step["status"] = "ok" if ok else "failed"
    step["detail"] = detail
    step["elapsed_ms"] = now_ms() - start_ms


# ─── Main orchestrator ───────────────────────────────────────────────────────

def run(repo_root: Path, log_path: str, report_path: str) -> int:
    os.makedirs(os.path.dirname(log_path), exist_ok=True)
    log_file = open(log_path, "w", encoding="utf-8")

    steps = [
        make_step(1, "verify_supervisor"),
        make_step(2, "stop_mcp_via_supervisor"),
        make_step(3, "start_standalone_mcp"),
        make_step(4, "build_supervisor"),
        make_step(5, "stop_standalone_mcp"),
        make_step(6, "start_new_supervisor"),
        make_step(7, "verify_services"),
        make_step(8, "write_report"),
    ]

    overall_status = "success"
    standalone_mcp_proc = None
    build_output_lines: list[str] = []

    log(f"=== Supervisor Upgrade Orchestrator ===", log_file)
    log(f"repo_root   : {repo_root}", log_file)
    log(f"report_path : {report_path}", log_file)
    log(f"log_path    : {log_path}", log_file)

    # ── Step 1: Verify supervisor running ────────────────────────────────────
    s = steps[0]; t = now_ms()
    log(f"Step 1: Verifying supervisor on port {SUPERVISOR_TCP_PORT}...", log_file)
    try:
        resp = send_supervisor_request({"type": "Status"}, timeout_s=5.0)
        ok = resp.get("ok", False)
        finish_step(s, ok, json.dumps(resp)[:200], t)
        log(f"  → {'OK' if ok else 'FAILED'}: {resp}", log_file)
        if not ok:
            overall_status = "failed"
    except Exception as e:
        finish_step(s, False, str(e), t)
        overall_status = "failed"
        log(f"  → FAILED: {e}", log_file)

    if overall_status == "failed":
        return _write_report(steps, overall_status, {}, log_path, report_path, log_file)

    # ── Step 2: Stop MCP via supervisor ──────────────────────────────────────
    s = steps[1]; t = now_ms()
    log("Step 2: Stopping MCP via supervisor control...", log_file)
    try:
        resp = send_supervisor_request({"type": "Stop", "service": "mcp"}, timeout_s=10.0)
        ok = resp.get("ok", False)
        finish_step(s, ok, json.dumps(resp)[:200], t)
        log(f"  → {'OK' if ok else 'WARN (proceeding)'}: {resp}", log_file)
    except Exception as e:
        finish_step(s, False, str(e), t)
        log(f"  → WARN: {e} — proceeding anyway", log_file)

    time.sleep(1.0)  # brief drain

    # ── Step 3: Start temporary standalone MCP ───────────────────────────────
    s = steps[2]; t = now_ms()
    log("Step 3: Starting temporary standalone MCP on port 3457...", log_file)
    server_dir = repo_root / "server"
    env = {**os.environ, "PORT": "3457"}
    # Remove supervisor-attachment env so it doesn't try to reconnect
    env.pop("PM_SUPERVISOR_PIPE_PATH", None)
    env.pop("PM_ORCHESTRATION_SUPERVISOR_PIPE_PATH", None)

    try:
        creationflags = DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP if sys.platform == "win32" else 0
        standalone_mcp_proc = subprocess.Popen(
            ["node", "dist/server.js"],
            cwd=str(server_dir),
            env=env,
            creationflags=creationflags,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        reachable = wait_for_http(3457, "/health", timeout_s=30.0)
        finish_step(s, reachable, f"pid={standalone_mcp_proc.pid}, reachable={reachable}", t)
        log(f"  → {'OK' if reachable else 'WARN'}: pid={standalone_mcp_proc.pid}, health={reachable}", log_file)
    except Exception as e:
        finish_step(s, False, str(e), t)
        log(f"  → WARN: {e} — proceeding without standalone MCP", log_file)

    # ── Step 4: Build supervisor ──────────────────────────────────────────────
    s = steps[3]; t = now_ms()
    log("Step 4: Building supervisor (cargo build --release -p supervisor)...", log_file)
    try:
        proc = subprocess.Popen(
            ["cargo", "build", "--release", "-p", "supervisor"],
            cwd=str(repo_root),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
        )
        for line in proc.stdout:
            build_output_lines.append(line)
            log_file.write(line)
            log_file.flush()
        proc.wait(timeout=BUILD_TIMEOUT_S)
        exit_code = proc.returncode
        ok = exit_code == 0
        finish_step(s, ok, f"exit_code={exit_code}", t)
        log(f"  → {'OK' if ok else 'FAILED'}: exit_code={exit_code}", log_file)
        if not ok:
            overall_status = "failed"
    except Exception as e:
        finish_step(s, False, str(e), t)
        overall_status = "failed"
        log(f"  → FAILED: {e}", log_file)

    # ── Step 5: Stop standalone MCP ──────────────────────────────────────────
    s = steps[4]; t = now_ms()
    log("Step 5: Stopping temporary standalone MCP...", log_file)
    if standalone_mcp_proc is not None:
        try:
            standalone_mcp_proc.terminate()
            try:
                standalone_mcp_proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                standalone_mcp_proc.kill()
            finish_step(s, True, "terminated", t)
            log("  → OK: standalone MCP terminated", log_file)
        except Exception as e:
            finish_step(s, False, str(e), t)
            log(f"  → WARN: {e}", log_file)
    else:
        finish_step(s, True, "no standalone process to stop", t)
        log("  → OK: nothing to stop", log_file)

    if overall_status == "failed":
        return _write_report(steps, overall_status, {}, log_path, report_path, log_file)

    # ── Step 6: Start new supervisor ─────────────────────────────────────────
    s = steps[5]; t = now_ms()
    supervisor_exe = repo_root / "target" / "release" / "supervisor.exe"
    if not supervisor_exe.exists():
        supervisor_exe = repo_root / "target" / "release" / "supervisor"

    appdata = os.environ.get("APPDATA") or str(Path.home() / "AppData" / "Roaming")
    ports_json = Path(appdata) / "ProjectMemory" / "ports.json"

    log(f"Step 6: Starting new supervisor ({supervisor_exe})...", log_file)
    try:
        # Remove stale ports.json so we can detect fresh write
        if ports_json.exists():
            ports_json.unlink()

        creationflags = DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP if sys.platform == "win32" else 0
        new_sup = subprocess.Popen(
            [str(supervisor_exe)],
            cwd=str(repo_root / "target" / "release"),
            creationflags=creationflags,
            close_fds=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        appeared = wait_for_file(ports_json, timeout_s=30.0)
        finish_step(s, appeared, f"pid={new_sup.pid}, ports.json_appeared={appeared}", t)
        log(f"  → {'OK' if appeared else 'WARN'}: pid={new_sup.pid}, ports.json={appeared}", log_file)
        if not appeared:
            overall_status = "partial"
    except Exception as e:
        finish_step(s, False, str(e), t)
        overall_status = "failed"
        log(f"  → FAILED: {e}", log_file)
        return _write_report(steps, overall_status, {}, log_path, report_path, log_file)

    time.sleep(2.0)  # allow services to start

    # ── Step 7: Verify all services ──────────────────────────────────────────
    s = steps[6]; t = now_ms()
    log("Step 7: Verifying managed services...", log_file)
    services_after: dict = {}
    all_up = True
    for svc_name, port in SERVICES.items():
        reachable = wait_for_http(port, "/health", timeout_s=30.0)
        services_after[svc_name] = {"reachable": reachable, "port": port}
        log(f"  {svc_name}:{port} → {'UP' if reachable else 'DOWN'}", log_file)
        if not reachable:
            all_up = False

    finish_step(s, all_up, f"services_up={sum(v['reachable'] for v in services_after.values())}/{len(services_after)}", t)
    if not all_up and overall_status == "success":
        overall_status = "partial"

    return _write_report(steps, overall_status, services_after, log_path, report_path, log_file)


def _write_report(
    steps: list,
    overall_status: str,
    services_after: dict,
    log_path: str,
    report_path: str,
    log_file,
) -> int:
    s = steps[7]; t = now_ms()
    log(f"Step 8: Writing report (status={overall_status})...", log_file)

    report = {
        "timestamp": now_iso(),
        "status": overall_status,
        "steps": steps,
        "services_after": services_after,
        "build_output_path": log_path,
    }

    # Write upgrade-report.json for supervisor to consume on next launch
    try:
        os.makedirs(os.path.dirname(report_path), exist_ok=True)
        with open(report_path, "w", encoding="utf-8") as f:
            json.dump(report, f, indent=2)
        log(f"  → upgrade-report.json written: {report_path}", log_file)
    except Exception as e:
        log(f"  → WARN: could not write upgrade-report.json: {e}", log_file)

    # Write text summary to network share
    try:
        os.makedirs(NETWORK_SHARE, exist_ok=True)
        timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d_%H-%M-%S")
        summary_path = os.path.join(NETWORK_SHARE, f"supervisor_upgrade_{timestamp}.txt")
        with open(summary_path, "w", encoding="utf-8") as f:
            f.write(f"Supervisor Upgrade Report\n")
            f.write(f"========================\n")
            f.write(f"Timestamp : {report['timestamp']}\n")
            f.write(f"Status    : {overall_status}\n\n")
            f.write("Steps:\n")
            for step in steps:
                icon = "✓" if step["status"] == "ok" else ("✗" if step["status"] == "failed" else "?")
                f.write(f"  {icon} Step {step['step']}: {step['name']} [{step['status']}] ({step['elapsed_ms']}ms)\n")
                if step["detail"]:
                    f.write(f"       {step['detail']}\n")
            f.write("\nServices after upgrade:\n")
            for svc, info in services_after.items():
                icon = "UP  " if info.get("reachable") else "DOWN"
                f.write(f"  [{icon}] {svc} (port {info.get('port')})\n")
        log(f"  → text summary written: {summary_path}", log_file)
    except Exception as e:
        log(f"  → WARN: could not write network share summary: {e}", log_file)

    finish_step(s, True, "report written", t)
    log(f"=== Upgrade complete: {overall_status} ===", log_file)
    log_file.close()

    return 0 if overall_status in ("success", "partial") else 1


# ─── Entry point ─────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Supervisor zero-downtime upgrade orchestrator")
    parser.add_argument("--repo-root", required=True, help="Path to the monorepo root")
    parser.add_argument("--log-path",   required=True, help="Path to write the build/upgrade log")
    parser.add_argument("--report-path", required=True, help="Path to write upgrade-report.json")
    args = parser.parse_args()

    repo_root = Path(args.repo_root).resolve()
    sys.exit(run(repo_root, args.log_path, args.report_path))


if __name__ == "__main__":
    main()
