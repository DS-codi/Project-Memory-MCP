---
applyTo: "**/*"
---

# memory_brainstorm — Tool Reference

GUI routing tool for the Brainstorm workflow. Hub agents (Coordinator, Analyst) use it to send form requests to the Brainstorm GUI and receive structured answers back before dispatching the Brainstorm agent.

GUI launches are **serialised per-app** — concurrent calls queue and wait rather than spawning duplicate windows.

---

## Actions

### `route`

Send a `FormRequest` to the Brainstorm GUI. Blocks until the user submits or the GUI times out. Does not fall back automatically on unavailability — use `route_with_fallback` for resilience.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"route"` |
| `form_request` | object | ✅ | `FormRequest` payload to send to the GUI |

**Returns:** GUI response data on success, or `success: false` with an error if the GUI is unavailable or timed out.

**When to use:** When the GUI must be present — plan creation flows where you want to guarantee user input before proceeding.

**Example:**
```json
{
  "action": "route",
  "form_request": {
    "form_id": "brainstorm_kickoff",
    "title": "Feature: Payment Refunds",
    "fields": [
      { "id": "scope", "label": "What should be in scope?", "type": "textarea" },
      { "id": "priority", "label": "Priority", "type": "select", "options": ["low", "medium", "high"] }
    ]
  }
}
```

---

### `route_with_fallback`

Send a `FormRequest` to the GUI. When the GUI is unavailable, returns `success: false` with `requires_approval: true` in the response data instead of erroring. The agent **must** then call `memory_terminal` with an echo sentinel command for VS Code approval before using any fallback answers.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"route_with_fallback"` |
| `form_request` | object | ✅ | `FormRequest` payload |

**Returns on success:** GUI response data (`success: true`).

**Returns on unavailability:** `{ success: false, data: { requires_approval: true, ... } }`

**Critical rule:** If `requires_approval: true` is in the response, you MUST call `memory_terminal(action: run)` with an echo sentinel command before using fallback answers. Do not silently proceed.

**When to use:** Workflows where brainstorm input is helpful but the work can proceed with VS Code approval if the GUI is not available.

**Example — handling unavailability:**
```json
// Step 1: attempt GUI
{ "action": "route_with_fallback", "form_request": { ... } }

// Step 2: if response.data.requires_approval === true:
{
  "action": "run",
  "command": "echo",
  "args": ["[APPROVAL REQUIRED] Brainstorm GUI unavailable — confirm fallback answers"],
  "workspace_id": "..."
}
```

---

### `refine`

Submit a standalone `FormRefinementRequest` to an already-active Brainstorm agent session via the Supervisor. Used to inject additional context or adjust scope mid-brainstorm without relaunching.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"refine"` |
| `refinement_request` | object | ✅ | `FormRefinementRequest` payload |

**Returns:** Acknowledgement from the active Brainstorm agent.

**When to use:** When the Brainstorm agent is already running and you need to send it corrective context or a scope change. Do not use before `route`/`route_with_fallback` has been called — there must be an active session to target.

**Example:**
```json
{
  "action": "refine",
  "refinement_request": {
    "session_id": "sess_abc123",
    "refinement": "Focus only on the server-side; exclude frontend changes from scope"
  }
}
```

---

## FormRequest shape

The `form_request` payload is flexible but should follow the GUI contract. Minimum fields:

| Field | Description |
|-------|-------------|
| `form_id` | Unique form identifier |
| `title` | Display title for the form window |
| `fields` | Array of field definitions (id, label, type, options) |

The GUI validates and may reject malformed payloads — check the `error` field in the response.

## Serialisation note

If two agents (or two hub invocations) call `route`/`route_with_fallback` concurrently for the same app, the second call is queued. It will not fail — it waits until the first GUI window is dismissed.
