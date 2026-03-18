# Interactive Terminal — Manual E2E Integration Test Checklist

> **Scope:** Android device on the same LAN connecting to the Project Memory supervisor
> and its embedded `interactive-terminal` WebSocket server.
> Run through every scenario in order. Mark each checkbox when it passes.

---

## Prerequisites

- [ ] Supervisor is running on the host machine (`launch-supervisor.ps1` or equivalent)
- [ ] `interactive-terminal` is started by the supervisor (check tray icon: Terminal WS status = green)
- [ ] Android device is connected to the **same Wi-Fi network** as the host
- [ ] Mobile APK is installed (`npx cap sync android && Android Studio → Run`)

---

## Scenario 1 — Network Discovery

### 1a mDNS auto-discovery
- [ ] Open the app → Discovery screen appears
- [ ] Within ~5 seconds the host appears in the device list (mDNS service `_pm._tcp`)
- [ ] Tap the host → pairing flow begins

### 1b Manual IP entry
- [ ] On Discovery screen tap **"Enter IP manually"**
- [ ] Enter the host IP and port (default `8080`)
- [ ] Tap **Connect** → pairing flow begins

---

## Scenario 2 — QR Pairing from Supervisor Tray

- [ ] Right-click the supervisor tray icon → **"Pair mobile device"**
- [ ] QR code dialog opens on the host
- [ ] On the app tap **"Scan QR"** → camera opens
- [ ] Scan the QR code
- [ ] App stores the API key via `SecureStorage` and navigates to Dashboard
- [ ] Tray dialog confirms "Device paired"

---

## Scenario 3 — Dashboard Status Indicators

- [ ] Dashboard screen loads
- [ ] **Supervisor** status card shows green (HTTP `/gui/ping` returns `{ ok: true }`)
- [ ] **Terminal WS** status card shows green (WebSocket `/ws` reachable — checked via ping or indicator)
- [ ] Activity log shows at least one recent event

---

## Scenario 4 — Terminal Connection Established

- [ ] Tap **Terminal** in the bottom nav or Dashboard quick-action
- [ ] `TerminalScreen` opens; overlay shows **"Connecting…"** spinner
- [ ] Within 2 seconds overlay disappears — session authenticated
- [ ] xterm.js renders a shell prompt (e.g. `C:\Users\User>` or `$`)

---

## Scenario 5 — PTY Input / Output

- [ ] Tap the xterm.js canvas to focus input
- [ ] Type `echo hello world` via the software keyboard
- [ ] Press Enter
- [ ] `hello world` appears on the next line in the terminal (PTY output round-trips correctly)
- [ ] Run `dir` (Windows) or `ls -la` (Unix): multi-line ANSI output renders without corruption
- [ ] Color output (e.g. `echo -e "\033[32mgreen\033[0m"`) displays correct colors in xterm.js

---

## Scenario 6 — MobileKeybar Keys

For each button, verify the correct sequence reaches the PTY:

| Button | Expected sequence | Test method |
|--------|------------------|-------------|
| **Tab** | `\t` (0x09) | Start `python3` → type partial command → Tab → completion appears |
| **Esc** | `\x1b` | Open `vim` → press Esc → confirm mode changes to Normal |
| **↑ / ↓** | `\x1b[A` / `\x1b[B` | Press ↑ in shell to cycle history |
| **← / →** | `\x1b[D` / `\x1b[C` | Move cursor in a long command |
| **^C** | `\x03` | Start `ping localhost` → tap ^C → process terminates |
| **^D** | `\x04` | Open `python3` REPL → tap ^D → REPL exits |
| **Ctrl toggle** | stateful | Tap **Ctrl** (highlights) → tap **C** → ^C sent → toggle clears |
| **PgUp / PgDn** | `\x1b[5~` / `\x1b[6~` | Scroll within `less` pager |

- [ ] All key sequences above verified correct

---

## Scenario 7 — Session Switcher (SessionDrawer)

- [ ] On TerminalScreen, tap the **☰ (hamburger)** button in the app bar
- [ ] SessionDrawer slides up from the bottom
- [ ] Current session is highlighted in the list
- [ ] **Status dot** for the current session is green (connected)
- [ ] Tap **"+ New Session"** → drawer closes → new TerminalScreen opens with a new `session_id`
- [ ] Open the drawer again → both sessions appear (one green, one potentially grey if not yet connected)
- [ ] Tap the original session → navigates back to it; PTY state is preserved (prompt / output unchanged)

---

## Scenario 8 — Session Persistence (Background / Foreground)

**Goal:** PTY process survives a ≥3-minute app background and reconnects to the same session.

1. [ ] Open a terminal session; note the `session_id` shown in the app bar
2. [ ] Run a long-running command (e.g. `ping -t localhost`) that produces continuous output
3. [ ] Background the app (press Home / switch app) — **wait at least 3 minutes**
4. [ ] Foreground the app → TerminalScreen reloads
5. [ ] Overlay shows **"Connecting…"** briefly, then disappears
6. [ ] The existing PTY output is visible / the running command is still active
7. [ ] New output from the long-running command streams in correctly
8. [ ] The `session_id` in the app bar is **identical** to step 1 (same session re-attached)

---

## Scenario 9 — Auth Rejection

- [ ] In `SecureStorage` manually set the API key to an invalid value (dev tool or debug screen)
- [ ] Navigate to Terminal → overlay shows **"Auth failed — tap to retry"**
- [ ] Restore the correct key → tap Retry → connection succeeds

---

## Build Verification Notes

> Populate this section after running `npm run build && npx cap sync android`.

```
npx cap sync android output:
(paste output here)

Warnings / plugin compatibility notes:
- 
```

---

*Last updated: 2026-03-19*
