# HomeLynk End-to-End Wokwi Test Guide

This guide tests the full software path:

```txt
Dashboard -> WebSocket server -> ESP32 simulator -> Relay output -> ESP32 ack/telemetry -> Dashboard
```

The dashboard must start empty for new users. Devices and relay channels appear only after you add an ESP32 from the dashboard.

## 1. Project Setup

Install dependencies once:

```bash
npm install
```

Create `apps/web/.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_WS_URL=ws://localhost:4000
```

Create `apps/realtime/.env`:

```bash
DATABASE_URL=postgresql://postgres.YOUR_PROJECT:PASSWORD@aws-0-REGION.pooler.supabase.com:6543/postgres
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY
WS_PORT=4000
```

Run `supabase/schema.sql` in the Supabase SQL editor before testing. If you already ran an older schema, run the latest file again because the current system depends on:

- `ensure_home_bootstrap()` creating only profile and home records.
- `create_home_device(device_name text)` creating ESP32 records only when the user clicks Add ESP32.
- The device claim flow storing a hashed device secret.

Start both apps:

```bash
npm run dev
```

In a second terminal:

```bash
npm run dev:realtime
```

Open the dashboard:

```txt
http://localhost:3000/dashboard
```

## 2. Create a Test Account and Add an ESP32

1. Sign up or sign in.
2. Open the dashboard.
3. Confirm the device list is empty.
4. Click Add ESP32.
5. Copy the generated `Device ID` and `Pairing Code`.

The `Device ID` is the public identifier compiled into the ESP32 firmware. The `Pairing Code` is used only once to claim the device and get the private `deviceSecret`.

## 3. Get the Two Bulb Appliance IDs

Adding an ESP32 creates four relay-channel placeholders. For this Wokwi test, use Relay Channel 1 and Relay Channel 2.

Run this in Supabase SQL editor and replace the device ID:

```sql
select
  a.id,
  a.name,
  a.state,
  d.public_device_id
from public.appliances a
join public.devices d on d.id = a.device_id
where d.public_device_id = 'HLY-YOUR-DEVICE-ID'
order by a.sort_order;
```

Copy the `id` values for:

- Relay Channel 1 -> `BULB_1_APPLIANCE_ID`
- Relay Channel 2 -> `BULB_2_APPLIANCE_ID`

## 4. Expose Local Servers for Wokwi

Wokwi cannot call your computer's `localhost`. Use a deployed environment or tunnel both services.

For local testing with tunnels, expose:

- Web app/claim API on port `3000`.
- Realtime WebSocket server on port `4000`.

Your firmware needs:

```txt
CLAIM_URL=https://YOUR-WEB-TUNNEL/api/devices/claim
WS_HOST=YOUR-REALTIME-TUNNEL-HOST
WS_PORT=443
WS_USE_SSL=true
```

For production-style testing, deploy the web app and realtime server, then set:

```txt
NEXT_PUBLIC_WS_URL=wss://YOUR-REALTIME-DOMAIN
CLAIM_URL=https://YOUR-WEB-DOMAIN/api/devices/claim
WS_HOST=YOUR-REALTIME-DOMAIN
WS_PORT=443
WS_USE_SSL=true
```

## 5. Wokwi Files

Create a new Wokwi ESP32 Arduino project. Add these files.

### libraries.txt

```txt
ArduinoJson
WebSockets
```

### diagram.json

This simulates two bulbs with LEDs on GPIO 26 and GPIO 27. For real hardware, replace the LEDs with relay module inputs and drive the appliances through the relay contacts.

```json
{
  "version": 1,
  "author": "HomeLynk",
  "editor": "wokwi",
  "parts": [
    { "type": "wokwi-esp32-devkit-v1", "id": "esp", "top": 0, "left": 0, "attrs": {} },
    { "type": "wokwi-led", "id": "bulb1", "top": -42, "left": 240, "attrs": { "color": "yellow", "label": "Bulb 1" } },
    { "type": "wokwi-led", "id": "bulb2", "top": 42, "left": 240, "attrs": { "color": "orange", "label": "Bulb 2" } },
    { "type": "wokwi-resistor", "id": "r1", "top": -24, "left": 160, "attrs": { "value": "220" } },
    { "type": "wokwi-resistor", "id": "r2", "top": 60, "left": 160, "attrs": { "value": "220" } }
  ],
  "connections": [
    [ "esp:TX0", "$serialMonitor:RX", "", [] ],
    [ "esp:RX0", "$serialMonitor:TX", "", [] ],
    [ "esp:D26", "r1:1", "green", [] ],
    [ "r1:2", "bulb1:A", "green", [] ],
    [ "bulb1:C", "esp:GND.1", "black", [] ],
    [ "esp:D27", "r2:1", "blue", [] ],
    [ "r2:2", "bulb2:A", "blue", [] ],
    [ "bulb2:C", "esp:GND.2", "black", [] ]
  ],
  "dependencies": {}
}
```

