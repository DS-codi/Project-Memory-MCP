import { onMount, onCleanup } from "solid-js";
import { Terminal } from "xterm";
import { FitAddon } from "@xterm/addon-fit";
import "xterm/css/xterm.css";
import "./TerminalView.css";

export interface TerminalHandle {
  /** Write raw bytes or a UTF-8 string to the xterm.js display. */
  write(data: string | Uint8Array): void;
  /** Re-fit the terminal canvas to its container and update PTY size. */
  fit(): void;
}

interface TerminalViewProps {
  /**
   * Callback invoked immediately after the Terminal is mounted.
   * Receives an imperative handle for write/fit operations.
   */
  ref?: (handle: TerminalHandle) => void;
  /**
   * Fired whenever the terminal dimensions change (e.g. after fit()).
   * Use this to call `terminalWs.sendResize(cols, rows)`.
   */
  onResize?: (cols: number, rows: number) => void;
}

export default function TerminalView(props: TerminalViewProps) {
  let containerRef: HTMLDivElement | undefined;

  onMount(() => {
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: '"Cascadia Code", "Fira Code", monospace',
      theme: {
        background: "#1e1e2e",
        foreground: "#cdd6f4",
        cursor: "#f5e0dc",
        selectionBackground: "#585b70",
      },
      convertEol: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef!);
    fitAddon.fit();

    // Expose imperative handle to the parent.
    const handle: TerminalHandle = {
      write: (data) => term.write(data),
      fit: () => fitAddon.fit(),
    };
    props.ref?.(handle);

    // Propagate size changes to the parent (→ WS resize frame).
    term.onResize(({ cols, rows }) => {
      props.onResize?.(cols, rows);
    });

    // Re-fit when the viewport resizes (orientation change, keyboard open, etc.).
    const onWindowResize = () => {
      fitAddon.fit();
    };
    window.addEventListener("resize", onWindowResize);

    onCleanup(() => {
      window.removeEventListener("resize", onWindowResize);
      term.dispose();
    });
  });

  return <div ref={containerRef} class="terminal-view" />;
}
