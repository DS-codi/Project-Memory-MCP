import { getApiKey, getServerConfig } from "./storage";

export type ConnectStatus =
  | "disconnected"
  | "connecting"
  | "authenticated"
  | "auth_failed";

interface WsFrame {
  type: string;
  session_id?: string;
  payload?: string;
  message?: string;
  cols?: number;
  rows?: number;
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  // Chunked to avoid call-stack overflow for large buffers.
  const CHUNK = 8192;
  let bin = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

/**
 * Manages a single WebSocket connection to the interactive-terminal server.
 *
 * Protocol:
 *  - On open: sends `{"type":"auth","key":"...","session_id":"..."}`
 *  - On `data` frame: base64-decodes payload → calls `onData(Uint8Array)`
 *  - On `heartbeat` frame: echoes back a heartbeat
 *  - On `error` frame with message "unauthorized": fires `onStatus("auth_failed")`
 *  - On close within SESSION_TIMEOUT: reconnects with same session_id after 2 s
 */
export class TerminalWsService {
  /** 5-minute window in which a disconnect triggers automatic reconnect. */
  readonly SESSION_TIMEOUT_MS = 5 * 60 * 1000;

  onData: ((data: Uint8Array) => void) | null = null;
  onStatus: ((status: ConnectStatus) => void) | null = null;
  onError: ((message: string) => void) | null = null;

  private ws: WebSocket | null = null;
  private sessionId: string;
  private intentionalDisconnect = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connectTime = 0;
  private authTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  async connect() {
    this.intentionalDisconnect = false;

    const [cfg, key] = await Promise.all([getServerConfig(), getApiKey()]);
    if (!cfg) {
      this.onStatus?.("auth_failed");
      return;
    }

    this.onStatus?.("connecting");

    // In browser (not Capacitor native), route through Vite dev-server proxy
    const isBrowser = !(window as any).Capacitor?.isNativePlatform?.();
    const url = isBrowser
      ? `ws://${window.location.host}/ws`
      : `ws://${cfg.host}:${cfg.wsPort}/ws`;
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.connectTime = Date.now();
      this.ws!.send(
        JSON.stringify({ type: "auth", key: key ?? "", session_id: this.sessionId })
      );
      // Optimistically assume auth succeeds; error frame will override within ~100 ms.
      this.authTimer = setTimeout(() => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.onStatus?.("authenticated");
        }
      }, 400);
    };

    this.ws.onmessage = (event) => {
      try {
        const frame: WsFrame = JSON.parse(event.data as string);
        switch (frame.type) {
          case "data":
            if (frame.payload) {
              this.onData?.(base64ToBytes(frame.payload));
            }
            break;
          case "heartbeat":
            this.ws?.send(JSON.stringify({ type: "heartbeat" }));
            break;
          case "error":
            if (this.authTimer !== null) {
              clearTimeout(this.authTimer);
              this.authTimer = null;
            }
            if (frame.message === "unauthorized") {
              this.intentionalDisconnect = true;
              this.onStatus?.("auth_failed");
            } else {
              this.onError?.(frame.message ?? "server error");
            }
            break;
          default:
            // Any other frame after connect confirms auth.
            if (this.authTimer !== null) {
              clearTimeout(this.authTimer);
              this.authTimer = null;
              this.onStatus?.("authenticated");
            }
        }
      } catch {
        // Binary fallback — shouldn't occur with JSON framing server.
        if (event.data instanceof ArrayBuffer) {
          this.onData?.(new Uint8Array(event.data));
        }
      }
    };

    this.ws.onerror = () => {
      this.onError?.("WebSocket error");
    };

    this.ws.onclose = () => {
      if (this.authTimer !== null) {
        clearTimeout(this.authTimer);
        this.authTimer = null;
      }
      if (this.intentionalDisconnect) return;
      const elapsed = Date.now() - this.connectTime;
      if (elapsed < this.SESSION_TIMEOUT_MS) {
        // Reconnect within session persistence window.
        this.reconnectTimer = setTimeout(() => this.connect(), 2000);
      } else {
        this.onStatus?.("disconnected");
      }
    };
  }

  disconnect() {
    this.intentionalDisconnect = true;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.authTimer !== null) {
      clearTimeout(this.authTimer);
      this.authTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    this.onStatus?.("disconnected");
  }

  /** Send keystroke/paste data to the PTY (base64-encoded). */
  sendData(text: string) {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    const bytes = new TextEncoder().encode(text);
    const payload = bytesToBase64(bytes);
    this.ws.send(
      JSON.stringify({ type: "data", session_id: this.sessionId, payload })
    );
  }

  /** Send a PTY resize notification to the server. */
  sendResize(cols: number, rows: number) {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: "resize", cols, rows }));
  }
}
