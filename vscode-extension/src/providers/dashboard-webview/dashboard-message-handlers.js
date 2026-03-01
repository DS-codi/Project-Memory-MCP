"use strict";
/**
 * Dashboard message handlers for skills and instructions management.
 *
 * These functions handle webview → extension messages for listing,
 * deploying, and undeploying skills and instructions.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleGetSkills = handleGetSkills;
exports.handleDeploySkill = handleDeploySkill;
exports.handleGetInstructions = handleGetInstructions;
exports.handleDeployInstruction = handleDeployInstruction;
exports.handleUndeployInstruction = handleUndeployInstruction;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const defaults_1 = require("../../utils/defaults");
const skillsSourceRoot_1 = require("../../utils/skillsSourceRoot");
function notify(message, ...items) {
    const config = vscode.workspace.getConfiguration('projectMemory');
    if (config.get('showNotifications', true)) {
        return vscode.window.showInformationMessage(message, ...items);
    }
    return Promise.resolve(undefined);
}
// --- Skills handlers ---
/** List available skills and their deployment status */
function handleGetSkills(poster) {
    try {
        const config = vscode.workspace.getConfiguration('projectMemory');
        const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const configuredSkillsRoot = config.get('skillsRoot') || (0, defaults_1.getDefaultSkillsRoot)();
        const globalSkillsRoot = config.get('globalSkillsRoot');
        const sourceResolution = (0, skillsSourceRoot_1.resolveSkillsSourceRoot)(configuredSkillsRoot, workspacePath ?? process.cwd(), fs.existsSync, [globalSkillsRoot]);
        if (!sourceResolution.root) {
            poster.postMessage({ type: 'skillsList', data: { skills: [] } });
            return;
        }
        const skillsRoot = sourceResolution.root;
        const skills = fs.readdirSync(skillsRoot)
            .filter((dir) => {
            const skillFile = path.join(skillsRoot, dir, 'SKILL.md');
            return fs.existsSync(skillFile);
        })
            .map((dir) => {
            let description = '';
            try {
                const content = fs.readFileSync(path.join(skillsRoot, dir, 'SKILL.md'), 'utf-8');
                const match = content.match(/^description:\s*(.+)$/m);
                if (match) {
                    description = match[1].substring(0, 120);
                }
            }
            catch { /* ignore */ }
            let deployed = false;
            if (workspacePath) {
                const deployedPath = path.join(workspacePath, '.github', 'skills', dir, 'SKILL.md');
                deployed = fs.existsSync(deployedPath);
            }
            return { name: dir, description, deployed };
        });
        poster.postMessage({ type: 'skillsList', data: { skills } });
    }
    catch (error) {
        console.error('Failed to list skills:', error);
        poster.postMessage({ type: 'skillsList', data: { skills: [] } });
    }
}
/** Deploy a single skill to the workspace */
function handleDeploySkill(poster, data) {
    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspacePath) {
        vscode.window.showErrorMessage('No workspace folder open');
        return;
    }
    const config = vscode.workspace.getConfiguration('projectMemory');
    const configuredSkillsRoot = config.get('skillsRoot') || (0, defaults_1.getDefaultSkillsRoot)();
    const globalSkillsRoot = config.get('globalSkillsRoot');
    const sourceResolution = (0, skillsSourceRoot_1.resolveSkillsSourceRoot)(configuredSkillsRoot, workspacePath, fs.existsSync, [globalSkillsRoot]);
    if (!sourceResolution.root) {
        vscode.window.showWarningMessage((0, skillsSourceRoot_1.buildMissingSkillsSourceWarning)(workspacePath, sourceResolution.checkedPaths));
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
    }
    catch (error) {
        vscode.window.showErrorMessage(`Failed to deploy skill: ${error}`);
    }
}
// --- Instructions handlers ---
/** List available instructions and their deployment status */
function handleGetInstructions(poster) {
    try {
        const config = vscode.workspace.getConfiguration('projectMemory');
        const instructionsRoot = config.get('instructionsRoot') || (0, defaults_1.getDefaultInstructionsRoot)();
        if (!instructionsRoot || !fs.existsSync(instructionsRoot)) {
            poster.postMessage({ type: 'instructionsList', data: { instructions: [] } });
            return;
        }
        const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const instructions = fs.readdirSync(instructionsRoot)
            .filter((f) => f.endsWith('.instructions.md'))
            .map((f) => {
            const name = f.replace('.instructions.md', '');
            let deployed = false;
            if (workspacePath) {
                const deployedPath = path.join(workspacePath, '.github', 'instructions', f);
                deployed = fs.existsSync(deployedPath);
            }
            return { name, fileName: f, deployed };
        });
        poster.postMessage({ type: 'instructionsList', data: { instructions } });
    }
    catch (error) {
        console.error('Failed to list instructions:', error);
        poster.postMessage({ type: 'instructionsList', data: { instructions: [] } });
    }
}
/** Deploy a single instruction to the workspace */
function handleDeployInstruction(poster, data) {
    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspacePath) {
        vscode.window.showErrorMessage('No workspace folder open');
        return;
    }
    const config = vscode.workspace.getConfiguration('projectMemory');
    const instructionsRoot = config.get('instructionsRoot') || (0, defaults_1.getDefaultInstructionsRoot)();
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
    }
    catch (error) {
        vscode.window.showErrorMessage(`Failed to deploy instruction: ${error}`);
    }
}
/** Remove an instruction from the workspace */
function handleUndeployInstruction(poster, data) {
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
    }
    catch (error) {
        vscode.window.showErrorMessage(`Failed to remove instruction: ${error}`);
    }
}
// --- Sessions handlers removed (Plan 01: Extension Strip-Down) ---
// Session management functions (handleGetSessions, handleStopSession,
// handleInjectSession, handleClearAllSessions, handleForceCloseSession,
// syncServerSessions) have been archived to src/_archive/chat/orchestration/.
// The SessionInterceptRegistry is no longer used by the extension.
//# sourceMappingURL=dashboard-message-handlers.js.map