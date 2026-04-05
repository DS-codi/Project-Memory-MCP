import { createSignal, Show, createResource, For } from "solid-js";
import { useParams, A } from "@solidjs/router";
import { 
  ArrowLeft, 
  Bot, 
  Clock, 
  GitBranch, 
  ListChecks, 
  Activity, 
  Target,
  Terminal,
  Database,
  Users,
  Layers,
  Shield,
  MessageSquare,
  Play,
  CheckCircle2
} from 'lucide-solid';
import { fetchPlan } from "../lib/api";
import { StepList, Step } from "../components/plan/StepList";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: any[]) {
  return twMerge(clsx(inputs));
}

export default function PlanDetailPage() {
  const params = useParams();
  const workspaceId = () => params.workspaceId;
  const planId = () => params.planId;

  const [plan] = createResource(
    () => ({ workspaceId: workspaceId(), planId: planId() }),
    async ({ workspaceId, planId }) => {
      if (!workspaceId || !planId) return null;
      const res = await fetchPlan(workspaceId, planId);
      return res.data;
    }
  );

  const steps = () => (plan()?.steps || []) as Step[];
  const progress = () => {
    const s = steps();
    if (s.length === 0) return 0;
    const done = s.filter(st => st.status === 'done').length;
    return (done / s.length) * 100;
  };

  return (
    <div class="space-y-6">
      {/* Breadcrumbs */}
      <div class="flex items-center gap-4">
        <A href={`/workspace/${workspaceId()}`} class="p-2 hover:bg-gray-800 rounded-full text-gray-400 hover:text-white transition-colors">
          <ArrowLeft size={20} />
        </A>
        <div class="flex items-center gap-2 text-gray-400 text-sm">
          <A href="/" class="hover:text-white">Dashboard</A>
          <span>/</span>
          <A href={`/workspace/${workspaceId()}`} class="hover:text-white">Workspace</A>
          <span>/</span>
          <span class="text-gray-200 font-medium">Plan</span>
        </div>
      </div>

      <Show when={!plan.loading} fallback={<div class="animate-pulse space-y-6">
        <div class="h-8 bg-gray-800 rounded w-48" />
        <div class="h-64 bg-gray-800 rounded-lg" />
      </div>}>
        {/* Plan Header */}
        <div class="bg-gray-800 p-6 rounded-xl border border-gray-700 shadow-xl">
          <div class="flex flex-col md:flex-row md:items-start justify-between gap-6">
            <div class="space-y-4 flex-1">
              <div class="flex items-center gap-3">
                <span class={cn(
                  "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border",
                  plan()?.priority === 'critical' ? "bg-red-500/10 text-red-400 border-red-500/20" :
                  plan()?.priority === 'high' ? "bg-orange-500/10 text-orange-400 border-orange-500/20" :
                  "bg-blue-500/10 text-blue-400 border-blue-500/20"
                )}>
                  {plan()?.priority} Priority
                </span>
                <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border bg-gray-700 text-gray-300 border-gray-600">
                  {plan()?.category}
                </span>
              </div>
              
              <h1 class="text-3xl font-bold text-white leading-tight">
                {plan()?.title}
              </h1>
              
              <p class="text-gray-400 text-sm max-w-2xl leading-relaxed">
                {plan()?.description}
              </p>

              <div class="flex flex-wrap items-center gap-6 pt-2">
                <div class="flex items-center gap-2 text-gray-400 text-sm">
                  <Clock size={16} />
                  <span>Created {plan()?.created_at ? new Date(plan()!.created_at).toLocaleDateString() : 'N/A'}</span>
                </div>
                <div class="flex items-center gap-2 text-gray-400 text-sm">
                  <Activity size={16} />
                  <span>{plan()?.status}</span>
                </div>
              </div>
            </div>

            <div class="w-full md:w-64 space-y-4">
              <div class="bg-gray-900/50 p-4 rounded-lg border border-gray-700/50">
                <div class="flex items-center justify-between mb-2">
                  <span class="text-xs font-bold text-gray-500 uppercase tracking-wider">Overall Progress</span>
                  <span class="text-sm font-bold text-indigo-400">{Math.round(progress())}%</span>
                </div>
                <div class="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div 
                    class="h-full bg-indigo-500 rounded-full transition-all duration-700 ease-out" 
                    style={`width: ${progress()}%`}
                  />
                </div>
                <div class="mt-3 flex justify-between text-[10px] text-gray-500 font-mono">
                  <span>{steps().filter(s => s.status === 'done').length} DONE</span>
                  <span>{steps().length} TOTAL</span>
                </div>
              </div>
              
              <button class="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-indigo-900/20">
                <Play size={16} fill="currentColor" />
                Launch Agent
              </button>
            </div>
          </div>
        </div>

        {/* Content Tabs */}
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Steps List */}
          <div class="lg:col-span-2 space-y-4">
            <div class="flex items-center justify-between">
              <h2 class="text-lg font-bold text-white flex items-center gap-2">
                <ListChecks size={20} class="text-indigo-400" />
                Execution Steps
              </h2>
            </div>
            
            <StepList steps={steps()} />
          </div>

          {/* Sidebar Panels */}
          <div class="space-y-6">
            {/* Goals Panel */}
            <div class="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
              <div class="bg-gray-700/30 px-4 py-3 border-b border-gray-700 flex items-center gap-2">
                <Target size={18} class="text-indigo-400" />
                <h3 class="text-sm font-bold text-white uppercase tracking-wider">Plan Goals</h3>
              </div>
              <div class="p-4 space-y-3">
                <For each={plan()?.goals || []}>
                  {(goal) => (
                    <div class="flex items-start gap-3">
                      <div class="mt-1 w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
                      <p class="text-sm text-gray-300 leading-snug">{goal}</p>
                    </div>
                  )}
                </For>
              </div>
            </div>

            {/* Success Criteria Panel */}
            <div class="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
              <div class="bg-gray-700/30 px-4 py-3 border-b border-gray-700 flex items-center gap-2">
                <Shield size={18} class="text-green-400" />
                <h3 class="text-sm font-bold text-white uppercase tracking-wider">Success Criteria</h3>
              </div>
              <div class="p-4 space-y-3">
                <For each={plan()?.success_criteria || []}>
                  {(criteria) => (
                    <div class="flex items-start gap-3">
                      <div class="mt-1">
                        <CheckCircle2 size={14} class="text-green-500" />
                      </div>
                      <p class="text-sm text-gray-300 leading-snug">{criteria}</p>
                    </div>
                  )}
                </For>
              </div>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
}
