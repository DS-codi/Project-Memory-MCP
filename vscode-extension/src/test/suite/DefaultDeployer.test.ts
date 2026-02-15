/**
 * DefaultDeployer Unit Tests
 *
 * Tests the defaultSkills filtering behaviour introduced by Bug 1 fix:
 *   - deployAllSkills with empty defaultSkills → deploys ALL valid skill dirs
 *   - deployAllSkills with specific defaultSkills → only deploys listed skills
 *   - updateConfig merges defaultSkills into config
 *   - getDeploymentPlan returns skills filtered by defaultSkills
 *
 * Runs inside the VS Code extension host via mocha/tdd.
 */

import * as assert from 'assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { DefaultDeployer, DeploymentConfig } from '../../deployer/DefaultDeployer';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tempRoot: string;

/** Create a skill directory with a SKILL.md file inside `parentDir`. */
function createSkillDir(parentDir: string, skillName: string): void {
    const skillDir = path.join(parentDir, skillName);
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
        path.join(skillDir, 'SKILL.md'),
        `# ${skillName}\n\nThis is a test skill.\n`,
        'utf-8',
    );
}

/** Create a minimal DeploymentConfig pointing at temp directories. */
function makeConfig(overrides?: Partial<DeploymentConfig>): DeploymentConfig {
    return {
        agentsRoot: path.join(tempRoot, 'agents-source'),
        instructionsRoot: path.join(tempRoot, 'instructions-source'),
        skillsRoot: path.join(tempRoot, 'skills-source'),
        defaultAgents: [],
        defaultInstructions: [],
        defaultSkills: [],
        ...overrides,
    };
}

