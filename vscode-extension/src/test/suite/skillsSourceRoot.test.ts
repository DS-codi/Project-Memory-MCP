import * as assert from 'assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { buildMissingSkillsSourceWarning, resolveSkillsSourceRoot } from '../../utils/skillsSourceRoot';

suite('Skills Source Root Resolution', () => {
    let tempRoot: string;

    setup(() => {
        tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-skills-root-test-'));
    });

    teardown(() => {
        fs.rmSync(tempRoot, { recursive: true, force: true });
    });

    test('does not fall back to .github/skills when configured skills source is missing', () => {
        const workspacePath = path.join(tempRoot, 'workspace');
        const fallbackSkillsRoot = path.join(workspacePath, '.github', 'skills');
        fs.mkdirSync(fallbackSkillsRoot, { recursive: true });

        const result = resolveSkillsSourceRoot(path.join(workspacePath, 'skills'), workspacePath);

        assert.strictEqual(result.root, undefined);
        assert.deepStrictEqual(result.checkedPaths, [
            path.resolve(path.join(workspacePath, 'skills'))
        ]);
    });

    test('returns no source and includes checked paths when no skills source exists', () => {
        const workspacePath = path.join(tempRoot, 'workspace');
        fs.mkdirSync(workspacePath, { recursive: true });

        const result = resolveSkillsSourceRoot(path.join(workspacePath, 'skills'), workspacePath);

        assert.strictEqual(result.root, undefined);
        assert.deepStrictEqual(result.checkedPaths, [
            path.resolve(path.join(workspacePath, 'skills'))
        ]);
    });

    test('checks primary source then additional candidates in order and resolves first existing candidate', () => {
        const workspacePath = path.join(tempRoot, 'workspace');
        const primaryRoot = path.join(workspacePath, 'skills-primary');
        const globalFallbackRoot = path.join(tempRoot, 'shared-skills');
        fs.mkdirSync(workspacePath, { recursive: true });
        fs.mkdirSync(globalFallbackRoot, { recursive: true });

        const result = resolveSkillsSourceRoot(
            primaryRoot,
            workspacePath,
            fs.existsSync,
            [globalFallbackRoot]
        );

        assert.strictEqual(result.root, path.resolve(globalFallbackRoot));
        assert.deepStrictEqual(result.checkedPaths, [
            path.resolve(primaryRoot),
            path.resolve(globalFallbackRoot)
        ]);
    });

    test('does not use .github/skills target as implicit fallback when primary and additional sources are missing', () => {
        const workspacePath = path.join(tempRoot, 'workspace');
        const primaryRoot = path.join(workspacePath, 'skills-primary');
        const globalFallbackRoot = path.join(tempRoot, 'shared-skills');
        const targetSkillsRoot = path.join(workspacePath, '.github', 'skills');
        fs.mkdirSync(targetSkillsRoot, { recursive: true });

        const result = resolveSkillsSourceRoot(
            primaryRoot,
            workspacePath,
            fs.existsSync,
            [globalFallbackRoot]
        );

        assert.strictEqual(result.root, undefined);
        assert.deepStrictEqual(result.checkedPaths, [
            path.resolve(primaryRoot),
            path.resolve(globalFallbackRoot)
        ]);
    });

    test('builds clear warning message for missing skills source', () => {
        const workspacePath = path.join(tempRoot, 'workspace');
        fs.mkdirSync(workspacePath, { recursive: true });
        const checked = [
            path.join(workspacePath, 'skills')
        ];

        const message = buildMissingSkillsSourceWarning(workspacePath, checked);

        assert.ok(message.includes('No skills source directory found. Checked:'));
        assert.ok(message.includes('skills'));
    });
});
