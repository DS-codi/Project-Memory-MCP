from __future__ import annotations

import argparse
import json
import os
import re
import sqlite3
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Set, Tuple

from cleanup_common import cleanup_paths, ensure_staging_directories, iso_utc, now_utc, save_json_file

TERMINAL_PLAN_STATUSES = {"done", "completed", "complete", "archived"}
TERMINAL_STEP_STATUSES = {"done", "blocked"}

STOPWORDS = {
    "the",
    "and",
    "for",
    "with",
    "that",
    "this",
    "from",
    "into",
    "over",
    "under",
    "plan",
    "phase",
    "step",
    "work",
    "task",
    "update",
    "system",
    "project",
    "mcp",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Analyze Project Memory plans and generate a non-destructive cleanup proposal. "
            "This script only reports recommended plan actions and never executes them."
        )
    )
    source_group = parser.add_argument_group("plan source")
    source_group.add_argument(
        "--plans-json",
        default=None,
        help=(
            "Optional JSON payload path containing plans. Supports direct plan arrays or nested MCP responses. "
            "If omitted, plans are loaded directly from the SQLite DB."
        ),
    )
    source_group.add_argument(
        "--db-path",
        default=None,
        help=(
            "Optional explicit SQLite database path. Defaults to <PM_DATA_ROOT>/project-memory.db or "
            "platform app-data path when --plans-json is not provided."
        ),
    )
    source_group.add_argument(
        "--data-root",
        default=None,
        help=(
            "Optional data-root directory containing project-memory.db. Ignored when --db-path is provided."
        ),
    )
    source_group.add_argument(
        "--include-archived",
        action="store_true",
        help="When loading from DB, include archived plans from plans_archive.",
    )
    parser.add_argument(
        "--workspace-id",
        default=None,
        help=(
            "Optional workspace_id filter for DB mode and action payload hint for JSON mode. "
            "Recommended for mutation-ready proposals."
        ),
    )
    parser.add_argument(
        "--output",
        default=None,
        help="Optional output report path. Defaults to .cleanup-staging/reports/<timestamp>-plan-cleanup-proposal.json.",
    )
    parser.add_argument(
        "--print-limit",
        type=int,
        default=20,
        help="How many oldest triage items to print (default: 20).",
    )
    return parser.parse_args()


def normalize_plan_id(value: Any) -> Optional[str]:
    if not isinstance(value, str):
        return None
    trimmed = value.strip()
    if not trimmed:
        return None
    if not trimmed.startswith("plan_"):
        return None
    return trimmed


def looks_like_plan(item: Any) -> bool:
    if not isinstance(item, dict):
        return False
    return normalize_plan_id(item.get("id")) is not None or normalize_plan_id(item.get("plan_id")) is not None


def _platform_data_root() -> Path:
    if sys.platform == "win32":
        return Path(os.environ.get("APPDATA", str(Path.home() / "AppData" / "Roaming"))) / "ProjectMemory"
    if sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support" / "ProjectMemory"
    return Path(os.environ.get("XDG_DATA_HOME", str(Path.home() / ".local" / "share"))) / "ProjectMemory"


def resolve_db_path(db_path: Optional[str], data_root: Optional[str]) -> Path:
    if db_path:
        return Path(db_path).expanduser().resolve()

    env_root = os.environ.get("PM_DATA_ROOT")
    if data_root:
        root = Path(data_root).expanduser()
    elif env_root:
        root = Path(env_root).expanduser()
    else:
        root = _platform_data_root()

    if root.suffix.lower() == ".db":
        return root.resolve()
    return (root / "project-memory.db").resolve()


def _table_exists(conn: sqlite3.Connection, table_name: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name = ? LIMIT 1",
        (table_name,),
    ).fetchone()
    return row is not None


def _parse_json_list(value: Any) -> List[str]:
    if isinstance(value, list):
        return [str(item) for item in value]
    if not isinstance(value, str) or not value.strip():
        return []
    try:
        decoded = json.loads(value)
    except json.JSONDecodeError:
        return []
    if isinstance(decoded, list):
        return [str(item) for item in decoded]
    return []


