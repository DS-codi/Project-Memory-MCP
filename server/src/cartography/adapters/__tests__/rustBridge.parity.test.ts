import { existsSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { RustBridge, getRustBinaryPath } from '../rustBridge.js';

const BINARY_PRESENT = existsSync(getRustBinaryPath());

describe('RustBridge parity tests', () => {
  const maybeIt = BINARY_PRESENT ? it : it.skip;

  maybeIt('summary mode returns ok=true, files array, and diagnostics', async () => {
    const bridge = new RustBridge();
    const result = await bridge.invoke({
      action: 'scan',
      root: process.cwd(),
      scan_mode: 'summary',
      max_files: 50,
      max_seconds: 10.0,
    });
    expect(result.ok).toBe(true);
    expect(Array.isArray(result.result?.files)).toBe(true);
    expect(result.result?.diagnostics.file_count).toBeGreaterThan(0);
    expect(result.result?.diagnostics.elapsed_seconds).toBeLessThan(5);
  }, 15_000);

  maybeIt('file_context mode returns at least one symbol', async () => {
    const bridge = new RustBridge();
    const result = await bridge.invoke({
      action: 'scan',
      root: process.cwd(),
      scan_mode: 'file_context',
      max_files: 20,
      max_seconds: 10.0,
    });
    expect(result.ok).toBe(true);
    const allSymbols = result.result!.files.flatMap(f => f.symbols);
    expect(allSymbols.length).toBeGreaterThan(0);
  }, 15_000);
});
