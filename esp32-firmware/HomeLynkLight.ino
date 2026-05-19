/*
 * HomeLynk ESP32 Light Bulb Firmware for Wokwi Simulation
 *
 * This firmware implements the HomeLynk realtime protocol to:
 * 1. Connect to the HomeLynk WebSocket server
 * 2. Authenticate using device ID and secret
 * 3. Subscribe to device commands
 * 4. Control a simulated LED (representing a light bulb)
 * 5. Send telemetry updates
 *
 * For Wokwi simulation: Connect an LED to GPIO2 (built-in LED on many ESP32 boards)
*/

#include <WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>
#include <Preferences.h>

// ======================
// USER CONFIGURATION
// ======================

// WiFi credentials - UPDATE THESE FOR YOUR NETWORK
const char* WIFI_SSID = "your_wifi_ssid";
const char* WIFI_PASSWORD = "your_wifi_password";

// HomeLynk Server Configuration
const char* WS_SERVER = "homelynk-2026-2.onrender.com";  // Deployed WebSocket server
const uint16_t WS_PORT = 443;  // WSS uses port 443

// Device credentials - GET THESE FROM THE DASHBOARD AFTER CREATING DEVICE
const char* PUBLIC_DEVICE_ID = "HLY-XXXXXXXXXXXX";  // Replace with actual device ID
const char* DEVICE_SECRET = "your_device_secret_here";  // Replace with actual secret from /api/devices/claim

// Light bulb configuration
const int LIGHT_BULB_PIN = 2;  // GPIO2 (built-in LED on many ESP32 dev boards)
const bool LIGHT_BULB_STATE_ON = HIGH;  // Most LEDs: HIGH = ON
const bool LIGHT_BULB_STATE_OFF = LOW;  // Most LEDs: LOW = OFF

// ======================
// GLOBAL OBJECTS
// ======================

WebSocketsClient webSocket;
Preferences preferences;

// State tracking
bool isConnected = false;
bool lightState = false;
unsigned long lastTelemetrySend = 0;
const unsigned long TELEMETRY_INTERVAL = 30000;  // 30 seconds

// ======================
// SETUP & LOOP
// ======================

void setup() {
  Serial.begin(115200);

  // Initialize light bulb pin
  pinMode(LIGHT_BULB_PIN, OUTPUT);
  digitalWrite(LIGHT_BULB_PIN, LIGHT_BULB_STATE_OFF);

  // Initialize preferences for storing credentials
  preferences.begin("homelynk", false);

  // Attempt to load saved credentials
  loadCredentials();

  // Connect to WiFi
  connectToWiFi();

  // Setup WebSocket
  setupWebSocket();
}

void loop() {
  webSocket.loop();

  // Send telemetry periodically
  if (isConnected && (millis() - lastTelemetrySend > TELEMETRY_INTERVAL)) {
    sendTelemetry();
    lastTelemetrySend = millis();
  }
}

// ======================
// WIFI FUNCTIONS
// ======================

void connectToWiFi() {
  Serial.print("Connecting to WiFi: ");
  Serial.println(WIFI_SSID);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long startAttemptTime = millis();

  // Wait for connection with timeout
  while (WiFi.status() != WL_CONNECTED && millis() - startAttemptTime < 15000) {
    delay(500);
    Serial.print(".");
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi connected!");
    Serial.print("IP address: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\nWiFi connection failed!");
  }
}

// ======================
// WEBSOCKET FUNCTIONS
// ======================

void setupWebSocket() {
  // WebSocket events
  webSocket.onEvent(webSocketEvent);

  // Connect to server
  String wsUrl = String(WS_SERVER) + ":" + String(WS_PORT);
  Serial.print("Connecting to WebSocket server: ");
  Serial.println(wsUrl);

  webSocket.begin(WS_SERVER, WS_PORT, "/");
}

// Handle WebSocket events
void webSocketEvent(WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {
    case WStype_DISCONNECTED:
      Serial.println("[WebSocket] Disconnected!");
      isConnected = false;
      // Try to reconnect after delay
      delay(3000);
      setupWebSocket();
      break;

    case WStype_CONNECTED:
      Serial.println("[WebSocket] Connected to server");
      isConnected = true;

      // Authenticate as device
      authenticateDevice();
      break;

    case WStype_TEXT:
      Serial.printf("[WebSocket] Received text: %s\n", payload);
      handleWebSocketMessage(payload, length);
      break;

    case WStype_BIN:
      Serial.printf("[WebSocket] Received binary of length: %u\n", length);
      break;

    case WStype_ERROR:
    case WStype_FRAGMENT_TEXT_START:
    case WStype_FRAGMENT_BIN_START:
    case WStype_FRAGMENT:
    case WStype_FRAGMENT_FIN:
      break;
  }
}

// Authenticate device with server
void authenticateDevice() {
  if (!isConnected) return;

  JsonDocument authDoc;
  authDoc["role"] = "device";
  authDoc["deviceId"] = PUBLIC_DEVICE_ID;
  authDoc["secret"] = DEVICE_SECRET;

  String authMessage;
  serializeJson(authDoc, authMessage);

  webSocket.sendTXT(authMessage);
  Serial.println("[WebSocket] Sent device authentication");
}

