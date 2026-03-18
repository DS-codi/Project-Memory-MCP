// API types for Project Memory Supervisor communication

export interface PingResponse {
  status: "ok";
  version: string;
  active_plans: number;
  uptime_seconds: number;
}

export interface PlanSummary {
  id: string;
  title: string;
  status: string;
  current_phase: string;
  progress: number;
}

export interface RuntimeEvent {
  id: string;
  event_type: string;
  message: string;
  timestamp: string;
  plan_id?: string;
  session_id?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  thinking?: boolean;
  tool_use?: boolean;
}

export interface ChatResponse {
  message_id: string;
  content: string;
  done: boolean;
  tool_use?: boolean;
}

export interface ChatStatusResponse {
  id: string;
  status: "pending" | "streaming" | "done" | "error";
  content?: string;
}
