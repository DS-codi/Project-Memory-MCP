import "./ChatBubble.css";

interface ChatBubbleProps {
  role: "user" | "assistant";
  content: string;
}

export default function ChatBubble(props: ChatBubbleProps) {
  return (
    <div class={`chat-bubble chat-bubble--${props.role}`}>
      <div class="chat-bubble__content">{props.content}</div>
    </div>
  );
}
