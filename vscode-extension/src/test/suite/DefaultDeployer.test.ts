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
import type { WorkspaceContextSyncEntry, WorkspaceContextSyncReport } from '../../deployer/workspace-context-manifest';

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

function writeFile(filePath: string, content: string): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf-8');
}

function seedMandatorySources(config: DeploymentConfig): void {
    writeFile(path.join(config.agentsRoot, 'core', 'hub.agent.md'), 'Canonical hub');
    writeFile(path.join(config.agentsRoot, 'core', 'prompt-analyst.agent.md'), 'Canonical prompt analyst');
    writeFile(path.join(config.agentsRoot, 'core', 'shell.agent.md'), 'Canonical shell');

    writeFile(path.join(config.instructionsRoot, 'hub.instructions.md'), '---\napplyTo: "**/*"\n---\nHub instruction');
    writeFile(path.join(config.instructionsRoot, 'mcp-usage.instructions.md'), '---\napplyTo: "**/*"\n---\nUsage instruction');
    writeFile(path.join(config.instructionsRoot, 'prompt-analyst.instructions.md'), '---\napplyTo: "**/*"\n---\nPrompt analyst instruction');
    writeFile(path.join(config.instructionsRoot, 'subagent-recovery.instructions.md'), '---\napplyTo: "**/*"\n---\nRecovery instruction');
}

function seedMandatoryWorkspace(workspaceRoot: string): void {
    writeFile(path.join(workspaceRoot, '.github', 'agents', 'hub.agent.md'), 'Workspace hub');
    writeFile(path.join(workspaceRoot, '.github', 'agents', 'prompt-analyst.agent.md'), 'Workspace prompt analyst');
    writeFile(path.join(workspaceRoot, '.github', 'agents', 'shell.agent.md'), 'Workspace shell');

    writeFile(path.join(workspaceRoot, '.github', 'instructions', 'hub.instructions.md'), '---\napplyTo: "**/*"\n---\nWorkspace hub instruction');
    writeFile(path.join(workspaceRoot, '.github', 'instructions', 'mcp-usage.instructions.md'), '---\napplyTo: "**/*"\n---\nWorkspace usage instruction');
    writeFile(path.join(workspaceRoot, '.github', 'instructions', 'prompt-analyst.instructions.md'), '---\napplyTo: "**/*"\n---\nWorkspace prompt analyst instruction');
    writeFile(path.join(workspaceRoot, '.github', 'instructions', 'subagent-recovery.instructions.md'), '---\napplyTo: "**/*"\n---\nWorkspace recovery instruction');
}

function makeSyncEntry(overrides: Partial<WorkspaceContextSyncEntry> & Pick<WorkspaceContextSyncEntry, 'kind' | 'filename' | 'relative_path' | 'canonical_name' | 'canonical_filename' | 'status'>): WorkspaceContextSyncEntry {
    return {
        remediation: 'test remediation',
        comparison_basis: overrides.status === 'protected_drift' ? 'local_db_seed' : 'ignored_local',
        policy: {
            sync_managed: true,
            controlled: false,
            import_mode: 'never',
            canonical_source: 'none',
            canonical_path: null,
            required_workspace_copy: false,
            legacy_mandatory: false,
            validation_errors: [],
        },
        ...overrides,
    };
}

