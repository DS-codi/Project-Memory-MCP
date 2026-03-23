import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import {
    MANDATORY_AGENTS,
    MANDATORY_INSTRUCTIONS,
    SKILLS_ARE_DB_ONLY,
    ManifestHealthReport,
    isMandatoryAgent,
    isMandatoryInstruction,
    isDbOnlyAgent,
    isDbOnlyInstruction,
    isImportedFile,
} from './workspace-context-manifest';

export interface DeploymentConfig {
    agentsRoot: string;
    instructionsRoot: string;
    skillsRoot: string;
    defaultAgents: string[];
    defaultInstructions: string[];
    defaultSkills: string[];
    /**
     * Whether deployToWorkspace() auto-deploys skills.
     * Defaults to false — skills are DB-only and should never be deployed
     * to the workspace automatically. Set to true only in legacy test setups.
     */
    deploySkills?: boolean;
}

export class DefaultDeployer {
    private outputChannel: vscode.OutputChannel | undefined;
    private readonly suppressOutputChannel: boolean;
    private config: DeploymentConfig;

    constructor(config: DeploymentConfig) {
        this.config = config;
        // Extension-host tests exercise deployment code heavily; avoid creating
        // VS Code output channels in that mode to prevent lifecycle noise.
        this.suppressOutputChannel = process.env.PROJECT_MEMORY_TEST_MODE === '1';
    }

    updateConfig(config: Partial<DeploymentConfig>): void {
        this.config = { ...this.config, ...config };
    }

    /**
     * Read the workspace identity file and derive the 6-char hex short code.
     * Returns null if .projectmemory/identity.json does not exist or is unreadable.
     *
     * Example: workspace_id "project_memory_mcp-50e04147a402" → "50e041"
     */
    private readWorkspaceShortCode(workspacePath: string): string | null {
        const identityPath = path.join(workspacePath, '.projectmemory', 'identity.json');
        try {
            const raw = fs.readFileSync(identityPath, 'utf-8');
            const identity = JSON.parse(raw) as { workspace_id?: string };
            const id = identity.workspace_id;
            if (!id) return null;
            const parts = id.split('-');
            const hex = parts[parts.length - 1] ?? '';
            return hex.substring(0, 6) || null;
        } catch {
            return null;
        }
    }

    /**
     * Deploy default agents and instructions to a workspace.
     * If a workspace identity file exists, agent and instruction files are deployed
     * with a 6-char workspace short code in the filename (e.g. hub.50e041.agent.md).
     * The applyTo frontmatter field in instruction files is updated to reference
     * the workspace-coded agent filenames so VS Code continues to match them.
     */
    async deployToWorkspace(workspacePath: string): Promise<{ agents: string[]; instructions: string[]; skills: string[] }> {
        const deployedAgents: string[] = [];
        const deployedInstructions: string[] = [];
        const deployedSkills: string[] = [];

        const shortCode = this.readWorkspaceShortCode(workspacePath);
        this.log(`Deploying defaults to workspace: ${workspacePath} (short code: ${shortCode ?? 'none'})`);

        // Deploy agents
        const agentsTargetDir = path.join(workspacePath, '.github', 'agents');
        for (const agentName of this.config.defaultAgents) {
            try {
                const deployed = await this.deployAgentWithCode(agentName, agentsTargetDir, shortCode);
                if (deployed) {
                    deployedAgents.push(agentName);
                }
            } catch (error) {
                this.log(`Failed to deploy agent ${agentName}: ${error}`);
            }
        }

        // Deploy instructions
        const instructionsTargetDir = path.join(workspacePath, '.github', 'instructions');
        for (const instructionName of this.getInstructionNamesToDeploy()) {
            try {
                const deployed = await this.deployInstructionWithCode(instructionName, instructionsTargetDir, shortCode, this.config.defaultAgents);
                if (deployed) {
                    deployedInstructions.push(instructionName);
                }
            } catch (error) {
                this.log(`Failed to deploy instruction ${instructionName}: ${error}`);
            }
        }

        // Deploy skills (opt-in only — skills are DB-only by default)
        if (this.config.deploySkills === true) {
        const skillsTargetDir = path.join(workspacePath, '.github', 'skills');
        try {
            const skills = await this.deployAllSkills(skillsTargetDir);
            deployedSkills.push(...skills);
        } catch (error) {
            this.log(`Failed to deploy skills: ${error}`);
        }
        } else {
            this.log('Skills deployment skipped (deploySkills !== true — skills are DB-only)');
        }

        this.log(`Deployed ${deployedAgents.length} agents, ${deployedInstructions.length} instructions, ${deployedSkills.length} skills`);

        return { agents: deployedAgents, instructions: deployedInstructions, skills: deployedSkills };
    }

