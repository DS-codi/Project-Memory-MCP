import { For, Show, createSignal } from "solid-js";
import { 
  CheckCircle2, 
  Circle, 
  Clock, 
  Play, 
  MoreVertical,
  ChevronDown,
  ChevronRight,
  User,
  MessageSquare
} from 'lucide-solid';
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: any[]) {
  return twMerge(clsx(inputs));
}

export interface Step {
  index: number;
  phase: string;
  task: string;
  status: string;
  type: string;
  notes?: string;
  assignee?: string;
  completed_at?: string;
  display_number?: number;
}

interface StepListProps {
  steps: Step[];
}

export function StepList(props: StepListProps) {
  return (
    <div class="space-y-2">
      <For each={props.steps}>
        {(step) => (
          <div 
            class={cn(
              "bg-gray-800/50 border rounded-lg p-3 transition-all",
              step.status === 'active' ? "border-indigo-500/50 bg-indigo-500/5" : "border-gray-700 hover:border-gray-600"
            )}
          >
            <div class="flex items-start gap-3">
              <div class={cn(
                "mt-0.5 p-1 rounded-full",
                step.status === 'done' ? "text-green-400" : 
                step.status === 'active' ? "text-indigo-400" : "text-gray-500"
              )}>
                <Show when={step.status === 'done'} fallback={
                  <Show when={step.status === 'active'} fallback={<Circle size={18} />}>
                    <div class="animate-pulse"><Play size={18} fill="currentColor" /></div>
                  </Show>
                }>
                  <CheckCircle2 size={18} />
                </Show>
              </div>

              <div class="flex-1 min-w-0">
                <div class="flex items-center justify-between gap-2">
                  <span class="text-xs font-bold uppercase tracking-widest text-gray-500">
                    {step.phase}
                  </span>
                  <Show when={step.completed_at}>
                    <span class="text-[10px] text-gray-500 font-mono">
                      {new Date(step.completed_at!).toLocaleTimeString()}
                    </span>
                  </Show>
                </div>
                
                <h4 class={cn(
                  "text-sm font-medium mt-1",
                  step.status === 'done' ? "text-gray-400 line-through" : "text-gray-200"
                )}>
                  {step.task}
                </h4>

                <Show when={step.notes}>
                  <div class="mt-2 p-2 bg-gray-900/50 rounded border border-gray-700/50 text-xs text-gray-400 flex gap-2">
                    <MessageSquare size={14} class="shrink-0 mt-0.5" />
                    <p class="italic">{step.notes}</p>
                  </div>
                </Show>

                <div class="flex items-center gap-4 mt-3">
                  <div class="flex items-center gap-1 text-[10px] text-gray-500">
                    <User size={12} />
                    <span>{step.assignee || 'Unassigned'}</span>
                  </div>
                  <div class="flex items-center gap-1 text-[10px] text-gray-500">
                    <span class={cn(
                      "px-1.5 py-0.5 rounded-sm uppercase font-bold text-[9px]",
                      step.type === 'planning' ? "bg-blue-500/10 text-blue-400" :
                      step.type === 'standard' ? "bg-gray-700 text-gray-400" :
                      "bg-purple-500/10 text-purple-400"
                    )}>
                      {step.type}
                    </span>
                  </div>
                </div>
              </div>

              <button class="text-gray-600 hover:text-gray-400 transition-colors">
                <MoreVertical size={18} />
              </button>
            </div>
          </div>
        )}
      </For>
    </div>
  );
}
