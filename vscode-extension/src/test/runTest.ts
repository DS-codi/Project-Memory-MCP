/**
 * VS Code Extension Integration Test Runner
 * 
 * This script runs the extension integration tests inside VS Code.
 */
import * as path from 'path';
import { runTests } from '@vscode/test-electron';

async function main() {
    try {
        process.env.PROJECT_MEMORY_TEST_MODE = '1';
        const requestedTests = process.argv.slice(2).filter((arg) => /\.test\.(ts|js)$/i.test(arg));
        if (requestedTests.length > 0) {
            process.env.PM_TEST_FILTER = JSON.stringify(requestedTests);
        }

        // The folder containing the Extension Manifest package.json
        const extensionDevelopmentPath = path.resolve(__dirname, '../../');

        // The path to test runner
        const extensionTestsPath = path.resolve(__dirname, './suite/index');

        // Download VS Code, unzip it and run the integration tests
        await runTests({
            extensionDevelopmentPath,
            extensionTestsPath,
            launchArgs: [
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
