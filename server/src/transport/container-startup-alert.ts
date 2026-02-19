/**
 * Container Startup Alert — container-startup-alert.ts
 *
 * On container startup (HTTP transport mode), sends a fire-and-forget
 * POST to the host's alert listener to announce that the container MCP
 * server is ready. The host can then notify the user to switch their
 * MCP config to the container endpoint.
 *
 * Environment variables:
 *   MBS_ALERT_HOST  — Host IP to send the alert to (set by run-container.ps1)
 *   MBS_ALERT_PORT  — Port the host's alert listener is on (default: 9200)
 *
 * This is a one-shot, best-effort notification. If the host isn't
 * listening, the alert silently fails — the container starts regardless.
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

function getAlertTarget(): { host: string; port: number } | null {
  const host = process.env.MBS_ALERT_HOST;
  if (!host) {
    // No host configured — can't send alert
    return null;
  }

  const envPort = process.env.MBS_ALERT_PORT;
  const port = envPort ? parseInt(envPort, 10) : 9200;
  if (isNaN(port) || port < 1 || port > 65535) {
    console.error(`[startup-alert] Invalid MBS_ALERT_PORT: ${envPort}`);
    return null;
  }

  return { host, port };
}

// ---------------------------------------------------------------------------
// Send alert
// ---------------------------------------------------------------------------

export interface StartupAlertPayload {
  url: string;
  version: string;
  transport?: string;
  timestamp?: string;
}

/**
 * Send a container-ready alert to the host's alert listener.
 * Fire-and-forget with a 3-second timeout. Never throws.
 *
 * @param serverPort - The port the MCP HTTP server is listening on (e.g. 3000)
 * @param version    - Server version string
 * @param transport  - Transport type (e.g. 'streamable-http')
 */
export async function sendStartupAlert(
  serverPort: number,
  version: string,
  transport?: string
): Promise<void> {
  const target = getAlertTarget();
  if (!target) {
    console.error(
      '[startup-alert] MBS_ALERT_HOST not set — skipping container-ready alert'
    );
    return;
  }

  const payload: StartupAlertPayload = {
    url: `http://localhost:${serverPort}`,
    version,
    transport: transport ?? 'http',
    timestamp: new Date().toISOString(),
  };

  const alertUrl = `http://${target.host}:${target.port}/container-ready`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(alertUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (response.ok) {
      console.error(
        `[startup-alert] Container-ready alert sent to ${alertUrl} — host acknowledged`
      );
    } else {
      console.error(
        `[startup-alert] Host responded with ${response.status} — alert may not have been processed`
      );
    }
  } catch {
    // Expected when host isn't listening — silently continue
    console.error(
      `[startup-alert] Could not reach host alert listener at ${alertUrl} — ` +
      `this is normal if the host MCP server is not running`
    );
  }
}
