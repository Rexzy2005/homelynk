# HomeLynk ESP32 Light Bulb Firmware

This firmware enables an ESP32 to work as a light bulb appliance in the HomeLynk home automation system. It implements the WebSocket-based realtime protocol for secure communication between the ESP32 and the HomeLynk server.

## Features

- Secure WebSocket connection (WSS) to HomeLynk realtime server
- Device authentication using public device ID and secret
- Command execution for turning light on/off/toggle
- Telemetry reporting (light state, WiFi signal, uptime)
- LED output representing the light bulb state
- Credential storage in ESP32 non-volatile memory
- Automatic reconnection handling
- Designed for both local development and cloud deployment

## Wokwi Simulation Setup with Cloud Deployment

The HomeLynk project has been deployed to:
- **Frontend**: https://homelynk-2026.onrender.com/
- **Realtime WebSocket Server**: wss://homelynk-2026-2.onrender.com

### 1. Create the Simulation

Go to [Wokwi ESP32 Simulator](https://wokwi.com/projects/new/esp32) and create a new project.

### 2. Add the Firmware

Replace the default `sketch.ino` with the contents of `HomeLynkLight.ino` from this directory.

### 3. Configure WiFi

In the firmware, update these values:
```cpp
const char* WIFI_SSID = "your_wifi_ssid";
const char* WIFI_PASSWORD = "your_wifi_password";
```

For Wokwi simulation, you can use the special network name `Wokwi-GUEST` which provides internet access:
```cpp
const char* WIFI_SSID = "Wokwi-GUEST";
const char* WIFI_PASSWORD = "";  // Leave empty for Wokwi-GUEST
```

### 4. Get Device Credentials from Deployed Frontend

Before flashing, you need to:
1. Visit the deployed frontend: https://homelynk-2026.onrender.com/
2. Sign up for an account (or log in if you already have one)
3. After login, you'll see the dashboard with "No ESP32 device added yet"
4. Click "Create ESP32 identity" in the pairing panel
5. Enter a device name (e.g., "Wokwi Simulation Light")
6. Copy the generated:
   - **Device ID** (format: `HLY-XXXXXXXXXXXX`)
   - **Pairing Code** (8-character hex code)
7. Claim the device via the deployed backend's `/api/devices/claim` endpoint to get the `deviceSecret`

### 5. Update Firmware with Credentials

Replace these values in the firmware:
```cpp
const char* PUBLIC_DEVICE_ID = "HLY-YOUR_DEVICE_ID_HERE";  // From dashboard
const char* DEVICE_SECRET = "YOUR_DEVICE_SECRET_FROM_CLAIM_RESPONSE";  // From claim response
```

### 6. WebSocket Server Address (Already Configured)

The firmware is already configured to use the deployed WebSocket server:
```cpp
const char* WS_SERVER = "homelynk-2026-2.onrender.com";  // Deployed WebSocket server
const uint16_t WS_PORT = 443;  // WSS uses port 443
```

### 7. LED Connection

The firmware uses GPIO2 for the light bulb output. In Wokwi:
- Connect an LED's anode (long leg) to GPIO2 through a 220-330Ω resistor
- Connect the LED's cathode (short leg) to GND
- Wokwi ESP32 has a built-in LED on GPIO2, so you can also just observe that

### 8. Start the Simulation

Click "Start Simulation" in Wokwi. You should see:
1. WiFi connection messages (using Wokwi-GUEST network for internet)
2. WSS WebSocket connection to `homelynk-2026-2.onrender.com:443`
3. Device authentication
4. Telemetry updates every 30 seconds
5. LED state changes when you control it from the dashboard at https://homelynk-2026.onrender.com/

## Manual Flashing (Physical ESP32)

If you want to flash this to a physical ESP32:

### Requirements
- Arduino IDE with ESP32 board support
- ESP32 development board
- USB cable

### Installation
1. Install ESP32 board in Arduino IDE:
   - File → Preferences
   - Add to "Additional Boards Manager URLs": `https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json`
   - Tools → Board → Boards Manager → Search for "esp32" and install

2. Install Libraries:
   - Sketch → Include Library → Manage Libraries
   - Install: "ArduinoJson" by Benoit Blanchon
   - Install: "WebSockets" by Markus Sattler

3. Upload
   - Select your ESP32 board and port
   - Update WiFi and credentials in the code (the WebSocket server is pre-configured for the deployed instance)
   - Click Upload

## Protocol Implementation Details

### WebSocket Connection Flow (WSS)

1. **Connection**: ESP32 connects to `wss://homelynk-2026-2.onrender.com:443/`
2. **Authentication**: Sends JSON with `role=device`, `deviceId`, and `secret`
3. **Subscription**: After connection ready, subscribes to device updates
4. **Command Handling**: Receives `command.execute` messages and performs actions
5. **Acknowledgement**: Sends `command.ack` with execution status
6. **Telemetry**: Periodically sends `device.telemetry` with appliance states

### Message Formats

All messages are JSON over WebSocket.

**Incoming to ESP32:**
```json
{
  "type": "command.execute",
  "requestId": "browser-uuid",
  "commandId": "database-uuid",
  "applianceId": "appliance-uuid",
  "action": "turn_on|turn_off|toggle",
  "desiredState": {
    "power": true
  }
}
```

**Outgoing from ESP32:**
```json
// Command Acknowledgement
{
  "type": "command.ack",
  "requestId": "browser-uuid",
  "commandId": "database-uuid",
  "status": "completed|failed",
  "applianceId": "appliance-uuid",
  "state": {
    "power": true
  }
}

// Telemetry Update
{
  "type": "device.telemetry",
  "payload": {
    "wifiRssi": -55,
    "uptimeMs": 123456,
    "states": [
      {
        "applianceId": "appliance-uuid",
        "state": {
          "power": true
        }
      }
    ]
  }
}
```

## Security Notes for Deployed Instance

1. **Device Secret**: The pairing code is only used once to obtain the device secret. The secret should be stored securely and never transmitted again in plaintext over insecure channels.

2. **WebSocket Security**: The deployed server already uses wss:// (WebSocket Secure) with a valid SSL certificate from Render.com, providing encrypted communication.

3. **Credential Storage**: The firmware uses ESP32 Preferences API to store credentials in NVS (Non-Volatile Storage), which retains data across power cycles.

4. **Production Considerations**: For physical deployments, consider:
   - Regular credential rotation
   - Monitoring device connection status
   - Implementing watchdog timers for recovery from network issues

## Customization

### Adding More Appliances
To control multiple appliances:
1. Modify the firmware to handle multiple GPIO pins
2. Update the telemetry to include states for each appliance
3. In `handleCommandExecute()`, check `applianceId` to determine which appliance to control

### Different Appliance Types
The current implementation assumes a simple on/off appliance (light bulb). For other types:
- **Dimmable lights**: Add brightness control using PWM
- **Fan controls**: Add speed control
- **Sensors**: Add sensor reading to telemetry state
- **Locks**: Add servo/lock mechanism control

## Troubleshooting with Cloud Deployment

### Common Issues

1. **WiFi Connection Failed**
   - Check SSID and password
   - Ensure WiFi network is accessible
   - For Wokwi: Use `Wokwi-GUEST` network (provides internet access)

2. **WSS WebSocket Connection Failed**
   - Verify you can reach `https://homelynk-2026-2.onrender.com` in a browser (should show "Cannot GET /" which is normal for WebSocket endpoint)
   - Check that WS_SERVER is set to `homelynk-2026-2.onrender.com` and WS_PORT is 443
   - Ensure network allows outbound connections to port 443 (HTTPS/WSS)
   - Some corporate/network firewalls may block non-standard ports, but 443 is usually allowed

3. **Authentication Failed**
   - Verify PUBLIC_DEVICE_ID and DEVICE_SECRET are correct
   - Ensure device was properly claimed via `https://homelynk-2026.onrender.com/api/devices/claim`
   - Device secrets are only shown once after claiming - if lost, you must recreate the device

4. **No Response to Commands**
   - Check that device is subscribed (look for "Sent device subscription" in Wokwi logs)
   - Verify applianceId in command matches what ESP32 expects (firmware uses "light-bulb-01" for simplicity)
   - Ensure command execution logic matches your hardware
   - Check WebSocket connection status (should show "Connected" and "isConnected = true")

### Debugging Tips
- Monitor Serial output in Wokwi Console for connection status and message flow
- The firmware sends detailed logs for each step: WiFi, WebSocket connect/auth, commands, telemetry
- LED state changes (GPIO2) provide immediate visual feedback of command execution
- Check the deployed frontend dashboard for device status and command history
- Render.com logs may provide additional server-side debugging information

## Verification Steps

To verify your Wokwi simulation is working correctly with the deployed HomeLynk instance:

1. **WiFi Connection**: Look for "WiFi connected!" and IP address in Wokwi logs
2. **WebSocket Connection**: Look for "[WebSocket] Connected to server" and "[WebSocket] Device connection ready"
3. **Authentication**: Look for "[WebSocket] Sent device authentication" followed by successful connection ready
4. **Subscription**: Look for "[WebSocket] Sent device subscription"
5. **Telemetry**: Look for periodic "[WebSocket] Sent telemetry update" (every 30 seconds)
6. **Command Execution**: When you toggle a light in the dashboard:
   - Look for received command in Wokwi logs: "[WebSocket] Received text: {...}"
   - Look for execution: "[WebSocket] Executing command: turn_on on appliance ..."
   - Look for state change: "[Light Bulb] State changed to: ON"
   - Look for acknowledgment: "[WebSocket] Sent command ack: completed"
   - Look for follow-up telemetry: "[WebSocket] Sent telemetry update"

If you see this flow, your Wokwi ESP32 is successfully communicating with the deployed HomeLynk system!