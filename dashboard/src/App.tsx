import { Routes, Route } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { DashboardPage } from './pages/DashboardPage';
import { WorkspacePage } from './pages/WorkspacePage';
import { PlanDetailPage } from './pages/PlanDetailPage';
import { AgentsPage } from './pages/AgentsPage';
import { AgentEditorPage } from './pages/AgentEditorPage';
import { DbEntityEditorPage } from './pages/DbEntityEditorPage';
import { SkillsPage } from './pages/SkillsPage';
import { MetricsPage } from './pages/MetricsPage';
import { PromptsPage } from './pages/PromptsPage';
import { InstructionsPage } from './pages/InstructionsPage';
import { ContextFilesPage } from './pages/ContextFilesPage';
import { DataRootPage } from './pages/DataRootPage';
import { WorkspaceStatusPage } from './pages/WorkspaceStatusPage';
import { PlanBuildScriptsPage } from './pages/PlanBuildScriptsPage';
import { ProgramDetailPage } from './pages/ProgramDetailPage';
import { SprintsPage } from './pages/SprintsPage';
import { SprintDetailPage } from './pages/SprintDetailPage';
import { useMCPEvents } from './hooks/useMCPEvents';
import { ToastContainer } from './components/common/Toast';
import { ErrorBoundary } from './components/common/ErrorBoundary';

function App() {
  // Enable MCP event handling with toasts and live query invalidation
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
          <Route path="/workspace/:workspaceId/program/:programId" element={<ProgramDetailPage />} />
          <Route path="/workspace/:workspaceId/sprints" element={<SprintsPage />} />
          <Route path="/workspace/:workspaceId/sprint/:sprintId" element={<SprintDetailPage />} />
          
          <Route path="/agents" element={<AgentsPage />} />
          <Route path="/agents/:agentId" element={<AgentEditorPage />} />
          <Route path="/agents/db/:id" element={<DbEntityEditorPage type="agent" key="agent-db" />} />
          
          <Route path="/prompts" element={<PromptsPage />} />
          
          <Route path="/instructions" element={<InstructionsPage />} />
          <Route path="/instructions/db/:id" element={<DbEntityEditorPage type="instruction" key="instruction-db" />} />
          
          <Route path="/skills" element={<SkillsPage />} />
          <Route path="/skills/db/:id" element={<DbEntityEditorPage type="skill" key="skill-db" />} />
          
          <Route path="/metrics" element={<MetricsPage />} />
        </Routes>
      </Layout>
      <ToastContainer />
    </ErrorBoundary>
  );
}

export default App;
