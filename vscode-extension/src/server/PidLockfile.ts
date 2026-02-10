/**
 * PidLockfile
 * 
 * Guards against duplicate server processes across multiple VS Code windows.
 * Only one window "owns" the Express server at a time. When the owning window
 * closes, a surviving window can detect the stale lock and respawn the server.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface LockfileData {
    pid: number;
    port: number;
    windowId: string;
    timestamp: string;
}

export class PidLockfile {
    private lockfilePath: string;
    private windowId: string;

    constructor(dataRoot: string) {
        this.lockfilePath = path.join(dataRoot, 'server.lock');
        // Use a unique identifier per VS Code window: PID + a random suffix
        this.windowId = `${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
    }

    /** Try to acquire the lock. Returns true if this window now owns it. */
    acquire(port: number): boolean {
        const existing = this.read();

        // If a lockfile exists and the process is still alive, we don't own it
        if (existing && this.isProcessAlive(existing.pid)) {
            return false;
        }

        // Stale lock or no lock — claim it
        this.write(port);
        return true;
    }

    /** Release the lock if this window owns it. */
    release(): void {
        const existing = this.read();
        if (existing && existing.windowId === this.windowId) {
            try {
                fs.unlinkSync(this.lockfilePath);
            } catch { /* may already be deleted */ }
        }
    }

    /** Check if this window currently owns the lock. */
    isOwner(): boolean {
        const existing = this.read();
        return existing?.windowId === this.windowId;
    }

    /** Check if another window owns the lock and its process is alive. */
    isOwnedByOther(): boolean {
        const existing = this.read();
        if (!existing) { return false; }
        if (existing.windowId === this.windowId) { return false; }
        return this.isProcessAlive(existing.pid);
    }

    /** Check if the lockfile exists but the owning process is dead (stale). */
    isStale(): boolean {
        const existing = this.read();
        if (!existing) { return false; }
        return !this.isProcessAlive(existing.pid);
    }

    /** Get the current lock data (if any). */
    read(): LockfileData | null {
        try {
            const content = fs.readFileSync(this.lockfilePath, 'utf-8');
            return JSON.parse(content) as LockfileData;
        } catch {
            return null;
        }
    }

    private write(port: number): void {
        const data: LockfileData = {
            pid: process.pid,
            port,
            windowId: this.windowId,
            timestamp: new Date().toISOString(),
        };
        try {
            fs.mkdirSync(path.dirname(this.lockfilePath), { recursive: true });
            fs.writeFileSync(this.lockfilePath, JSON.stringify(data, null, 2));
        } catch (e) {
            console.error('Failed to write PID lockfile:', e);
        }
    }

    private isProcessAlive(pid: number): boolean {
        try {
            // Sending signal 0 checks if process exists without killing it
            process.kill(pid, 0);
            return true;
        } catch {
            return false;
        }
    }
}
