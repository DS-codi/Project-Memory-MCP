import { Route } from "@solidjs/router";
import { lazy } from "solid-js";
import { Layout } from "./components/layout/Layout";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const WorkspacePage = lazy(() => import("./pages/WorkspacePage"));
const PlanDetailPage = lazy(() => import("./pages/PlanDetailPage"));
const MetricsPage = lazy(() => import("./pages/MetricsPage"));

function App() {
  return (
    <Layout>
      <Route path="/" component={Dashboard} />
      <Route path="/workspace/:workspaceId" component={WorkspacePage} />
      <Route path="/workspace/:workspaceId/plan/:planId" component={PlanDetailPage} />
      <Route path="/metrics" component={MetricsPage} />
      {/* 
        Remaining routes from React dashboard:
        - /agents
        - /prompts
        - /instructions
        - /skills
      */}
    </Layout>
  );
}

export default App;
