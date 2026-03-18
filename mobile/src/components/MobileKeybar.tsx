import { createSignal } from "solid-js";
import "./MobileKeybar.css";

interface MobileKeybarProps {
  /** Called with the escape-sequence string to send to the PTY. */
  onSend: (data: string) => void;
}

/**
 * Horizontally-scrollable toolbar of common terminal keys designed for
 * mobile users who lack a hardware keyboard.
 *
 * Ctrl-toggle behaviour:
 *   1. Tap Ctrl  → button highlights (ctrlActive = true)
 *   2. Tap an alphanumeric key while active → sends Ctrl+<key> sequence
 *      (e.g. "a" → \x01, "c" → \x03) and clears the toggle.
 *   3. Tapping a fixed-sequence key (Tab, Esc, arrows, Ctrl+C, Ctrl+D)
 *      while Ctrl is active still sends their normal sequence and clears
 *      the toggle, matching user expectation on Android.
 */
export default function MobileKeybar(props: MobileKeybarProps) {
  const [ctrlActive, setCtrlActive] = createSignal(false);

  function send(seq: string) {
    props.onSend(seq);
    setCtrlActive(false);
  }

  /** Convert an alphanumeric char to its Ctrl+<char> sequence. */
  function ctrlOf(char: string): string {
    const code = char.toUpperCase().charCodeAt(0) - 64;
    return String.fromCharCode(code);
  }

  function handleAlpha(char: string) {
    if (ctrlActive()) {
      send(ctrlOf(char));
    } else {
      send(char);
    }
  }

  function handleFixed(seq: string) {
    send(seq);
  }

  function toggleCtrl() {
    setCtrlActive((v) => !v);
  }

  return (
    <div class="mobile-keybar" role="toolbar" aria-label="Terminal keys">
      {/* ── Ctrl toggle ─────────────────────────────────── */}
      <button
        class={`key-btn ctrl-btn ${ctrlActive() ? "active" : ""}`}
        onClick={toggleCtrl}
        aria-pressed={ctrlActive()}
        title="Ctrl modifier"
      >
        Ctrl
      </button>

      {/* ── Esc ─────────────────────────────────────────── */}
      <button class="key-btn" onClick={() => handleFixed("\x1b")} title="Escape">
        Esc
      </button>

      {/* ── Tab ─────────────────────────────────────────── */}
      <button class="key-btn" onClick={() => handleFixed("\t")} title="Tab">
        Tab
      </button>

      {/* ── Arrow keys ──────────────────────────────────── */}
      <button class="key-btn" onClick={() => handleFixed("\x1b[A")} title="Arrow Up">
        ↑
      </button>
      <button class="key-btn" onClick={() => handleFixed("\x1b[B")} title="Arrow Down">
        ↓
      </button>
      <button class="key-btn" onClick={() => handleFixed("\x1b[D")} title="Arrow Left">
        ←
      </button>
      <button class="key-btn" onClick={() => handleFixed("\x1b[C")} title="Arrow Right">
        →
      </button>

      {/* ── Ctrl+C / Ctrl+D ─────────────────────────────── */}
      <button
        class="key-btn danger-btn"
        onClick={() => handleFixed("\x03")}
        title="Ctrl+C (interrupt)"
      >
        ^C
      </button>
      <button
        class="key-btn"
        onClick={() => handleFixed("\x04")}
        title="Ctrl+D (EOF)"
      >
        ^D
      </button>

      {/* ── Page Up / Page Down ──────────────────────────── */}
      <button class="key-btn" onClick={() => handleFixed("\x1b[5~")} title="Page Up">
        PgUp
      </button>
      <button class="key-btn" onClick={() => handleFixed("\x1b[6~")} title="Page Down">
        PgDn
      </button>
    </div>
  );
}
