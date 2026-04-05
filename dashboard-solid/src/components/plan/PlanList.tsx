import { For, Show } from "solid-js";
import { A } from "@solidjs/router";
import { 
  CheckCircle2, 
  Circle, 
  Clock, 
  ChevronRight,
  AlertCircle
} from 'lucide-solid';
import { PlanSummary } from "../../lib/api";

interface PlanListProps {
  plans: PlanSummary[];
  workspaceId: string;
}

export function PlanList(props: PlanListProps) {
  return (
    <div class="grid grid-cols-1 gap-4">
      <Show when={props.plans.length > 0} fallback={
        <div class="text-center py-12 bg-gray-800/50 border border-dashed border-gray-700 rounded-xl">
          <p class="text-gray-500">No active plans found in this workspace.</p>
          <button class="mt-4 text-indigo-400 hover:text-indigo-300 font-medium text-sm">Create your first plan</button>
        </div>
      }>
        <For each={props.plans}>
          {(plan) => (
            <A 
              href={`/workspace/${props.workspaceId}/plan/${plan.id}`}
              class="bg-gray-800 border border-gray-700 hover:border-gray-600 p-4 rounded-xl transition-all group"
            >
              <div class="flex items-center justify-between">
                <div class="flex items-start gap-4 flex-1">
                  <div class={`mt-1 p-1.5 rounded-full ${
                    plan.status === 'active' ? 'bg-indigo-500/20 text-indigo-400' :
                    plan.status === 'done' ? 'bg-green-500/20 text-green-400' :
                    'bg-gray-700 text-gray-400'
                  }`}>
                    <Show when={plan.status === 'done'} fallback={<Circle size={16} />}>
                      <CheckCircle2 size={16} />
                    </Show>
                  </div>
                  
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-3">
                      <h3 class="text-white font-semibold truncate group-hover:text-indigo-300 transition-colors">
                        {plan.title}
                      </h3>
                      <span class={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${
                        plan.priority === 'critical' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                        plan.priority === 'high' ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' :
                        'bg-blue-500/10 text-blue-400 border-blue-500/20'
                      }`}>
                        {plan.priority}
                      </span>
                    </div>
                    
                    <div class="flex items-center gap-4 mt-2 text-xs text-gray-400">
                      <div class="flex items-center gap-1.5">
                        <div class="w-24 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                          <div 
                            class="h-full bg-indigo-500 rounded-full transition-all duration-500" 
                            style={`width: ${(plan.steps_done / plan.steps_total) * 100}%`}
                          />
                        </div>
                        <span class="font-mono">{plan.steps_done}/{plan.steps_total} steps</span>
                      </div>
                      <div class="flex items-center gap-1.5">
                        <Clock size={12} />
                        <span>{new Date(plan.updated_at).toLocaleDateString()}</span>
                      </div>
                    </div>

                    <Show when={plan.next_step_task}>
                      <div class="mt-3 flex items-center gap-2 text-xs">
                        <span class="text-gray-500 uppercase tracking-widest font-bold text-[9px]">Next:</span>
                        <span class="text-gray-300 truncate">{plan.next_step_task}</span>
                      </div>
                    </Show>
                  </div>
                </div>
                
                <div class="text-gray-600 group-hover:text-gray-400 transition-colors">
                  <ChevronRight size={20} />
                </div>
              </div>
            </A>
          )}
        </For>
      </Show>
    </div>
  );
}
