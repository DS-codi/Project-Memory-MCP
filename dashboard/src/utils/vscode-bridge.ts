/**
 * VS Code API Bridge
 * 
 * Provides a unified interface for the React app to communicate with
 * VS Code when running inside a webview, or with the standalone API
 * when running in a browser.
 */

// VS Code API type
interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare global {
  interface Window {
    vscode?: VsCodeApi;
  }
}

// Check if running inside VS Code webview
export const isVsCodeWebview = (): boolean => {
  return typeof window !== 'undefined' && window.vscode !== undefined;
};

// Get the VS Code API if available
export const getVsCodeApi = (): VsCodeApi | null => {
  if (isVsCodeWebview()) {
    return window.vscode!;
  }
  return null;
};

// Message types for VS Code communication
export type MessageType =
  | 'openFile'
  | 'revealInExplorer'
  | 'showNotification'
  | 'getConfig'
  | 'refresh'
  | 'createPlan'
  | 'deployAgents'
  | 'discussPlanInChat';

export interface VsCodeMessage {
  type: MessageType;
  data?: unknown;
}

// Send a message to VS Code extension
export const postToVsCode = (message: VsCodeMessage): void => {
  const vscode = getVsCodeApi();
  if (vscode) {
    vscode.postMessage(message);
  } else if (typeof window !== 'undefined' && window.parent && window.parent !== window) {
    window.parent.postMessage({
      type: 'projectMemory.dashboard',
      payload: message,
    }, '*');
  } else {
    console.log('[VSCode Bridge] Not in webview, ignoring message:', message);
  }
};

// Convenience functions
export const vscodeApi = {
  // Open a file in VS Code editor
  openFile: (filePath: string, line?: number) => {
    postToVsCode({
      type: 'openFile',
      data: { filePath, line }
    });
  },

  // Reveal a file in VS Code Explorer
  revealInExplorer: (path: string) => {
    postToVsCode({
      type: 'revealInExplorer',
      data: { path }
    });
  },

  // Show a notification in VS Code
  showNotification: (text: string, level: 'info' | 'warning' | 'error' = 'info') => {
    postToVsCode({
      type: 'showNotification',
      data: { text, level }
    });
  },

  // Request configuration from extension
  getConfig: () => {
    postToVsCode({ type: 'getConfig' });
  },

  // Request data refresh
  refresh: () => {
    postToVsCode({ type: 'refresh' });
  }
};

// Listen for messages from VS Code
export const onVsCodeMessage = (callback: (message: VsCodeMessage) => void): (() => void) => {
  const handler = (event: MessageEvent) => {
    const message = event.data as VsCodeMessage;
    callback(message);
  };

  window.addEventListener('message', handler);
  
  return () => {
    window.removeEventListener('message', handler);
  };
};

// Hook for using VS Code messages in React
export const useVsCodeMessages = (_callback: (message: VsCodeMessage) => void) => {
  // Note: This would need to be used with useEffect in a React component
  // Example:
  // useEffect(() => {
  //   return onVsCodeMessage((msg) => {
  //     if (msg.type === 'init') {
  //       setConfig(msg.data);
  //     }
  //   });
  // }, []);
};
