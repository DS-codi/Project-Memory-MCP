# mDNS Plugin Status

## Decision

`@capacitor-community/mdns` availability at runtime is uncertain — the package is not widely
maintained for Capacitor v6. The `DiscoveryScreen` uses a **defensive dynamic import** wrapped
in a `try/catch`, so the app functions correctly without it.

## Behaviour

| Plugin available | Behaviour |
|-----------------|-----------|
| Yes | mDNS browse for `_projectmemory._tcp.local.` runs on mount; discovered hosts shown in list |
| No (import fails) | Error silently caught; manual IP entry form shown immediately |

## Manual Fallback Fields

| Field | Default |
|-------|---------|
| Host IP / hostname | (required) |
| HTTP Port | 3464 |
| WS Port | 3458 |

## mDNS TXT Record Format (from Supervisor broadcaster)

The Supervisor broadcasts `_projectmemory._tcp.local.` with TXT records:
- `http_port` — Supervisor HTTP/REST port (default 3464)
- `ws_port` — Interactive Terminal WebSocket port (default 3458)

## Installation (when Android platform is added)

```bash
npm install @capacitor-community/mdns
npx cap sync android
```

Then register the plugin in `android/app/src/main/MainActivity.kt` if required by the plugin docs.