### sketch.ino

Replace the values in the configuration block before running.

```cpp
#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <WebSocketsClient.h>
#include <WiFi.h>

const char* WIFI_SSID = "Wokwi-GUEST";
const char* WIFI_PASSWORD = "";

const char* PUBLIC_DEVICE_ID = "HLY-REPLACE-ME";
const char* PAIRING_CODE = "REPLACE-ME";

const char* BULB_1_APPLIANCE_ID = "00000000-0000-0000-0000-000000000000";
const char* BULB_2_APPLIANCE_ID = "00000000-0000-0000-0000-000000000000";

const char* CLAIM_URL = "https://YOUR-WEB-DOMAIN/api/devices/claim";
const char* WS_HOST = "YOUR-REALTIME-DOMAIN";
const uint16_t WS_PORT = 443;
const bool WS_USE_SSL = true;

const char* FIRMWARE_VERSION = "wokwi-two-bulb-1.0.0";

// Leave empty for the first run so the sketch claims the device and prints the secret.
// After the first successful claim, paste the printed secret here for repeatable tests.
String deviceSecret = "";

const int BULB_1_PIN = 26;
const int BULB_2_PIN = 27;
const int RELAY_ON_LEVEL = HIGH;
const int RELAY_OFF_LEVEL = LOW;

WebSocketsClient webSocket;

bool bulb1Power = false;
bool bulb2Power = false;
unsigned long lastTelemetryAt = 0;

void setBulb(int channel, bool power) {
  if (channel == 1) {
    bulb1Power = power;
    digitalWrite(BULB_1_PIN, power ? RELAY_ON_LEVEL : RELAY_OFF_LEVEL);
  }

  if (channel == 2) {
    bulb2Power = power;
    digitalWrite(BULB_2_PIN, power ? RELAY_ON_LEVEL : RELAY_OFF_LEVEL);
  }
}

int channelForAppliance(const String& applianceId) {
  if (applianceId == BULB_1_APPLIANCE_ID) return 1;
  if (applianceId == BULB_2_APPLIANCE_ID) return 2;
  return 0;
}

void connectWifi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(300);
    Serial.print(".");
  }

  Serial.println();
  Serial.print("WiFi connected. IP: ");
  Serial.println(WiFi.localIP());
}

bool claimDevice() {
  if (deviceSecret.length() > 0) return true;

  HTTPClient http;
  http.begin(CLAIM_URL);
  http.addHeader("Content-Type", "application/json");

  StaticJsonDocument<384> requestDoc;
  requestDoc["publicDeviceId"] = PUBLIC_DEVICE_ID;
  requestDoc["pairingCode"] = PAIRING_CODE;
  requestDoc["firmwareVersion"] = FIRMWARE_VERSION;

  String requestBody;
  serializeJson(requestDoc, requestBody);

  Serial.println("Claiming device...");
  int statusCode = http.POST(requestBody);
  String response = http.getString();
  http.end();

  Serial.print("Claim status: ");
  Serial.println(statusCode);
  Serial.println(response);

  if (statusCode != 200) {
    Serial.println("Claim failed. If the status is 409, the device was already claimed. Paste the saved deviceSecret into the sketch.");
    return false;
  }

  StaticJsonDocument<768> responseDoc;
  DeserializationError error = deserializeJson(responseDoc, response);
  if (error) {
    Serial.print("Claim JSON parse failed: ");
    Serial.println(error.c_str());
    return false;
  }

  deviceSecret = responseDoc["deviceSecret"].as<String>();
  if (deviceSecret.length() == 0) {
    Serial.println("Claim response did not include deviceSecret.");
    return false;
  }

  Serial.println("Device claimed. Save this secret for future Wokwi runs:");
  Serial.println(deviceSecret);
  return true;
}

void sendCommandAck(
  const String& commandId,
  const String& requestId,
  const String& status,
  const String& applianceId,
  bool includeState,
  bool power,
  const String& errorMessage = ""
) {
  StaticJsonDocument<512> ack;
  ack["type"] = "command.ack";
  ack["commandId"] = commandId;
  ack["requestId"] = requestId;
  ack["status"] = status;

  if (applianceId.length() > 0) {
    ack["applianceId"] = applianceId;
  }

  if (includeState) {
    JsonObject state = ack.createNestedObject("state");
    state["power"] = power;
  }

  if (errorMessage.length() > 0) {
    ack["error"] = errorMessage;
  }

  String output;
  serializeJson(ack, output);
  webSocket.sendTXT(output);
  Serial.print("ACK -> ");
  Serial.println(output);
}

void sendTelemetry() {
  if (!webSocket.isConnected()) return;

  StaticJsonDocument<768> doc;
  doc["type"] = "device.telemetry";
  JsonObject payload = doc.createNestedObject("payload");
  payload["wifiRssi"] = WiFi.RSSI();
  payload["uptimeMs"] = millis();

  JsonArray states = payload.createNestedArray("states");

  JsonObject bulb1 = states.createNestedObject();
  bulb1["applianceId"] = BULB_1_APPLIANCE_ID;
  JsonObject bulb1State = bulb1.createNestedObject("state");
  bulb1State["power"] = bulb1Power;

  JsonObject bulb2 = states.createNestedObject();
  bulb2["applianceId"] = BULB_2_APPLIANCE_ID;
  JsonObject bulb2State = bulb2.createNestedObject("state");
  bulb2State["power"] = bulb2Power;

  String output;
  serializeJson(doc, output);
  webSocket.sendTXT(output);
  Serial.print("Telemetry -> ");
  Serial.println(output);
}

void handleCommand(JsonDocument& doc) {
  String commandId = doc["commandId"] | "";
  String requestId = doc["requestId"] | "";
  String applianceId = doc["applianceId"] | "";
  String action = doc["action"] | "";

  int channel = channelForAppliance(applianceId);
  if (channel == 0) {
    sendCommandAck(commandId, requestId, "failed", applianceId, false, false, "Unknown applianceId for this firmware.");
    return;
  }

  JsonVariant powerValue = doc["desiredState"]["power"];
  bool nextPower = action == "turn_on";
  if (!powerValue.isNull()) {
    nextPower = powerValue.as<bool>();
  }
  if (action == "turn_off") {
    nextPower = false;
  }

  setBulb(channel, nextPower);
  sendCommandAck(commandId, requestId, "completed", applianceId, true, nextPower);
  sendTelemetry();
}

void handleWebSocketText(uint8_t* payload, size_t length) {
  StaticJsonDocument<1024> doc;
  DeserializationError error = deserializeJson(doc, payload, length);
  if (error) {
    Serial.print("WebSocket JSON parse failed: ");
    Serial.println(error.c_str());
    return;
  }

  String type = doc["type"] | "";
  Serial.print("WS <- ");
  serializeJson(doc, Serial);
  Serial.println();

  if (type == "connection.ready") {
    sendTelemetry();
    return;
  }

  if (type == "command.execute") {
    handleCommand(doc);
    return;
  }

  if (type == "error") {
    Serial.print("Server error: ");
    Serial.println(doc["error"].as<const char*>());
  }
}

void webSocketEvent(WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {
    case WStype_DISCONNECTED:
      Serial.println("WebSocket disconnected");
      break;

    case WStype_CONNECTED:
      Serial.println("WebSocket connected");
      break;

    case WStype_TEXT:
      handleWebSocketText(payload, length);
      break;

    case WStype_ERROR:
      Serial.println("WebSocket error");
      break;

    default:
      break;
  }
}

void connectRealtime() {
  String path = String("/?role=device&deviceId=") + PUBLIC_DEVICE_ID + "&secret=" + deviceSecret;

  Serial.print("Connecting realtime socket to ");
  Serial.print(WS_HOST);
  Serial.println(path);

  if (WS_USE_SSL) {
    webSocket.beginSSL(WS_HOST, WS_PORT, path);
  } else {
    webSocket.begin(WS_HOST, WS_PORT, path);
  }

  webSocket.onEvent(webSocketEvent);
  webSocket.setReconnectInterval(3000);
  webSocket.enableHeartbeat(15000, 3000, 2);
}

void setup() {
  Serial.begin(115200);
  pinMode(BULB_1_PIN, OUTPUT);
  pinMode(BULB_2_PIN, OUTPUT);
  setBulb(1, false);
  setBulb(2, false);

  connectWifi();

  if (!claimDevice()) {
    Serial.println("Stopping because device provisioning failed.");
    return;
  }

  connectRealtime();
}

void loop() {
  webSocket.loop();

  if (millis() - lastTelemetryAt > 10000) {
    lastTelemetryAt = millis();
    sendTelemetry();
  }
}
```

