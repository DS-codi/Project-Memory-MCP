from __future__ import annotations

import argparse
from pathlib import Path

from cleanup_common import (
    MANIFESTS_DIR_NAME,
    find_latest_report,
    load_json_file,
    save_json_file,
    stage_candidates_from_report,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Move proposed cleanup candidates to a project-local recycle bin. "
            "Files are never deleted by this script."
        )
    )
    parser.add_argument(
        "--root",
        default=".",
        help="Project root (default: current directory).",
    )
    parser.add_argument(
        "--report",
        default=None,
        help="Cleanup proposal JSON from audit_cleanup.py. Defaults to latest report.",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Apply staging moves. Without this flag, only preview actions are produced.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    root = Path(args.root).resolve()

    if not root.exists() or not root.is_dir():
        raise SystemExit(f"Root path must exist and be a directory: {root}")

    report_path = Path(args.report).resolve() if args.report else find_latest_report(root)
    if not report_path:
        raise SystemExit("No cleanup report found. Run audit_cleanup.py first.")
    if not report_path.exists():
        raise SystemExit(f"Cleanup report does not exist: {report_path}")

    report = load_json_file(report_path)
    manifest = stage_candidates_from_report(root=root, report=report, apply_changes=args.apply)

    manifest_path = root / ".cleanup-staging" / MANIFESTS_DIR_NAME / f"{manifest['run_id']}-staging-manifest.json"
    save_json_file(manifest_path, manifest)

    summary = manifest.get("summary", {})
    mode = "APPLY" if args.apply else "PREVIEW"
    print(f"Staging mode: {mode}")
    print(f"  Total items: {summary.get('total_items', 0)}")
    print(f"  Staged: {summary.get('staged_count', 0)}")
    print(f"  Preview: {summary.get('preview_count', 0)}")
    print(f"  Skipped: {summary.get('skipped_count', 0)}")

    if manifest.get("reference_extract_files"):
        print("\nReference extracts:")
        for path in manifest["reference_extract_files"]:
            print(f"  - {path}")

    print(f"\nManifest written to: {manifest_path}")
    print("No files were deleted. Items were either previewed or moved to .cleanup-staging/recycle-bin.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
