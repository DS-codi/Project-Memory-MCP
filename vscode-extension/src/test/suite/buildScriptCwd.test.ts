import * as assert from 'assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { resolveTerminalCwdForBuildScript, sanitizeBuildScriptDirectoryPath } from '../../utils/buildScriptCwd';

suite('Build Script CWD Resolution', () => {
    let tempRoot: string;

    setup(() => {
        tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-cwd-test-'));
    });

    teardown(() => {
        fs.rmSync(tempRoot, { recursive: true, force: true });
    });

    test('sanitizes container-relative path into workspace absolute path', () => {
        const workspaceRoot = path.join(tempRoot, 'workspace');
        fs.mkdirSync(workspaceRoot, { recursive: true });

        const sanitized = sanitizeBuildScriptDirectoryPath('/app/scripts/build', workspaceRoot);

        assert.strictEqual(sanitized, path.join(workspaceRoot, 'scripts', 'build'));
    });

    test('prefers resolved directory when normalized path exists', () => {
        const workspaceRoot = path.join(tempRoot, 'workspace');
        const resolvedDir = path.join(workspaceRoot, 'server');
        fs.mkdirSync(resolvedDir, { recursive: true });

        const result = resolveTerminalCwdForBuildScript('/app/server', undefined, workspaceRoot);

        assert.strictEqual(result.cwd, resolvedDir);
        assert.strictEqual(result.warning, undefined);
    });

    test('falls back to script directory when resolved directory is invalid', () => {
        const workspaceRoot = path.join(tempRoot, 'workspace');
        const scriptDir = path.join(workspaceRoot, 'dashboard');
        fs.mkdirSync(scriptDir, { recursive: true });

        const result = resolveTerminalCwdForBuildScript('/app/missing', 'dashboard', workspaceRoot);

        assert.strictEqual(result.cwd, scriptDir);
        assert.strictEqual(result.warning, 'Resolved script directory is not valid on this host. Using script directory fallback.');
    });

    test('falls back to workspace root when resolved and script directories are invalid', () => {
        const workspaceRoot = path.join(tempRoot, 'workspace');
        fs.mkdirSync(workspaceRoot, { recursive: true });

        const result = resolveTerminalCwdForBuildScript('/app/missing', 'also-missing', workspaceRoot);

        assert.strictEqual(result.cwd, workspaceRoot);
        assert.strictEqual(result.warning, 'Resolved script directory is not valid on this host. Using workspace root as fallback.');
    });

    test('returns warning only when no valid cwd exists', () => {
        const nonExistentWorkspace = path.join(tempRoot, 'does-not-exist');

        const result = resolveTerminalCwdForBuildScript('/app/missing', 'also-missing', nonExistentWorkspace);

        assert.strictEqual(result.cwd, undefined);
        assert.strictEqual(result.warning, 'No valid working directory was found for this build script. Running command without cwd override.');
    });
});
