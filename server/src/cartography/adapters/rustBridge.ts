import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const EXE_SUFFIX = process.platform === 'win32' ? '.exe' : '';

/**
 * Returns the path to the cartographer-core release binary.
 * The binary lives in the workspace root target/release/ (not the crate subdir).
 * Path: server/src/cartography/adapters -> up 5 levels = project root
 */
export function getRustBinaryPath(): string {
  // From adapters/ -> src/ -> cartography/ -> server/ -> Project-Memory-MCP/ (project root)
  const projectRoot = path.resolve(MODULE_DIR, '..', '..', '..', '..');
  const release = path.join(projectRoot, 'target', 'release', `cartographer-core${EXE_SUFFIX}`);
  const debug = path.join(projectRoot, 'target', 'debug', `cartographer-core${EXE_SUFFIX}`);
  return existsSync(release) ? release : debug;
}

export interface RustScanRequest {
  action: 'scan';
  root: string;
  scan_mode: string;
  max_files?: number;
  max_seconds?: number;
  include_extensions?: string[];
  exclude_paths?: string[];
}

export interface RustScanResponse {
  ok: boolean;
  result?: {
    root: string;
    scan_mode: string;
    files: Array<{
      path: string;
      language: string;
      size_bytes: number;
      symbols: Array<{
        name: string;
        kind: string;
        line_start: number;
        line_end: number;
        qualified_name?: string;
        exported?: boolean;
        async_fn?: boolean;
        params?: string;
        return_type?: string;
        docstring?: string;
        body_fragment?: string;
      }>;
    }>;
    diagnostics: {
      elapsed_seconds: number;
      file_count: number;
      symbol_count: number;
      budget_hit?: boolean;
      errors: string[];
    };
  };
  error?: string;
}

const TIMEOUT_MS = 35_000;

export class RustBridge {
  async invoke(cmd: RustScanRequest): Promise<RustScanResponse> {
    const binaryPath = getRustBinaryPath();
    if (!existsSync(binaryPath)) {
      throw new Error(`cartographer-core binary not found at ${binaryPath}`);
    }

    const inputLine = JSON.stringify(cmd) + '\n';

    return new Promise<RustScanResponse>((resolve, reject) => {
      let settled = false;
      let stdoutBuffer = '';
      let stderrBuffer = '';

      const child = spawn(binaryPath, [], {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });

      const timeoutHandle = setTimeout(() => {
        if (!settled) {
          settled = true;
          child.kill('SIGKILL');
          reject(new Error(`cartographer-core timed out after ${TIMEOUT_MS}ms`));
        }
      }, TIMEOUT_MS);

      const finalize = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutHandle);
        fn();
      };

      child.once('error', (err) => {
        finalize(() => reject(err));
      });

      child.stderr.on('data', (chunk: Buffer) => {
        stderrBuffer += chunk.toString();
      });

      child.stdout.on('data', (chunk: Buffer) => {
        stdoutBuffer += chunk.toString();
      });

      child.once('close', (code) => {
        finalize(() => {
          const line = stdoutBuffer.trim();
          if (!line) {
            reject(new Error(
              `cartographer-core exited (code ${code}) with no output. stderr: ${stderrBuffer.trim()}`
            ));
            return;
          }
          try {
            resolve(JSON.parse(line) as RustScanResponse);
          } catch {
            reject(new Error(`cartographer-core returned invalid JSON: ${line.slice(0, 200)}`));
          }
        });
      });

      child.stdin.once('error', () => { /* stdin close race — expected */ });
      child.stdin.end(inputLine, 'utf8');
    });
  }
}
