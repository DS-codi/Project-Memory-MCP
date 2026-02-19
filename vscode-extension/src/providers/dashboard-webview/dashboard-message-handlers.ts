/**
 * Dashboard message handlers for skills and instructions management.
 *
 * These functions handle webview → extension messages for listing,
 * deploying, and undeploying skills and instructions.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { getDefaultSkillsRoot, getDefaultInstructionsRoot } from '../../utils/defaults';
import { buildMissingSkillsSourceWarning, resolveSkillsSourceRoot } from '../../utils/skillsSourceRoot';
import type { SessionInterceptRegistry } from '../../chat/orchestration/session-intercept-registry';

/** Message posting interface (subset of DashboardViewProvider) */
export interface MessagePoster {
    postMessage(message: { type: string; data?: unknown }): void;
}

function notify(message: string, ...items: string[]): Thenable<string | undefined> {
    const config = vscode.workspace.getConfiguration('projectMemory');
    if (config.get<boolean>('showNotifications', true)) {
        return vscode.window.showInformationMessage(message, ...items);
    }
    return Promise.resolve(undefined);
}

// --- Skills handlers ---

/** List available skills and their deployment status */
export function handleGetSkills(poster: MessagePoster): void {
    try {
        const config = vscode.workspace.getConfiguration('projectMemory');
        const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const configuredSkillsRoot = config.get<string>('skillsRoot') || getDefaultSkillsRoot();
        const globalSkillsRoot = config.get<string>('globalSkillsRoot');
        const sourceResolution = resolveSkillsSourceRoot(
            configuredSkillsRoot,
            workspacePath ?? process.cwd(),
            fs.existsSync,
            [globalSkillsRoot]
        );

        if (!sourceResolution.root) {
            poster.postMessage({ type: 'skillsList', data: { skills: [] } });
            return;
        }

        const skillsRoot = sourceResolution.root;
        const skills = fs.readdirSync(skillsRoot)
            .filter((dir: string) => {
                const skillFile = path.join(skillsRoot, dir, 'SKILL.md');
                return fs.existsSync(skillFile);
            })
            .map((dir: string) => {
                let description = '';
                try {
                    const content = fs.readFileSync(path.join(skillsRoot, dir, 'SKILL.md'), 'utf-8');
                    const match = content.match(/^description:\s*(.+)$/m);
                    if (match) { description = match[1].substring(0, 120); }
                } catch { /* ignore */ }

                let deployed = false;
                if (workspacePath) {
                    const deployedPath = path.join(workspacePath, '.github', 'skills', dir, 'SKILL.md');
                    deployed = fs.existsSync(deployedPath);
                }

                return { name: dir, description, deployed };
            });

        poster.postMessage({ type: 'skillsList', data: { skills } });
    } catch (error) {
        console.error('Failed to list skills:', error);
        poster.postMessage({ type: 'skillsList', data: { skills: [] } });
    }
}

