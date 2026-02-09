import { useEffect, useState } from 'react';
import { Activity, Clock, ArrowRight, FileText, CheckCircle, Zap } from 'lucide-react';
import { cn } from '@/utils/cn';
import { formatRelative, displayStepNumber } from '@/utils/formatters';
import type { LiveUpdate } from '@/types';

interface ActivityFeedProps {
  updates: LiveUpdate[];
  maxItems?: number;
  className?: string;
}

export function ActivityFeed({ updates, maxItems = 20, className }: ActivityFeedProps) {
  const displayedUpdates = updates.slice(0, maxItems);

  if (displayedUpdates.length === 0) {
    return (
      <div className={cn('text-center py-8 text-slate-500', className)}>
        <Activity className="mx-auto mb-2 opacity-50" size={32} />
        <p>No recent activity</p>
        <p className="text-sm">Updates will appear here in real-time</p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-2', className)}>
      {displayedUpdates.map((update, index) => (
        <ActivityItem key={`${update.timestamp}-${index}`} update={update} />
      ))}
    </div>
  );
}

function ActivityItem({ update }: { update: LiveUpdate }) {
  const icons: Record<LiveUpdate['type'], React.ReactNode> = {
    handoff: <ArrowRight size={16} />,
    step_update: <CheckCircle size={16} />,
    plan_created: <FileText size={16} />,
    plan_archived: <FileText size={16} />,
  };

  const colors: Record<LiveUpdate['type'], string> = {
    handoff: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
    step_update: 'bg-green-500/20 text-green-300 border-green-500/30',
    plan_created: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    plan_archived: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
  };

  return (
    <div className={cn(
      'flex items-start gap-3 p-3 rounded-lg border',
      colors[update.type]
    )}>
      <div className="mt-0.5">
        {icons[update.type]}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm">{update.message}</p>
        <div className="flex items-center gap-2 mt-1 text-xs opacity-70">
          <Clock size={12} />
          <span>{formatRelative(update.timestamp)}</span>
          {update.plan_id && (
            <span className="font-mono">{update.plan_id.slice(-8)}</span>
          )}
        </div>
      </div>
    </div>
  );
}

// Live activity feed that accumulates updates from WebSocket AND SSE
export function LiveActivityFeed({ className }: { className?: string }) {
  const [activities, setActivities] = useState<LiveUpdate[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Try SSE for MCP events first
    const eventSource = new EventSource('/api/events/stream');
    
    eventSource.addEventListener('connected', () => {
      setIsConnected(true);
    });
    
    eventSource.addEventListener('mcp_event', (event) => {
      try {
        const data = JSON.parse(event.data);
        const update: LiveUpdate = {
          timestamp: data.timestamp,
          type: mapMCPEventType(data.type),
          workspace_id: data.workspace_id,
          plan_id: data.plan_id || '',
          message: formatMCPEventMessage(data),
        };
        
        setActivities((prev) => [update, ...prev].slice(0, 100));
      } catch (e) {
        console.error('Failed to parse MCP event:', e);
      }
    });
    
    eventSource.onerror = () => {
      setIsConnected(false);
    };

    // Also connect to WebSocket for file watcher updates
    const ws = new WebSocket('ws://localhost:3002');

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const update: LiveUpdate = {
          timestamp: data.timestamp || new Date().toISOString(),
          type: mapEventType(data.type),
          workspace_id: data.workspace_id,
          plan_id: data.plan_id || '',
          message: formatEventMessage(data),
        };
        
        setActivities((prev) => [update, ...prev].slice(0, 100));
      } catch (e) {
        console.error('Failed to parse activity:', e);
      }
    };

    return () => {
      eventSource.close();
      ws.close();
    };
  }, []);

  return (
    <div className={className}>
      {isConnected && (
        <div className="flex items-center gap-2 text-xs text-green-400 mb-3 pb-3 border-b border-slate-700">
          <Zap size={12} className="animate-pulse" />
          <span>Connected to MCP events</span>
        </div>
      )}
      <ActivityFeed updates={activities} />
    </div>
  );
}

function mapEventType(type: string): LiveUpdate['type'] {
  switch (type) {
    case 'handoff': return 'handoff';
    case 'plan_created': return 'plan_created';
    case 'plan_archived': return 'plan_archived';
    default: return 'step_update';
  }
}

function mapMCPEventType(type: string): LiveUpdate['type'] {
  switch (type) {
    case 'handoff': return 'handoff';
    case 'plan_created': return 'plan_created';
    case 'plan_archived':
    case 'plan_updated': return 'plan_archived';
    case 'step_updated': return 'step_update';
    case 'agent_session_started':
    case 'agent_session_completed': return 'handoff';
    default: return 'step_update';
  }
}

function formatEventMessage(data: { type: string; file?: string; plan_id?: string; workspace_id?: string }): string {
  switch (data.type) {
    case 'handoff':
      return `Agent handoff recorded`;
    case 'plan_updated':
      return `Plan state updated`;
    case 'workspace_updated':
      return `Workspace configuration changed`;
    case 'step_update':
      return `Step status changed`;
    default:
      return `Activity detected: ${data.file || data.type}`;
  }
}

function formatMCPEventMessage(data: { type: string; tool_name?: string; agent_type?: string; data?: Record<string, unknown> }): string {
  switch (data.type) {
    case 'handoff':
      const handoffData = data.data as { fromAgent?: string; toAgent?: string; reason?: string };
      return `${handoffData?.fromAgent || 'Agent'} → ${handoffData?.toAgent || 'Agent'}: ${handoffData?.reason || 'Handoff'}`;
    case 'plan_created':
      return `New plan: ${(data.data as { title?: string })?.title || 'Untitled'}`;
    case 'step_updated':
      const stepData = data.data as { stepIndex?: number; newStatus?: string };
      return `Step ${displayStepNumber(stepData?.stepIndex ?? 0)} → ${stepData?.newStatus || 'updated'}`;
    case 'agent_session_started':
      return `${data.agent_type || 'Agent'} session started`;
    case 'agent_session_completed':
      return `${data.agent_type || 'Agent'} session completed`;
    case 'tool_call':
      return `Tool: ${data.tool_name || 'unknown'}`;
    default:
      return `MCP event: ${data.type}`;
  }
}
