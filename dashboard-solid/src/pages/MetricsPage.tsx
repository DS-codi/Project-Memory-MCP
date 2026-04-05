import { createResource, For, Show } from "solid-js";
import { 
  BarChart3, 
  Users, 
  Clock, 
  CheckCircle2, 
  FolderKanban,
  Activity,
  GitBranch,
  TrendingUp,
  AlertTriangle
} from 'lucide-solid';
import { fetchMetrics, DashboardMetrics } from "../lib/api";
import { SolidApexCharts } from 'solid-apexcharts';

export default function MetricsPage() {
  const [metrics] = createResource<DashboardMetrics>(fetchMetrics);

  const planCategoryData = () => {
    const data = metrics()?.plans?.by_category || {};
    return {
      series: Object.values(data) as number[],
      options: {
        labels: Object.keys(data),
        chart: { type: 'donut' as any, foreColor: '#9ca3af' },
        colors: ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'],
        stroke: { show: false },
        legend: { position: 'bottom' as any },
        plotOptions: { pie: { donut: { size: '70%' } } }
      }
    };
  };

  const planPriorityData = () => {
    const data = metrics()?.plans?.by_priority || {};
    return {
      series: [{ name: 'Plans', data: Object.values(data) as number[] }],
      options: {
        chart: { type: 'bar' as any, toolbar: { show: false }, foreColor: '#9ca3af' },
        plotOptions: { bar: { borderRadius: 4, horizontal: true } },
        colors: ['#6366f1'],
        xaxis: { categories: Object.keys(data) },
        grid: { borderColor: '#374151' }
      }
    };
  };

  return (
    <div class="space-y-6">
      <div class="flex items-center justify-between">
        <h1 class="text-2xl font-bold text-white flex items-center gap-3">
          <BarChart3 class="text-indigo-400" />
          Performance Metrics
        </h1>
        <div class="text-xs text-gray-500 font-mono">
          Last updated: {metrics()?.generated_at ? new Date(metrics()!.generated_at).toLocaleString() : 'Loading...'}
        </div>
      </div>

      <Show when={!metrics.loading} fallback={<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <For each={[1, 2, 3, 4]}>
          {() => <div class="h-32 bg-gray-800 animate-pulse rounded-xl border border-gray-700" />}
        </For>
      </div>}>
        {/* Top Stats */}
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div class="bg-gray-800 p-6 rounded-xl border border-gray-700 shadow-lg">
            <div class="flex items-center justify-between mb-4">
              <div class="p-2 bg-indigo-500/10 text-indigo-400 rounded-lg">
                <FolderKanban size={24} />
              </div>
              <span class="text-xs font-bold text-gray-500 uppercase tracking-wider">Workspaces</span>
            </div>
            <p class="text-3xl font-bold text-white">{metrics()?.workspaces?.total}</p>
            <p class="text-xs text-gray-500 mt-2">
              <span class="text-green-400 font-medium">{metrics()?.workspaces?.with_active_plans}</span> active workspaces
            </p>
          </div>

          <div class="bg-gray-800 p-6 rounded-xl border border-gray-700 shadow-lg">
            <div class="flex items-center justify-between mb-4">
              <div class="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg">
                <Activity size={24} />
              </div>
              <span class="text-xs font-bold text-gray-500 uppercase tracking-wider">Plans</span>
            </div>
            <p class="text-3xl font-bold text-white">{metrics()?.plans?.total_plans}</p>
            <p class="text-xs text-gray-500 mt-2">
              <span class="text-indigo-400 font-medium">{metrics()?.plans?.active}</span> active / <span class="text-green-400 font-medium">{metrics()?.plans?.completed}</span> done
            </p>
          </div>

          <div class="bg-gray-800 p-6 rounded-xl border border-gray-700 shadow-lg">
            <div class="flex items-center justify-between mb-4">
              <div class="p-2 bg-blue-500/10 text-blue-400 rounded-lg">
                <CheckCircle2 size={24} />
              </div>
              <span class="text-xs font-bold text-gray-500 uppercase tracking-wider">Steps</span>
            </div>
            <p class="text-3xl font-bold text-white">{metrics()?.steps?.total_steps}</p>
            <p class="text-xs text-gray-500 mt-2">
              <span class="text-blue-400 font-medium">{metrics()?.steps ? Math.round(metrics()!.steps.completion_rate * 100) : 0}%</span> overall completion
            </p>
          </div>

          <div class="bg-gray-800 p-6 rounded-xl border border-gray-700 shadow-lg">
            <div class="flex items-center justify-between mb-4">
              <div class="p-2 bg-amber-500/10 text-amber-400 rounded-lg">
                <Clock size={24} />
              </div>
              <span class="text-xs font-bold text-gray-500 uppercase tracking-wider">Avg Time</span>
            </div>
            <p class="text-xl font-bold text-white leading-tight mt-1 truncate">
              {metrics()?.time?.average_plan_duration_human}
            </p>
            <p class="text-xs text-gray-500 mt-2">Per completed plan</p>
          </div>
        </div>

        {/* Charts Section */}
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div class="bg-gray-800 p-6 rounded-xl border border-gray-700 shadow-lg">
            <h3 class="text-sm font-bold text-white uppercase tracking-wider mb-6 flex items-center gap-2">
              <TrendingUp size={18} class="text-indigo-400" />
              Plans by Category
            </h3>
            <div class="h-64 flex items-center justify-center">
              <SolidApexCharts 
                type="donut" 
                options={planCategoryData().options} 
                series={planCategoryData().series} 
                width="100%"
                height={250}
              />
            </div>
          </div>

          <div class="bg-gray-800 p-6 rounded-xl border border-gray-700 shadow-lg">
            <h3 class="text-sm font-bold text-white uppercase tracking-wider mb-6 flex items-center gap-2">
              <AlertTriangle size={18} class="text-amber-400" />
              Plans by Priority
            </h3>
            <div class="h-64">
              <SolidApexCharts 
                type="bar" 
                options={planPriorityData().options} 
                series={planPriorityData().series} 
                width="100%"
                height={250}
              />
            </div>
          </div>
        </div>

        {/* Handoffs Table */}
        <div class="bg-gray-800 rounded-xl border border-gray-700 shadow-lg overflow-hidden">
          <div class="px-6 py-4 border-b border-gray-700 flex items-center justify-between">
            <h3 class="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <GitBranch size={18} class="text-indigo-400" />
              Common Agent Transitions
            </h3>
            <span class="text-xs text-gray-500">{metrics()?.handoffs?.total_handoffs} total handoffs</span>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-left text-sm">
              <thead class="bg-gray-900/50 text-gray-500 uppercase text-[10px] font-bold">
                <tr>
                  <th class="px-6 py-3">From Agent</th>
                  <th class="px-6 py-3">To Agent</th>
                  <th class="px-6 py-3 text-right">Count</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-700/50">
                <For each={metrics()?.handoffs?.most_common_transitions?.slice(0, 5)}>
                  {(handoff) => (
                    <tr class="hover:bg-gray-700/30 transition-colors">
                      <td class="px-6 py-4">
                        <span class="px-2 py-1 bg-gray-700 text-gray-300 rounded text-xs font-mono">{handoff.from}</span>
                      </td>
                      <td class="px-6 py-4">
                        <span class="px-2 py-1 bg-indigo-500/10 text-indigo-300 rounded text-xs font-mono">{handoff.to}</span>
                      </td>
                      <td class="px-6 py-4 text-right font-bold text-gray-200">{handoff.count}</td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </div>
      </Show>
    </div>
  );
}