    /**
     * Deploy a single agent file, adding a workspace short code to the filename
     * if one is provided (e.g. hub.50e041.agent.md).
     * Falls back to hub.agent.md when shortCode is null.
     */
    private async deployAgentWithCode(agentName: string, targetDir: string, shortCode: string | null): Promise<boolean> {
        let sourcePath = path.join(this.config.agentsRoot, 'core', `${agentName}.agent.md`);
        if (!fs.existsSync(sourcePath)) { sourcePath = path.join(this.config.agentsRoot, 'spoke', `${agentName}.agent.md`); }
        if (!fs.existsSync(sourcePath)) { sourcePath = path.join(this.config.agentsRoot, `${agentName}.agent.md`); }
        const targetFilename = shortCode ? `${agentName}.${shortCode}.agent.md` : `${agentName}.agent.md`;
        const targetPath = path.join(targetDir, targetFilename);
        return this.copyFile(sourcePath, targetPath);
    }

    /**
     * Deploy a single instruction file, adding a workspace short code to the filename
     * and rewriting any applyTo: "agents/hub.agent.md" references to the workspace-coded form.
     */
    private async deployInstructionWithCode(
        instructionName: string,
        targetDir: string,
        shortCode: string | null,
        knownAgentNames: string[],
        overwrite = false
    ): Promise<boolean> {
        const sourcePath = path.join(this.config.instructionsRoot, `${instructionName}.instructions.md`);
        if (!fs.existsSync(sourcePath)) {
            this.log(`Source instruction not found: ${sourcePath}`);
            return false;
        }

        const targetFilename = shortCode
            ? `${instructionName}.${shortCode}.instructions.md`
            : `${instructionName}.instructions.md`;
        const targetPath = path.join(targetDir, targetFilename);

        if (fs.existsSync(targetPath) && !overwrite) {
            this.log(`Target exists, skipping: ${targetPath}`);
            return false;
        }

        // Ensure target directory exists
        const targetDirPath = path.dirname(targetPath);
        if (!fs.existsSync(targetDirPath)) {
            fs.mkdirSync(targetDirPath, { recursive: true });
        }

        let content = fs.readFileSync(sourcePath, 'utf-8');

        // Rewrite applyTo references to use workspace-coded agent filenames
        if (shortCode) {
            for (const agentName of knownAgentNames) {
                const canonical = `agents/${agentName}.agent.md`;
                const coded = `agents/${agentName}.${shortCode}.agent.md`;
                content = content.replace(new RegExp(escapeRegex(canonical), 'g'), coded);
            }
        }

        fs.writeFileSync(targetPath, content, 'utf-8');
        this.log(`Deployed (with workspace code): ${sourcePath} -> ${targetPath}`);
        return true;
    }