def _fetch_db_plans(
    conn: sqlite3.Connection,
    plan_table: str,
    steps_table: str,
    workspace_id: Optional[str],
    archived_value: bool,
) -> List[Dict[str, Any]]:
    if not _table_exists(conn, plan_table):
        return []

    plan_alias = "p"
    where_clause = ""
    params: List[Any] = []
    if workspace_id:
        where_clause = f"WHERE {plan_alias}.workspace_id = ?"
        params.append(workspace_id)

    if _table_exists(conn, steps_table):
        sql = f"""
            SELECT
                {plan_alias}.id,
                {plan_alias}.workspace_id,
                {plan_alias}.program_id,
                {plan_alias}.title,
                {plan_alias}.description,
                {plan_alias}.status,
                {plan_alias}.goals,
                {plan_alias}.created_at,
                {plan_alias}.updated_at,
                {plan_alias}.completed_at,
                COUNT(s.id) AS total_steps,
                COALESCE(SUM(CASE WHEN LOWER(s.status) = 'done' THEN 1 ELSE 0 END), 0) AS done_steps,
                COALESCE(SUM(CASE WHEN LOWER(s.status) IN ('done', 'blocked') THEN 1 ELSE 0 END), 0) AS terminal_steps
            FROM {plan_table} {plan_alias}
            LEFT JOIN {steps_table} s ON s.plan_id = {plan_alias}.id
            {where_clause}
            GROUP BY {plan_alias}.id
            ORDER BY {plan_alias}.created_at ASC, {plan_alias}.id ASC
        """
    else:
        sql = f"""
            SELECT
                {plan_alias}.id,
                {plan_alias}.workspace_id,
                {plan_alias}.program_id,
                {plan_alias}.title,
                {plan_alias}.description,
                {plan_alias}.status,
                {plan_alias}.goals,
                {plan_alias}.created_at,
                {plan_alias}.updated_at,
                {plan_alias}.completed_at,
                0 AS total_steps,
                0 AS done_steps,
                0 AS terminal_steps
            FROM {plan_table} {plan_alias}
            {where_clause}
            ORDER BY {plan_alias}.created_at ASC, {plan_alias}.id ASC
        """

    rows = conn.execute(sql, params).fetchall()
    plans: List[Dict[str, Any]] = []
    for row in rows:
        row_data = dict(row)
        plan_id = normalize_plan_id(row_data.get("id"))
        if not plan_id:
            continue
        plans.append(
            {
                "id": plan_id,
                "workspace_id": row_data.get("workspace_id"),
                "program_id": row_data.get("program_id"),
                "title": row_data.get("title") or "(untitled)",
                "description": row_data.get("description") or "",
                "status": row_data.get("status") or "unknown",
                "goals": _parse_json_list(row_data.get("goals")),
                "created_at": row_data.get("created_at"),
                "updated_at": row_data.get("updated_at"),
                "completed_at": row_data.get("completed_at"),
                "total_steps": int(row_data.get("total_steps") or 0),
                "done_steps": int(row_data.get("done_steps") or 0),
                "terminal_steps": int(row_data.get("terminal_steps") or 0),
                "archived": archived_value,
            }
        )

    return plans


def load_plans_from_db(
    db_path: Path,
    workspace_id: Optional[str],
    include_archived: bool,
) -> List[Dict[str, Any]]:
    if not db_path.exists():
        raise SystemExit(f"Database file does not exist: {db_path}")

    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    try:
        plans = _fetch_db_plans(
            conn=conn,
            plan_table="plans",
            steps_table="steps",
            workspace_id=workspace_id,
            archived_value=False,
        )

        if include_archived:
            plans.extend(
                _fetch_db_plans(
                    conn=conn,
                    plan_table="plans_archive",
                    steps_table="steps_archive",
                    workspace_id=workspace_id,
                    archived_value=True,
                )
            )

        return plans
    finally:
        conn.close()


