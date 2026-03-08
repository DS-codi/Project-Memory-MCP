from __future__ import annotations

import argparse
from pathlib import Path

from cleanup_common import analyze_workspace, default_report_path, ensure_staging_directories, load_config, save_json_file


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Analyze a project directory and generate a non-destructive cleanup proposal. "
            "No files are moved or deleted by this command."
        )
    )
    parser.add_argument(
        "--root",
        default=".",
        help="Project root to analyze (default: current directory).",
    )
    parser.add_argument(
        "--config",
        default=None,
        help="Optional JSON config path. Defaults to category_rules.json in this folder.",
    )
    parser.add_argument(
        "--output",
        default=None,
        help="Optional output report path. Defaults to .cleanup-staging/reports/<timestamp>-cleanup-proposal.json.",
    )
    parser.add_argument(
        "--print-limit",
        type=int,
        default=25,
        help="How many candidate rows to print to the console (default: 25).",
    )
    return parser.parse_args()


def _default_config_path() -> Path:
    return Path(__file__).resolve().with_name("category_rules.json")


def _print_summary(report: dict, print_limit: int) -> None:
    summary = report.get("summary", {})
    print("Cleanup proposal generated.")
    print(f"  Staging candidates: {summary.get('staging_candidate_count', 0)}")
    print(f"  Extract then stage: {summary.get('extract_then_stage_count', 0)}")
    print(f"  Organization proposals: {summary.get('organization_proposal_count', 0)}")

    staging = report.get("staging_candidates", [])[:print_limit]
    if staging:
        print("\nTop staging candidates (oldest first):")
        for item in staging:
            print(
                f"  - {item['path']} | age_days={item['age_days']} | "
                f"modified={item['last_modified_utc']} | action={item['proposed_action']}"
            )

    proposals = report.get("organization_proposals", [])[:print_limit]
    if proposals:
        print("\nTop organization proposals (oldest first):")
        for item in proposals:
            print(
                f"  - {item['source_path']} -> {item['target_path']} | "
                f"age_days={item['age_days']} | status={item['status']}"
            )


def main() -> int:
    args = parse_args()
    root = Path(args.root).resolve()

    if not root.exists() or not root.is_dir():
        raise SystemExit(f"Root path must exist and be a directory: {root}")

    config_path = Path(args.config).resolve() if args.config else _default_config_path()
    config = load_config(config_path)

    ensure_staging_directories(root)
    report = analyze_workspace(root, config)

    output_path = Path(args.output).resolve() if args.output else default_report_path(root, report["generated_at_utc"])
    save_json_file(output_path, report)

    _print_summary(report, max(1, args.print_limit))
    print(f"\nReport written to: {output_path}")
    print("No files were deleted or moved.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
