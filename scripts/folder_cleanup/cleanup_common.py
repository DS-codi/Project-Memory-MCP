from __future__ import annotations

import json
import os
import re
import shutil
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

STAGING_DIR_NAME = ".cleanup-staging"
REPORTS_DIR_NAME = "reports"
RECYCLE_BIN_DIR_NAME = "recycle-bin"
REFERENCE_EXTRACTS_DIR_NAME = "reference-extracts"
MANIFESTS_DIR_NAME = "manifests"


@dataclass(frozen=True)
class CleanupPaths:
    root: Path
    staging_root: Path
    reports_dir: Path
    recycle_bin_dir: Path
    reference_extracts_dir: Path
    manifests_dir: Path


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def iso_utc(value: datetime) -> str:
    return value.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def relpath_posix(path: Path) -> str:
    return path.as_posix()


def cleanup_paths(root: Path) -> CleanupPaths:
    staging_root = root / STAGING_DIR_NAME
    return CleanupPaths(
        root=root,
        staging_root=staging_root,
        reports_dir=staging_root / REPORTS_DIR_NAME,
        recycle_bin_dir=staging_root / RECYCLE_BIN_DIR_NAME,
        reference_extracts_dir=staging_root / REFERENCE_EXTRACTS_DIR_NAME,
        manifests_dir=staging_root / MANIFESTS_DIR_NAME,
    )


def ensure_staging_directories(root: Path) -> CleanupPaths:
    paths = cleanup_paths(root)
    paths.reports_dir.mkdir(parents=True, exist_ok=True)
    paths.recycle_bin_dir.mkdir(parents=True, exist_ok=True)
    paths.reference_extracts_dir.mkdir(parents=True, exist_ok=True)
    paths.manifests_dir.mkdir(parents=True, exist_ok=True)
    return paths


