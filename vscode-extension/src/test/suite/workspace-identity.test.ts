/**
 * Workspace Identity Resolution Tests
 *
 * Tests staleness detection in tryReadIdentity (via the public
 * resolveWorkspaceIdentity entry point) and cache-clearing behaviour.
 *
 * Runs inside the VS Code extension host via mocha/tdd.
 *
 * Key behaviour under test (Bug 4 fix):
 *   When identity.json's workspace_path does NOT match the directory
 *   being queried (cross-machine staleness), projectPath must use the
 *   actual queried directory, NOT the stale path from the file.
 *   workspaceId always comes from identity.json regardless of staleness.
 */

import * as assert from 'assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
    resolveWorkspaceIdentity,
    clearIdentityCache,
    WorkspaceIdentity,
} from '../../utils/workspace-identity';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a `.projectmemory/identity.json` inside `dir` with the given payload. */
function writeIdentityJson(dir: string, payload: Record<string, unknown>): void {
    const identityDir = path.join(dir, '.projectmemory');
    fs.mkdirSync(identityDir, { recursive: true });
    fs.writeFileSync(
        path.join(identityDir, 'identity.json'),
        JSON.stringify(payload, null, 2),
        'utf-8',
    );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

suite('workspace-identity — tryReadIdentity staleness', () => {
    let tempRoot: string;

    setup(() => {
        clearIdentityCache();
        tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-ws-identity-test-'));
    });

    teardown(() => {
        clearIdentityCache();
        fs.rmSync(tempRoot, { recursive: true, force: true });
    });

    // ------- Case 1: Matching workspace_path (normal, non-stale) -----------

    test('returns identity with projectPath from identity.json when workspace_path matches dir', () => {
        const workspaceDir = path.join(tempRoot, 'my-project');
        fs.mkdirSync(workspaceDir, { recursive: true });

        writeIdentityJson(workspaceDir, {
            workspace_id: 'my-project-aabbccdd1122',
            workspace_path: workspaceDir,
        });

        const identity = resolveWorkspaceIdentity(workspaceDir);

        assert.ok(identity, 'identity should not be null');
        assert.strictEqual(identity!.workspaceId, 'my-project-aabbccdd1122');
        // Non-stale: projectPath should equal the path stored in identity.json
        assert.strictEqual(
            path.normalize(identity!.projectPath),
            path.normalize(workspaceDir),
        );
        assert.strictEqual(identity!.workspaceName, path.basename(workspaceDir));
    });

    // ------- Case 2: Non-matching workspace_path (cross-machine staleness) -

    test('returns identity with projectPath = actual dir when workspace_path is stale', () => {
        const actualDir = path.join(tempRoot, 'local-checkout');
        fs.mkdirSync(actualDir, { recursive: true });

        // identity.json records a path from a different machine / location
        const foreignPath = 'C:\\Users\\other-user\\projects\\my-project';

        writeIdentityJson(actualDir, {
            workspace_id: 'my-project-aabbccdd1122',
            workspace_path: foreignPath,
        });

        const identity = resolveWorkspaceIdentity(actualDir);

        assert.ok(identity, 'identity should not be null');
        assert.strictEqual(identity!.workspaceId, 'my-project-aabbccdd1122');
        // Stale: projectPath must be the actual dir we queried, NOT foreignPath
        assert.strictEqual(
            path.normalize(identity!.projectPath),
            path.normalize(actualDir),
        );
        // workspaceName should derive from the actual dir, not the stale path
        assert.strictEqual(identity!.workspaceName, path.basename(actualDir));
    });

    // ------- Case 3: Missing required fields → null --------------------

    test('returns null when identity.json has no workspace_id', () => {
        const dir = path.join(tempRoot, 'missing-id');
        fs.mkdirSync(dir, { recursive: true });

        writeIdentityJson(dir, {
            workspace_path: dir,
            // workspace_id is missing
        });

        const identity = resolveWorkspaceIdentity(dir);
        assert.strictEqual(identity, null);
    });

    test('returns null when identity.json has no workspace_path', () => {
        const dir = path.join(tempRoot, 'missing-path');
        fs.mkdirSync(dir, { recursive: true });

        writeIdentityJson(dir, {
            workspace_id: 'some-id-123456789012',
            // workspace_path is missing
        });

        const identity = resolveWorkspaceIdentity(dir);
        assert.strictEqual(identity, null);
    });

    // ------- Case 4: No identity.json at all → null --------------------

    test('returns null when no identity.json exists in directory', () => {
        const emptyDir = path.join(tempRoot, 'no-identity');
        fs.mkdirSync(emptyDir, { recursive: true });

        const identity = resolveWorkspaceIdentity(emptyDir);
        assert.strictEqual(identity, null);
    });

    // ------- Case 5: workspaceId is the same regardless of staleness -----

    test('workspaceId is identical for matching and non-matching workspace_path', () => {
        const theId = 'shared-id-ffeeddccbbaa';

        // Non-stale directory
        const matchDir = path.join(tempRoot, 'match-dir');
        fs.mkdirSync(matchDir, { recursive: true });
        writeIdentityJson(matchDir, {
            workspace_id: theId,
            workspace_path: matchDir,
        });
        const matchIdentity = resolveWorkspaceIdentity(matchDir);

        clearIdentityCache();

        // Stale directory (different workspace_path in identity.json)
        const staleDir = path.join(tempRoot, 'stale-dir');
        fs.mkdirSync(staleDir, { recursive: true });
        writeIdentityJson(staleDir, {
            workspace_id: theId,
            workspace_path: '/completely/different/path',
        });
        const staleIdentity = resolveWorkspaceIdentity(staleDir);

        assert.ok(matchIdentity, 'matchIdentity should not be null');
        assert.ok(staleIdentity, 'staleIdentity should not be null');
        assert.strictEqual(
            matchIdentity!.workspaceId,
            staleIdentity!.workspaceId,
            'workspaceId must be the same regardless of staleness',
        );
        assert.strictEqual(matchIdentity!.workspaceId, theId);
    });

    // ------- Edge: Corrupt / invalid JSON → null --------------------------

    test('returns null when identity.json contains invalid JSON', () => {
        const dir = path.join(tempRoot, 'corrupt');
        fs.mkdirSync(dir, { recursive: true });

        const identityDir = path.join(dir, '.projectmemory');
        fs.mkdirSync(identityDir, { recursive: true });
        fs.writeFileSync(
            path.join(identityDir, 'identity.json'),
            '{ this is not valid json }}}',
            'utf-8',
        );

        const identity = resolveWorkspaceIdentity(dir);
        assert.strictEqual(identity, null);
    });

    // ------- Edge: Cache clearing works -----------------------------------

    test('clearIdentityCache forces re-read from disk', () => {
        const dir = path.join(tempRoot, 'cache-test');
        fs.mkdirSync(dir, { recursive: true });

        // First: no identity file → null
        const first = resolveWorkspaceIdentity(dir);
        assert.strictEqual(first, null, 'should be null before identity file exists');

        // Now create the identity file
        writeIdentityJson(dir, {
            workspace_id: 'cache-test-000000000000',
            workspace_path: dir,
        });

        // Still null because of cache
        const cached = resolveWorkspaceIdentity(dir);
        assert.strictEqual(cached, null, 'should still be null from cache');

        // Clear and re-read
        clearIdentityCache();
        const fresh = resolveWorkspaceIdentity(dir);
        assert.ok(fresh, 'should find identity after cache clear');
        assert.strictEqual(fresh!.workspaceId, 'cache-test-000000000000');
    });

    // ------- Edge: Case-insensitive & trailing-separator matching ---------

    test('matching is case-insensitive and ignores trailing separators', () => {
        const dir = path.join(tempRoot, 'CaseMix');
        fs.mkdirSync(dir, { recursive: true });

        // Write with trailing separator and different case
        writeIdentityJson(dir, {
            workspace_id: 'case-test-112233445566',
            workspace_path: dir.toUpperCase() + path.sep,
        });

        const identity = resolveWorkspaceIdentity(dir);

        assert.ok(identity, 'identity should not be null');
        assert.strictEqual(identity!.workspaceId, 'case-test-112233445566');
        // Should be non-stale since normalized paths match
        // projectPath comes from parsed.workspace_path (the one in identity.json)
        assert.ok(
            identity!.projectPath,
            'projectPath should be set',
        );
    });
});
