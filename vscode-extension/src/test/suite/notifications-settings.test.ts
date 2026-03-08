import * as assert from 'assert';
import * as vscode from 'vscode';
import { notificationsEnabled } from '../../utils/helpers';

type InspectLike<T> = {
    key: string;
    defaultValue?: T;
    globalValue?: T;
    workspaceValue?: T;
    workspaceFolderValue?: T;
};

function makeConfig(options: {
    values?: Record<string, unknown>;
    inspected?: Record<string, InspectLike<boolean> | undefined>;
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

suite('notificationsEnabled', () => {
    let originalGetConfiguration: typeof vscode.workspace.getConfiguration;

    setup(() => {
        originalGetConfiguration = vscode.workspace.getConfiguration;
    });

    teardown(() => {
        vscode.workspace.getConfiguration = originalGetConfiguration;
    });

    test('prefers explicit notifications.enabled over legacy showNotifications', () => {
        vscode.workspace.getConfiguration = () => makeConfig({
            values: {
                'notifications.enabled': true,
                showNotifications: false,
            },
            inspected: {
                'notifications.enabled': {
                    key: 'notifications.enabled',
                    workspaceValue: true,
                },
                showNotifications: {
                    key: 'showNotifications',
                    workspaceValue: false,
                },
            },
        });

        assert.strictEqual(notificationsEnabled(), true);
    });

    test('falls back to explicit legacy showNotifications when canonical is unset', () => {
        vscode.workspace.getConfiguration = () => makeConfig({
            values: { showNotifications: false },
            inspected: {
                'notifications.enabled': {
                    key: 'notifications.enabled',
                },
                showNotifications: {
                    key: 'showNotifications',
                    workspaceValue: false,
                },
            },
        });

        assert.strictEqual(notificationsEnabled(), false);
    });

    test('uses notifications.enabled default when neither key is explicitly set', () => {
        vscode.workspace.getConfiguration = () => makeConfig({
            values: {
                'notifications.enabled': true,
            },
            inspected: {
                'notifications.enabled': {
                    key: 'notifications.enabled',
                    defaultValue: true,
                },
                showNotifications: {
                    key: 'showNotifications',
                },
            },
        });

        assert.strictEqual(notificationsEnabled(), true);
    });
});
