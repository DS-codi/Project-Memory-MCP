import * as assert from 'assert';
import * as vscode from 'vscode';
import { resolveDashboardPort, __resetResolveDashboardPortTestState } from '../../utils/dashboard-port';

type InspectLike<T> = {
    key: string;
    defaultValue?: T;
    globalValue?: T;
    workspaceValue?: T;
    workspaceFolderValue?: T;
};

function makeConfig(options: {
    values?: Record<string, unknown>;
    inspected?: Record<string, InspectLike<number> | undefined>;
}): vscode.WorkspaceConfiguration {
    const values = options.values ?? {};
    const inspected = options.inspected ?? {};

    return {
        get<T>(key: string, defaultValue?: T): T {
            if (key in values) {
                return values[key] as T;
            }
            return defaultValue as T;
        },
        has: (key: string) => key in values,
        inspect<T>(key: string): T | undefined {
            return inspected[key] as unknown as T | undefined;
        },
        update: (_key: string, _value: unknown): Thenable<void> => Promise.resolve(),
    } as unknown as vscode.WorkspaceConfiguration;
}

suite('resolveDashboardPort', () => {
    let originalGetConfiguration: typeof vscode.workspace.getConfiguration;

    setup(() => {
        originalGetConfiguration = vscode.workspace.getConfiguration;
        __resetResolveDashboardPortTestState();
    });

    teardown(() => {
        vscode.workspace.getConfiguration = originalGetConfiguration;
        __resetResolveDashboardPortTestState();
    });

    test('prefers explicitly configured serverPort', () => {
        vscode.workspace.getConfiguration = () => makeConfig({
            values: { apiPort: 4123 },
            inspected: {
                serverPort: {
                    key: 'serverPort',
                    defaultValue: 3459,
                    globalValue: undefined,
                    workspaceValue: 4001,
                    workspaceFolderValue: undefined,
                },
            },
        });

        const port = resolveDashboardPort();
        assert.strictEqual(port, 4001);
    });

    test('uses legacy apiPort when serverPort is only defaulted', () => {
        vscode.workspace.getConfiguration = () => makeConfig({
            values: { apiPort: 4123 },
            inspected: {
                serverPort: {
                    key: 'serverPort',
                    defaultValue: 3459,
                    globalValue: undefined,
                    workspaceValue: undefined,
                    workspaceFolderValue: undefined,
                },
            },
        });

        const port = resolveDashboardPort();
        assert.strictEqual(port, 4123);
    });

    test('falls back to serverPort default when no explicit values are present', () => {
        vscode.workspace.getConfiguration = () => makeConfig({
            values: {},
            inspected: {
                serverPort: {
                    key: 'serverPort',
                    defaultValue: 3459,
                    globalValue: undefined,
                    workspaceValue: undefined,
                    workspaceFolderValue: undefined,
                },
            },
        });

        const port = resolveDashboardPort();
        assert.strictEqual(port, 3459);
    });
});
