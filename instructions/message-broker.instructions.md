---
applyTo: "**/message-broker/**,**/broker/**,**/*broker*.*"
---

# Message Broker Instructions

Guidelines for building TCP-based pub/sub message brokers for inter-process communication between Python applications and AutoHotkey scripts.

## Architecture Overview

```
┌─────────────────────────────────────────┐
│         Message Broker Server           │
│         (localhost:15234)               │
│  Topic Router | Message Queue | Health  │
└─────────────────────────────────────────┘
        ▲               ▲               ▲
        │ TCP           │ TCP           │ TCP
┌───────┴───────┐ ┌─────┴─────┐ ┌───────┴───────┐
│  Python App   │ │  AHK App  │ │  Qt App       │
│ BrokerClient  │ │ TCP Socket│ │QtBrokerClient │
└───────────────┘ └───────────┘ └───────────────┘
```

## Protocol Specification

### Transport
- Protocol: TCP
- Default Port: 15234
- Host: localhost

### Frame Format
```
┌─────────────────┬────────────────────────┐
│ Length (4 bytes)│ JSON Payload (UTF-8)   │
│ (big-endian)    │                        │
└─────────────────┴────────────────────────┘
```

### JSON-RPC 2.0 Messages

**Request:**
```json
{"jsonrpc": "2.0", "method": "subscribe", "params": {"patterns": ["jobs.*"]}, "id": 1}
```

**Response:**
```json
{"jsonrpc": "2.0", "result": {"subscribed": ["jobs.*"]}, "id": 1}
```

**Notification (no response):**
```json
{"jsonrpc": "2.0", "method": "message", "params": {"topic": "jobs.activated", "payload": {...}, "sender": "app1"}}
```

### Methods

| Method | Description | Params |
|--------|-------------|--------|
| `connect` | Initialize connection | `client_id`, `client_type`, `version` |
| `disconnect` | Clean disconnect | - |
| `subscribe` | Subscribe to patterns | `patterns[]` |
| `unsubscribe` | Unsubscribe | `patterns[]` |
| `publish` | Publish message | `topic`, `payload`, `qos`, `ttl` |
| `ping` | Heartbeat | - |
| `status` | Get broker status | - |

## Broker Server

### Configuration

```python
from dataclasses import dataclass

@dataclass
class BrokerConfig:
    host: str = "localhost"
    port: int = 15234
    max_connections: int = 100
    heartbeat_interval: float = 5.0
    heartbeat_timeout: float = 30.0
    max_message_size: int = 1024 * 1024  # 1 MB
    max_queue_size: int = 10000
```

### Basic Server

```python
import asyncio
from message_broker import MessageBroker, BrokerConfig

async def main():
    config = BrokerConfig(host="localhost", port=15234)
    broker = MessageBroker(config)
    await broker.start()
    
    try:
        while True:
            await asyncio.sleep(1)
    except KeyboardInterrupt:
        await broker.stop()

asyncio.run(main())
```

### System Topics

| Topic | Payload | Description |
|-------|---------|-------------|
| `system.broker.ready` | `{host, port}` | Broker started |
| `system.broker.shutdown` | `{reason}` | Broker stopping |
| `system.client.connected` | `{client_id}` | Client connected |
| `system.client.disconnected` | `{client_id}` | Client disconnected |

## Python Async Client

```python
from message_broker import BrokerClient, Message

async def main():
    client = BrokerClient("my_app", host="localhost", port=15234)
    await client.connect()
    
    # Subscribe
    async def handler(msg: Message):
        print(f"{msg.topic}: {msg.payload}")
    
    await client.subscribe(["jobs.*", "scripts.+"], handler)
    
    # Publish
    await client.publish("jobs.activated", {"job_id": "123"})
    
    # Request/Response
    response = await client.request("scripts.status", {"id": "saw1"}, timeout=5.0)
    
    await client.disconnect()
```

### Client Properties