    /**
     * Deploy a single agent file (canonical filename, no workspace code).
     * Used by direct callers outside of deployToWorkspace.
     */
    async deployAgent(agentName: string, targetDir: string): Promise<boolean> {
        let sourcePath = path.join(this.config.agentsRoot, 'core', `${agentName}.agent.md`);
        if (!fs.existsSync(sourcePath)) { sourcePath = path.join(this.config.agentsRoot, 'spoke', `${agentName}.agent.md`); }
        if (!fs.existsSync(sourcePath)) { sourcePath = path.join(this.config.agentsRoot, `${agentName}.agent.md`); }
        const targetPath = path.join(targetDir, `${agentName}.agent.md`);

        return this.copyFile(sourcePath, targetPath);
    }

    /**
     * Deploy a single instruction file (canonical filename, no workspace code).
     * Used by direct callers outside of deployToWorkspace.
     */
    async deployInstruction(instructionName: string, targetDir: string): Promise<boolean> {
        const sourcePath = path.join(this.config.instructionsRoot, `${instructionName}.instructions.md`);
        const targetPath = path.join(targetDir, `${instructionName}.instructions.md`);

        return this.copyFile(sourcePath, targetPath);
    }

    /**
     * Deploy all skill directories from skillsRoot to target dir.
     * Each skill is a subdirectory containing a SKILL.md file.
     */
    async deployAllSkills(targetDir: string): Promise<string[]> {
        const deployed: string[] = [];

        if (!this.config.skillsRoot || !fs.existsSync(this.config.skillsRoot)) {
            return deployed;
        }

        const entries = fs.readdirSync(this.config.skillsRoot);
        let filteredEntries = entries;
        if (this.config.defaultSkills && this.config.defaultSkills.length > 0) {
            filteredEntries = entries.filter(entry => this.config.defaultSkills.includes(entry));
        }
        for (const entry of filteredEntries) {
            const sourceDir = path.join(this.config.skillsRoot, entry);
            const stat = fs.statSync(sourceDir);
            if (!stat.isDirectory()) { continue; }

            const sourceFile = path.join(sourceDir, 'SKILL.md');
            if (!fs.existsSync(sourceFile)) { continue; }

            const skillTargetDir = path.join(targetDir, entry);
            const targetFile = path.join(skillTargetDir, 'SKILL.md');

            if (fs.existsSync(targetFile)) {
                // Check if source is newer
                const sourceStats = fs.statSync(sourceFile);
                const targetStats = fs.statSync(targetFile);
                if (sourceStats.mtimeMs <= targetStats.mtimeMs) {
                    continue;
                }
                // Source is newer, overwrite
                const copied = await this.copyFile(sourceFile, targetFile, true);
                if (copied) { deployed.push(entry); }
            } else {
                // New skill, copy it
                const copied = await this.copyFile(sourceFile, targetFile);
                if (copied) { deployed.push(entry); }
            }
        }

        return deployed;
    }

