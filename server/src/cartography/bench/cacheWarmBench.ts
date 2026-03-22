/**
 * cacheWarmBench.ts
 *
 * Benchmark: Python cold | Rust cold | Rust cached
 *
 * Run with: npx ts-node --esm server/src/cartography/bench/cacheWarmBench.ts
 * Or:       npx vite-node server/src/cartography/bench/cacheWarmBench.ts
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { ensureSchema, getCached, setCached } from '../adapters/scanCache.js';
import { getRustBinaryPath, RustBridge } from '../adapters/rustBridge.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Project root = bench/ -> cartography/ -> src/ -> server/ -> project root
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const WORKSPACE_PATH = PROJECT_ROOT;
const SCAN_MODE = 'summary';
const PYTHON_COLD_MS = 18_902; // baseline from Phase 0

async function runBench(): Promise<void> {
  const binaryPath = getRustBinaryPath();
  if (!existsSync(binaryPath)) {
    console.error(`Binary not found at ${binaryPath}. Run: cargo build --release --manifest-path crates/cartographer-core/Cargo.toml`);
    process.exit(1);
  }

  const bridge = new RustBridge();

  // --- Cold Rust scan ---
  console.log('Running cold Rust scan...');
  const coldStart = Date.now();
  const coldResult = await bridge.invoke({
    action: 'scan',
    root: WORKSPACE_PATH,
    scan_mode: SCAN_MODE,
    max_files: 5000,
    max_seconds: 60.0,
  });
  const rustColdMs = Date.now() - coldStart;

  if (!coldResult.ok) {
    console.error('Cold scan failed:', coldResult.error);
    process.exit(1);
  }

  // --- Write to cache ---
  const db = new Database(':memory:'); // in-memory for bench isolation
  ensureSchema(db);
  setCached(db, WORKSPACE_PATH, 'bench_head', SCAN_MODE, coldResult.result!, rustColdMs);

  // --- Warm cache read ---
  const warmStart = Date.now();
  const warmResult = getCached(db, WORKSPACE_PATH, 'bench_head', SCAN_MODE);
  const rustWarmMs = Date.now() - warmStart;

  if (!warmResult) {
    console.error('Cache read failed — result not found after write');
    process.exit(1);
  }

  // --- Print results ---
  console.log('\n=== Cartographer Performance Benchmark ===');
  console.log(`Python cold:   ${PYTHON_COLD_MS.toLocaleString()} ms (baseline)`);
  console.log(`Rust cold:     ${rustColdMs.toLocaleString()} ms  (${(PYTHON_COLD_MS / rustColdMs).toFixed(1)}x faster)`);
  console.log(`Rust cached:   ${rustWarmMs.toLocaleString()} ms  (${(PYTHON_COLD_MS / Math.max(rustWarmMs, 1)).toFixed(0)}x faster)`);
  console.log(`Files scanned: ${coldResult.result!.diagnostics.file_count}`);
  console.log(`Symbols:       ${coldResult.result!.diagnostics.symbol_count ?? 'N/A (summary mode)'}`);
  console.log();

  if (rustWarmMs > 50) {
    console.warn(`WARNING: Warm cache read ${rustWarmMs}ms exceeds 50ms target`);
  } else {
    console.log(`✓ Warm cache < 50ms target (${rustWarmMs}ms)`);
  }

  if (rustColdMs > 2000) {
    console.warn(`WARNING: Rust cold scan ${rustColdMs}ms exceeds 2000ms target`);
  } else {
    console.log(`✓ Rust cold < 2000ms target (${rustColdMs}ms)`);
  }
}

runBench().catch((err) => {
  console.error('Bench error:', err);
  process.exit(1);
});