def parse_dt(value: Any) -> Optional[datetime]:
    if not isinstance(value, str):
        return None
    raw = value.strip()
    if not raw:
        return None

    normalized = raw
    if normalized.endswith("Z"):
        normalized = normalized[:-1] + "+00:00"

    try:
        dt = datetime.fromisoformat(normalized)
    except ValueError:
        return None

    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _collect_candidate_plan_lists(node: Any, sink: List[List[Dict[str, Any]]]) -> None:
    if isinstance(node, list):
        plans = [entry for entry in node if looks_like_plan(entry)]
        if plans and len(plans) == len(node):
            sink.append(plans)
        for value in node:
            _collect_candidate_plan_lists(value, sink)
        return

    if isinstance(node, dict):
        for value in node.values():
            _collect_candidate_plan_lists(value, sink)


def extract_plans(payload: Any) -> List[Dict[str, Any]]:
    if looks_like_plan(payload):
        return [payload]

    candidates: List[List[Dict[str, Any]]] = []
    _collect_candidate_plan_lists(payload, candidates)
    if not candidates:
        return []

    # Prefer the largest discovered list because most payloads wrap plans in nested data objects.
    candidates.sort(key=len, reverse=True)
    return candidates[0]


def normalize_plans(raw_plans: Sequence[Dict[str, Any]], workspace_id_hint: Optional[str]) -> List[Dict[str, Any]]:
    normalized: List[Dict[str, Any]] = []

    for plan in raw_plans:
        if not isinstance(plan, dict):
            continue

        plan_id = normalize_plan_id(plan.get("id")) or normalize_plan_id(plan.get("plan_id"))
        if not plan_id:
            continue

        workspace_id = plan.get("workspace_id")
        if not isinstance(workspace_id, str) or not workspace_id.strip():
            workspace_id = workspace_id_hint

        goals = plan.get("goals")
        if isinstance(goals, list):
            normalized_goals = [str(goal) for goal in goals]
        else:
            normalized_goals = []

        normalized.append(
            {
                "id": plan_id,
                "workspace_id": workspace_id,
                "program_id": plan.get("program_id"),
                "title": plan.get("title") or "(untitled)",
                "description": plan.get("description") or "",
                "status": plan.get("status") or "unknown",
                "created_at": plan.get("created_at"),
                "updated_at": plan.get("updated_at") or plan.get("last_updated"),
                "completed_at": plan.get("completed_at"),
                "goals": normalized_goals,
                "steps": plan.get("steps") if isinstance(plan.get("steps"), list) else [],
                "total_steps": int(plan.get("total_steps") or plan.get("steps_total") or 0),
                "done_steps": int(plan.get("done_steps") or plan.get("steps_done") or 0),
                "terminal_steps": int(plan.get("terminal_steps") or 0),
                "archived": bool(plan.get("archived") or plan.get("is_archived") or str(plan.get("status", "")).lower() == "archived"),
            }
        )

    return normalized


def tokenize_text(text: str) -> Set[str]:
    tokens = re.findall(r"[a-z0-9]+", text.lower())
    return {token for token in tokens if len(token) > 2 and token not in STOPWORDS}


def plan_tokens(plan: Dict[str, Any]) -> Set[str]:
    parts: List[str] = []
    for key in ("title", "description"):
        value = plan.get(key)
        if isinstance(value, str):
            parts.append(value)

    goals = plan.get("goals")
    if isinstance(goals, list):
        parts.extend(str(goal) for goal in goals)

    return tokenize_text(" ".join(parts))


def jaccard(left: Set[str], right: Set[str]) -> float:
    if not left and not right:
        return 0.0
    intersection = left & right
    union = left | right
    if not union:
        return 0.0
    return len(intersection) / len(union)