function makeSyncReport(workspacePath: string, entries: WorkspaceContextSyncEntry[]): WorkspaceContextSyncReport {
    const count = (status: WorkspaceContextSyncEntry['status']): number => entries.filter(entry => entry.status === status).length;
    return {
        workspace_path: workspacePath,
        report_mode: 'read_only',
        writes_performed: false,
        github_agents_dir: path.join(workspacePath, '.github', 'agents'),
        github_instructions_dir: path.join(workspacePath, '.github', 'instructions'),
        agents: entries.filter((entry): entry is WorkspaceContextSyncEntry => entry.kind === 'agent'),
        instructions: entries.filter((entry): entry is WorkspaceContextSyncEntry => entry.kind === 'instruction'),
        summary: {
            total: entries.length,
            in_sync: count('in_sync'),
            local_only: count('local_only'),
            db_only: count('db_only'),
            content_mismatch: count('content_mismatch'),
            protected_drift: count('protected_drift'),
            ignored_local: count('ignored_local'),
            import_candidate: count('import_candidate'),
        },
    };
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

suite('DefaultDeployer — workspace short code', () => {
    let agentsSourceDir: string;
    let instructionsSourceDir: string;
    let workspaceRoot: string;

    setup(() => {
        tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-deployer-shortcode-test-'));
        agentsSourceDir = path.join(tempRoot, 'agents-source');
        instructionsSourceDir = path.join(tempRoot, 'instructions-source');
        workspaceRoot = path.join(tempRoot, 'workspace');

        fs.mkdirSync(path.join(agentsSourceDir, 'core'), { recursive: true });
        fs.mkdirSync(path.join(agentsSourceDir, 'spoke'), { recursive: true });
        fs.mkdirSync(instructionsSourceDir, { recursive: true });
        fs.mkdirSync(workspaceRoot, { recursive: true });

        // Seed mock agents
        fs.writeFileSync(path.join(agentsSourceDir, 'core', 'hub.agent.md'), 'Hub content');
        fs.writeFileSync(path.join(agentsSourceDir, 'spoke', 'researcher.agent.md'), 'Researcher content');

        // Seed mock instruction
        fs.writeFileSync(
            path.join(instructionsSourceDir, 'test.instructions.md'),
            '---\napplyTo: "agents/hub.agent.md"\n---\nTest instruction content'
        );
    });

    teardown(() => {
        fs.rmSync(tempRoot, { recursive: true, force: true });
    });

    function createIdentity(workspaceId: string): void {
        const pmDir = path.join(workspaceRoot, '.projectmemory');
        fs.mkdirSync(pmDir, { recursive: true });
        fs.writeFileSync(
            path.join(pmDir, 'identity.json'),
            JSON.stringify({ workspace_id: workspaceId }),
            'utf-8'
        );
    }

    test('deployToWorkspace with identity.json present uses short-code segment', async () => {
        createIdentity('project_memory_mcp-50e04147a402');
        const deployer = new DefaultDeployer(makeConfig({
            agentsRoot: agentsSourceDir,
            instructionsRoot: instructionsSourceDir,
            defaultAgents: ['hub', 'researcher'],
            defaultInstructions: ['test']
        }));

        await deployer.deployToWorkspace(workspaceRoot);

        const agentsDir = path.join(workspaceRoot, '.github', 'agents');
        const instructionsDir = path.join(workspaceRoot, '.github', 'instructions');

        assert.ok(fs.existsSync(path.join(agentsDir, 'hub.50e041.agent.md')), 'hub should have short code');
        assert.ok(fs.existsSync(path.join(agentsDir, 'researcher.50e041.agent.md')), 'researcher should have short code');
        assert.ok(fs.existsSync(path.join(instructionsDir, 'test.50e041.instructions.md')), 'instruction should have short code');

        deployer.dispose();
    });

    test('deployToWorkspace without identity.json uses canonical names', async () => {
        const deployer = new DefaultDeployer(makeConfig({
            agentsRoot: agentsSourceDir,
            instructionsRoot: instructionsSourceDir,
            defaultAgents: ['hub'],
            defaultInstructions: ['test']
        }));

        await deployer.deployToWorkspace(workspaceRoot);

        const agentsDir = path.join(workspaceRoot, '.github', 'agents');
        assert.ok(fs.existsSync(path.join(agentsDir, 'hub.agent.md')), 'hub should be canonical');

        deployer.dispose();
    });

    test('deployInstructionWithCode rewrites applyTo frontmatter', async () => {
        createIdentity('project_memory_mcp-50e04147a402');
        const deployer = new DefaultDeployer(makeConfig({
            agentsRoot: agentsSourceDir,
            instructionsRoot: instructionsSourceDir,
            defaultAgents: ['hub'],
            defaultInstructions: ['test']
        }));

        await deployer.deployToWorkspace(workspaceRoot);

        const instructionPath = path.join(workspaceRoot, '.github', 'instructions', 'test.50e041.instructions.md');
        const content = fs.readFileSync(instructionPath, 'utf-8');

        assert.ok(content.includes('applyTo: "agents/hub.50e041.agent.md"'), 'applyTo should be rewritten with short code');

        deployer.dispose();
    });

    test('updateWorkspace with identity.json updates short-coded filename', async () => {
        createIdentity('project_memory_mcp-50e04147a402');
        const deployer = new DefaultDeployer(makeConfig({
            agentsRoot: agentsSourceDir,
            instructionsRoot: instructionsSourceDir,
            defaultAgents: ['hub'],
            defaultInstructions: ['test']
        }));

        // Initial deploy
        await deployer.deployToWorkspace(workspaceRoot);

        const agentPath = path.join(workspaceRoot, '.github', 'agents', 'hub.50e041.agent.md');
        const instructionPath = path.join(workspaceRoot, '.github', 'instructions', 'test.50e041.instructions.md');

        // Modify source to be newer
        const now = Date.now();
        const sourceAgentPath = path.join(agentsSourceDir, 'core', 'hub.agent.md');
        fs.writeFileSync(sourceAgentPath, 'Updated Hub content');
        fs.utimesSync(sourceAgentPath, new Date(now + 10000), new Date(now + 10000));

        const sourceInstructionPath = path.join(instructionsSourceDir, 'test.instructions.md');
        fs.writeFileSync(sourceInstructionPath, '---\napplyTo: "agents/hub.agent.md"\n---\nUpdated Test instruction');
        fs.utimesSync(sourceInstructionPath, new Date(now + 10000), new Date(now + 10000));

        const result = await deployer.updateWorkspace(workspaceRoot);

        assert.ok(result.updated.includes('hub'), 'hub agent should be updated');
        assert.ok(result.updated.includes('test'), 'test instruction should be updated');

        const updatedAgentContent = fs.readFileSync(agentPath, 'utf-8');
        assert.strictEqual(updatedAgentContent, 'Updated Hub content');

        const updatedInstructionContent = fs.readFileSync(instructionPath, 'utf-8');
        assert.ok(updatedInstructionContent.includes('Updated Test instruction'));
        assert.ok(updatedInstructionContent.includes('applyTo: "agents/hub.50e041.agent.md"'), 'applyTo should be rewritten in update');

        deployer.dispose();
    });
});

suite('DefaultDeployer — safe manifest enforcement', () => {
    let workspaceRoot: string;
    let config: DeploymentConfig;

    setup(() => {
        tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-deployer-manifest-test-'));
        workspaceRoot = path.join(tempRoot, 'workspace');
        fs.mkdirSync(workspaceRoot, { recursive: true });

        config = makeConfig({
            defaultAgents: ['hub', 'prompt-analyst', 'shell'],
            defaultInstructions: ['hub', 'mcp-usage', 'prompt-analyst', 'subagent-recovery'],
        });

        seedMandatorySources(config);
        seedMandatoryWorkspace(workspaceRoot);
    });

    teardown(() => {
        fs.rmSync(tempRoot, { recursive: true, force: true });
    });

    test('healthCheck preserves workspace-local skills and unmanaged files without sync evidence', () => {
        createSkillDir(path.join(workspaceRoot, '.github', 'skills'), 'local-skill');
        writeFile(path.join(workspaceRoot, '.github', 'agents', 'custom-helper.agent.md'), 'Local helper');

        const deployer = new DefaultDeployer(config);
        const report = deployer.healthCheck(workspaceRoot);

        assert.strictEqual(report.syncBacked, false);
        assert.strictEqual(report.cullTargets.length, 0);
        assert.ok(report.workspaceSpecific.some(entry => entry.kind === 'skill' && entry.name === 'local-skill'));
        assert.ok(report.workspaceSpecific.some(entry => entry.kind === 'agent' && entry.name === 'custom-helper'));
        assert.ok(fs.existsSync(path.join(workspaceRoot, '.github', 'skills', 'local-skill', 'SKILL.md')));

        deployer.dispose();
    });

    test('enforceManifest culls only server-backed ignored_local entries and preserves import candidates and skills', async () => {
        const cullAgentPath = path.join(workspaceRoot, '.github', 'agents', 'folder-cleanup-shell.agent.md');
        const importInstructionPath = path.join(workspaceRoot, '.github', 'instructions', 'community.instructions.md');
        const skillPath = path.join(workspaceRoot, '.github', 'skills', 'local-skill', 'SKILL.md');

        writeFile(cullAgentPath, 'Cull me');
        writeFile(importInstructionPath, '---\napplyTo: "**/*"\npm_sync_managed: true\npm_import_mode: manual\n---\nImport me');
        createSkillDir(path.join(workspaceRoot, '.github', 'skills'), 'local-skill');

        const syncReport = makeSyncReport(workspaceRoot, [
            makeSyncEntry({
                kind: 'agent',
                filename: 'folder-cleanup-shell.agent.md',
                relative_path: 'agents/folder-cleanup-shell.agent.md',
                canonical_name: 'folder-cleanup-shell',
                canonical_filename: 'folder-cleanup-shell.agent.md',
                status: 'ignored_local',
                policy: {
                    sync_managed: false,
                    controlled: false,
                    import_mode: 'never',
                    canonical_source: 'none',
                    canonical_path: null,
                    required_workspace_copy: false,
                    legacy_mandatory: false,
                    cull_reason: 'db_only_agent',
                    validation_errors: [],
                },
            }),
            makeSyncEntry({
                kind: 'instruction',
                filename: 'community.instructions.md',
                relative_path: 'instructions/community.instructions.md',
                canonical_name: 'community.instructions.md',
                canonical_filename: 'community.instructions.md',
                status: 'import_candidate',
                comparison_basis: 'local_only',
                policy: {
                    sync_managed: true,
                    controlled: false,
                    import_mode: 'manual',
                    canonical_source: 'none',
                    canonical_path: null,
                    required_workspace_copy: false,
                    legacy_mandatory: false,
                    validation_errors: [],
                },
            }),
        ]);

        const deployer = new DefaultDeployer(config);
        const result = await deployer.enforceManifest(workspaceRoot, syncReport);

        assert.ok(result.culled.includes('agent:folder-cleanup-shell'));
        assert.ok(!fs.existsSync(cullAgentPath));
        assert.ok(fs.existsSync(importInstructionPath));
        assert.ok(fs.existsSync(skillPath));

        deployer.dispose();
    });

    test('enforceManifest redeploys protected mandatory drift from canonical source', async () => {
        const hubPath = path.join(workspaceRoot, '.github', 'agents', 'hub.agent.md');
        writeFile(path.join(config.agentsRoot, 'core', 'hub.agent.md'), 'Canonical hub after drift');
        writeFile(hubPath, 'Workspace drifted hub');

        const syncReport = makeSyncReport(workspaceRoot, [
            makeSyncEntry({
                kind: 'agent',
                filename: 'hub.agent.md',
                relative_path: 'agents/hub.agent.md',
                canonical_name: 'hub',
                canonical_filename: 'hub.agent.md',
                status: 'protected_drift',
                comparison_basis: 'local_db_seed',
                policy: {
                    sync_managed: true,
                    controlled: true,
                    import_mode: 'never',
                    canonical_source: 'database_seed_resources',
                    canonical_path: 'agents/core/hub.agent.md',
                    required_workspace_copy: true,
                    legacy_mandatory: true,
                    validation_errors: [],
                },
            }),
        ]);

        const deployer = new DefaultDeployer(config);
        const result = await deployer.enforceManifest(workspaceRoot, syncReport);

        assert.ok(result.deployed.includes('agent:hub'));
        assert.strictEqual(fs.readFileSync(hubPath, 'utf-8'), 'Canonical hub after drift');

        deployer.dispose();
    });
});
