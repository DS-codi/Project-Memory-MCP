import { Routes, Route } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { DashboardPage } from './pages/DashboardPage';
import { WorkspacePage } from './pages/WorkspacePage';
import { PlanDetailPage } from './pages/PlanDetailPage';
import { AgentsPage } from './pages/AgentsPage';
import { AgentEditorPage } from './pages/AgentEditorPage';
import { MetricsPage } from './pages/MetricsPage';
import { PromptsPage } from './pages/PromptsPage';
import { InstructionsPage } from './pages/InstructionsPage';
import { ContextFilesPage } from './pages/ContextFilesPage';
import { DataRootPage } from './pages/DataRootPage';
import { WorkspaceStatusPage } from './pages/WorkspaceStatusPage';
import { PlanBuildScriptsPage } from './pages/PlanBuildScriptsPage';
import { useLiveUpdates } from './hooks/useLiveUpdates';
import { useMCPEvents } from './hooks/useMCPEvents';
import { ToastContainer } from './components/common/Toast';
import { ErrorBoundary } from './components/common/ErrorBoundary';

function App() {
  // Enable live updates via WebSocket
  useLiveUpdates();
  
  // Enable MCP event handling with toasts
  useMCPEvents();

  return (
    <ErrorBoundary>
      <Layout>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/workspace/:workspaceId" element={<WorkspacePage />} />
          <Route path="/workspace/:workspaceId/status" element={<WorkspaceStatusPage />} />
          <Route path="/workspace/:workspaceId/data-root" element={<DataRootPage />} />
          <Route path="/workspace/:workspaceId/plan/:planId" element={<PlanDetailPage />} />
          <Route path="/workspace/:workspaceId/plan/:planId/context" element={<ContextFilesPage />} />
          <Route path="/workspace/:workspaceId/plan/:planId/build-scripts" element={<PlanBuildScriptsPage />} />
          <Route path="/agents" element={<AgentsPage />} />
          <Route path="/agents/:agentId" element={<AgentEditorPage />} />
          <Route path="/prompts" element={<PromptsPage />} />
          <Route path="/instructions" element={<InstructionsPage />} />
          <Route path="/metrics" element={<MetricsPage />} />
        </Routes>
      </Layout>
      <ToastContainer />
    </ErrorBoundary>
  );
}

export default App;
