import * as cp from 'child_process';
import * as fs from 'fs';

/**
 * Spawn the Supervisor launcher executable as a fully detached process.
 *
 * The child process is detached and unreferenced so it continues running
 * independently of the VS Code extension host process.
 *
 * @param launcherPath Absolute path to the launcher executable.
 * @returns The spawned {@link cp.ChildProcess} (already unref'd).
 * @throws {Error} If `launcherPath` is empty or the file does not exist.
 */
export function spawnLauncher(launcherPath: string): cp.ChildProcess {
  if (!launcherPath || launcherPath.trim().length === 0) {
    throw new Error(
      'spawnLauncher: launcherPath must not be empty. ' +
        'Provide the absolute path to the Supervisor launcher executable.'
    );
  }

  if (!fs.existsSync(launcherPath)) {
    throw new Error(
      `spawnLauncher: launcher executable not found at path "${launcherPath}". ` +
        'Ensure the Supervisor launcher is installed and the path is correct.'
    );
  }

  const child = cp.spawn(launcherPath, [], {
    detached: true,
    stdio: 'ignore',
  });

  child.unref();

  return child;
}
