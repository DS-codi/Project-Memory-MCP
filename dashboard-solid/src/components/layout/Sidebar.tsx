import { createSignal, For, Show, onMount } from "solid-js";
import { A, useLocation } from "@solidjs/router";
import { 
  ChevronLeft, 
  ChevronRight, 
  FolderOpen, 
  LayoutDashboard,
  Bot,
  BarChart3,
  FileText,
  BookOpen,
  Wand2,
  Target
} from 'lucide-solid';
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { useWorkspaces } from "../../lib/api";

function cn(...inputs: any[]) {
  return twMerge(clsx(inputs));
}

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar(props: SidebarProps) {
  const location = useLocation();
  const [data] = useWorkspaces();

  const workspaces = () => data()?.workspaces || [];

  return (
    <aside 
      class={cn(
        'bg-gray-800 border-r border-gray-700 flex flex-col transition-all duration-300',
        props.collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Logo */}
      <div class="h-14 flex items-center px-4 border-b border-gray-700">
        <A href="/" class="flex items-center gap-2">
          <span class="text-2xl">🧠</span>
          {!props.collapsed && (
            <span class="font-semibold text-lg text-white">Memory Observer</span>
          )}
        </A>
      </div>

      {/* Navigation */}
      <nav class="flex-1 overflow-y-auto py-4 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
        {/* Dashboard Link */}
        <A
          href="/"
          class={cn(
            'flex items-center gap-3 px-4 py-2 mx-2 rounded-lg transition-colors',
            location.pathname === '/' 
              ? 'bg-indigo-500/20 text-indigo-300' 
              : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'
          )}
        >
          <LayoutDashboard size={20} />
          {!props.collapsed && <span>Dashboard</span>}
        </A>

        {/* Workspaces Section */}
        <div class="mt-6">
          {!props.collapsed && (
            <h3 class="px-4 mb-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Workspaces
            </h3>
          )}
          
          <div class="space-y-1">
            <Show when={!data.loading} fallback={<div class="px-6 text-gray-500 text-sm">Loading...</div>}>
              <For each={workspaces()}>
                {(ws) => (
                  <div>
                    <A
                      href={`/workspace/${ws.workspace_id}`}
                      class={cn(
                        'flex items-center gap-3 px-4 py-2 mx-2 rounded-lg transition-colors',
                        location.pathname.includes(ws.workspace_id)
                          ? 'bg-gray-700 text-gray-100'
                          : 'text-gray-400 hover:bg-gray-700/50 hover:text-gray-200'
                      )}
                    >
                      <FolderOpen size={20} />
                      {!props.collapsed && (
                        <div class="flex-1 min-w-0">
                          <div class="truncate font-medium">{ws.name}</div>
                          <div class="text-xs text-gray-500">
                            {ws.active_plan_count} active
                          </div>
                        </div>
                      )}
                    </A>
                  </div>
                )}
              </For>
            </Show>
          </div>
        </div>

        {/* Agents Section */}
        <div class="mt-6">
          {!props.collapsed && (
            <h3 class="px-4 mb-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Copilot Config
            </h3>
          )}
          <A
            href="/agents"
            class={cn(
              'flex items-center gap-3 px-4 py-2 mx-2 rounded-lg transition-colors',
              location.pathname === '/agents'
                ? 'bg-indigo-500/20 text-indigo-300'
                : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'
            )}
          >
            <Bot size={20} />
            {!props.collapsed && <span>Agents</span>}
          </A>
          <A
            href="/prompts"
            class={cn(
              'flex items-center gap-3 px-4 py-2 mx-2 rounded-lg transition-colors',
              location.pathname === '/prompts'
                ? 'bg-indigo-500/20 text-indigo-300'
                : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'
            )}
          >
            <FileText size={20} />
            {!props.collapsed && <span>Prompts</span>}
          </A>
          <A
            href="/instructions"
            class={cn(
              'flex items-center gap-3 px-4 py-2 mx-2 rounded-lg transition-colors',
              location.pathname === '/instructions'
                ? 'bg-amber-500/20 text-amber-300'
                : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'
            )}
          >
            <BookOpen size={20} />
            {!props.collapsed && <span>Instructions</span>}
          </A>
          <A
            href="/skills"
            class={cn(
              'flex items-center gap-3 px-4 py-2 mx-2 rounded-lg transition-colors',
              location.pathname === '/skills'
                ? 'bg-indigo-500/20 text-indigo-300'
                : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'
            )}
          >
            <Wand2 size={20} />
            {!props.collapsed && <span>Skills</span>}
          </A>
        </div>

        {/* Metrics Section */}
        <div class="mt-6">
          {!props.collapsed && (
            <h3 class="px-4 mb-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Analytics
            </h3>
          )}
          <A
            href="/metrics"
            class={cn(
              'flex items-center gap-3 px-4 py-2 mx-2 rounded-lg transition-colors',
              location.pathname === '/metrics'
                ? 'bg-indigo-500/20 text-indigo-300'
                : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'
            )}
          >
            <BarChart3 size={20} />
            {!props.collapsed && <span>Performance Metrics</span>}
          </A>
        </div>
      </nav>

      {/* Collapse Toggle */}
      <button
        onClick={() => props.onToggle()}
        class="h-12 flex items-center justify-center border-t border-gray-700 text-gray-400 hover:text-gray-200 hover:bg-gray-700 transition-colors"
      >
        <Show when={props.collapsed} fallback={<ChevronLeft size={20} />}>
          <ChevronRight size={20} />
        </Show>
      </button>
    </aside>
  );
}
