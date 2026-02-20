/**
 * Mocha Test Suite Index
 * 
 * Sets up and runs the Mocha test suite for VS Code extension tests.
 */
import * as path from 'path';
import Mocha from 'mocha';
import { glob } from 'glob';

export async function run(): Promise<void> {
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
        files.forEach((filePath: string) => mocha.addFile(path.resolve(root, filePath)));
    }

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