/** Deploy a single skill to the workspace */
export function handleDeploySkill(poster: MessagePoster, data: { skillName: string }): void {
    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspacePath) {
        vscode.window.showErrorMessage('No workspace folder open');
        return;
    }

    const config = vscode.workspace.getConfiguration('projectMemory');
    const configuredSkillsRoot = config.get<string>('skillsRoot') || getDefaultSkillsRoot();
    const globalSkillsRoot = config.get<string>('globalSkillsRoot');
    const sourceResolution = resolveSkillsSourceRoot(
        configuredSkillsRoot,
        workspacePath,
        fs.existsSync,
        [globalSkillsRoot]
    );
    if (!sourceResolution.root) {
        vscode.window.showWarningMessage(buildMissingSkillsSourceWarning(workspacePath, sourceResolution.checkedPaths));
        return;
    }
    const skillsRoot = sourceResolution.root;

    try {
        const sourceDir = path.join(skillsRoot, data.skillName);
        if (!fs.existsSync(sourceDir)) {
            vscode.window.showWarningMessage(`Skill "${data.skillName}" not found in source root.`);
            return;
        }
        const destDir = path.join(workspacePath, '.github', 'skills', data.skillName);
        fs.mkdirSync(destDir, { recursive: true });

        const files = fs.readdirSync(sourceDir);
        for (const file of files) {
            const srcFile = path.join(sourceDir, file);
            if (fs.statSync(srcFile).isFile()) {
                fs.copyFileSync(srcFile, path.join(destDir, file));
            }
        }

        notify(`Deployed skill "${data.skillName}" to workspace`);
        handleGetSkills(poster); // Refresh the list
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to deploy skill: ${error}`);
    }
}

// --- Instructions handlers ---

/** List available instructions and their deployment status */
export function handleGetInstructions(poster: MessagePoster): void {
    try {
        const config = vscode.workspace.getConfiguration('projectMemory');
        const instructionsRoot = config.get<string>('instructionsRoot') || getDefaultInstructionsRoot();
        if (!instructionsRoot || !fs.existsSync(instructionsRoot)) {
            poster.postMessage({ type: 'instructionsList', data: { instructions: [] } });
            return;
        }

        const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const instructions = fs.readdirSync(instructionsRoot)
            .filter((f: string) => f.endsWith('.instructions.md'))
            .map((f: string) => {
                const name = f.replace('.instructions.md', '');
                let deployed = false;
                if (workspacePath) {
                    const deployedPath = path.join(workspacePath, '.github', 'instructions', f);
                    deployed = fs.existsSync(deployedPath);
                }
                return { name, fileName: f, deployed };
            });

        poster.postMessage({ type: 'instructionsList', data: { instructions } });
    } catch (error) {
        console.error('Failed to list instructions:', error);
        poster.postMessage({ type: 'instructionsList', data: { instructions: [] } });
    }
}

/** Deploy a single instruction to the workspace */
export function handleDeployInstruction(poster: MessagePoster, data: { instructionName: string }): void {
    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspacePath) {
        vscode.window.showErrorMessage('No workspace folder open');
        return;
    }

    const config = vscode.workspace.getConfiguration('projectMemory');
    const instructionsRoot = config.get<string>('instructionsRoot') || getDefaultInstructionsRoot();
    if (!instructionsRoot) {
        vscode.window.showErrorMessage('Instructions root not configured');
        return;
    }

    try {
        const fileName = `${data.instructionName}.instructions.md`;
        const sourcePath = path.join(instructionsRoot, fileName);
        const targetDir = path.join(workspacePath, '.github', 'instructions');
        fs.mkdirSync(targetDir, { recursive: true });
        fs.copyFileSync(sourcePath, path.join(targetDir, fileName));

        notify(`Deployed instruction "${data.instructionName}" to workspace`);
        handleGetInstructions(poster); // Refresh the list
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to deploy instruction: ${error}`);
    }
}

/** Remove an instruction from the workspace */
export function handleUndeployInstruction(poster: MessagePoster, data: { instructionName: string }): void {
    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspacePath) {
        vscode.window.showErrorMessage('No workspace folder open');
        return;
    }

    try {
        const fileName = `${data.instructionName}.instructions.md`;
        const filePath = path.join(workspacePath, '.github', 'instructions', fileName);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            notify(`Removed instruction "${data.instructionName}" from workspace`);
        }
        handleGetInstructions(poster); // Refresh the list
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to remove instruction: ${error}`);
    }
}

// --- Sessions handlers ---

/** Options for server-side session discovery */
export interface SessionDiscoveryContext {
    apiPort: number;
    workspaceId: string;
}

/**
 * Fetch active agent sessions from the dashboard API and auto-register
 * any that aren't already in the local SessionInterceptRegistry.
 * Returns the count of newly registered sessions.
 */
async function syncServerSessions(
    registry: SessionInterceptRegistry,
    ctx: SessionDiscoveryContext
): Promise<number> {
    try {
        // Step 1: Get plan listing for IDs and statuses (lightweight — no agent_sessions)
        const listResponse = await fetch(
            `http://localhost:${ctx.apiPort}/api/plans/workspace/${ctx.workspaceId}`
        );
        if (!listResponse.ok) return 0;

        const listData = await listResponse.json() as {
            plans?: Array<{
                id?: string;
                plan_id?: string;
                status?: string;
            }>;
        };

        const plans = listData.plans ?? [];
        const activePlanIds = plans
            .filter(p => p.status !== 'archived')
            .map(p => p.id ?? p.plan_id)
            .filter((id): id is string => !!id)
            .slice(0, 10); // Limit to 10 active plans to avoid excessive requests

        if (activePlanIds.length === 0) return 0;

        let registered = 0;

        // Step 2: Fetch full state for each active plan (includes agent_sessions)
        for (const planId of activePlanIds) {
            try {
                const planResponse = await fetch(
                    `http://localhost:${ctx.apiPort}/api/plans/${ctx.workspaceId}/${planId}`
                );
                if (!planResponse.ok) continue;

                const planState = await planResponse.json() as {
                    agent_sessions?: Array<{
                        session_id: string;
                        agent_type: string;
                        started_at: string;
                        completed_at?: string;
                        context?: { parent_session_id?: string };
                    }>;
                };

                for (const sess of planState.agent_sessions ?? []) {
                    // Skip completed sessions
                    if (sess.completed_at) continue;

                    // Skip if already tracked locally
                    if (registry.getBySessionId(sess.session_id)) continue;

                    // Auto-register into the local registry
                    await registry.register({
                        sessionId: sess.session_id,
                        workspaceId: ctx.workspaceId,
                        planId,
                        agentType: sess.agent_type,
                        parentSessionId: sess.context?.parent_session_id,
                        startedAt: sess.started_at
                    });
                    registered++;
                }
            } catch {
                // Skip individual plan fetch errors
            }
        }

        return registered;
    } catch (err) {
        console.error('Failed to sync server sessions:', err);
        return 0;
    }
}