```python
client.client_id: str
client.is_connected: bool

await client.connect() -> bool
await client.disconnect()
await client.subscribe(patterns, callback) -> list[str]
await client.unsubscribe(patterns) -> list[str]
await client.publish(topic, payload, qos=0, ttl=0) -> str
await client.request(topic, payload, timeout=5.0) -> dict
```

## Qt Integration (QtBrokerClient)

Thread-safe client with Qt signals for PySide6/PyQt applications.

```python
from PySide6.QtWidgets import QMainWindow
from PySide6.QtCore import Slot
from message_broker.qt_client import QtBrokerClient

class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        
        self._broker = QtBrokerClient("main_app", parent=self)
        
        # Connect signals
        self._broker.connected.connect(self._on_connected)
        self._broker.disconnected.connect(self._on_disconnected)
        self._broker.message_received.connect(self._on_message)
        self._broker.error_occurred.connect(self._on_error)
        
        self._broker.connect_to_broker()
    
    @Slot()
    def _on_connected(self):
        self._broker.subscribe(["jobs.*"])
    
    @Slot(str, dict, str, str)
    def _on_message(self, topic, payload, sender, msg_id):
        print(f"{topic} from {sender}: {payload}")
    
    def publish_event(self, job_id):
        self._broker.publish("jobs.activated", {"job_id": job_id})
    
    def closeEvent(self, event):
        self._broker.disconnect_from_broker()
        super().closeEvent(event)
```

### QtBrokerClient Signals

| Signal | Parameters | Description |
|--------|------------|-------------|
| `connected` | - | Connected |
| `disconnected` | - | Disconnected |
| `connection_failed` | `str` | Connection error |
| `message_received` | `str, dict, str, str` | topic, payload, sender, id |
| `subscribed` | `list[str]` | Patterns subscribed |
| `published` | `str` | Message ID |
| `error_occurred` | `str` | Error message |

## Topic Patterns

### Naming Convention
```
<domain>.<entity>.<action>
```

Examples:
- `jobs.activated`
- `jobs.12345.updated`
- `scripts.saw1.started`
- `system.broker.ready`

### Pattern Matching

| Pattern | Matches | Description |
|---------|---------|-------------|
| `jobs.activated` | Exact match | Single topic |
| `jobs.*` | `jobs.activated`, `jobs.created` | Single level wildcard |
| `jobs.+` | `jobs.123`, `jobs.abc` | Single level (≥1 char) |
| `scripts.#` | `scripts.saw1.started`, `scripts.saw1.hotkey.pressed` | Multi-level wildcard |
| `scripts.+.started` | `scripts.saw1.started` | Middle wildcard |

### Reserved Topics

| Pattern | Purpose |
|---------|---------|
| `system.*` | Broker internal events |
| `_internal.*` | Internal operations |

## Common Patterns

### Job Activation Flow

```python
# Publisher (main app)
await broker.publish("jobs.activated", {
    "job_id": job_id,
    "job_number": "ABC123",
    "timestamp": datetime.now().isoformat(),
})

# Subscriber (other apps)
async def on_message(msg):
    if msg.topic == "jobs.activated":
        job_id = msg.payload["job_id"]
        update_ui(job_id)

await client.subscribe(["jobs.*"], on_message)
```

### Script Status Updates

```python
# Runner publishes lifecycle
await broker.publish(f"scripts.{script_id}.started", {"pid": pid})
await broker.publish(f"scripts.{script_id}.stopped", {"exit_code": 0})

# Monitor subscribes
await client.subscribe(["scripts.+.started", "scripts.+.stopped"], handler)
```

### Request/Response (RPC)

```python
# Client requests
response = await client.request("scripts.status", {"script_id": "saw1"}, timeout=5.0)

# Service handles
async def handle_request(msg):
    script_id = msg.payload["script_id"]
    return {"running": script_id in running_scripts}
```

## AHK Integration

### Direct TCP (AHK v2)

