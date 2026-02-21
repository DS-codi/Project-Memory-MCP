import * as net from 'net';
import * as vscode from 'vscode';

/** Named pipe path used by the Project Memory Supervisor on Windows. */
const SUPERVISOR_PIPE = '\\\\.\\pipe\\project-memory-supervisor';

/** Default TCP endpoint used by Supervisor in container/TCP transport mode. */
const SUPERVISOR_TCP_HOST = '127.0.0.1';
const SUPERVISOR_TCP_PORT = 45470;

type ProbeTarget =
  | { kind: 'pipe'; path: string }
  | { kind: 'tcp'; host: string; port: number };

function getProbeTargets(): ProbeTarget[] {
  const cfg = vscode.workspace.getConfiguration('projectMemory');
  const containerMode = cfg.get<'auto' | 'local' | 'container'>('containerMode', 'auto');

  if (containerMode === 'container') {
    return [{ kind: 'tcp', host: SUPERVISOR_TCP_HOST, port: SUPERVISOR_TCP_PORT }];
  }

  if (containerMode === 'local') {
    return [{ kind: 'pipe', path: SUPERVISOR_PIPE }];
  }

  // Auto mode: keep existing pipe-first behavior and add TCP fallback.
  return [
    { kind: 'pipe', path: SUPERVISOR_PIPE },
    { kind: 'tcp', host: SUPERVISOR_TCP_HOST, port: SUPERVISOR_TCP_PORT },
  ];
}

function tryProbe(target: ProbeTarget, timeoutMs: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let settled = false;

    const settle = (result: boolean): void => {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy();
      resolve(result);
    };

    const socket =
      target.kind === 'pipe'
        ? net.createConnection({ path: target.path })
        : net.createConnection({ host: target.host, port: target.port });

    const timer = setTimeout(() => settle(false), timeoutMs);

    socket.on('connect', () => {
      clearTimeout(timer);
      settle(true);
    });

    socket.on('error', () => {
      clearTimeout(timer);
      settle(false);
    });
  });
}

/**
 * Attempt a named pipe connection to the running Supervisor process.
 *
 * @param timeoutMs Maximum time (ms) to wait for the connection before giving up.
 * @returns `true` if the connection succeeds within the timeout, `false` otherwise.
 */
export function detectSupervisor(timeoutMs: number): Promise<boolean> {
  return (async () => {
    const targets = getProbeTargets();
    for (const target of targets) {
      const isReachable = await tryProbe(target, timeoutMs);
      if (isReachable) {
        return true;
      }
    }
    return false;
  })();
}
