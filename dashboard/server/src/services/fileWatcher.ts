import chokidar from 'chokidar';
import * as path from 'path';

interface FileWatchEvent {
  type: 'plan_updated' | 'workspace_updated' | 'handoff' | 'step_update';
  timestamp: string;
  workspace_id: string;
  plan_id?: string;
  file: string;
}

export function setupFileWatcher(
  dataRoot: string, 
  onEvent: (event: FileWatchEvent) => void
): chokidar.FSWatcher {
  const watcher = chokidar.watch(dataRoot, {
    persistent: true,
    ignoreInitial: true,
    depth: 4,
    awaitWriteFinish: {
      stabilityThreshold: 500,
      pollInterval: 100,
    },
  });

  watcher.on('change', (filePath) => {
    const relativePath = path.relative(dataRoot, filePath);
    const parts = relativePath.split(path.sep);
    
    if (parts.length < 2) return;
    
    const workspaceId = parts[0];
    const fileName = parts[parts.length - 1];
    
    let event: FileWatchEvent;
    
    if (fileName === 'workspace.meta.json') {
      event = {
        type: 'workspace_updated',
        timestamp: new Date().toISOString(),
        workspace_id: workspaceId,
        file: fileName,
      };
    } else if (fileName === 'state.json' && parts[1] === 'plans') {
      const planId = parts[2];
      event = {
        type: 'plan_updated',
        timestamp: new Date().toISOString(),
        workspace_id: workspaceId,
        plan_id: planId,
        file: fileName,
      };
    } else if (fileName.startsWith('handoff_')) {
      const planId = parts[2];
      event = {
        type: 'handoff',
        timestamp: new Date().toISOString(),
        workspace_id: workspaceId,
        plan_id: planId,
        file: fileName,
      };
    } else {
      return; // Ignore other files
    }
    
    console.log(`📁 File change detected: ${relativePath}`);
    onEvent(event);
  });

  watcher.on('error', (error) => {
    console.error('File watcher error:', error);
  });

  console.log(`👁️ Watching for changes in: ${dataRoot}`);
  
  return watcher;
}