def classify_plan(plan: Dict[str, Any]) -> Dict[str, Any]:
    steps = plan.get("steps") if isinstance(plan.get("steps"), list) else []
    step_statuses = [str(step.get("status", "")).lower() for step in steps if isinstance(step, dict)]

    if step_statuses:
        step_count = len(step_statuses)
        done_steps = sum(1 for status in step_statuses if status == "done")
        terminal_steps = sum(1 for status in step_statuses if status in TERMINAL_STEP_STATUSES)
    else:
        step_count = int(plan.get("total_steps") or 0)
        done_steps = int(plan.get("done_steps") or 0)
        terminal_steps = int(plan.get("terminal_steps") or 0)

    has_steps = step_count > 0
    all_steps_terminal = has_steps and terminal_steps >= step_count
    all_steps_done = has_steps and done_steps >= step_count

    status = str(plan.get("status", "")).lower()
    archived = bool(plan.get("archived") or plan.get("is_archived") or status == "archived")

    created_at = parse_dt(plan.get("created_at"))
    updated_at = parse_dt(plan.get("updated_at"))
    completed_at = parse_dt(plan.get("completed_at"))

    finished_not_archived = (not archived) and (
        status in TERMINAL_PLAN_STATUSES or all_steps_done or completed_at is not None
    )

    return {
        "id": plan.get("id"),
        "workspace_id": plan.get("workspace_id"),
        "program_id": plan.get("program_id"),
        "title": plan.get("title") or "(untitled)",
        "description": plan.get("description") or "",
        "status": status or "unknown",
        "archived": archived,
        "created_at": iso_utc(created_at) if created_at else None,
        "updated_at": iso_utc(updated_at) if updated_at else None,
        "created_dt": created_at,
        "updated_dt": updated_at,
        "tokens": plan_tokens(plan),
        "step_count": step_count,
        "done_steps": done_steps,
        "all_steps_terminal": all_steps_terminal,
        "all_steps_done": all_steps_done,
        "finished_not_archived": finished_not_archived,
    }


def plan_sort_key(item: Dict[str, Any]) -> Tuple[datetime, str]:
    created = item.get("created_dt")
    updated = item.get("updated_dt")

    if isinstance(created, datetime):
        ts = created
    elif isinstance(updated, datetime):
        ts = updated
    else:
        ts = datetime.max.replace(tzinfo=timezone.utc)

    return ts, str(item.get("id", ""))


def connected_components(nodes: Iterable[str], edges: Iterable[Tuple[str, str]]) -> List[List[str]]:
    graph: Dict[str, Set[str]] = {node: set() for node in nodes}
    for left, right in edges:
        graph.setdefault(left, set()).add(right)
        graph.setdefault(right, set()).add(left)

    seen: Set[str] = set()
    groups: List[List[str]] = []

    for node in graph:
        if node in seen:
            continue
        stack = [node]
        group: List[str] = []
        seen.add(node)

        while stack:
            current = stack.pop()
            group.append(current)
            for neighbor in graph.get(current, set()):
                if neighbor not in seen:
                    seen.add(neighbor)
                    stack.append(neighbor)

        groups.append(sorted(group))

    return groups


def theme_for_group(items: List[Dict[str, Any]]) -> str:
    all_tokens = [token for item in items for token in item.get("tokens", set())]
    if not all_tokens:
        return "Related Plans"

    counts = Counter(all_tokens)
    top = [token for token, _ in counts.most_common(4)]
    if not top:
        return "Related Plans"
    return " ".join(word.capitalize() for word in top)


def _workspace_hint(plan_ids: Sequence[str], by_id: Dict[str, Dict[str, Any]], fallback_workspace_id: Optional[str]) -> Optional[str]:
    ids: Set[str] = set()
    for plan_id in plan_ids:
        workspace_id = by_id.get(plan_id, {}).get("workspace_id")
        if isinstance(workspace_id, str) and workspace_id:
            ids.add(workspace_id)
    if len(ids) == 1:
        return next(iter(ids))
    return fallback_workspace_id


