/**
 * merge-workspace CLI — Merges a ghost/source workspace folder into a canonical target
 *
 * Usage:
 *   npx tsx src/cli/merge-workspace.ts --source <ghost-id> --target <canonical-id> [--execute]
 *   node dist/cli/merge-workspace.js --source <ghost-id> --target <canonical-id> [--execute]
 *
 * Default is dry-run mode (no changes). Pass --execute to apply.
 */

import { mergeWorkspace } from '../storage/workspace-identity.js';

function parseArgs(argv: string[]): { source: string; target: string; dryRun: boolean } {
  let source = '';
  let target = '';
  let dryRun = true;

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if ((arg === '--source' || arg === '-s') && argv[i + 1]) {
      source = argv[++i];
    } else if ((arg === '--target' || arg === '-t') && argv[i + 1]) {
      target = argv[++i];
    } else if (arg === '--execute' || arg === '--no-dry-run') {
      dryRun = false;
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }
  }

  return { source, target, dryRun };
}

function printUsage(): void {
  console.log(`
merge-workspace — Merge a ghost workspace folder into a canonical workspace

Usage:
  npx tsx src/cli/merge-workspace.ts --source <ghost-id> --target <canonical-id> [--execute]

Options:
  --source, -s    Source (ghost) folder name under data root
  --target, -t    Target (canonical) workspace ID to merge into
  --execute       Apply changes (default is dry-run)
  --dry-run       Preview changes without applying (default)
  --help, -h      Show this help message

Examples:
  npx tsx src/cli/merge-workspace.ts --source NotionDataPull --target notiondatapull-cce82c6e7c79
  npx tsx src/cli/merge-workspace.ts --source ds_file_decoder --target ds_file_decoder-dcf63cde98ef --execute
`);
}

async function main(): Promise<void> {
  const { source, target, dryRun } = parseArgs(process.argv);

  if (!source || !target) {
    console.error('ERROR: --source and --target are required.\n');
    printUsage();
    process.exit(1);
  }

  console.log(`Merge workspace: '${source}' → '${target}'`);
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes)' : 'EXECUTE (changes will be applied)'}\n`);

  const result = await mergeWorkspace(source, target, dryRun);

  console.log('Results:');
  console.log(`  Plans merged:   ${result.merged_plans.length > 0 ? result.merged_plans.join(', ') : '(none)'}`);
  console.log(`  Logs merged:    ${result.merged_logs.length > 0 ? result.merged_logs.join(', ') : '(none)'}`);
  console.log(`  Source deleted:  ${result.source_deleted ? 'Yes' : 'No'}`);

  if (result.notes.length > 0) {
    console.log('\nNotes:');
    for (const note of result.notes) {
      console.log(`  - ${note}`);
    }
  }

  if (dryRun && (result.merged_plans.length > 0 || result.merged_logs.length > 0)) {
    console.log('\nTo apply these changes, re-run with --execute');
  }
}

main().catch((err) => {
  console.error('Error merging workspace:', err);
  process.exit(1);
});