// Handle incoming WebSocket messages
void handleWebSocketMessage(uint8_t* payload, size_t length) {
  JsonDocument doc;
  DeserializationError error = deserializeJson(doc, payload, length);

  if (error) {
    Serial.printf("[WebSocket] JSON deserialization failed: %s\n", error.c_str());
    return;
  }

  const char* messageType = doc["type"];

  if (strcmp(messageType, "command.execute") == 0) {
    handleCommandExecute(doc);
  } else if (strcmp(messageType, "connection.ready") == 0) {
    handleConnectionReady(doc);
  }
}

// Handle connection ready message
void handleConnectionReady(JsonDocument& doc) {
  const char* role = doc["role"];
  if (strcmp(role, "device") == 0) {
    Serial.println("[WebSocket] Device connection ready");

    // Subscribe to device updates
    subscribeToDevice();
  }
}

// Subscribe to device for receiving commands
void subscribeToDevice() {
  if (!isConnected) return;

  JsonDocument subDoc;
  subDoc["type"] = "device.subscribe";

  JsonObject payload = subDoc.createNestedObject("payload");
  payload["deviceId"] = PUBLIC_DEVICE_ID;

  String subMessage;
  serializeJson(subDoc, subMessage);

  webSocket.sendTXT(subMessage);
  Serial.println("[WebSocket] Sent device subscription");
}

// Handle execute command from server
void handleCommandExecute(JsonDocument& doc) {
  const char* requestId = doc["requestId"];
  const char* commandId = doc["commandId"];
  const char* applianceId = doc["applianceId"];
  const char* action = doc["action"];
  JsonVariant desiredState = doc["desiredState"];

  Serial.printf("[WebSocket] Executing command: %s on appliance %s\n", action, applianceId);

  // For our simple light bulb, we control based on action
  // In a real implementation, you'd match applianceId to specific hardware
  bool newState = false;

  if (strcmp(action, "turn_on") == 0) {
    newState = true;
  } else if (strcmp(action, "turn_off") == 0) {
    newState = false;
  } else if (strcmp(action, "toggle") == 0) {
    newState = !lightState;
  }

  // Update light state if changed
  if (newState != lightState) {
    lightState = newState;
    digitalWrite(LIGHT_BULB_PIN, lightState ? LIGHT_BULB_STATE_ON : LIGHT_BULB_STATE_OFF);
    Serial.print("[Light Bulb] State changed to: ");
    Serial.println(lightState ? "ON" : "OFF");
  }

  // Send acknowledgment
  sendCommandAck(requestId, commandId, applianceId, "completed");
}

// Send command acknowledgment to server
void sendCommandAck(const char* requestId, const char* commandId,
                   const char* applianceId, const char* status) {
  if (!isConnected) return;

  JsonDocument ackDoc;
  ackDoc["type"] = "command.ack";
  ackDoc["requestId"] = requestId;
  ackDoc["commandId"] = commandId;
  ackDoc["status"] = status;

  JsonObject payload = ackDoc.createNestedObject("payload");

  JsonObject stateObj = payload.createNestedObject("state");
  stateObj["power"] = lightState;

  ackDoc["applianceId"] = applianceId;

  String ackMessage;
  serializeJson(ackDoc, ackMessage);

  webSocket.sendTXT(ackMessage);
  Serial.printf("[WebSocket] Sent command ack: %s\n", status);
}

// Send telemetry update to server
void sendTelemetry() {
  if (!isConnected) return;

  JsonDocument telemetryDoc;
  telemetryDoc["type"] = "device.telemetry";

  JsonObject payload = telemetryDoc.createNestedObject("payload");

  // WiFi signal strength (simulated)
  payload["wifiRssi"] = WiFi.RSSI();

  // Uptime
  payload["uptimeMs"] = millis();

  // Appliance states
  JsonArray states = payload.createNestedArray("states");

  JsonObject lightStateObj = states.createNestedObject();
  lightStateObj["applianceId"] = "light-bulb-01";  // In real implementation, use actual appliance ID

  JsonObject stateObj = lightStateObj.createNestedObject("state");
  stateObj["power"] = lightState;

  String telemetryMessage;
  serializeJson(telemetryDoc, telemetryMessage);

  webSocket.sendTXT(telemetryMessage);
  Serial.println("[WebSocket] Sent telemetry update");
}

// ======================
// CREDENTIAL MANAGEMENT
// ======================

void loadCredentials() {
  // Try to load credentials from preferences
  if (preferences.isKey("deviceId")) {
    String storedId = preferences.getString("deviceId", "");
    if (storedId.length() > 0) {
      strcpy((char*)PUBLIC_DEVICE_ID, storedId.c_str());
      Serial.println("[Credentials] Loaded device ID from storage");
    }
  }

  if (preferences.isKey("deviceSecret")) {
    String storedSecret = preferences.getString("deviceSecret", "");
    if (storedSecret.length() > 0) {
      strcpy((char*)DEVICE_SECRET, storedSecret.c_str());
      Serial.println("[Credentials] Loaded device secret from storage");
    }
  }
}

void saveCredentials(const char* deviceId, const char* deviceSecret) {
  preferences.putString("deviceId", deviceId);
  preferences.putString("deviceSecret", deviceSecret);
  Serial.println("[Credentials] Saved credentials to storage");
}

// ======================
// HELPER FUNCTIONS
// ======================

// Blink pattern for status indication
void statusBlink(int count, int delayMs) {
  for (int i = 0; i < count; i++) {
    digitalWrite(LIGHT_BULB_PIN, LIGHT_BULB_STATE_ON);
    delay(delayMs);
    digitalWrite(LIGHT_BULB_PIN, LIGHT_BULB_STATE_OFF);
    if (i < count - 1) delay(delayMs);
  }
}