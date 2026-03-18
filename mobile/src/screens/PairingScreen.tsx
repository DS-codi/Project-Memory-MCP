import { createSignal, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { setApiKey, setServerConfig } from "../services/storage";

interface ParsedQr {
  host: string;
  httpPort: number;
  wsPort: number;
  key: string;
}

function parseQrUrl(raw: string): ParsedQr | null {
  try {
    // Expected format: pmobile://<host>:<httpPort>?key=<apiKey>&ws_port=<wsPort>
    const url = new URL(raw);
    if (url.protocol !== "pmobile:") return null;
    const key = url.searchParams.get("key");
    if (!key) return null;
    return {
      host: url.hostname,
      httpPort: parseInt(url.port || "3464", 10),
      wsPort: parseInt(url.searchParams.get("ws_port") ?? "3458", 10),
      key,
    };
  } catch {
    return null;
  }
}

export default function PairingScreen() {
  const navigate = useNavigate();
  const [scanning, setScanning] = createSignal(false);
  const [scanError, setScanError] = createSignal("");
  const [manualKey, setManualKey] = createSignal("");
  const [manualHost, setManualHost] = createSignal("");
  const [manualHttp, setManualHttp] = createSignal("3464");
  const [manualWs, setManualWs] = createSignal("3458");
  const [formError, setFormError] = createSignal("");

  const applyPairing = async (parsed: ParsedQr) => {
    await setApiKey(parsed.key);
    await setServerConfig({
      host: parsed.host,
      httpPort: parsed.httpPort,
      wsPort: parsed.wsPort,
    });
    navigate("/dashboard");
  };

  const scanQr = async () => {
    setScanError("");
    setScanning(true);
    try {
      const mod = await import("@capacitor-mlkit/barcode-scanning").catch(
        () => null
      );
      if (!mod) {
        setScanError(
          "Barcode scanner plugin not available — use manual entry below"
        );
        return;
      }
      const { BarcodeScanner } = mod as any;

      // Request camera permission
      const { camera } = await BarcodeScanner.requestPermissions();
      if (camera !== "granted" && camera !== "limited") {
        setScanError("Camera permission denied — use manual entry below");
        return;
      }

      const { barcodes } = await BarcodeScanner.scan({
        formats: ["QR_CODE"],
      });

      const raw: string = barcodes?.[0]?.rawValue ?? "";
      if (!raw) {
        setScanError("No QR code detected — try again");
        return;
      }

      const parsed = parseQrUrl(raw);
      if (!parsed) {
        setScanError(
          `Invalid QR code format. Expected: pmobile://<host>:<port>?key=<k>&ws_port=<ws>\nGot: ${raw.slice(0, 80)}`
        );
        return;
      }

      await applyPairing(parsed);
    } catch (e: any) {
      setScanError(e?.message ?? "Scan failed");
    } finally {
      setScanning(false);
    }
  };

  const saveManual = async () => {
    setFormError("");
    if (!manualKey().trim()) {
      setFormError("API key is required");
      return;
    }
    if (!manualHost().trim()) {
      setFormError("Host IP or hostname is required");
      return;
    }
    const httpPort = parseInt(manualHttp(), 10);
    const wsPort = parseInt(manualWs(), 10);
    if (isNaN(httpPort) || isNaN(wsPort)) {
      setFormError("Ports must be valid numbers");
      return;
    }
    await applyPairing({
      key: manualKey().trim(),
      host: manualHost().trim(),
      httpPort,
      wsPort,
    });
  };

  return (
    <div class="screen">
      <h2>Pair with Supervisor</h2>
      <p class="info">
        Open the Supervisor tray and click <b>Show Pairing QR</b>, then scan
        the code below.
      </p>

      {/* QR scan section */}
      <div class="pairing-section">
        <Show when={scanError()}>
          <p class="error">{scanError()}</p>
        </Show>
        <button
          onClick={scanQr}
          disabled={scanning()}
          style="width:100%;font-size:1rem;padding:14px"
        >
          {scanning() ? "Opening Camera…" : "📷  Scan QR Code"}
        </button>
      </div>

      <hr />

      {/* Manual entry section */}
      <div class="pairing-section">
        <h3>Manual Pairing</h3>
        <Show when={formError()}>
          <p class="error">{formError()}</p>
        </Show>
        <label class="field-label">API Key</label>
        <input
          type="text"
          placeholder="Paste API key here"
          value={manualKey()}
          onInput={(e) => setManualKey(e.currentTarget.value)}
          autocapitalize="none"
          autocorrect="off"
          autocomplete="off"
        />
        <label class="field-label">Host IP or Hostname</label>
        <input
          type="text"
          placeholder="192.168.1.x"
          value={manualHost()}
          onInput={(e) => setManualHost(e.currentTarget.value)}
          autocapitalize="none"
          autocorrect="off"
        />
        <label class="field-label">HTTP Port (Supervisor)</label>
        <input
          type="number"
          placeholder="3464"
          value={manualHttp()}
          onInput={(e) => setManualHttp(e.currentTarget.value)}
          inputmode="numeric"
        />
        <label class="field-label">WebSocket Port (Terminal)</label>
        <input
          type="number"
          placeholder="3458"
          value={manualWs()}
          onInput={(e) => setManualWs(e.currentTarget.value)}
          inputmode="numeric"
        />
        <button onClick={saveManual} style="width:100%;margin-top:8px">
          Save & Connect
        </button>
      </div>
    </div>
  );
}