def load_json_file(path: Path) -> Dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def save_json_file(path: Path, data: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        json.dump(data, handle, indent=2)
        handle.write("\n")


def deep_merge(base: Dict[str, Any], override: Dict[str, Any]) -> Dict[str, Any]:
    merged: Dict[str, Any] = dict(base)
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = deep_merge(merged[key], value)
        else:
            merged[key] = value
    return merged


def default_config() -> Dict[str, Any]:
    return {
        "ignore_paths": [
            ".git",
            ".github",
            "node_modules",
            "target",
            STAGING_DIR_NAME,
            ".projectmemory",
            "dist",
            "build",
            "venv",
            ".venv",
            "__pycache__",
        ],
        "doc_extensions": [".md", ".rst", ".txt"],
        "script_extensions": [".ps1", ".py", ".sh", ".bat", ".cmd"],
        "stale_days": {
            "docs": 120,
            "scripts": 45,
        },
        "recent_guard_days": 14,
        "one_time_script_name_patterns": [
            "one-time",
            "one_time",
            "temp",
            "tmp",
            "ad-hoc",
            "adhoc",
            "quickfix",
            "hotfix",
            "migration-only",
            "copy",
            "backup",
        ],
        "one_time_script_content_patterns": [
            "one-time",
            "run once",
            "temporary",
            "quick workaround",
            "manual cleanup",
        ],
        "worthwhile_script_content_patterns": [
            "usage",
            "example",
            "function",
            "class",
            "param(",
            "todo",
            "note",
        ],
        "cleanup_candidate_path_patterns": [
            "archive",
            "backup",
            "old",
            "chat history",
            "copied for transfer",
            "tmp",
            "temp",
        ],
        "docs_categories": {
            "architecture": ["architecture", "design", "contract", "schema"],
            "operations": ["runbook", "guide", "setup", "troubleshooting", "install"],
            "reports": ["report", "audit", "validation", "checklist", "summary"],
            "plans": ["plan", "roadmap", "phase", "backlog"],
            "reference": ["reference", "api", "cookbook", "spec"],
            "history": ["history", "chat", "copied", "archive"],
        },
        "scripts_categories": {
            "build": ["build", "install", "compile", "package"],
            "test": ["test", "harness", "verify", "assert", "check"],
            "maintenance": ["cleanup", "migrate", "fix", "repair", "doctor"],
            "automation": ["deploy", "release", "sync", "seed", "bootstrap"],
            "diagnostics": ["debug", "inspect", "trace", "profile", "log"],
        },
    }


def load_config(config_path: Optional[Path]) -> Dict[str, Any]:
    config = default_config()
    if not config_path:
        return config
    if not config_path.exists():
        raise FileNotFoundError(f"Config file not found: {config_path}")
    override = load_json_file(config_path)
    return deep_merge(config, override)


def find_latest_report(root: Path) -> Optional[Path]:
    reports_dir = cleanup_paths(root).reports_dir
    if not reports_dir.exists():
        return None
    reports = sorted(reports_dir.glob("*-cleanup-proposal.json"))
    if not reports:
        return None
    return reports[-1]


def _ignore_name_set(ignore_paths: Iterable[str]) -> set[str]:
    return {token.strip("/\\").lower() for token in ignore_paths if token.strip()}


def iter_files(root: Path, ignore_paths: Iterable[str]) -> Iterable[Path]:
    ignore_names = _ignore_name_set(ignore_paths)
    for dirpath, dirnames, filenames in os.walk(root):
        current_dir = Path(dirpath)
        dirnames[:] = [
            folder
            for folder in dirnames
            if folder.lower() not in ignore_names and not folder.startswith(".")
        ]
        for filename in sorted(filenames):
            if filename.startswith("."):
                continue
            yield current_dir / filename


def _matches_patterns(text: str, patterns: Iterable[str]) -> bool:
    for pattern in patterns:
        raw = (pattern or "").strip()
        if not raw:
            continue
        try:
            if re.search(raw, text, flags=re.IGNORECASE):
                return True
        except re.error:
            if raw.lower() in text.lower():
                return True
    return False


def _score_patterns(text: str, patterns: Iterable[str]) -> int:
    score = 0
    for pattern in patterns:
        raw = (pattern or "").strip()
        if not raw:
            continue
        if _matches_patterns(text, [raw]):
            score += 1
    return score


def classify_category(text: str, category_map: Dict[str, List[str]]) -> str:
    normalized = text.lower()
    best_category = "misc"
    best_score = 0
    for category, patterns in category_map.items():
        score = _score_patterns(normalized, patterns)
        if score > best_score:
            best_score = score
            best_category = category
    return best_category


def is_doc_file(path: Path, config: Dict[str, Any]) -> bool:
    return path.suffix.lower() in {ext.lower() for ext in config.get("doc_extensions", [])}


def is_script_file(path: Path, config: Dict[str, Any]) -> bool:
    return path.suffix.lower() in {ext.lower() for ext in config.get("script_extensions", [])}


def read_head(path: Path, max_bytes: int = 64_000) -> str:
    with path.open("r", encoding="utf-8", errors="replace") as handle:
        return handle.read(max_bytes)


def is_cleanup_candidate_path(path_text: str, config: Dict[str, Any]) -> bool:
    return _matches_patterns(path_text.lower(), config.get("cleanup_candidate_path_patterns", []))


def detect_one_time_script(path_text: str, content: str, config: Dict[str, Any]) -> bool:
    lower_path = path_text.lower()
    if _matches_patterns(lower_path, config.get("one_time_script_name_patterns", [])):
        return True
    if _matches_patterns(content.lower(), config.get("one_time_script_content_patterns", [])):
        return True
    if re.search(r"\b20\d{2}[-_]\d{2}[-_]\d{2}\b", lower_path):
        return True
    return False


def is_worthwhile_script(content: str, config: Dict[str, Any]) -> bool:
    lines = content.splitlines()
    if len(lines) >= 60:
        return True
    if re.search(r"^\s*(def\s+|class\s+|function\s+|param\s*\()", content, flags=re.IGNORECASE | re.MULTILINE):
        return True
    return _matches_patterns(content.lower(), config.get("worthwhile_script_content_patterns", []))


def _age_days(path: Path, now: datetime) -> tuple[str, float]:
    modified = datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc)
    age = (now - modified).total_seconds() / 86400
    return iso_utc(modified), round(age, 2)


