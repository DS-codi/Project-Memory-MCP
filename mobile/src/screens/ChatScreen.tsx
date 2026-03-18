import {
  createSignal,
  createEffect,
  onMount,
  onCleanup,
  For,
  Show,
} from "solid-js";
import { sendMessage, getStatus, getRecentEvents } from "../services/chatbotApi";
import ChatBubble from "../components/ChatBubble";
import SessionList from "../components/SessionList";
import type { ChatMessage } from "../types/api";
import "./ChatScreen.css";

export default function ChatScreen() {
  const [messages, setMessages] = createSignal<ChatMessage[]>([]);
  const [input, setInput] = createSignal("");
  const [sending, setSending] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [showSessions, setShowSessions] = createSignal(false);
  let bottomRef: HTMLDivElement | undefined;
  let abortController: AbortController | null = null;

  // Scroll to bottom whenever messages change
  createEffect(() => {
    messages();
    bottomRef?.scrollIntoView({ behavior: "smooth" });
  });

  onCleanup(() => abortController?.abort());

  async function send() {
    const text = input().trim();
    if (!text || sending()) return;
    setInput("");
    setError(null);

    const userMsg: ChatMessage = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setSending(true);

    abortController = new AbortController();
    const timeout = setTimeout(() => abortController?.abort(), 5 * 60 * 1000);

    try {
      const res = await sendMessage(text, abortController.signal);

      // If tool-use in progress, poll for completion
      if (res.status === "tool_use") {
        let statusId = res.id;
        let pollInterval = setInterval(async () => {
          try {
            const status = await getStatus(statusId);
            if (status.status === "complete") {
              clearInterval(pollInterval);
              setSending(false);
              setMessages((prev) => [
                ...prev,
                { role: "assistant", content: status.reply ?? "" },
              ]);
            } else if (status.status === "error") {
              clearInterval(pollInterval);
              setSending(false);
              setError(status.error ?? "Tool use failed");
            }
          } catch (e) {
            clearInterval(pollInterval);
            setSending(false);
            setError("Polling error");
          }
        }, 2000);
        onCleanup(() => clearInterval(pollInterval));
      } else {
        setSending(false);
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: res.reply ?? "" },
        ]);
      }
    } catch (e: any) {
      setSending(false);
      if (e?.name === "AbortError") {
        setError("Request timed out after 5 minutes");
      } else {
        setError(e?.message ?? "Send failed");
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div class="screen chat-screen">
      <div class="chat-toolbar">
        <button class="sessions-btn" onClick={() => setShowSessions(true)}>
          Sessions
        </button>
      </div>

      <div class="chat-messages">
        <For each={messages()}>{(msg) => <ChatBubble message={msg} />}</For>
        <Show when={sending()}>
          <div class="thinking-indicator">
            <span class="pulse-dot" />
            <span class="pulse-dot" />
            <span class="pulse-dot" />
          </div>
        </Show>
        <Show when={error()}>
          <div class="chat-error">
            {error()}
            <button onClick={() => setError(null)}>✕</button>
          </div>
        </Show>
        <div ref={bottomRef} />
      </div>

      <div class="chat-input-bar">
        <textarea
          value={input()}
          onInput={(e) => setInput(e.currentTarget.value)}
          onKeyDown={handleKeyDown}
          placeholder="Message…"
          rows={1}
          disabled={sending()}
        />
        <button onClick={send} disabled={sending() || !input().trim()}>
          Send
        </button>
      </div>

      <Show when={showSessions()}>
        <SessionList onClose={() => setShowSessions(false)} />
      </Show>
    </div>
  );
}
