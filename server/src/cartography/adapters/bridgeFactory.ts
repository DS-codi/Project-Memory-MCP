import { existsSync } from 'node:fs';
import { RustBridge, getRustBinaryPath } from './rustBridge.js';

function logBridgeSelection(bridge: string): void {
  process.stderr.write(`[cartographer] using ${bridge} bridge\n`);
}

export function getBridge(): RustBridge | null {
  const rustPath = getRustBinaryPath();
  const useRust = process.env.CARTOGRAPHER_ENGINE !== 'python' && existsSync(rustPath);
  logBridgeSelection(useRust ? 'Rust' : 'Python');
  return useRust ? new RustBridge() : null;
}
