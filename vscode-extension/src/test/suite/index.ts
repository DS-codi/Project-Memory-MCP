/**
 * Mocha Test Suite Index
 * 
 * Sets up and runs the Mocha test suite for VS Code extension tests.
 */
import * as path from 'path';
import Mocha from 'mocha';
import { glob } from 'glob';
import * as vscode from 'vscode';

function normalizeRequestedTestPath(testPath: string): string {
    return testPath
        .replace(/\\/g, '/')
        .replace(/^src\/test\//, '')
        .replace(/\.ts$/i, '.js')
        .trim();
}

function getRequestedTests(): string[] {
    const raw = process.env.PM_TEST_FILTER;
    if (!raw) {
        return [];
    }

    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
            return [];
        }

        return parsed
            .filter((entry): entry is string => typeof entry === 'string')
            .map(normalizeRequestedTestPath)
            .filter((entry) => entry.length > 0);
    } catch {
        return [];
    }
}

function resolveExtensionId(): string {
    const explicitId = process.env.PM_EXTENSION_ID;
    if (explicitId && explicitId.trim().length > 0) {
        return explicitId.trim();
    }

    return 'project-memory.project-memory-dashboard';
}

async function teardownExtensionLifecycle(): Promise<void> {
    // VS Code manages extension deactivation at process shutdown.
    // Manual exported deactivate() calls here can race with in-flight API
    // registrations and produce DisposableStore lifecycle warnings.
    const extension = vscode.extensions.getExtension(resolveExtensionId());
    if (!extension?.isActive) {
        return;
    }

    await new Promise((resolve) => setTimeout(resolve, 0));
}

export async function run(): Promise<void> {
    const requestedTests = getRequestedTests();

    // Create the mocha test
    const mocha = new Mocha({
        ui: 'tdd',
        color: true,
        timeout: 10000,
    });

    const testRoots = [
        path.resolve(__dirname, '.'),
        path.resolve(__dirname, '../chat'),
        path.resolve(__dirname, '../ui'),
        path.resolve(__dirname, '../supervisor'),
    ];

    for (const root of testRoots) {
        const files = await glob('**/*.test.js', { cwd: root });
        files.forEach((filePath: string) => {
            if (requestedTests.length > 0) {
                const normalizedFilePath = filePath.replace(/\\/g, '/');
                const matches = requestedTests.some((requested) =>
                    normalizedFilePath.endsWith(requested) || normalizedFilePath.endsWith(path.basename(requested)),
                );

                if (!matches) {
                    return;
                }
            }

            mocha.addFile(path.resolve(root, filePath));
        });
    }

    mocha.suite.afterAll('extension lifecycle teardown', async () => {
        await teardownExtensionLifecycle();
    });

    // Run the mocha test
    return new Promise<void>((resolve, reject) => {
        try {
            mocha.run((failures: number) => {
                if (failures > 0) {
                    reject(new Error(`${failures} tests failed.`));
                } else {
                    resolve();
                }
            });
        } catch (err) {
            console.error(err);
            reject(err);
        }
    });
}