def _build_organization_proposal(
    rel_path: Path,
    is_doc: bool,
    is_script: bool,
    age_days: float,
    modified_utc: str,
    config: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    parts = rel_path.parts
    if len(parts) != 2:
        return None

    root_folder = parts[0].lower()
    filename = parts[1]

    if is_doc and root_folder in {"docs", "documentation"}:
        category = classify_category(filename, config.get("docs_categories", {}))
        target = Path(parts[0]) / category / filename
    elif is_script and root_folder == "scripts":
        category = classify_category(filename, config.get("scripts_categories", {}))
        target = Path("scripts") / category / filename
    else:
        return None

    if rel_path == target:
        return None

    status = "ready"
    reason = "Top-level file should be grouped by category."
    if age_days <= float(config.get("recent_guard_days", 14)):
        status = "recent_review_needed"
        reason = "Recently modified file: review before moving."

    return {
        "source_path": relpath_posix(rel_path),
        "target_path": relpath_posix(target),
        "suggested_category": category,
        "status": status,
        "reason": reason,
        "last_modified_utc": modified_utc,
        "age_days": age_days,
    }


def analyze_workspace(root: Path, config: Dict[str, Any]) -> Dict[str, Any]:
    now = now_utc()
    staging_candidates: List[Dict[str, Any]] = []
    organization_proposals: List[Dict[str, Any]] = []

    stale_docs_days = float(config.get("stale_days", {}).get("docs", 120))
    stale_scripts_days = float(config.get("stale_days", {}).get("scripts", 45))

    for file_path in iter_files(root, config.get("ignore_paths", [])):
        try:
            rel_path = file_path.relative_to(root)
        except ValueError:
            continue

        rel_text = relpath_posix(rel_path)
        modified_utc, age_days = _age_days(file_path, now)

        doc_file = is_doc_file(file_path, config)
        script_file = is_script_file(file_path, config)
        content_head = ""

        if doc_file or script_file:
            try:
                content_head = read_head(file_path)
            except OSError:
                content_head = ""

        action: Optional[str] = None
        reason: Optional[str] = None

        if script_file and detect_one_time_script(rel_text, content_head, config):
            if is_worthwhile_script(content_head, config):
                action = "extract_reference_then_stage"
                reason = "One-time script with reusable reference material."
            else:
                action = "stage_for_deletion"
                reason = "One-time script likely no longer needed."
        elif script_file and age_days >= stale_scripts_days and is_cleanup_candidate_path(rel_text, config):
            action = "stage_for_deletion"
            reason = "Aged script in a cleanup-prone path."
        elif doc_file and age_days >= stale_docs_days and is_cleanup_candidate_path(rel_text, config):
            action = "stage_for_deletion"
            reason = "Aged documentation in a cleanup-prone path."

        if action:
            staging_candidates.append(
                {
                    "path": rel_text,
                    "kind": "script" if script_file else "documentation" if doc_file else "file",
                    "proposed_action": action,
                    "reason": reason,
                    "last_modified_utc": modified_utc,
                    "age_days": age_days,
                    "size_bytes": file_path.stat().st_size,
                }
            )

        proposal = _build_organization_proposal(
            rel_path=rel_path,
            is_doc=doc_file,
            is_script=script_file,
            age_days=age_days,
            modified_utc=modified_utc,
            config=config,
        )
        if proposal:
            organization_proposals.append(proposal)

    staging_candidates.sort(key=lambda item: item["age_days"], reverse=True)
    organization_proposals.sort(key=lambda item: item["age_days"], reverse=True)

    return {
        "generated_at_utc": iso_utc(now),
        "root": str(root),
        "policy": {
            "no_immediate_delete": True,
            "staging_directory": f"{STAGING_DIR_NAME}/{RECYCLE_BIN_DIR_NAME}",
            "date_modified_priority": True,
            "recent_guard_days": config.get("recent_guard_days", 14),
        },
        "summary": {
            "staging_candidate_count": len(staging_candidates),
            "extract_then_stage_count": len(
                [item for item in staging_candidates if item["proposed_action"] == "extract_reference_then_stage"]
            ),
            "organization_proposal_count": len(organization_proposals),
        },
        "staging_candidates": staging_candidates,
        "organization_proposals": organization_proposals,
    }


def default_report_path(root: Path, generated_at_utc: str) -> Path:
    safe_stamp = generated_at_utc.replace(":", "-")
    return cleanup_paths(root).reports_dir / f"{safe_stamp}-cleanup-proposal.json"


def stage_run_id() -> str:
    return now_utc().strftime("%Y%m%dT%H%M%SZ")


def _extract_signatures(lines: List[str]) -> List[str]:
    results: List[str] = []
    signature_pattern = re.compile(r"^\s*(def\s+|class\s+|function\s+|param\s*\()", re.IGNORECASE)
    for line in lines:
        if signature_pattern.search(line):
            results.append(line.rstrip())
        if len(results) >= 20:
            break
    return results


def extract_reference_material(path: Path, max_lines: int = 220) -> str:
    text = read_head(path, max_bytes=128_000)
    if not text:
        return ""

    lines = text.splitlines()[:max_lines]
    selected: List[str] = []

    # Keep leading comments/docstrings because they usually contain the "why" and usage notes.
    quote_token: Optional[str] = None
    for line in lines:
        stripped = line.strip()
        if quote_token:
            selected.append(line.rstrip())
            if quote_token in stripped:
                quote_token = None
                break
            continue
        if not stripped and not selected:
            continue
        if stripped.startswith("#") or stripped.startswith("//") or stripped.startswith(";"):
            selected.append(line.rstrip())
            continue
        if stripped.startswith('"""') or stripped.startswith("'''"):
            quote_token = stripped[:3]
            selected.append(line.rstrip())
            if stripped.count(quote_token) >= 2:
                quote_token = None
                break
            continue
        break

    selected.extend(_extract_signatures(lines))

    note_pattern = re.compile(r"\b(todo|note|usage|example)\b", re.IGNORECASE)
    for line in lines:
        if note_pattern.search(line):
            selected.append(line.rstrip())
        if len(selected) >= 80:
            break

    unique_lines: List[str] = []
    seen = set()
    for line in selected:
        key = line.strip()
        if not key or key in seen:
            continue
        seen.add(key)
        unique_lines.append(line)

    return "\n".join(unique_lines).strip()


def _append_reference_extract(
    root: Path,
    run_id: str,
    source_path: str,
    extracted_text: str,
) -> Optional[Path]:
    if not extracted_text:
        return None

    extracts_path = cleanup_paths(root).reference_extracts_dir / f"{run_id}-reference-material.md"
    is_new = not extracts_path.exists()
    with extracts_path.open("a", encoding="utf-8", newline="\n") as handle:
        if is_new:
            handle.write(f"# Extracted Reference Material ({run_id})\n\n")
            handle.write("Generated automatically before staging one-time scripts.\n\n")
        handle.write(f"## {source_path}\n\n")
        handle.write(f"Extracted at: {iso_utc(now_utc())}\n\n")
        handle.write("```text\n")
        handle.write(extracted_text)
        handle.write("\n```\n\n")
    return extracts_path


def stage_candidates_from_report(root: Path, report: Dict[str, Any], apply_changes: bool) -> Dict[str, Any]:
    ensure_staging_directories(root)
    run_id = stage_run_id()

    items: List[Dict[str, Any]] = []
    extracted_reference_files: set[str] = set()

    for candidate in report.get("staging_candidates", []):
        rel_path = candidate.get("path")
        if not rel_path:
            continue

        source = root / rel_path
        destination = cleanup_paths(root).recycle_bin_dir / run_id / rel_path
        item_result: Dict[str, Any] = {
            "path": rel_path,
            "proposed_action": candidate.get("proposed_action"),
            "source_exists": source.exists(),
            "destination": relpath_posix(destination.relative_to(root)),
            "status": "preview",
        }

        if not source.exists():
            item_result["status"] = "skipped_missing_source"
            items.append(item_result)
            continue

        if candidate.get("proposed_action") == "extract_reference_then_stage":
            if apply_changes:
                extracted = extract_reference_material(source)
                extract_file = _append_reference_extract(root, run_id, rel_path, extracted)
                if extract_file:
                    extracted_reference_files.add(relpath_posix(extract_file.relative_to(root)))
                    item_result["reference_extracted"] = True
                else:
                    item_result["reference_extracted"] = False
            else:
                item_result["would_extract_reference"] = True

        if apply_changes:
            destination.parent.mkdir(parents=True, exist_ok=True)
            if destination.exists():
                item_result["status"] = "skipped_destination_exists"
            else:
                shutil.move(str(source), str(destination))
                item_result["status"] = "staged"
        else:
            item_result["status"] = "preview"

        items.append(item_result)

    manifest = {
        "run_id": run_id,
        "generated_at_utc": iso_utc(now_utc()),
        "root": str(root),
        "apply_changes": apply_changes,
        "no_immediate_delete": True,
        "report_source": report.get("generated_at_utc"),
        "items": items,
        "reference_extract_files": sorted(extracted_reference_files),
        "summary": {
            "total_items": len(items),
            "staged_count": len([item for item in items if item["status"] == "staged"]),
            "preview_count": len([item for item in items if item["status"] == "preview"]),
            "skipped_count": len([item for item in items if item["status"].startswith("skipped")]),
        },
    }

    return manifest


def apply_organization_from_report(
    root: Path,
    report: Dict[str, Any],
    apply_changes: bool,
    include_recent: bool,
) -> Dict[str, Any]:
    ensure_staging_directories(root)
    run_id = stage_run_id()

    items: List[Dict[str, Any]] = []

    for proposal in report.get("organization_proposals", []):
        status = proposal.get("status")
        if status == "recent_review_needed" and not include_recent:
            items.append(
                {
                    "source_path": proposal.get("source_path"),
                    "target_path": proposal.get("target_path"),
                    "status": "skipped_recent_review_needed",
                    "reason": proposal.get("reason"),
                }
            )
            continue

        source = root / proposal.get("source_path", "")
        target = root / proposal.get("target_path", "")

        result: Dict[str, Any] = {
            "source_path": proposal.get("source_path"),
            "target_path": proposal.get("target_path"),
            "status": "preview",
            "reason": proposal.get("reason"),
        }

        if not source.exists():
            result["status"] = "skipped_missing_source"
            items.append(result)
            continue

        if apply_changes:
            target.parent.mkdir(parents=True, exist_ok=True)
            if target.exists():
                result["status"] = "skipped_target_exists"
            else:
                shutil.move(str(source), str(target))
                result["status"] = "moved"
        else:
            result["status"] = "preview"

        items.append(result)

    manifest = {
        "run_id": run_id,
        "generated_at_utc": iso_utc(now_utc()),
        "root": str(root),
        "apply_changes": apply_changes,
        "include_recent": include_recent,
        "items": items,
        "summary": {
            "total_items": len(items),
            "moved_count": len([item for item in items if item["status"] == "moved"]),
            "preview_count": len([item for item in items if item["status"] == "preview"]),
            "skipped_count": len([item for item in items if item["status"].startswith("skipped")]),
        },
    }
    return manifest