/** List immediate subdirectory names inside `dir` (non-recursive). */
function listSubdirs(dir: string): string[] {
    if (!fs.existsSync(dir)) { return []; }
    return fs.readdirSync(dir, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => e.name)
        .sort();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

suite('DefaultDeployer — defaultSkills filtering', () => {
    let skillsSourceDir: string;
    let targetDir: string;

    setup(() => {
        tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-deployer-test-'));
        skillsSourceDir = path.join(tempRoot, 'skills-source');
        targetDir = path.join(tempRoot, 'target-skills');
        fs.mkdirSync(skillsSourceDir, { recursive: true });
        fs.mkdirSync(targetDir, { recursive: true });

        // Seed 4 mock skills in the source
        createSkillDir(skillsSourceDir, 'skill-a');
        createSkillDir(skillsSourceDir, 'skill-b');
        createSkillDir(skillsSourceDir, 'skill-c');
        createSkillDir(skillsSourceDir, 'skill-d');
    });

    teardown(() => {
        fs.rmSync(tempRoot, { recursive: true, force: true });
    });

    // ---- Case 1: Empty defaultSkills → deploys ALL valid skills ----------

    test('deployAllSkills deploys all skills when defaultSkills is empty', async () => {
        const deployer = new DefaultDeployer(makeConfig({ defaultSkills: [] }));
        const deployed = await deployer.deployAllSkills(targetDir);

        assert.deepStrictEqual(
            deployed.sort(),
            ['skill-a', 'skill-b', 'skill-c', 'skill-d'],
            'all four skills should be deployed',
        );

        // Verify files exist on disk
        for (const name of ['skill-a', 'skill-b', 'skill-c', 'skill-d']) {
            const skillMd = path.join(targetDir, name, 'SKILL.md');
            assert.ok(fs.existsSync(skillMd), `${name}/SKILL.md should exist in target`);
        }

        deployer.dispose();
    });

    // ---- Case 2: Specific defaultSkills → only deploys those -------------

    test('deployAllSkills deploys only listed skills when defaultSkills is non-empty', async () => {
        const deployer = new DefaultDeployer(
            makeConfig({ defaultSkills: ['skill-a', 'skill-c'] }),
        );
        const deployed = await deployer.deployAllSkills(targetDir);

        assert.deepStrictEqual(
            deployed.sort(),
            ['skill-a', 'skill-c'],
            'only skill-a and skill-c should be deployed',
        );

        // skill-b and skill-d should NOT be in target
        assert.ok(
            !fs.existsSync(path.join(targetDir, 'skill-b', 'SKILL.md')),
            'skill-b should not be deployed',
        );
        assert.ok(
            !fs.existsSync(path.join(targetDir, 'skill-d', 'SKILL.md')),
            'skill-d should not be deployed',
        );

        deployer.dispose();
    });

    // ---- Case 2b: defaultSkills referencing non-existent skill -----------

    test('deployAllSkills ignores defaultSkills entries that do not exist in skillsRoot', async () => {
        const deployer = new DefaultDeployer(
            makeConfig({ defaultSkills: ['skill-a', 'nonexistent'] }),
        );
        const deployed = await deployer.deployAllSkills(targetDir);

        assert.deepStrictEqual(deployed, ['skill-a']);
        assert.ok(
            !fs.existsSync(path.join(targetDir, 'nonexistent')),
            'nonexistent skill dir should not appear in target',
        );

        deployer.dispose();
    });

    // ---- Case 3: updateConfig merges defaultSkills -----------------------

    test('updateConfig correctly merges defaultSkills into config', async () => {
        const deployer = new DefaultDeployer(makeConfig({ defaultSkills: [] }));

        // Initially no filter → deploys all four
        let deployed = await deployer.deployAllSkills(targetDir);
        assert.strictEqual(deployed.length, 4, 'should deploy all before updateConfig');

        // Clean target
        fs.rmSync(targetDir, { recursive: true, force: true });
        fs.mkdirSync(targetDir, { recursive: true });

        // Update config with restricted set
        deployer.updateConfig({ defaultSkills: ['skill-b'] });

        deployed = await deployer.deployAllSkills(targetDir);
        assert.deepStrictEqual(deployed, ['skill-b'], 'after updateConfig only skill-b should deploy');

        deployer.dispose();
    });

    // ---- Case 4: getDeploymentPlan reflects filtered defaults -------------

    test('getDeploymentPlan returns skills validated against skillsRoot', () => {
        const deployer = new DefaultDeployer(
            makeConfig({ defaultSkills: ['skill-a', 'skill-d', 'ghost'] }),
        );

        const plan = deployer.getDeploymentPlan();

        // 'ghost' has no SKILL.md in source → should be excluded
        assert.deepStrictEqual(
            plan.skills.sort(),
            ['skill-a', 'skill-d'],
            'plan.skills should include only skills with SKILL.md in source',
        );
        assert.ok(Array.isArray(plan.agents), 'plan should include agents array');
        assert.ok(Array.isArray(plan.instructions), 'plan should include instructions array');

        deployer.dispose();
    });

    // ---- Edge: skillsRoot does not exist → empty deploy ------------------

    test('deployAllSkills returns empty array when skillsRoot does not exist', async () => {
        const deployer = new DefaultDeployer(
            makeConfig({ skillsRoot: path.join(tempRoot, 'nope') }),
        );

        const deployed = await deployer.deployAllSkills(targetDir);
        assert.deepStrictEqual(deployed, []);

        deployer.dispose();
    });

    // ---- Edge: Skill directories without SKILL.md are skipped -----------

    test('deployAllSkills skips directories without SKILL.md', async () => {
        // Add a directory that has no SKILL.md
        const emptySkillDir = path.join(skillsSourceDir, 'empty-skill');
        fs.mkdirSync(emptySkillDir, { recursive: true });
        fs.writeFileSync(path.join(emptySkillDir, 'README.md'), '# Not a skill');

        const deployer = new DefaultDeployer(makeConfig({ defaultSkills: [] }));
        const deployed = await deployer.deployAllSkills(targetDir);

        // empty-skill should NOT be in the deployed list
        assert.ok(
            !deployed.includes('empty-skill'),
            'directories without SKILL.md should be skipped',
        );
        // But the 4 valid skills should still be deployed
        assert.strictEqual(deployed.length, 4);

        deployer.dispose();
    });

    // ---- Edge: Files (not directories) in skillsRoot are skipped --------

    test('deployAllSkills skips non-directory entries in skillsRoot', async () => {
        // Add a stray file in skillsRoot
        fs.writeFileSync(path.join(skillsSourceDir, 'stray-file.txt'), 'not a skill dir');

        const deployer = new DefaultDeployer(makeConfig({ defaultSkills: [] }));
        const deployed = await deployer.deployAllSkills(targetDir);

        assert.strictEqual(deployed.length, 4, 'should only deploy the 4 skill directories');

        deployer.dispose();
    });
});
