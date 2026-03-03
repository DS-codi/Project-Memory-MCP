import * as assert from 'assert';
import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';
import * as vscode from 'vscode';

function resolveExtensionId(): string {
    const explicitId = process.env.PM_EXTENSION_ID;
    if (explicitId && explicitId.trim().length > 0) {
        return explicitId.trim();
    }

    return 'project-memory.project-memory-dashboard';
}

function requestStatusCode(url: string, timeoutMs: number): Promise<number> {
    return new Promise((resolve, reject) => {
        const request = http.get(url, { timeout: timeoutMs }, (response) => {
            resolve(response.statusCode ?? 0);
            response.resume();
        });

        request.on('timeout', () => {
            request.destroy(new Error(`timeout after ${timeoutMs}ms`));
        });

        request.on('error', (error) => reject(error));
    });
}

async function writeAssertions(status: 'pass' | 'fail', details: Record<string, unknown>): Promise<void> {
    const assertionsPath = process.env.PM_EXTENSION_ASSERTIONS_PATH;
    if (!assertionsPath || assertionsPath.trim().length === 0) {
        return;
    }

    const payload = {
        run_id: process.env.PM_INTEGRATION_RUN_ID ?? 'unknown',
        lane: 'extension-headless',
        status,
        generated_at: new Date().toISOString(),
        details,
    };

    await fs.promises.mkdir(path.dirname(assertionsPath), { recursive: true });
    await fs.promises.writeFile(assertionsPath, JSON.stringify(payload, null, 2), 'utf8');
}

suite('Integration - Headless Activation + Handshake', () => {
    test('activates extension and performs backend handshake', async () => {
        const extensionId = resolveExtensionId();
        const extension = vscode.extensions.getExtension(extensionId);

        assert.ok(extension, `Extension not found: ${extensionId}`);

        await extension!.activate();
        assert.strictEqual(extension!.isActive, true, 'Extension did not become active after activation');

        const handshakeUrl = process.env.PM_EXTENSION_HANDSHAKE_URL ?? 'http://localhost:3000/health';
        const timeoutMs = Number.parseInt(process.env.PM_EXTENSION_HANDSHAKE_TIMEOUT_MS ?? '3000', 10);

        if (process.env.PM_EXTENSION_HEADLESS_DRY_RUN === '1') {
            await writeAssertions('pass', {
                extension_id: extensionId,
                extension_activated: true,
                backend_handshake: 'synthetic_pass',
                handshake_url: handshakeUrl,
                status_code: 200,
                dry_run: true,
            });
            return;
        }

        try {
            const statusCode = await requestStatusCode(handshakeUrl, timeoutMs);
            assert.strictEqual(statusCode, 200, `Handshake probe expected HTTP 200 but received ${statusCode} from ${handshakeUrl}`);

            await writeAssertions('pass', {
                extension_id: extensionId,
                extension_activated: true,
                backend_handshake: 'pass',
                handshake_url: handshakeUrl,
                status_code: statusCode,
                dry_run: false,
            });
        } catch (error) {
            await writeAssertions('fail', {
                extension_id: extensionId,
                extension_activated: true,
                backend_handshake: 'fail',
                handshake_url: handshakeUrl,
                error: error instanceof Error ? error.message : String(error),
                dry_run: false,
            });
            throw error;
        }
    });
});