    /**
     * Update deployed files in a workspace (sync with source)
     */
    async updateWorkspace(workspacePath: string): Promise<{ updated: string[]; added: string[] }> {
        const updated: string[] = [];
        const added: string[] = [];

        const shortCode = this.readWorkspaceShortCode(workspacePath);
        const agentsDir = path.join(workspacePath, '.github', 'agents');
        const instructionsDir = path.join(workspacePath, '.github', 'instructions');

        // Update agents
        for (const agentName of this.config.defaultAgents) {
            let sourcePath = path.join(this.config.agentsRoot, 'core', `${agentName}.agent.md`);
        if (!fs.existsSync(sourcePath)) { sourcePath = path.join(this.config.agentsRoot, 'spoke', `${agentName}.agent.md`); }
        if (!fs.existsSync(sourcePath)) { sourcePath = path.join(this.config.agentsRoot, `${agentName}.agent.md`); }
            const targetFilename = shortCode ? `${agentName}.${shortCode}.agent.md` : `${agentName}.agent.md`;
            const targetPath = path.join(agentsDir, targetFilename);

            if (!fs.existsSync(sourcePath)) continue;

            if (fs.existsSync(targetPath)) {
                // Check if source is newer
                const sourceStats = fs.statSync(sourcePath);
                const targetStats = fs.statSync(targetPath);

                if (sourceStats.mtimeMs > targetStats.mtimeMs) {
                    await this.copyFile(sourcePath, targetPath, true);
                    updated.push(agentName);
                }
            } else {
                await this.copyFile(sourcePath, targetPath);
                added.push(agentName);
            }
        }

        // Update instructions
        for (const instructionName of this.config.defaultInstructions) {
            const sourcePath = path.join(this.config.instructionsRoot, `${instructionName}.instructions.md`);
            const targetFilename = shortCode ? `${instructionName}.${shortCode}.instructions.md` : `${instructionName}.instructions.md`;
            const targetPath = path.join(instructionsDir, targetFilename);

            if (!fs.existsSync(sourcePath)) continue;

            if (fs.existsSync(targetPath)) {
                const sourceStats = fs.statSync(sourcePath);
                const targetStats = fs.statSync(targetPath);

                if (sourceStats.mtimeMs > targetStats.mtimeMs) {
                    await this.deployInstructionWithCode(instructionName, instructionsDir, shortCode, this.config.defaultAgents, true);
                    updated.push(instructionName);
                }
            } else {
                await this.deployInstructionWithCode(instructionName, instructionsDir, shortCode, this.config.defaultAgents);
                added.push(instructionName);
            }
        }

        return { updated, added };
    }

    /**
     * List what would be deployed (dry run)
     */
    getDeploymentPlan(): { agents: string[]; instructions: string[]; skills: string[] } {
        const agents = this.config.defaultAgents.filter(name => {
            let sourcePath = path.join(this.config.agentsRoot, 'core', `${name}.agent.md`);
            if (!fs.existsSync(sourcePath)) { sourcePath = path.join(this.config.agentsRoot, 'spoke', `${name}.agent.md`); }
            if (!fs.existsSync(sourcePath)) { sourcePath = path.join(this.config.agentsRoot, `${name}.agent.md`); }
            return fs.existsSync(sourcePath);
        });

        const instructions = this.getInstructionNamesToDeploy().filter(name => {
            const sourcePath = path.join(this.config.instructionsRoot, `${name}.instructions.md`);
            return fs.existsSync(sourcePath);
        });

        const skills = (this.config.defaultSkills || []).filter(name => {
            const sourceDir = path.join(this.config.skillsRoot, name);
            return fs.existsSync(path.join(sourceDir, 'SKILL.md'));
        });

        return { agents, instructions, skills };
    }

    private getInstructionNamesToDeploy(): string[] {
        const configured = this.config.defaultInstructions ?? [];
        const configuredMatches = configured.filter(name => {
            const sourcePath = path.join(this.config.instructionsRoot, `${name}.instructions.md`);
            return fs.existsSync(sourcePath);
        });

        if (configuredMatches.length > 0) {
            return configuredMatches;
        }

        if (!this.config.instructionsRoot || !fs.existsSync(this.config.instructionsRoot)) {
            return [];
        }

        return fs.readdirSync(this.config.instructionsRoot)
            .filter(entry => entry.endsWith('.instructions.md'))
            .map(entry => entry.replace(/\.instructions\.md$/, ''));
    }

    private async copyFile(sourcePath: string, targetPath: string, overwrite = false): Promise<boolean> {
        if (!fs.existsSync(sourcePath)) {
            this.log(`Source not found: ${sourcePath}`);
            return false;
        }

        if (fs.existsSync(targetPath) && !overwrite) {
            this.log(`Target exists, skipping: ${targetPath}`);
            return false;
        }

        // Ensure target directory exists
        const targetDir = path.dirname(targetPath);
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }

