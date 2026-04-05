import { createSignal, For, Show } from "solid-js";
import { useParams, A } from "@solidjs/router";
import { 
  ArrowLeft, 
  FolderOpen, 
  Plus, 
  Activity, 
  Database, 
  FolderTree,
  Target
} from 'lucide-solid';
import { useWorkspace, usePlans } from "../lib/api";
import { PlanList } from "../components/plan/PlanList";

export default function WorkspacePage() {
  const params = useParams();
  const workspaceId = () => params.workspaceId;

  const [workspace] = useWorkspace(workspaceId);
  const [plansData] = usePlans(workspaceId);

  const plans = () => plansData()?.plans || [];

  return (
    <div class="space-y-6">
      {/* Breadcrumbs / Back button */}
      <div class="flex items-center gap-4">
        <A href="/" class="p-2 hover:bg-gray-800 rounded-full text-gray-400 hover:text-white transition-colors">
          <ArrowLeft size={20} />
        </A>
        <div class="flex items-center gap-2 text-gray-400 text-sm">
          <A href="/" class="hover:text-white">Dashboard</A>
          <span>/</span>
          <span class="text-gray-200 font-medium">Workspace</span>
        </div>
      </div>

      <Show when={!workspace.loading} fallback={<div class="animate-pulse space-y-6">
        <div class="h-8 bg-gray-800 rounded w-48" />
        <div class="h-32 bg-gray-800 rounded-lg" />
      </div>}>
        {/* Workspace Header */}
        <div class="bg-gray-800 p-6 rounded-xl border border-gray-700">
          <div class="flex items-start justify-between">
            <div class="flex items-center gap-4">
              <div class="p-3 bg-indigo-500/20 text-indigo-400 rounded-lg">
                <FolderOpen size={32} />
              </div>
              <div>
                <h1 class="text-2xl font-bold text-white">{workspace()?.name}</h1>
                <p class="text-gray-400 font-mono text-xs mt-1">{workspace()?.path}</p>
              </div>
            </div>
            <div class="flex gap-3">
              <button class="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors text-sm font-medium">
                <Plus size={18} />
                New Plan
              </button>
            </div>
          </div>

          <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8 pt-6 border-t border-gray-700">
            <div>
              <p class="text-gray-500 text-xs uppercase font-semibold tracking-wider">Active Plans</p>
              <p class="text-xl font-bold mt-1">{workspace()?.active_plan_count}</p>
            </div>
            <div>
              <p class="text-gray-500 text-xs uppercase font-semibold tracking-wider">Archived Plans</p>
              <p class="text-xl font-bold mt-1 text-gray-400">{workspace()?.archived_plan_count}</p>
            </div>
            <div>
              <p class="text-gray-500 text-xs uppercase font-semibold tracking-wider">Health</p>
              <div class="flex items-center gap-2 mt-1">
                <div class="w-2.5 h-2.5 rounded-full bg-green-500"></div>
                <p class="text-xl font-bold capitalize">{workspace()?.health || 'Healthy'}</p>
              </div>
            </div>
            <div>
              <p class="text-gray-500 text-xs uppercase font-semibold tracking-wider">ID</p>
              <p class="text-sm font-mono mt-2 text-gray-400">{workspace()?.workspace_id}</p>
            </div>
          </div>
        </div>

        {/* Workspace Tabs/Navigation */}
        <div class="flex items-center gap-1 border-b border-gray-800 pb-px">
          <button class="px-4 py-2 border-b-2 border-indigo-500 text-indigo-400 font-medium text-sm">Plans</button>
          <button class="px-4 py-2 text-gray-500 hover:text-gray-300 font-medium text-sm transition-colors">Programs</button>
          <button class="px-4 py-2 text-gray-500 hover:text-gray-300 font-medium text-sm transition-colors">Sprints</button>
          <button class="px-4 py-2 text-gray-500 hover:text-gray-300 font-medium text-sm transition-colors">Context</button>
        </div>

        {/* Plans Section */}
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <h2 class="text-lg font-bold text-white flex items-center gap-2">
              <Activity size={20} class="text-indigo-400" />
              Active Plans
            </h2>
          </div>
          
          <PlanList plans={plans()} workspaceId={workspaceId()!} />
        </div>
      </Show>
    </div>
  );
}
