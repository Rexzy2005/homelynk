# HomeLynk Realtime Protocol

The dashboard and ESP32 connect to the realtime server over WebSocket.

## Provisioning model

New accounts start with a profile and home only. The dashboard should show an empty device list until the user or installer adds an ESP32.

Adding an ESP32 creates a pending device record and four default relay-channel placeholders:

```txt
User -> Home -> ESP32 Device -> Relay Channel Appliances
```

The dashboard shows:

- `publicDeviceId`: stable public device identifier to compile/provision into the ESP32.
- `pairingCode`: one-time setup code used only to claim the device.

The ESP32 exchanges `publicDeviceId + pairingCode` once for a long-lived `deviceSecret`. Store the `deviceSecret` in ESP32 non-volatile storage and do not expose it in the dashboard.

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

The ESP32 claims its identity once using the device ID and pairing code shown in the dashboard after the installer clicks Add ESP32.

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
