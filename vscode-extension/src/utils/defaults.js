"use strict";
/**
 * Default path resolution for Project Memory data directories.
 * Resolves workspace-relative paths using workspace identity when available.
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
exports.getDefaultDataRoot = getDefaultDataRoot;
exports.getDefaultAgentsRoot = getDefaultAgentsRoot;
exports.getDefaultInstructionsRoot = getDefaultInstructionsRoot;
exports.getDefaultPromptsRoot = getDefaultPromptsRoot;
exports.getDefaultSkillsRoot = getDefaultSkillsRoot;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const workspace_identity_1 = require("./workspace-identity");
function resolveDefaultPath(subdir) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders) {
        const identity = (0, workspace_identity_1.resolveWorkspaceIdentity)(workspaceFolders[0].uri.fsPath);
        if (identity) {
            return path.join(identity.projectPath, subdir);
        }
        return vscode.Uri.joinPath(workspaceFolders[0].uri, subdir).fsPath;
    }
    return '';
}
function getDefaultDataRoot() {
    return resolveDefaultPath('data');
}
function getDefaultAgentsRoot() {
    return resolveDefaultPath('agents');
}
function getDefaultInstructionsRoot() {
    return resolveDefaultPath('instructions');
}
function getDefaultPromptsRoot() {
    return resolveDefaultPath('prompts');
}
/**
 * Skills root resolution with system-wide fallback.
 * Unlike agents/instructions (which users configure via agentsRoot/instructionsRoot),
 * skillsRoot is often left unset. When unset, derive from the same parent directory
 * as an already-configured agentsRoot or instructionsRoot so skills resolve to the
 * shared MCP project directory in every workspace — not the current workspace.
 */
function getDefaultSkillsRoot() {
    const config = vscode.workspace.getConfiguration('projectMemory');
    // 1. Explicit skillsRoot setting
    const explicit = config.get('skillsRoot');
    if (explicit) {
        return explicit;
    }
    // 2. Explicit globalSkillsRoot fallback
    const global = config.get('globalSkillsRoot');
    if (global) {
        return global;
    }
    // 3. Derive as sibling of agentsRoot (agents/ → skills/)
    const agentsRoot = config.get('agentsRoot');
    if (agentsRoot) {
        return path.join(path.dirname(agentsRoot), 'skills');
    }
    // 4. Derive as sibling of instructionsRoot
    const instructionsRoot = config.get('instructionsRoot');
    if (instructionsRoot) {
        return path.join(path.dirname(instructionsRoot), 'skills');
    }
    // 5. Final fallback: workspace-relative
    return resolveDefaultPath('skills');
}
//# sourceMappingURL=defaults.js.map