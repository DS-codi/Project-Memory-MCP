# Message Broker Guide

A comprehensive guide to setting up and using the TCP-based pub/sub message broker for inter-process communication (IPC) between Python applications and AutoHotkey scripts.

This guide is based on the `message_broker` module used by **ds_pas** and **ahk_manager**.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Quick Start](#quick-start)
4. [Protocol Specification](#protocol-specification)
5. [Broker Server](#broker-server)
6. [Python Clients](#python-clients)
7. [Qt Integration](#qt-integration)
8. [AHK Integration](#ahk-integration)
9. [Topic Patterns](#topic-patterns)
10. [Common Patterns](#common-patterns)
11. [Testing](#testing)
12. [Troubleshooting](#troubleshooting)

---

## Overview

The message broker provides:

- **Pub/Sub messaging**: Publish messages to topics, subscribe to patterns
- **Request/Response**: RPC-style communication with timeouts
- **Cross-platform**: Works between Python apps and AHK scripts
- **Auto-reconnection**: Clients automatically reconnect on disconnect
- **Qt integration**: Thread-safe Qt client with signals

### Use Cases

- Python app notifies AHK scripts of job changes
- AHK hotkey triggers Python utility
- Multiple Python apps share state
- Health monitoring across processes

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Message Broker Server                     │
│                    (localhost:15234)                         │
│  ┌─────────┐  ┌─────────┐  ┌────────────┐  ┌────────────┐  │
│  │  Topic  │  │ Message │  │  Client    │  │  Health    │  │
│  │ Router  │  │  Queue  │  │ Sessions   │  │  Monitor   │  │
│  └─────────┘  └─────────┘  └────────────┘  └────────────┘  │
└─────────────────────────────────────────────────────────────┘
        ▲               ▲               ▲
        │ TCP           │ TCP           │ TCP
        │               │               │
┌───────┴───────┐ ┌─────┴─────┐ ┌───────┴───────┐
│  Python App   │ │  AHK App  │ │  Python App   │
│  (ds_pas)     │ │ (scripts) │ │ (ahk_manager) │
│               │ │           │ │               │
│ QtBrokerClient│ │ TCP Socket│ │ BrokerClient  │
└───────────────┘ └───────────┘ └───────────────┘
```

---

## Quick Start

### 1. Start the Broker Server

```python
# Start from command line
python -m message_broker

# Or programmatically
import asyncio
from message_broker import MessageBroker, BrokerConfig

async def main():
    config = BrokerConfig(host="localhost", port=15234)
    broker = MessageBroker(config)
    await broker.start()
    
    # Keep running
    try:
        while True:
            await asyncio.sleep(1)
    except KeyboardInterrupt:
        await broker.stop()

asyncio.run(main())
```

### 2. Connect a Python Client

```python
import asyncio
from message_broker import BrokerClient, Message

async def main():
    client = BrokerClient("my_app")
    await client.connect()
    
    # Subscribe to topics
    async def on_message(msg: Message):
        print(f"Received: {msg.topic} = {msg.payload}")
    
    await client.subscribe(["jobs.*", "scripts.+"], on_message)
    
    # Publish a message
    await client.publish("jobs.activated", {"job_id": "12345"})
    
    await asyncio.sleep(10)
    await client.disconnect()

asyncio.run(main())
```

### 3. Connect from Qt Application

```python
from PySide6.QtWidgets import QApplication
from message_broker.qt_client import QtBrokerClient

app = QApplication([])

client = QtBrokerClient("main_app")
client.connected.connect(lambda: print("Connected!"))
client.message_received.connect(lambda t, p, s, i: print(f"{t}: {p}"))

client.connect_to_broker()
client.subscribe(["jobs.*"])

app.exec()
```

---

## Protocol Specification

### Transport Layer

- **Protocol**: TCP
- **Default Port**: 15234
- **Host**: localhost (configurable)

### Frame Format

```
┌─────────────────┬────────────────────────────┐
│ Length (4 bytes)│ JSON Payload (UTF-8)       │
│ (big-endian)    │                            │
└─────────────────┴────────────────────────────┘
```

### Message Types (JSON-RPC 2.0)

#### Request (expects response)
```json
{
    "jsonrpc": "2.0",
    "method": "subscribe",
    "params": {"patterns": ["jobs.*"]},
    "id": 1
}
```

#### Response
```json
{
    "jsonrpc": "2.0",
    "result": {"subscribed": ["jobs.*"]},
    "id": 1
}
```

#### Error Response
```json
{
    "jsonrpc": "2.0",
    "error": {
        "code": -32601,
        "message": "Method not found"
    },
    "id": 1
}
```

#### Notification (no response)
```json
{
    "jsonrpc": "2.0",
    "method": "message",
    "params": {
        "topic": "jobs.activated",
        "payload": {"job_id": "12345"},
        "timestamp": "2024-01-15T10:30:00",
        "sender": "ds_pas"
    }
}
```

### Methods

| Method        | Description                    | Params                           |
|---------------|--------------------------------|----------------------------------|
| `connect`     | Initialize connection          | `client_id`, `client_type`, `version` |
| `disconnect`  | Clean disconnect               | -                                |
| `subscribe`   | Subscribe to topic patterns    | `patterns` (array)               |
| `unsubscribe` | Unsubscribe from patterns      | `patterns` (array)               |
| `publish`     | Publish message to topic       | `topic`, `payload`, `qos`, `ttl` |
| `ping`        | Heartbeat                      | -                                |
| `status`      | Get broker status              | -                                |

### Error Codes

| Code    | Name                 | Description                    |
|---------|---------------------|--------------------------------|
| -32700  | PARSE_ERROR         | Invalid JSON                   |
| -32600  | INVALID_REQUEST     | Not a valid JSON-RPC request   |
| -32601  | METHOD_NOT_FOUND    | Method does not exist          |
| -32602  | INVALID_PARAMS      | Invalid method parameters      |
| -32603  | INTERNAL_ERROR      | Internal broker error          |
| -32001  | NOT_CONNECTED       | Client not connected           |
| -32002  | TIMEOUT             | Request timed out              |
| -32003  | SUBSCRIPTION_ERROR  | Subscription failed            |
| -32004  | PUBLISH_ERROR       | Publish failed                 |

---

## Broker Server

### Configuration

```python
from message_broker import BrokerConfig

config = BrokerConfig(
    # Network
    host="localhost",
    port=15234,
    
    # Connections
    max_connections=100,
    connection_timeout=30.0,
    
    # Messages
    max_message_size=1024 * 1024,  # 1 MB
    max_queue_size=10000,
    
    # Health
    heartbeat_interval=5.0,
    heartbeat_timeout=30.0,
    
    # Persistence (optional)
    persistence_enabled=False,
    persistence_path=None,
    
    # Logging
    log_level="INFO",
    log_messages=False,  # Log all messages (verbose)
)
```

### Running as Service

```python
# broker_service.py
"""Message broker as a standalone service."""

import asyncio
import signal
from message_broker import MessageBroker, BrokerConfig


async def main():
    config = BrokerConfig()
    broker = MessageBroker(config)
    
    # Handle shutdown signals
    loop = asyncio.get_event_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(
            sig,
            lambda: asyncio.create_task(broker.stop())
        )
    
    await broker.start()
    
    # Run until stopped
    while broker._running:
        await asyncio.sleep(1)


if __name__ == "__main__":
    asyncio.run(main())
```

### Broker Events

The broker publishes internal events to system topics:

| Topic                     | Payload                        | Description              |
|---------------------------|--------------------------------|--------------------------|
| `system.broker.ready`     | `{host, port, started_at}`     | Broker started           |
| `system.broker.shutdown`  | `{reason}`                     | Broker stopping          |
| `system.client.connected` | `{client_id, client_type}`     | Client connected         |
| `system.client.disconnected` | `{client_id, reason}`       | Client disconnected      |

---

## Python Clients

### Async Client (BrokerClient)

For asyncio-based applications.

```python
from message_broker import BrokerClient, Message
from message_broker.config import ClientConfig

# Configuration
config = ClientConfig(
    host="localhost",
    port=15234,
    auto_reconnect=True,
    reconnect_delay=1.0,
    max_reconnect_delay=30.0,
    max_reconnect_attempts=0,  # 0 = infinite
    connect_timeout=10.0,
    request_timeout=5.0,
    heartbeat_interval=5.0,
)

# Create client
client = BrokerClient(
    client_id="my_python_app",
    host="localhost",
    port=15234,
    config=config,
)

# Connect
await client.connect()

# Subscribe with callback
async def handle_message(msg: Message):
    print(f"Topic: {msg.topic}")
    print(f"Payload: {msg.payload}")
    print(f"Sender: {msg.sender}")
    print(f"Timestamp: {msg.timestamp}")

await client.subscribe(
    patterns=["jobs.*", "scripts.+.status"],
    callback=handle_message,
)

# Publish
await client.publish(
    topic="jobs.activated",
    payload={"job_id": "12345", "job_number": "ABC123"},
    qos=1,  # 0=at-most-once, 1=at-least-once
    ttl=60,  # seconds (0=no expiry)
)

# Request/Response pattern
response = await client.request(
    topic="scripts.status",
    payload={"script_id": "saw1"},
    timeout=5.0,
)

# Disconnect
await client.disconnect()
```

### Properties and Methods

```python
# Properties
client.client_id: str
client.is_connected: bool

# Methods
await client.connect() -> bool
await client.disconnect() -> None
await client.subscribe(patterns, callback) -> list[str]
await client.unsubscribe(patterns) -> list[str]
await client.publish(topic, payload, qos=0, ttl=0) -> str  # message_id
await client.request(topic, payload, timeout=5.0) -> dict
```

---

## Qt Integration

### QtBrokerClient

Thread-safe client for Qt applications that emits signals.

```python
from PySide6.QtWidgets import QMainWindow
from PySide6.QtCore import Slot
from message_broker.qt_client import QtBrokerClient


class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        
        # Create client
        self._broker = QtBrokerClient(
            client_id="main_app",
            host="localhost",
            port=15234,
            parent=self,
        )
        
        # Connect signals
        self._broker.connected.connect(self._on_connected)
        self._broker.disconnected.connect(self._on_disconnected)
        self._broker.message_received.connect(self._on_message)
        self._broker.error_occurred.connect(self._on_error)
        
        # Connect to broker
        self._broker.connect_to_broker()
    
    @Slot()
    def _on_connected(self):
        print("Connected to broker!")
        
        # Subscribe after connection
        self._broker.subscribe(["jobs.*", "scripts.+.status"])
    
    @Slot()
    def _on_disconnected(self):
        print("Disconnected from broker")
    
    @Slot(str, dict, str, str)
    def _on_message(self, topic: str, payload: dict, sender: str, message_id: str):
        print(f"Received: {topic} from {sender}")
        
        if topic.startswith("jobs."):
            self._handle_job_event(topic, payload)
    
    @Slot(str)
    def _on_error(self, error: str):
        print(f"Broker error: {error}")
    
    def _handle_job_event(self, topic: str, payload: dict):
        if topic == "jobs.activated":
            job_id = payload.get("job_id")
            print(f"Job activated: {job_id}")
    
    def publish_job_change(self, job_id: str):
        """Publish job change to other apps."""
        self._broker.publish(
            "jobs.activated",
            {"job_id": job_id, "source": "main_app"},
        )
    
    def closeEvent(self, event):
        self._broker.disconnect_from_broker()
        super().closeEvent(event)
```

### QtBrokerClient Signals

| Signal             | Parameters                           | Description              |
|--------------------|--------------------------------------|--------------------------|
| `connected`        | -                                    | Connected to broker      |
| `disconnected`     | -                                    | Disconnected from broker |
| `connection_failed`| `str` (error)                        | Connection failed        |
| `message_received` | `str, dict, str, str` (topic, payload, sender, id) | Message received |
| `subscribed`       | `list[str]` (patterns)               | Subscriptions active     |
| `published`        | `str` (message_id)                   | Message published        |
| `error_occurred`   | `str` (error)                        | Error occurred           |

### QtBrokerClient Methods

```python
# Connection
client.connect_to_broker() -> None
client.disconnect_from_broker() -> None

# Pub/Sub
client.subscribe(patterns: list[str]) -> None
client.unsubscribe(patterns: list[str]) -> None
client.publish(topic: str, payload: dict, retain: bool = False, qos: int = 0) -> None

# Properties
client.is_connected: bool
```

---

## AHK Integration

### Option 1: Direct TCP (AHK v2)

```autohotkey
; BrokerClient.ahk - AHK v2 TCP client for message broker

class BrokerClient {
    __New(clientId, host := "localhost", port := 15234) {
        this.clientId := clientId
        this.host := host
        this.port := port
        this.socket := ""
        this.connected := false
        this.requestId := 0
    }
    
    Connect() {
        ; Create socket
        this.socket := ComObject("MSWinsock.Winsock.1")
        this.socket.RemoteHost := this.host
        this.socket.RemotePort := this.port
        
        ; Connect
        this.socket.Connect()
        
        ; Wait for connection
        timeout := A_TickCount + 5000
        while (this.socket.State != 7 && A_TickCount < timeout) {
            Sleep(100)
        }
        
        if (this.socket.State != 7) {
            return false
        }
        
        ; Send connect request
        this.requestId++
        request := '{"jsonrpc":"2.0","method":"connect","params":{"client_id":"' . this.clientId . '","client_type":"ahk","version":"2.0"},"id":' . this.requestId . '}'
        this._Send(request)
        
        this.connected := true
        return true
    }
    
    Publish(topic, payload) {
        if (!this.connected)
            return false
        
        this.requestId++
        
        ; Build JSON
        payloadJson := this._ToJson(payload)
        request := '{"jsonrpc":"2.0","method":"publish","params":{"topic":"' . topic . '","payload":' . payloadJson . '},"id":' . this.requestId . '}'
        
        return this._Send(request)
    }
    
    Subscribe(patterns) {
        if (!this.connected)
            return false
        
        this.requestId++
        
        ; Build patterns array
        patternsJson := "["
        for i, p in patterns {
            if (i > 1)
                patternsJson .= ","
            patternsJson .= '"' . p . '"'
        }
        patternsJson .= "]"
        
        request := '{"jsonrpc":"2.0","method":"subscribe","params":{"patterns":' . patternsJson . '},"id":' . this.requestId . '}'
        
        return this._Send(request)
    }
    
    _Send(data) {
        ; Length prefix (4 bytes, big-endian)
        len := StrLen(data)
        header := Chr(len >> 24 & 0xFF) . Chr(len >> 16 & 0xFF) . Chr(len >> 8 & 0xFF) . Chr(len & 0xFF)
        
        this.socket.SendData(header . data)
        return true
    }
    
    _ToJson(obj) {
        ; Simple JSON encoder for objects
        if (Type(obj) == "Map") {
            json := "{"
            first := true
            for k, v in obj {
                if (!first)
                    json .= ","
                json .= '"' . k . '":' . this._ToJson(v)
                first := false
            }
            return json . "}"
        }
        if (Type(obj) == "Array") {
            json := "["
            first := true
            for v in obj {
                if (!first)
                    json .= ","
                json .= this._ToJson(v)
                first := false
            }
            return json . "]"
        }
        if (Type(obj) == "String")
            return '"' . obj . '"'
        return String(obj)
    }
    
    Disconnect() {
        if (this.socket)
            this.socket.Close()
        this.connected := false
    }
}
```

### Option 2: Python Bridge (Recommended)

Use the `ahk_bridge.py` module to run AHK scripts from Python with broker integration.

```python
# Python side
from message_broker import BrokerClient
from message_broker.ahk_bridge import AHKBridge

async def main():
    # Create broker client
    client = BrokerClient("ahk_bridge")
    await client.connect()
    
    # Create AHK bridge
    bridge = AHKBridge(broker_client=client)
    await bridge.start()
    
    # Run an AHK script
    await bridge.run_script(
        script_path="scripts/cad_hotkeys.ahk",
        program_key="cad",
    )
    
    # The bridge will:
    # - Publish script lifecycle events
    # - Forward hotkey events to broker
    # - Listen for commands from other components
```

### Option 3: File-Based IPC

For simpler scenarios, use file-based communication:

```autohotkey
; AHK writes to file
FileAppend("JOB_ACTIVATED|12345`n", "C:\temp\broker_queue.txt")

; Python monitors file
import time
from pathlib import Path

queue_file = Path("C:/temp/broker_queue.txt")

while True:
    if queue_file.exists():
        content = queue_file.read_text()
        queue_file.write_text("")  # Clear
        
        for line in content.strip().split("\n"):
            if line:
                topic, payload = line.split("|", 1)
                await client.publish(topic, {"data": payload})
    
    time.sleep(0.1)
```

---

## Topic Patterns

### Topic Naming Convention

```
<domain>.<entity>.<action>
<domain>.<entity>.<sub-entity>.<action>
```

Examples:
- `jobs.activated`
- `jobs.12345.updated`
- `scripts.saw1.started`
- `scripts.saw1.hotkey.pressed`
- `system.broker.ready`

### Pattern Matching

| Pattern     | Matches                        | Description              |
|-------------|--------------------------------|--------------------------|
| `jobs.activated` | `jobs.activated` only       | Exact match              |
| `jobs.*`    | `jobs.activated`, `jobs.created` | Single level wildcard  |
| `jobs.+`    | `jobs.activated`, `jobs.12345` | Single level (at least one char) |
| `scripts.#` | `scripts.saw1.started`, `scripts.saw1.hotkey.pressed` | Multi-level wildcard |
| `scripts.+.started` | `scripts.saw1.started`, `scripts.cad.started` | Middle wildcard |

### Reserved Topics

| Pattern          | Purpose                          |
|------------------|----------------------------------|
| `system.*`       | Broker internal events           |
| `system.broker.*`| Broker lifecycle                 |
| `system.client.*`| Client connection events         |
| `_internal.*`    | Internal broker operations       |

---

## Common Patterns

### 1. Job Activation Flow

```python
# ds_pas (publisher)
async def activate_job(job_id: str):
    # Update local state
    self._active_job = job_id
    
    # Write to INI file for AHK
    self._write_active_job_ini(job_id)
    
    # Publish to broker
    await self._broker.publish("jobs.activated", {
        "job_id": job_id,
        "job_number": "ABC123",
        "customer": "Acme Corp",
        "timestamp": datetime.now().isoformat(),
    })


# ahk_manager (subscriber)
async def on_message(msg: Message):
    if msg.topic == "jobs.activated":
        job_id = msg.payload.get("job_id")
        self._update_ui(job_id)
```

### 2. Script Status Updates

```python
# Script runner (publisher)
async def run_script(script_id: str):
    await self._broker.publish(f"scripts.{script_id}.started", {
        "pid": process.pid,
        "timestamp": datetime.now().isoformat(),
    })
    
    await process.wait()
    
    await self._broker.publish(f"scripts.{script_id}.stopped", {
        "exit_code": process.returncode,
    })


# Status monitor (subscriber)
await client.subscribe(["scripts.+.started", "scripts.+.stopped"], handler)
```

### 3. Request/Response (RPC)

```python
# Client requesting status
response = await client.request(
    topic="scripts.status",
    payload={"script_id": "saw1"},
    timeout=5.0,
)
print(f"Script running: {response.get('running')}")


# Service handling request
async def handle_status_request(msg: Message):
    script_id = msg.payload.get("script_id")
    
    # Check status
    running = script_id in self._running_scripts
    
    # Reply (broker handles routing)
    return {"running": running, "pid": self._running_scripts.get(script_id)}
```

### 4. Broadcast with Acknowledgment

```python
# Sender
message_id = await client.publish("config.reload", {
    "config_path": "/path/to/config.json"
})

# Wait for acks
await asyncio.sleep(2)

# Check who acknowledged
acks = await client.request("_internal.message_acks", {
    "message_id": message_id
})
print(f"Acknowledged by: {acks.get('clients')}")
```

---

## Testing

### Mock Broker for Unit Tests

```python
# tests/conftest.py
import pytest
from unittest.mock import AsyncMock, MagicMock

@pytest.fixture
def mock_broker_client():
    """Create a mock broker client for testing."""
    client = MagicMock()
    client.is_connected = True
    client.connect = AsyncMock(return_value=True)
    client.disconnect = AsyncMock()
    client.publish = AsyncMock(return_value="msg-123")
    client.subscribe = AsyncMock(return_value=["jobs.*"])
    return client


# tests/test_job_controller.py
async def test_activate_job_publishes_event(mock_broker_client):
    controller = JobController(broker_client=mock_broker_client)
    
    await controller.activate_job("job-123")
    
    mock_broker_client.publish.assert_called_once_with(
        "jobs.activated",
        {"job_id": "job-123"},
    )
```

### Integration Test with Real Broker

```python
# tests/test_broker_integration.py
import pytest
import asyncio
from message_broker import MessageBroker, BrokerClient

@pytest.fixture
async def broker():
    """Start a test broker."""
    broker = MessageBroker()
    await broker.start()
    yield broker
    await broker.stop()

@pytest.fixture
async def client(broker):
    """Create connected client."""
    client = BrokerClient("test_client")
    await client.connect()
    yield client
    await client.disconnect()

async def test_publish_subscribe(client):
    received = []
    
    async def handler(msg):
        received.append(msg)
    
    await client.subscribe(["test.*"], handler)
    await client.publish("test.message", {"data": "hello"})
    
    await asyncio.sleep(0.1)  # Wait for delivery
    
    assert len(received) == 1
    assert received[0].topic == "test.message"
    assert received[0].payload["data"] == "hello"
```

---

## Troubleshooting

### Common Issues

#### 1. Connection Refused

```
ConnectionRefusedError: [WinError 10061] No connection could be made
```

**Cause**: Broker not running or wrong port.

**Solution**:
```python
# Check if broker is running
import socket
sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
result = sock.connect_ex(('localhost', 15234))
if result == 0:
    print("Broker is running")
else:
    print("Broker not available")
sock.close()
```

#### 2. Message Not Received

**Possible causes**:
1. Topic doesn't match subscription pattern
2. Message published before subscription active
3. Client disconnected

**Debug**:
```python
# Enable message logging
config = BrokerConfig(log_messages=True)

# Subscribe to all topics to debug
await client.subscribe(["#"], debug_handler)
```

#### 3. Qt Client Freezing

**Cause**: Blocking async call in main thread.

**Solution**: Use the worker thread properly:
```python
# DON'T - blocks main thread
await client.connect()  # Never use await in Qt main thread

# DO - use Qt client
self._broker = QtBrokerClient("app")
self._broker.connect_to_broker()  # Non-blocking
```

#### 4. AHK Not Receiving Messages

**Cause**: Socket not reading continuously.

**Solution**: Use a timer to poll:
```autohotkey
SetTimer(CheckMessages, 100)

CheckMessages() {
    global broker
    if (broker.socket.BytesReceived > 0) {
        data := broker.socket.GetData()
        ; Parse and handle
    }
}
```

### Debugging Tools

```python
# Print all broker activity
import logging
logging.getLogger("message_broker").setLevel(logging.DEBUG)

# Get broker status
status = await client.request("status", {})
print(f"Connected clients: {status['client_count']}")
print(f"Messages processed: {status['message_count']}")

# List subscriptions
subs = await client.request("subscriptions", {"client_id": "my_app"})
print(f"Active subscriptions: {subs['patterns']}")
```

---

## Configuration Reference

### Default Values

```python
# Network
DEFAULT_HOST = "localhost"
DEFAULT_PORT = 15234

# Timeouts
DEFAULT_HEARTBEAT_INTERVAL = 5.0  # seconds
DEFAULT_HEARTBEAT_TIMEOUT = 30.0  # seconds

# Limits
DEFAULT_MAX_MESSAGE_SIZE = 1024 * 1024  # 1 MB
DEFAULT_MAX_QUEUE_SIZE = 10000  # messages
```

### Environment Variables

```bash
# Override defaults via environment
export BROKER_HOST=localhost
export BROKER_PORT=15234
export BROKER_LOG_LEVEL=DEBUG
```

---

## See Also

- [PYSIDE6_MVC_ARCHITECTURE_GUIDE.md](./PYSIDE6_MVC_ARCHITECTURE_GUIDE.md) - Building MVC apps with PySide6
- [JSON-RPC 2.0 Specification](https://www.jsonrpc.org/specification)
- [asyncio Documentation](https://docs.python.org/3/library/asyncio.html)
