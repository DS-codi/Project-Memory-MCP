/**
 * VS Code Extension Integration Test Runner
 * 
 * This script runs the extension integration tests inside VS Code.
 */
import * as path from 'path';
import * as fs from 'fs';
import { runTests } from '@vscode/test-electron';

function isHeadlessHandshakeTarget(requestedTests: string[]): boolean {
    return requestedTests.some((testPath) =>
        /headless-activation-handshake\.test\.(ts|js)$/i.test(testPath.replace(/\\/g, '/')),
    );
}

function buildIsolatedRuntimeDirs(extensionDevelopmentPath: string): {
    userDataDir: string;
    extensionsDir: string;
} {
    const runtimeRoot = path.resolve(extensionDevelopmentPath, '.vscode-test', 'runtime');
    const runId = `${Date.now()}-${process.pid}`;
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
        const headlessHandshakeTarget = isHeadlessHandshakeTarget(requestedTests);

        if (requestedTests.length > 0) {
            process.env.PM_TEST_FILTER = JSON.stringify(requestedTests);
        }

        // Keep targeted handshake validation deterministic in local runs where backend services may be absent.
        if (headlessHandshakeTarget && !process.env.PM_EXTENSION_HEADLESS_DRY_RUN) {
            process.env.PM_EXTENSION_HEADLESS_DRY_RUN = '1';
        }

        // The folder containing the Extension Manifest package.json
        const extensionDevelopmentPath = path.resolve(__dirname, '../../');

        // The path to test runner
        const extensionTestsPath = path.resolve(__dirname, './suite/index');
        const isolatedRuntime = buildIsolatedRuntimeDirs(extensionDevelopmentPath);

        // Download VS Code, unzip it and run the integration tests
        await runTests({
            extensionDevelopmentPath,
            extensionTestsPath,
            launchArgs: [
                `--user-data-dir=${isolatedRuntime.userDataDir}`,
                `--extensions-dir=${isolatedRuntime.extensionsDir}`,
                '--disable-extensions', // Disable other extensions
                '--disable-gpu', // Disable GPU for CI environments
            ],
        });
    } catch (err) {
        console.error('Failed to run tests:', err);
        process.exit(1);
    }
}

main();
