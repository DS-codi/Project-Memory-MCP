export interface HeadlessTerminalRunRequest {
    workspaceId: string;
    command: string;
    args?: string[];
    cwd?: string;
    timeoutMs?: number;
}

export interface HeadlessTerminalSession {
    sessionId: string;
    authorization: 'allowed' | 'blocked';
    startedAt: string;
    exitedAt?: string;
    exitCode?: number;
}

export interface HeadlessTerminalRunResult {
    ok: boolean;
    message?: string;
    session?: HeadlessTerminalSession;
}

export interface HeadlessTerminalReadRequest {
    workspaceId: string;
    sessionId: string;
}

export interface HeadlessTerminalReadResult {
    ok: boolean;
    output: string;
    session?: HeadlessTerminalSession;
}

export interface HeadlessTerminalExecutionPort {
    run(request: HeadlessTerminalRunRequest): Promise<HeadlessTerminalRunResult>;
    readOutput(request: HeadlessTerminalReadRequest): Promise<HeadlessTerminalReadResult>;
    kill(request: HeadlessTerminalReadRequest): Promise<HeadlessTerminalRunResult>;
}