        fs.copyFileSync(sourcePath, targetPath);
        this.log(`Copied: ${sourcePath} -> ${targetPath}`);
        return true;
    }

    // ── Manifest-driven enforcement ─────────────────────────────────────────

    /**
     * Inspect a workspace's `.github/` directory against the manifest.
     * Reports missing mandatory files, files that should be culled, and
     * workspace-specific files (left alone).
     */
    healthCheck(workspacePath: string): ManifestHealthReport {
        const report: ManifestHealthReport = {
            missingMandatory: [],
            cullTargets: [],
            workspaceSpecific: [],
            healthy: true,
        };

        const shortCode = this.readWorkspaceShortCode(workspacePath);
        const agentsDir = path.join(workspacePath, '.github', 'agents');
        const instructionsDir = path.join(workspacePath, '.github', 'instructions');
        const skillsDir = path.join(workspacePath, '.github', 'skills');

        // ── Check mandatory agents ──────────────────────────────────────
        for (const name of MANDATORY_AGENTS) {
            if (!this.findDeployedFile(agentsDir, name, 'agent', shortCode)) {
                report.missingMandatory.push({ kind: 'agent', name });
            }
        }

        // ── Check mandatory instructions ────────────────────────────────
        for (const name of MANDATORY_INSTRUCTIONS) {
            if (!this.findDeployedFile(instructionsDir, name, 'instructions', shortCode)) {
                report.missingMandatory.push({ kind: 'instruction', name });
            }
        }

        // ── Scan agents for cull targets / workspace-specific ───────────
        if (fs.existsSync(agentsDir)) {
            for (const file of fs.readdirSync(agentsDir)) {
                if (!file.endsWith('.agent.md')) continue;
                const baseName = this.extractBaseName(file, 'agent');
                if (isMandatoryAgent(baseName)) continue;
                if (isDbOnlyAgent(baseName) || isImportedFile(file)) {
                    report.cullTargets.push({
                        kind: isImportedFile(file) ? 'imported' : 'agent',
                        path: path.join(agentsDir, file),
                        name: baseName,
                    });
                } else {
                    report.workspaceSpecific.push({
                        kind: 'agent',
                        path: path.join(agentsDir, file),
                        name: baseName,
                    });
                }
            }
        }

        // ── Scan instructions for cull targets / workspace-specific ─────
        if (fs.existsSync(instructionsDir)) {
            for (const file of fs.readdirSync(instructionsDir)) {
                if (!file.endsWith('.instructions.md')) continue;
                const baseName = this.extractBaseName(file, 'instructions');
                if (isMandatoryInstruction(baseName)) continue;
                if (isDbOnlyInstruction(baseName) || isImportedFile(file)) {
                    report.cullTargets.push({
                        kind: isImportedFile(file) ? 'imported' : 'instruction',
                        path: path.join(instructionsDir, file),
                        name: baseName,
                    });
                } else {
                    report.workspaceSpecific.push({
                        kind: 'instruction',
                        path: path.join(instructionsDir, file),
                        name: baseName,
                    });
                }
            }
        }

        // ── Scan skills directory (all skills are DB-only) ──────────────
        if (SKILLS_ARE_DB_ONLY && fs.existsSync(skillsDir)) {
            for (const entry of fs.readdirSync(skillsDir)) {
                const entryPath = path.join(skillsDir, entry);
                if (fs.statSync(entryPath).isDirectory()) {
                    report.cullTargets.push({ kind: 'skill', path: entryPath, name: entry });
                }
            }
        }

        report.healthy = report.missingMandatory.length === 0 && report.cullTargets.length === 0;
        return report;
    }

    /**
     * Enforce the manifest on a workspace:
     *   1. Deploy any missing mandatory files
     *   2. Remove all cull targets (DB-only, imported, skills)
     *
     * Returns a summary of actions taken.
     */
    async enforceManifest(workspacePath: string): Promise<{
        deployed: string[];
        culled: string[];
        workspaceSpecific: string[];
    }> {
        const report = this.healthCheck(workspacePath);
        const deployed: string[] = [];
        const culled: string[] = [];

        const shortCode = this.readWorkspaceShortCode(workspacePath);

        // ── Deploy missing mandatory agents ─────────────────────────────
        const agentsDir = path.join(workspacePath, '.github', 'agents');
        const instructionsDir = path.join(workspacePath, '.github', 'instructions');

        for (const missing of report.missingMandatory) {
            if (missing.kind === 'agent') {
                const ok = await this.deployAgentWithCode(missing.name, agentsDir, shortCode);
                if (ok) deployed.push(`agent:${missing.name}`);
            } else {
                const ok = await this.deployInstructionWithCode(
                    missing.name, instructionsDir, shortCode, [...MANDATORY_AGENTS], true
                );
                if (ok) deployed.push(`instruction:${missing.name}`);
            }
        }

        // ── Cull DB-only / imported / skill files ───────────────────────
        for (const target of report.cullTargets) {
            try {
                if (target.kind === 'skill') {
                    fs.rmSync(target.path, { recursive: true, force: true });
                } else {
                    fs.unlinkSync(target.path);
                }
                culled.push(`${target.kind}:${target.name}`);
                this.log(`Culled ${target.kind}: ${target.path}`);
            } catch (error) {
                this.log(`Failed to cull ${target.path}: ${error}`);
            }
        }

        // ── Clean up empty skills directory after culling ────────────────
        const skillsDir = path.join(workspacePath, '.github', 'skills');
        if (fs.existsSync(skillsDir)) {
            try {
                const remaining = fs.readdirSync(skillsDir);
                if (remaining.length === 0) {
                    fs.rmdirSync(skillsDir);
                    this.log('Removed empty .github/skills/ directory');
                }
            } catch { /* ignore */ }
        }

        return {
            deployed,
            culled,
            workspaceSpecific: report.workspaceSpecific.map(ws => `${ws.kind}:${ws.name}`),
        };
    }

    /**
     * Find a deployed file that may have a workspace short code embedded.
     * Matches: `{name}.agent.md` or `{name}.{shortCode}.agent.md`
     */
    private findDeployedFile(dir: string, name: string, suffix: string, shortCode: string | null): boolean {
        if (!fs.existsSync(dir)) return false;
        const canonical = `${name}.${suffix}.md`;
        const coded = shortCode ? `${name}.${shortCode}.${suffix}.md` : null;
        for (const file of fs.readdirSync(dir)) {
            if (file === canonical || (coded && file === coded)) return true;
        }
        return false;
    }

    /**
     * Extract the base name from a deployed filename, stripping any workspace
     * short code.  e.g. `hub.50e041.agent.md` → `hub`, `mcp-usage.instructions.md` → `mcp-usage`
     */
    private extractBaseName(filename: string, suffix: string): string {
        // Pattern: {name}.{6-hex-chars}.{suffix}.md  OR  {name}.{suffix}.md
        const codedPattern = new RegExp(`^(.+)\\.[0-9a-f]{6}\\.${escapeRegex(suffix)}\\.md$`);
        const codedMatch = filename.match(codedPattern);
        if (codedMatch) return codedMatch[1];
        return filename.replace(`.${suffix}.md`, '');
    }

    private log(message: string): void {
        const outputChannel = this.getOutputChannel();
        if (!outputChannel) {
            return;
        }

        const timestamp = new Date().toISOString();
        outputChannel.appendLine(`[${timestamp}] ${message}`);
    }

    showLogs(): void {
        this.getOutputChannel()?.show();
    }

    dispose(): void {
        this.outputChannel?.dispose();
        this.outputChannel = undefined;
    }

    private getOutputChannel(): vscode.OutputChannel | undefined {
        if (this.suppressOutputChannel) {
            return undefined;
        }

        if (!this.outputChannel) {
            this.outputChannel = vscode.window.createOutputChannel('Project Memory Deployment');
        }

        return this.outputChannel;
    }
}

/** Escape a string for safe use inside a RegExp pattern. */
function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