## 6. Run the End-to-End Test

1. Update `PUBLIC_DEVICE_ID`, `PAIRING_CODE`, `BULB_1_APPLIANCE_ID`, `BULB_2_APPLIANCE_ID`, `CLAIM_URL`, and realtime host settings in `sketch.ino`.
2. Start the Wokwi simulation.
3. Watch the serial monitor.
4. On first successful claim, copy the printed `deviceSecret` and paste it into `deviceSecret` in the sketch for future runs.
5. Keep Wokwi running and return to the HomeLynk dashboard.
6. Confirm the selected ESP32 shows online.
7. Toggle Relay Channel 1. Bulb 1 should switch.
8. Toggle Relay Channel 2. Bulb 2 should switch.
9. Confirm the dashboard receives completed command status and telemetry updates.

## 7. Quick Claim Test Without Wokwi

You can verify the claim endpoint before running Wokwi:

```bash
curl -X POST http://localhost:3000/api/devices/claim \
  -H "Content-Type: application/json" \
  -d '{
    "publicDeviceId": "HLY-YOUR-DEVICE-ID",
    "pairingCode": "YOUR-PAIRING-CODE",
    "firmwareVersion": "manual-test"
  }'
```

Expected response:

```json
{
  "deviceId": "HLY-YOUR-DEVICE-ID",
  "deviceSecret": "hly_SECRET_VALUE",
  "websocketUrl": "ws://localhost:4000"
}
```

