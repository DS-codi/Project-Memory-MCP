# Design Document: Project Memory Mobile (Remote Controller)

## 1. Overview
**Project Memory Mobile** is a companion app designed to extend the **Supervisor** and **Interactive Terminal** capabilities to a mobile device over a local network (WiFi). It allows users to launch, monitor, and interact with CLI agent sessions (Gemini/Copilot) from their phone, providing a "pocket-sized" command center for software engineering tasks.

---

## 2. System Architecture

The mobile app acts as a lightweight client connecting to two existing backend services running on the host PC. 

### 2.1 Component Diagram
```text
[ Mobile App (iOS/Android) ]
       │
       ├── (Authenticated HTTP/JSON) ───► [ Supervisor GUI Server (Port 3464) ]
       │                                  • Launching Agents
       │                                  • Chatbot API (/chatbot/chat)
       │                                  • System Logs
       │
       └── (Authenticated WebSocket) ───► [ Interactive Terminal (Port 9101) ]
                                          • Raw PTY Stream (Bi-directional)
                                          • Shell Rendering
                                          • Interactive Input
```

---

## 3. Core Features

### 3.1 Authentication & Security (API Key)
To prevent unauthorized access to the host PC's shell and agent capabilities, a shared **API Key** is used.
*   **Storage:** The key is stored securely on the mobile device (e.g., iOS Keychain / Android EncryptedSharedPreferences) and configured in the Supervisor's `supervisor.toml` or a dedicated secrets file on the PC.
*   **HTTP Protocol:** Every request to the Supervisor must include the `X-PM-API-Key` header.
*   **WebSocket Protocol:** The API key is passed as a query parameter (`ws://<IP>:9101/ws?token=<KEY>`) or via a custom protocol header during the handshake.
*   **Validation:** The Supervisor and Terminal Host will reject any connection that does not provide a matching key.

### 3.2 Network Discovery (mDNS)
To avoid manual IP entry, the app will use **mDNS (Bonjour/Zeroconf)** to discover the PC.
*   **Service Name:** `_projectmemory._tcp`
*   **Fallback:** Manual IP/Port entry for restricted networks.

### 3.3 Agent Control (Chat Interface)
A simplified UI for sending high-level instructions to agents.
*   **UI:** Standard chat bubbles.
*   **Integration:** Calls `POST /chatbot/chat` on the Supervisor.
*   **Progress Tracking:** Polls `/chatbot/status/{id}` to show which tools (e.g., `read_file`, `shell_command`) the agent is currently using.

### 3.4 Remote Shell (Interactive Terminal)
The "Heart" of the app: a live terminal view of running agent sessions.
*   **Terminal Emulator:** Use a mobile-optimized terminal component (e.g., `flutter_xterm` for Flutter or `xterm.js` in a WebView for React Native).
*   **Bi-directional I/O:**
    *   **Output:** Streams raw ANSI sequences from the PC's PTY.
    *   **Input:** Captures mobile keyboard events and sends them as UTF-8 bytes to the PC.
*   **Session Management:** A sidebar or tab-bar to switch between multiple running agents.

---

## 4. UI/UX Specifications

### 4.1 The Dashboard
*   **Health Status:** Visual indicators (Green/Red) for Supervisor, MCP Server, and Terminal Host.
*   **Active Sessions:** A list of currently running agent processes with "Join" buttons.
*   **Recent Activity:** A small scrolling log window showing the latest system events.

### 4.2 The Terminal View (The "Shell")
*   **Font:** Monospace (Courier/Roboto Mono).
*   **Input Toolbar:** A persistent row of buttons above the keyboard for keys not native to mobile:
    *   `Tab`, `Ctrl`, `Esc`, `Arrow Up/Down/Left/Right`, `Ctrl+C`.
*   **Auto-Scroll:** Toggle between "Follow Tail" and manual scroll-back.

---

## 5. Technical Implementation (Recommended Stack)

| Layer | Technology |
| :--- | :--- |
| **Framework** | **React Native** (allows high code reuse from the existing Dashboard/TS logic) |
| **Terminal** | **xterm.js** + `react-native-webview` |
| **Networking** | `fetch` (HTTP) and standard `WebSocket` API |
| **Discovery** | `react-native-zeroconf` |
| **Security** | `react-native-keychain` for API key storage |

---

## 6. Implementation Roadmap

### Phase 1: Connectivity & Auth (The "Ping")
*   Implement mDNS discovery and API key setup screen.
*   Build the authenticated "System Health" screen that pulls data from `GET /gui/ping`.

### Phase 2: The Chat Interface
*   Implement the chat UI.
*   Wire it to the Supervisor’s `/chatbot/chat` endpoint with API key headers.
*   Display "Live Logs" using the `/runtime/recent` endpoint.

### Phase 3: The Shell (The "Hard" Part)
*   Integrate the Terminal Emulator component.
*   Connect to the Terminal WebSocket using the API key token.
*   Implement the "Mobile Input Toolbar" (Tab/Ctrl/Esc).

### Phase 4: Polish & Refinement
*   Add biometric lock (FaceID/Fingerprint) as a second layer of security.
*   Optimize for battery (suspend WebSockets when app is in background).
