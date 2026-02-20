import * as net from 'net';

/** Named pipe path used by the Project Memory Supervisor on Windows. */
const SUPERVISOR_PIPE = '\\\\.\\pipe\\project-memory-supervisor';

/**
 * Attempt a named pipe connection to the running Supervisor process.
 *
 * @param timeoutMs Maximum time (ms) to wait for the connection before giving up.
 * @returns `true` if the connection succeeds within the timeout, `false` otherwise.
 */
export function detectSupervisor(timeoutMs: number): Promise<boolean> {
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

    const socket = net.createConnection({ path: SUPERVISOR_PIPE });

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