def build_report(raw_plans: List[Dict[str, Any]], workspace_id: Optional[str]) -> Dict[str, Any]:
    classified = [classify_plan(plan) for plan in raw_plans if plan.get("id")]
    if workspace_id:
        classified = [item for item in classified if item.get("workspace_id") == workspace_id]

    by_id = {item["id"]: item for item in classified}

    triage = sorted(classified, key=plan_sort_key)

    finished_not_archived = [item for item in triage if item["finished_not_archived"]]

    redundant_edges: List[Tuple[str, str]] = []
    related_edges: List[Tuple[str, str]] = []
    pair_notes: List[Dict[str, Any]] = []

    for index, left in enumerate(classified):
        for right in classified[index + 1 :]:
            if left.get("workspace_id") != right.get("workspace_id"):
                continue
            if left["archived"] and right["archived"]:
                continue
            similarity = jaccard(left["tokens"], right["tokens"])
            common = sorted(left["tokens"] & right["tokens"])

            if similarity >= 0.72 and len(common) >= 2:
                redundant_edges.append((left["id"], right["id"]))
                pair_notes.append(
                    {
                        "left_plan_id": left["id"],
                        "right_plan_id": right["id"],
                        "relation": "redundant",
                        "similarity": round(similarity, 3),
                        "common_terms": common[:8],
                    }
                )
                continue

            if similarity >= 0.45 and len(common) >= 3:
                related_edges.append((left["id"], right["id"]))
                pair_notes.append(
                    {
                        "left_plan_id": left["id"],
                        "right_plan_id": right["id"],
                        "relation": "closely_related",
                        "similarity": round(similarity, 3),
                        "common_terms": common[:8],
                    }
                )

    redundant_groups = [
        group
        for group in connected_components(by_id.keys(), redundant_edges)
        if len(group) >= 2
    ]

    related_groups = [
        group
        for group in connected_components(by_id.keys(), related_edges)
        if len(group) >= 2
    ]

    superseded_candidates: List[Dict[str, Any]] = []
    for group in redundant_groups:
        group_items = sorted((by_id[plan_id] for plan_id in group), key=plan_sort_key)
        newer = group_items[-1]
        for older in group_items[:-1]:
            superseded_candidates.append(
                {
                    "plan_id": older["id"],
                    "title": older["title"],
                    "likely_superseded_by": newer["id"],
                    "reason": "Older plan in a high-similarity redundant group.",
                    "created_at": older["created_at"],
                }
            )

    proposed_actions: List[Dict[str, Any]] = []

    for item in finished_not_archived:
        action_workspace_id = item.get("workspace_id") or workspace_id
        params = {
            "action": "archive",
            "plan_id": item["id"],
        }
        if action_workspace_id:
            params["workspace_id"] = action_workspace_id

        proposed_actions.append(
            {
                "action_type": "archive_finished_plan",
                "requires_user_approval": True,
                "priority_reason": "Oldest finished plans should be archived first.",
                "plan_id": item["id"],
                "title": item["title"],
                "created_at": item["created_at"],
                "mcp_action": "memory_plan",
                "mcp_params": params,
            }
        )

    for group in redundant_groups:
        group_items = sorted((by_id[plan_id] for plan_id in group), key=plan_sort_key)
        target = group_items[-1]
        sources = [item["id"] for item in group_items[:-1]]
        action_workspace_id = _workspace_hint([target["id"], *sources], by_id, workspace_id)

        params = {
            "action": "merge_plans",
            "target_plan_id": target["id"],
            "source_plan_ids": sources,
            "archive_sources": False,
        }
        if action_workspace_id:
            params["workspace_id"] = action_workspace_id

        proposed_actions.append(
            {
                "action_type": "merge_redundant_plans",
                "requires_user_approval": True,
                "priority_reason": "Redundant plans likely duplicate scope and can be consolidated.",
                "target_plan_id": target["id"],
                "source_plan_ids": sources,
                "mcp_action": "memory_plan",
                "mcp_params": params,
            }
        )

    handled_program_groups: Set[Tuple[str, ...]] = set()
    for group in related_groups:
        sorted_group = tuple(sorted(group))
        if sorted_group in handled_program_groups:
            continue
        handled_program_groups.add(sorted_group)

        items = sorted((by_id[plan_id] for plan_id in group), key=plan_sort_key)
        action_workspace_id = _workspace_hint([item["id"] for item in items], by_id, workspace_id)

        non_null_program_ids = [
            str(item.get("program_id"))
            for item in items
            if isinstance(item.get("program_id"), str) and item.get("program_id")
        ]
        existing_program_id = Counter(non_null_program_ids).most_common(1)[0][0] if non_null_program_ids else None

        if existing_program_id:
            for member in items:
                if member.get("program_id") == existing_program_id:
                    continue
                params = {
                    "action": "link_to_program",
                    "program_id": existing_program_id,
                    "plan_id": member["id"],
                }
                if action_workspace_id:
                    params["workspace_id"] = action_workspace_id

                proposed_actions.append(
                    {
                        "action_type": "link_related_plan_to_existing_program",
                        "requires_user_approval": True,
                        "program_id": existing_program_id,
                        "plan_id": member["id"],
                        "mcp_action": "memory_plan",
                        "mcp_params": params,
                    }
                )
        else:
            program_title = f"Integrated Program: {theme_for_group(items)}"
            sequence: List[Dict[str, Any]] = []

            create_params = {
                "action": "create_program",
                "title": program_title,
                "description": "Created from related plan-cleanup candidates.",
            }
            if action_workspace_id:
                create_params["workspace_id"] = action_workspace_id
            sequence.append({"mcp_action": "memory_plan", "mcp_params": create_params})

            for member in items:
                add_params = {
                    "action": "add_plan_to_program",
                    "program_id": "<new_program_id_from_create_program>",
                    "plan_id": member["id"],
                }
                if action_workspace_id:
                    add_params["workspace_id"] = action_workspace_id
                sequence.append({"mcp_action": "memory_plan", "mcp_params": add_params})

            proposed_actions.append(
                {
                    "action_type": "create_integrated_program_for_related_plans",
                    "requires_user_approval": True,
                    "group_plan_ids": [member["id"] for member in items],
                    "recommended_program_title": program_title,
                    "mcp_action_sequence": sequence,
                }
            )

    def action_sort_key(action: Dict[str, Any]) -> Tuple[datetime, str]:
        plan_ids: List[str] = []

        for key in ("plan_id", "target_plan_id", "program_id"):
            value = action.get(key)
            if isinstance(value, str) and value:
                plan_ids.append(value)

        for key in ("source_plan_ids", "group_plan_ids"):
            value = action.get(key)
            if isinstance(value, list):
                plan_ids.extend(str(item) for item in value if isinstance(item, str) and item)

        # Keep insertion order while removing duplicates.
        seen: Set[str] = set()
        deduped_ids: List[str] = []
        for plan_id in plan_ids:
            if plan_id not in seen:
                seen.add(plan_id)
                deduped_ids.append(plan_id)

        if not deduped_ids:
            return datetime.max.replace(tzinfo=timezone.utc), ""

        dates: List[datetime] = []
        for plan_id in deduped_ids:
            item = by_id.get(plan_id)
            if not item:
                continue
            created_dt = item.get("created_dt")
            updated_dt = item.get("updated_dt")
            if isinstance(created_dt, datetime):
                dates.append(created_dt)
            elif isinstance(updated_dt, datetime):
                dates.append(updated_dt)

        if not dates:
            return datetime.max.replace(tzinfo=timezone.utc), deduped_ids[0]

        return min(dates), deduped_ids[0]

    proposed_actions.sort(key=action_sort_key)

    return {
        "generated_at_utc": iso_utc(now_utc()),
        "policy": {
            "approval_required_before_mutation": True,
            "oldest_first_triage": True,
            "no_automatic_mutations": True,
        },
        "workspace_id": workspace_id,
        "summary": {
            "total_plans_analyzed": len(classified),
            "finished_not_archived_count": len(finished_not_archived),
            "superseded_candidate_count": len(superseded_candidates),
            "redundant_group_count": len(redundant_groups),
            "related_group_count": len(related_groups),
            "proposed_action_count": len(proposed_actions),
        },
        "triage_order_oldest_first": [
            {
                "plan_id": item["id"],
                "title": item["title"],
                "created_at": item["created_at"],
                "updated_at": item["updated_at"],
                "status": item["status"],
                "archived": item["archived"],
                "finished_not_archived": item["finished_not_archived"],
            }
            for item in triage
        ],
        "findings": {
            "finished_not_archived": [
                {
                    "plan_id": item["id"],
                    "title": item["title"],
                    "created_at": item["created_at"],
                    "status": item["status"],
                    "step_count": item["step_count"],
                }
                for item in finished_not_archived
            ],
            "superseded_candidates": superseded_candidates,
            "redundant_groups": redundant_groups,
            "related_groups": related_groups,
            "pairwise_similarity_notes": pair_notes,
        },
        "proposed_actions": proposed_actions,
    }


