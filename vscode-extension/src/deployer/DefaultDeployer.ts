import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface DeploymentConfig {
    agentsRoot: string;
    instructionsRoot: string;
    defaultAgents: string[];
    defaultInstructions: string[];
}

export class DefaultDeployer {
    private outputChannel: vscode.OutputChannel;
    private config: DeploymentConfig;

    constructor(config: DeploymentConfig) {
        this.config = config;
        this.outputChannel = vscode.window.createOutputChannel('Project Memory Deployment');
    }

    updateConfig(config: Partial<DeploymentConfig>): void {
        this.config = { ...this.config, ...config };
    }

    /**
     * Deploy default agents and instructions to a workspace
     */
    async deployToWorkspace(workspacePath: string): Promise<{ agents: string[]; instructions: string[] }> {
        const deployedAgents: string[] = [];
        const deployedInstructions: string[] = [];

        this.log(`Deploying defaults to workspace: ${workspacePath}`);

        // Deploy agents
        const agentsTargetDir = path.join(workspacePath, '.github', 'agents');
        for (const agentName of this.config.defaultAgents) {
            try {
                const deployed = await this.deployAgent(agentName, agentsTargetDir);
                if (deployed) {
                    deployedAgents.push(agentName);
                }
            } catch (error) {
                this.log(`Failed to deploy agent ${agentName}: ${error}`);
            }
        }

        // Deploy instructions
        const instructionsTargetDir = path.join(workspacePath, '.github', 'instructions');
        for (const instructionName of this.config.defaultInstructions) {
            try {
                const deployed = await this.deployInstruction(instructionName, instructionsTargetDir);
                if (deployed) {
                    deployedInstructions.push(instructionName);
                }
            } catch (error) {
                this.log(`Failed to deploy instruction ${instructionName}: ${error}`);
            }
        }

        this.log(`Deployed ${deployedAgents.length} agents, ${deployedInstructions.length} instructions`);

        return { agents: deployedAgents, instructions: deployedInstructions };
    }

    /**
     * Deploy a single agent file
     */
    async deployAgent(agentName: string, targetDir: string): Promise<boolean> {
        const sourcePath = path.join(this.config.agentsRoot, `${agentName}.agent.md`);
        const targetPath = path.join(targetDir, `${agentName}.agent.md`);

        return this.copyFile(sourcePath, targetPath);
    }

    /**
     * Deploy a single instruction file
     */
    async deployInstruction(instructionName: string, targetDir: string): Promise<boolean> {
        const sourcePath = path.join(this.config.instructionsRoot, `${instructionName}.instructions.md`);
        const targetPath = path.join(targetDir, `${instructionName}.instructions.md`);

        return this.copyFile(sourcePath, targetPath);
    }

    /**
     * Update deployed files in a workspace (sync with source)
     */
    async updateWorkspace(workspacePath: string): Promise<{ updated: string[]; added: string[] }> {
        const updated: string[] = [];
        const added: string[] = [];

        const agentsDir = path.join(workspacePath, '.github', 'agents');
        const instructionsDir = path.join(workspacePath, '.github', 'instructions');

        // Update agents
        for (const agentName of this.config.defaultAgents) {
            const sourcePath = path.join(this.config.agentsRoot, `${agentName}.agent.md`);
            const targetPath = path.join(agentsDir, `${agentName}.agent.md`);

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
            const targetPath = path.join(instructionsDir, `${instructionName}.instructions.md`);

            if (!fs.existsSync(sourcePath)) continue;

            if (fs.existsSync(targetPath)) {
                const sourceStats = fs.statSync(sourcePath);
                const targetStats = fs.statSync(targetPath);

                if (sourceStats.mtimeMs > targetStats.mtimeMs) {
                    await this.copyFile(sourcePath, targetPath, true);
                    updated.push(instructionName);
                }
            } else {
                await this.copyFile(sourcePath, targetPath);
                added.push(instructionName);
            }
        }

        return { updated, added };
    }

    /**
     * List what would be deployed (dry run)
     */
    getDeploymentPlan(): { agents: string[]; instructions: string[] } {
        const agents = this.config.defaultAgents.filter(name => {
            const sourcePath = path.join(this.config.agentsRoot, `${name}.agent.md`);
            return fs.existsSync(sourcePath);
        });

        const instructions = this.config.defaultInstructions.filter(name => {
            const sourcePath = path.join(this.config.instructionsRoot, `${name}.instructions.md`);
            return fs.existsSync(sourcePath);
        });

        return { agents, instructions };
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

    private log(message: string): void {
        const timestamp = new Date().toISOString();
        this.outputChannel.appendLine(`[${timestamp}] ${message}`);
    }

    showLogs(): void {
        this.outputChannel.show();
    }

    dispose(): void {
        this.outputChannel.dispose();
    }
}
