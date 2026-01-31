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
          <Route path="/workspace/:workspaceId/plan/:planId" element={<PlanDetailPage />} />
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