def default_output_path(root: Path, generated_at_utc: str) -> Path:
    safe_stamp = generated_at_utc.replace(":", "-")
    return cleanup_paths(root).reports_dir / f"{safe_stamp}-plan-cleanup-proposal.json"


def print_summary(report: Dict[str, Any], print_limit: int) -> None:
    summary = report.get("summary", {})
    print("Plan cleanup proposal generated.")
    print(f"  Plans analyzed: {summary.get('total_plans_analyzed', 0)}")
    print(f"  Finished not archived: {summary.get('finished_not_archived_count', 0)}")
    print(f"  Superseded candidates: {summary.get('superseded_candidate_count', 0)}")
    print(f"  Redundant groups: {summary.get('redundant_group_count', 0)}")
    print(f"  Related groups: {summary.get('related_group_count', 0)}")
    print(f"  Proposed actions: {summary.get('proposed_action_count', 0)}")

    triage = report.get("triage_order_oldest_first", [])[:print_limit]
    if triage:
        print("\nOldest plans first:")
        for item in triage:
            print(
                f"  - {item['plan_id']} | created={item['created_at']} | "
                f"status={item['status']} | archived={item['archived']}"
            )


def main() -> int:
    args = parse_args()

    source_details = ""
    if args.plans_json:
        plans_path = Path(args.plans_json).resolve()
        if not plans_path.exists():
            raise SystemExit(f"Plans JSON path does not exist: {plans_path}")

        with plans_path.open("r", encoding="utf-8") as handle:
            payload = json.load(handle)

        workspace_hint = args.workspace_id
        if not workspace_hint and isinstance(payload, dict):
            payload_workspace = payload.get("workspace_id")
            if isinstance(payload_workspace, str) and payload_workspace:
                workspace_hint = payload_workspace

        extracted = extract_plans(payload)
        plans = normalize_plans(extracted, workspace_hint)
        source_details = f"json:{plans_path}"
    else:
        db_path = resolve_db_path(args.db_path, args.data_root)
        plans = load_plans_from_db(
            db_path=db_path,
            workspace_id=args.workspace_id,
            include_archived=args.include_archived,
        )
        source_details = f"db:{db_path}"

    if not plans:
        raise SystemExit("No plans found for the selected source/filter.")

    root = Path.cwd().resolve()
    ensure_staging_directories(root)

    report = build_report(plans, workspace_id=args.workspace_id)
    report["plan_source"] = source_details
    output_path = Path(args.output).resolve() if args.output else default_output_path(root, report["generated_at_utc"])
    save_json_file(output_path, report)

    print_summary(report, max(1, args.print_limit))
    print(f"\nReport written to: {output_path}")
    print("No plan mutations were executed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