/** List active sessions from registry (with optional server-side discovery) */
export async function handleGetSessions(
    poster: MessagePoster,
    registry: SessionInterceptRegistry | undefined,
    discoveryCtx?: SessionDiscoveryContext
): Promise<void> {
    if (!registry) {
        poster.postMessage({ type: 'sessionsList', data: { sessions: [] } });
        return;
    }
    
    try {
        // Sync from server first if discovery context is available
        if (discoveryCtx) {
            await syncServerSessions(registry, discoveryCtx);
        }

        const sessions = registry.listActive();
        poster.postMessage({ type: 'sessionsList', data: { sessions } });
    } catch (error) {
        console.error('Failed to list sessions:', error);
        poster.postMessage({ type: 'sessionsList', data: { sessions: [] } });
    }
}

/** Queue stop directive for a session */
export function handleStopSession(
    poster: MessagePoster,
    registry: SessionInterceptRegistry | undefined,
    data: { sessionKey: string }
): void {
    if (!registry) return;
    
    try {
        // Parse tripleKey: 'workspaceId::planId::sessionId'
        const [workspaceId, planId, sessionId] = data.sessionKey.split('::');
        if (!workspaceId || !planId || !sessionId) {
            poster.postMessage({ 
                type: 'sessionStopResult', 
                data: { success: false, sessionKey: data.sessionKey, error: 'Invalid session key' }
            });
            return;
        }
        
        const queued = registry.queueInterrupt(workspaceId, planId, sessionId);
        poster.postMessage({ 
            type: 'sessionStopResult', 
            data: { success: queued, sessionKey: data.sessionKey } 
        });
    } catch (error) {
        console.error('Failed to stop session:', error);
        poster.postMessage({ 
            type: 'sessionStopResult', 
            data: { success: false, sessionKey: data.sessionKey } 
        });
    }
}

/** Queue inject payload for a session */
export function handleInjectSession(
    poster: MessagePoster,
    registry: SessionInterceptRegistry | undefined,
    data: { sessionKey: string; text: string }
): void {
    if (!registry) return;
    
    try {
        // Parse tripleKey: 'workspaceId::planId::sessionId'
        const [workspaceId, planId, sessionId] = data.sessionKey.split('::');
        if (!workspaceId || !planId || !sessionId) {
            poster.postMessage({ 
                type: 'sessionInjectResult', 
                data: { success: false, sessionKey: data.sessionKey, error: 'Invalid session key' }
            });
            return;
        }
        
        const queued = registry.queueInject(workspaceId, planId, sessionId, data.text);
        poster.postMessage({ 
            type: 'sessionInjectResult', 
            data: { success: queued, sessionKey: data.sessionKey } 
        });
        
        if (queued) {
            notify(`Guidance injected into ${sessionId.substring(0, 12)}...`);
        }
    } catch (error) {
        console.error('Failed to inject into session:', error);
        poster.postMessage({ 
            type: 'sessionInjectResult', 
            data: { success: false, sessionKey: data.sessionKey } 
        });
    }
}
