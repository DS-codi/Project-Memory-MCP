/**
 * scan-ghosts CLI — Scans the data root for ghost folders (directories without workspace.meta.json)
 *
 * Usage:
 *   npx tsx src/cli/scan-ghosts.ts
 *   node dist/cli/scan-ghosts.js
 */

import { scanGhostFolders } from '../storage/workspace-identity.js';

async function main(): Promise<void> {
  console.log('Scanning data root for ghost folders...\n');

  const ghosts = await scanGhostFolders();

  if (ghosts.length === 0) {
    console.log('No ghost folders found. All data-root directories have valid workspace.meta.json files.');
    return;
  }

  console.log(`Found ${ghosts.length} ghost folder(s):\n`);

  for (const ghost of ghosts) {
    console.log(`  Folder:    ${ghost.folder_name}`);
    console.log(`  Path:      ${ghost.folder_path}`);
    console.log(`  Contents:  ${ghost.contents.join(', ') || '(empty)'}`);
    console.log(`  Plans:     ${ghost.plan_ids.join(', ') || '(none)'}`);
    console.log(`  Match:     ${ghost.likely_canonical_match ?? '(no match found)'}`);
    console.log(`  Reason:    ${ghost.match_reason ?? '-'}`);
    if (ghost.suggested_merge_command) {
      console.log(`  Merge cmd: ${ghost.suggested_merge_command}`);
    }
    console.log('');
  }

  console.log('To merge a ghost folder into its canonical workspace, run:');
  console.log('  npx tsx src/cli/merge-workspace.ts --source <ghost-id> --target <canonical-id>');
  console.log('');
  console.log('Add --dry-run (default) to preview changes, or --execute to apply them.');
}

main().catch((err) => {
  console.error('Error scanning for ghost folders:', err);
  process.exit(1);
});
