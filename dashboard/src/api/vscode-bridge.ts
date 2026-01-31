/**
 * VS Code Webview Bridge
 * Handles communication between the React app and VS Code extension
 */

// Type for VS Code API available in webview context
declare const acquireVsCodeApi: () => {
  postMessage: (message: unknown) => void;
  getState: () => unknown;
  setState: (state: unknown) => void;
};

interface VSCodeMessage {
  command: string;
  data?: unknown;
}

interface JumpToCodePayload {
  filePath: string;
  line?: number;
  column?: number;
}

interface OpenFilePayload {
  filePath: string;
}

interface ShowMessagePayload {
  type: 'info' | 'warning' | 'error';
  message: string;
}

class VSCodeBridge {
  private vscode: ReturnType<typeof acquireVsCodeApi> | null = null;
  private messageHandlers: Map<string, (data: unknown) => void> = new Map();
  private isWebview = false;

  constructor() {
    // Check if running in VS Code webview
    if (typeof acquireVsCodeApi !== 'undefined') {
      this.vscode = acquireVsCodeApi();
      this.isWebview = true;
      this.setupMessageListener();
    }
  }

  private setupMessageListener() {
    window.addEventListener('message', (event) => {
      const message = event.data as VSCodeMessage;
      const handler = this.messageHandlers.get(message.command);
      if (handler) {
        handler(message.data);
      }
    });
  }

  /**
   * Check if running in VS Code webview
   */
  isInWebview(): boolean {
    return this.isWebview;
  }

  /**
   * Send a message to the VS Code extension
   */
  postMessage(command: string, data?: unknown): void {
    if (this.vscode) {
      this.vscode.postMessage({ command, data });
    } else {
      console.log('[VSCodeBridge] Not in webview, ignoring message:', command, data);
    }
  }

  /**
   * Register a handler for messages from VS Code
   */
  onMessage(command: string, handler: (data: unknown) => void): () => void {
    this.messageHandlers.set(command, handler);
    return () => this.messageHandlers.delete(command);
  }

  /**
   * Jump to a specific location in a file
   */
  jumpToCode(payload: JumpToCodePayload): void {
    this.postMessage('jumpToCode', payload);
  }

  /**
   * Open a file in the editor
   */
  openFile(payload: OpenFilePayload): void {
    this.postMessage('openFile', payload);
  }

  /**
   * Show a notification in VS Code
   */
  showMessage(payload: ShowMessagePayload): void {
    this.postMessage('showMessage', payload);
  }

  /**
   * Request to add a file to the current plan
   */
  addToPlan(filePath: string, planId?: string): void {
    this.postMessage('addToPlan', { filePath, planId });
  }

  /**
   * Request workspace data from VS Code
   */
  requestWorkspaceData(): void {
    this.postMessage('getWorkspaceData');
  }

  /**
   * Save state for webview persistence
   */
  saveState(state: unknown): void {
    if (this.vscode) {
      this.vscode.setState(state);
    }
  }

  /**
   * Get saved state from webview
   */
  getState<T>(): T | null {
    if (this.vscode) {
      return this.vscode.getState() as T;
    }
    return null;
  }

  /**
   * Reveal a file in the explorer
   */
  revealInExplorer(filePath: string): void {
    this.postMessage('revealInExplorer', { filePath });
  }

  /**
   * Execute a VS Code command
   */
  executeCommand(commandId: string, ...args: unknown[]): void {
    this.postMessage('executeCommand', { commandId, args });
  }
}

// Singleton instance
export const vscodeBridge = new VSCodeBridge();

// React hook for VS Code bridge
import { useCallback } from 'react';

export function useVSCodeBridge() {
  const isWebview = vscodeBridge.isInWebview();

  const jumpToCode = useCallback((filePath: string, line?: number, column?: number) => {
    if (isWebview) {
      vscodeBridge.jumpToCode({ filePath, line, column });
    } else {
      // In browser, we could potentially open in a new tab or show a notification
      console.log('Jump to code:', filePath, line, column);
    }
  }, [isWebview]);

  const openFile = useCallback((filePath: string) => {
    if (isWebview) {
      vscodeBridge.openFile({ filePath });
    }
  }, [isWebview]);

  const addToPlan = useCallback((filePath: string, planId?: string) => {
    vscodeBridge.addToPlan(filePath, planId);
  }, []);

  const revealInExplorer = useCallback((filePath: string) => {
    vscodeBridge.revealInExplorer(filePath);
  }, []);

  return {
    isWebview,
    jumpToCode,
    openFile,
    addToPlan,
    revealInExplorer,
    postMessage: vscodeBridge.postMessage.bind(vscodeBridge),
    onMessage: vscodeBridge.onMessage.bind(vscodeBridge),
  };
}
