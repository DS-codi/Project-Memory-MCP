const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const esbuild = require('esbuild');

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function run() {
  const projectRoot = path.resolve(__dirname, '..');
  const entryPoint = path.join(projectRoot, 'src', 'test', 'replay', 'cli', 'replay-cli.ts');
  const scenariosPath = path.join(projectRoot, 'src', 'test', 'replay', 'scenarios', 'baseline-scenarios.v1.json');
  const profilePath = path.join(projectRoot, 'src', 'test', 'replay', 'config', 'default.profile.json');
  const outputPath = path.join(projectRoot, '.replay-runs');
  const outDir = path.join(projectRoot, '.replay-bin');
  const outFile = path.join(outDir, 'replay-cli.cjs');

  ensureDir(outDir);

  esbuild.buildSync({
    entryPoints: [entryPoint],
    outfile: outFile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: ['node20'],
    sourcemap: false,
    logLevel: 'error'
  });

  const cliArgs = process.argv.slice(2);
  const hasScenarios = cliArgs.includes('--scenarios');
  const hasProfile = cliArgs.includes('--profile');
  const hasOut = cliArgs.includes('--out');

  if (!hasScenarios) {
    cliArgs.push('--scenarios', scenariosPath);
  }

  if (!hasProfile) {
    cliArgs.push('--profile', profilePath);
  }

  if (!hasOut) {
    cliArgs.push('--out', outputPath);
  }
  const child = spawnSync(process.execPath, [outFile, ...cliArgs], {
    stdio: 'inherit',
    cwd: projectRoot,
    env: process.env
  });

  if (typeof child.status === 'number') {
    process.exit(child.status);
  }

  process.exit(1);
}

try {
  run();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Replay runner failed: ${message}\n`);
  process.exit(1);
}
