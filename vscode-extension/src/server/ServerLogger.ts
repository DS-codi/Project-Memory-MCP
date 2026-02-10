/**
 * ServerLogger
 * 
 * File-based logging utilities for ServerManager. Writes to rotating log files
 * under `data/logs/`. Separated from ServerManager to keep it under 400 lines.
 */

import * as fs from 'fs';
import * as path from 'path';

const MAX_LOG_SIZE = 1024 * 1024; // 1 MB

/** Write a line to a rotating log file. Non-critical — never throws. */
export function appendToRotatingLog(dataRoot: string, filename: string, line: string): void {
    try {
        const logsDir = path.join(dataRoot, 'logs');
        fs.mkdirSync(logsDir, { recursive: true });
        const logPath = path.join(logsDir, filename);

        // Rotate if exceeds max size
        try {
            const stat = fs.statSync(logPath);
            if (stat.size > MAX_LOG_SIZE) {
                const baseName = path.basename(filename, path.extname(filename));
                const ext = path.extname(filename);
                const rotated = path.join(logsDir, `${baseName}.${Date.now()}${ext}`);
                fs.renameSync(logPath, rotated);
            }
        } catch { /* file doesn't exist yet */ }

        fs.appendFileSync(logPath, line + '\n');
    } catch { /* non-critical — don't crash on log failure */ }
}

/** Write a structured lifecycle event as JSON to the process audit log. */
export function writeAuditEvent(dataRoot: string, event: string, details: Record<string, unknown> = {}): void {
    const entry = JSON.stringify({
        timestamp: new Date().toISOString(),
        event,
        ...details,
    });
    appendToRotatingLog(dataRoot, 'process-audit.log', entry);
}
