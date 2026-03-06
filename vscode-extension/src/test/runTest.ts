/**
 * VS Code Extension Integration Test Runner
 * 
 * This script runs the extension integration tests inside VS Code.
 */
import * as path from 'path';
import * as fs from 'fs';
import { randomUUID } from 'crypto';
import { runTests } from '@vscode/test-electron';

function cleanupLegacyUserDataLogs(extensionDevelopmentPath: string): void {
    const legacyLogsDir = path.resolve(extensionDevelopmentPath, '.vscode-test', 'user-data', 'logs');
    if (!fs.existsSync(legacyLogsDir)) {
        return;
    }

    try {
        fs.rmSync(legacyLogsDir, { recursive: true, force: true });
    } catch {
        // Ignore cleanup failures to keep test execution resilient.
    }
}

function buildIsolatedRuntimeDirs(extensionDevelopmentPath: string): {
    userDataDir: string;
    extensionsDir: string;
} {
    const runtimeRoot = path.resolve(extensionDevelopmentPath, '.vscode-test', 'runtime');
    const runId = `${Date.now()}-${process.pid}-${randomUUID()}`;
    const runRoot = path.join(runtimeRoot, runId);

    const userDataDir = path.join(runRoot, 'user-data');
    const extensionsDir = path.join(runRoot, 'extensions');

    fs.mkdirSync(userDataDir, { recursive: true });
    fs.mkdirSync(extensionsDir, { recursive: true });

    return {
        userDataDir,
        extensionsDir,
    };
}

async function main() {
    try {
        process.env.PROJECT_MEMORY_TEST_MODE = '1';
        const requestedTests = process.argv.slice(2).filter((arg) => /\.test\.(ts|js)$/i.test(arg));

        if (requestedTests.length > 0) {
            process.env.PM_TEST_FILTER = JSON.stringify(requestedTests);
        }

        // Default to synthetic handshake mode so full extension suites stay deterministic
        // in environments where backend services are intentionally absent.
        if (!process.env.PM_EXTENSION_HEADLESS_DRY_RUN) {
            process.env.PM_EXTENSION_HEADLESS_DRY_RUN = '1';
        }

        // The folder containing the Extension Manifest package.json
        const extensionDevelopmentPath = path.resolve(__dirname, '../../');

        // The path to test runner
        const extensionTestsPath = path.resolve(__dirname, './suite/index');

        // Clear legacy logs from older non-isolated runs so signature scans only
        // observe the current execution window.
        cleanupLegacyUserDataLogs(extensionDevelopmentPath);

        const isolatedRuntime = buildIsolatedRuntimeDirs(extensionDevelopmentPath);

        // Download VS Code, unzip it and run the integration tests
        await runTests({
            extensionDevelopmentPath,
            extensionTestsPath,
            launchArgs: [
                '--new-window',
                `--user-data-dir=${isolatedRuntime.userDataDir}`,
                `--extensions-dir=${isolatedRuntime.extensionsDir}`,
                '--disable-extensions', // Disable other extensions
                '--disable-gpu', // Disable GPU for CI environments
            ],
        });

        // Give the test host a brief window to flush shutdown handlers before
        // a follow-up wrapper run starts.
        await new Promise((resolve) => setTimeout(resolve, 250));
    } catch (err) {
        console.error('Failed to run tests:', err);
        process.exit(1);
    }
}

main();