```autohotkey
class BrokerClient {
    __New(clientId, host := "localhost", port := 15234) {
        this.clientId := clientId
        this.host := host
        this.port := port
        this.requestId := 0
    }
    
    Connect() {
        this.socket := ComObject("MSWinsock.Winsock.1")
        this.socket.RemoteHost := this.host
        this.socket.RemotePort := this.port
        this.socket.Connect()
        
        ; Send connect request
        this.requestId++
        request := '{"jsonrpc":"2.0","method":"connect","params":{"client_id":"' . this.clientId . '"},"id":' . this.requestId . '}'
        this._Send(request)
    }
    
    Publish(topic, payload) {
        this.requestId++
        request := '{"jsonrpc":"2.0","method":"publish","params":{"topic":"' . topic . '","payload":' . payload . '},"id":' . this.requestId . '}'
        this._Send(request)
    }
    
    _Send(data) {
        ; Length prefix (4 bytes big-endian)
        len := StrLen(data)
        header := Chr(len >> 24 & 0xFF) . Chr(len >> 16 & 0xFF) . Chr(len >> 8 & 0xFF) . Chr(len & 0xFF)
        this.socket.SendData(header . data)
    }
}
```

### Python Bridge (Recommended)

```python
from message_broker import BrokerClient
from message_broker.ahk_bridge import AHKBridge

async def main():
    client = BrokerClient("ahk_bridge")
    await client.connect()
    
    bridge = AHKBridge(broker_client=client)
    await bridge.start()
    await bridge.run_script("scripts/hotkeys.ahk")
```

## Error Codes

| Code | Name | Description |
|------|------|-------------|
| -32700 | PARSE_ERROR | Invalid JSON |
| -32600 | INVALID_REQUEST | Not valid JSON-RPC |
| -32601 | METHOD_NOT_FOUND | Unknown method |
| -32602 | INVALID_PARAMS | Invalid parameters |
| -32603 | INTERNAL_ERROR | Internal broker error |
| -32001 | NOT_CONNECTED | Client not connected |
| -32002 | TIMEOUT | Request timed out |

## Testing

### Mock Client

```python
from unittest.mock import AsyncMock, MagicMock

@pytest.fixture
def mock_broker():
    client = MagicMock()
    client.is_connected = True
    client.connect = AsyncMock(return_value=True)
    client.publish = AsyncMock(return_value="msg-123")
    client.subscribe = AsyncMock(return_value=["jobs.*"])
    return client
```

### Integration Test

```python
@pytest.fixture
async def broker():
    broker = MessageBroker()
    await broker.start()
    yield broker
    await broker.stop()

async def test_pub_sub(broker):
    client = BrokerClient("test")
    await client.connect()
    
    received = []
    await client.subscribe(["test.*"], lambda m: received.append(m))
    await client.publish("test.msg", {"data": "hello"})
    
    await asyncio.sleep(0.1)
    assert received[0].payload["data"] == "hello"
```

## Troubleshooting

### Connection Refused
- Check broker is running
- Verify port is correct
- Check firewall settings

### Messages Not Received
- Verify topic matches subscription pattern
- Check subscription was active before publish
- Enable debug logging: `logging.getLogger("message_broker").setLevel(logging.DEBUG)`

### Qt Client Freezing
- Never use `await` in Qt main thread
- Use `QtBrokerClient` which handles threading

### Debug Tools

```python
# Enable message logging
config = BrokerConfig(log_messages=True)

# Get broker status
status = await client.request("status", {})
print(f"Clients: {status['client_count']}")

# Subscribe to all for debugging
await client.subscribe(["#"], debug_handler)
```

## Configuration Defaults

```python
DEFAULT_HOST = "localhost"
DEFAULT_PORT = 15234
DEFAULT_HEARTBEAT_INTERVAL = 5.0
DEFAULT_HEARTBEAT_TIMEOUT = 30.0
DEFAULT_MAX_MESSAGE_SIZE = 1024 * 1024
```

## References

- [JSON-RPC 2.0 Specification](https://www.jsonrpc.org/specification)
- [asyncio Documentation](https://docs.python.org/3/library/asyncio.html)
