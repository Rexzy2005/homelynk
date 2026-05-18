# HomeLynk Realtime Protocol

The dashboard and ESP32 connect to the realtime server over WebSocket.

## User socket

```txt
ws://localhost:4000?role=user&token=<supabase-access-token>
```

The server validates the token with Supabase Auth, then checks device ownership in Postgres before forwarding commands.

Subscribe to a device:

```json
{
  "type": "device.subscribe",
  "payload": {
    "deviceId": "HLY-123456789ABC"
  }
}
```

Create a command:

```json
{
  "type": "command.create",
  "requestId": "browser-generated-id",
  "payload": {
    "deviceId": "HLY-123456789ABC",
    "applianceId": "uuid",
    "action": "turn_on",
    "desiredState": {
      "power": true
    }
  }
}
```

## ESP32 provisioning

The ESP32 claims its identity once using the device ID and pairing code shown in the dashboard.

```http
POST /api/devices/claim
Content-Type: application/json

{
  "publicDeviceId": "HLY-123456789ABC",
  "pairingCode": "A1B2C3D4",
  "firmwareVersion": "1.0.0"
}
```

The response includes the `deviceSecret` once. Store it in ESP32 non-volatile storage.

## ESP32 socket

```txt
ws://localhost:4000?role=device&deviceId=<public-device-id>&secret=<device-secret>
```

The server hashes the secret and compares it to `devices.device_secret_hash`.

Command sent to ESP32:

```json
{
  "type": "command.execute",
  "requestId": "browser-generated-id",
  "commandId": "uuid",
  "applianceId": "uuid",
  "action": "turn_on",
  "desiredState": {
    "power": true
  }
}
```

Command acknowledgement from ESP32:

```json
{
  "type": "command.ack",
  "commandId": "uuid",
  "status": "completed",
  "applianceId": "uuid",
  "state": {
    "power": true
  }
}
```

Telemetry from ESP32:

```json
{
  "type": "device.telemetry",
  "payload": {
    "wifiRssi": -55,
    "uptimeMs": 91822,
    "states": [
      {
        "applianceId": "uuid",
        "state": {
          "power": true
        }
      }
    ]
  }
}
```