The claim endpoint returns the `deviceSecret` only once. If you lose it during testing, create a new ESP32 from the dashboard or reset that device's secret in the database.

## 8. Troubleshooting

If Wokwi cannot claim the device:

- Confirm Wokwi is using a public HTTPS URL, not `localhost`.
- Confirm `SUPABASE_SERVICE_ROLE_KEY` is set in `apps/web/.env.local`.
- Confirm the pairing code has not already been used.
- Status `404` means the device ID or pairing code is wrong.
- Status `409` means the device was already claimed.

If the dashboard shows the ESP32 offline:

- Confirm `npm run dev:realtime` is running.
- Confirm `WS_HOST`, `WS_PORT`, and `WS_USE_SSL` match your realtime endpoint.
- Confirm the ESP32 is using the saved `deviceSecret`, not the pairing code.
- Confirm the realtime server has `DATABASE_URL`, `SUPABASE_URL`, and `SUPABASE_PUBLISHABLE_KEY`.

If commands time out:

- Confirm `BULB_1_APPLIANCE_ID` and `BULB_2_APPLIANCE_ID` are real UUIDs from the same device.
- Keep the Wokwi simulation tab running while testing.
- Check the serial monitor for `command.execute` messages.
- Confirm the ESP32 sends `command.ack` with the same `commandId`.

If the bulbs do not switch:

- Confirm the diagram uses GPIO 26 and GPIO 27.
- Confirm Relay Channel 1 maps to `BULB_1_APPLIANCE_ID`.
- Confirm Relay Channel 2 maps to `BULB_2_APPLIANCE_ID`.
- For real relay modules, adjust `RELAY_ON_LEVEL` and `RELAY_OFF_LEVEL` if the module is active-low.

## 9. Professional Hardware Flow

For a production install, the dashboard should remain the source of truth:

1. User creates account.
2. Dashboard starts with an empty device list.
3. Installer clicks Add ESP32.
4. Installer flashes/provisions ESP32 with the dashboard `Device ID`.
5. ESP32 exchanges the one-time `Pairing Code` for a private `deviceSecret`.
6. ESP32 stores the secret in non-volatile storage.
7. Dashboard sends commands through the realtime server.
8. ESP32 responds with `command.ack` and periodic `device.telemetry`.

Do not hardcode a shared secret across all devices. Every ESP32 should have its own `deviceSecret`, and that secret should never be displayed again after provisioning.
