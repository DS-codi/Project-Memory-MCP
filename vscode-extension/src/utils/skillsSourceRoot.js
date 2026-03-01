"use strict";
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
exports.resolveSkillsSourceRoot = resolveSkillsSourceRoot;
exports.buildMissingSkillsSourceWarning = buildMissingSkillsSourceWarning;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
function resolveSkillsSourceRoot(primaryRoot, workspacePath, existsSync = fs.existsSync, additionalSourceCandidates = []) {
    const candidates = [
        primaryRoot,
        ...additionalSourceCandidates
    ]
        .filter((candidate) => Boolean(candidate))
        .map((candidate) => path.resolve(candidate));
    const checkedPaths = [];
    const seen = new Set();
    for (const candidate of candidates) {
        const key = process.platform === 'win32' ? candidate.toLowerCase() : candidate;
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        checkedPaths.push(candidate);
        if (existsSync(candidate)) {
            return {
                root: candidate,
                checkedPaths
            };
        }
    }
    return {
        root: undefined,
        checkedPaths
    };
}
function buildMissingSkillsSourceWarning(workspacePath, checkedPaths) {
    const settingsHint = 'Set projectMemory.skillsRoot or projectMemory.globalSkillsRoot in settings.';
    if (checkedPaths.length === 0) {
        return `No skills source directory found. ${settingsHint}`;
    }
    const display = checkedPaths
        .map((checkedPath) => {
        const relativePath = path.relative(workspacePath, checkedPath);
        return relativePath && !relativePath.startsWith('..') ? relativePath : checkedPath;
    })
        .join(', ');
    return `No skills source directory found. Checked: ${display} — ${settingsHint}`;
}
//# sourceMappingURL=skillsSourceRoot.js.map