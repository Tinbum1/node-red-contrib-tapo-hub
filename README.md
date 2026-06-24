# node-red-contrib-tapo-hub

Node-RED nodes for controlling TP-Link Tapo devices via H100 hub - smart switches (S220/S210), temperature/humidity sensors (T310/T315), contact sensors (T110), Motion sensors (T100) and Via KH100 Hub kasa valves (KE100).

[![npm version](https://img.shields.io/npm/v/@macdudeuk/node-red-contrib-tapo-hub.svg)](https://www.npmjs.com/package/@macdudeuk/node-red-contrib-tapo-hub)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

## Features

- 🔌 **Switch Control** - Turn S220/S210 switches on/off/toggle
- 🌡️ **Temperature Sensors** - Read T310/T315 temperature and humidity
- 🌡️ **Kasa TRV valves** - Read set and ambiant temperature
- 🏠 **Hub Config Node** - Configure credentials once, use everywhere
- 🏠 **Contact Sensors** - Read credentials
- 🏠 **Motion Sensors** - Read Credentials
- 🔄 **Device Discovery** - Automatically find all devices on your hub
- 📊 **Battery Monitoring** - Track battery levels and signal strength
- 🚀 **Efficient** - Shared hub connection with request queuing

## Architecture

Tapo S220 switches and T310 sensors and others communicate via **sub-GHz radio** (not WiFi) to the H100 or KH100 hub. These nodes connect to your hub via a local network, which then controls/reads the devices wirelessly.

```
[Node-RED] ←WiFi/LAN→ [Hub] ←sub-GHz→ [S220 / T310 etc Devices]
```

## Installation

```bash
npm install @macdudeuk/node-red-contrib-tapo-hub
```

Or install directly from the Node-RED palette manager.

## Quick Start

### 1. Create Hub Configuration

1. Add any Tapo device node (switch or sensor) to your flow
2. Double-click and create a new **Tapo Hub** config:
   - **Hub IP**: Your H100 hub IP address (e.g., `192.168.1.100`)
   - **Email**: Your Tapo account email (lowercase)
   - **Password**: Your Tapo account password

### 2. Discover Your Devices

```javascript
// Send discover command
msg.payload = "discover";
```

Copy the `device_id` from the debug output.

### 3. Configure Device Node

1. Edit the device node
2. Select your hub config
3. Paste the Device ID
4. Deploy

### 4. Control Devices

**Switches:**
```javascript
msg.payload = "on";    // Turn on
msg.payload = "off";   // Turn off
msg.payload = "toggle"; // Toggle
msg.payload = "status"; // Get status
```

**Sensors:**
```javascript
msg.payload = "read";   // Read temperature/humidity
```

## Node Types

### Tapo Hub (Config Node)

Configuration node that manages the H100 hub connection. All device nodes reference this config.

### Tapo Switch

Controls S220/S210 smart switches.

**Commands:**
- `discover` - Find all switches
- `on` / `off` / `toggle` - Control switch
- `status` - Get device info

**Response:**
```javascript
{
    success: true,
    state: "on",
    deviceId: "..."
}
```

### Tapo Sensor

Reads T310/T315 temperature and humidity sensors.

**Commands:**
- `discover` - Find all sensors
- `read` / `status` - Get readings

**Response:**
```javascript
{
    success: true,
    readings: {
        temperature: 24.5,
        humidity: 66,
        temp_unit: "celsius"
    },
    device: {
        nickname: "Boiler Room",
        status: "online",
        battery_low: false,
        signal_level: 3
    },
    timestamp: "2025-10-19T12:00:00.000Z"
}
```

## Supported Devices

| Device | Model | Type | Status |
|--------|-------|------|--------|
| Smart Switch (Dual) | S220 | Switch | ✅ Tested |
| Smart Switch (Single) | S210 | Switch | ✅ Compatible |
| Smart Button | S200 | Button | ⚠️ Untested |
| Temp/Humidity Sensor | T310 | Sensor | ✅ Tested |
| Temp/Humidity Display | T315 | Sensor | ✅ Tested |
| Contact Sensor | T110 | Sensor | ✅ Tested |
| Motion Sensor  | T100 | Sensor | ✅ Tested |
| Kasa Valves | KE100 | Sensor | ✅ Tested |
## Example Flows

### Temperature Monitoring

```
[inject: every 5 min] → [tapo-sensor: read] → [function: check temp > 30] → [alert]
```

### Scheduled Switch Control

```
[inject: daily 7am, "on"] → [tapo-switch: Kitchen Lights]
[inject: daily 11pm, "off"] → [tapo-switch: Kitchen Lights]
```

### Multi-Device Dashboard

```
[tapo-hub config: My H100]
    ├── [tapo-switch: Kitchen] → [dashboard: switch widget]
    ├── [tapo-switch: Parking] → [dashboard: switch widget]
    └── [tapo-sensor: Boiler] → [dashboard: gauge widget]
```

## Requirements

- Node.js >= 14.0.0 (18.20.x recommended)
- Node-RED >= 1.0.0
- TP-Link Tapo account
- H100 hub connected to your network
- Devices paired with H100 hub via Tapo app

## Troubleshooting

### Cannot Connect to Hub

**Check:**
- Hub IP address is correct (may change with DHCP - set static IP!)
- Hub is online and connected to network
- Email is lowercase (capital letters cause auth failures)
- Internet connection available (initial cloud auth required)

### No Devices Discovered

**Check:**
- Devices are paired with H100 in Tapo app
- Devices show as "online" in Tapo app
- Device batteries are not low
- Signal strength is adequate

### Commands Don't Work

**Check:**
- Device ID is correct
- Device is online (use discover command)
- Hub connection is active

## Technical Details

### Protocol

- Uses KLAP or Passthrough protocol (auto-detected)
- Cloud authentication for credentials
- Local hub communication for commands
- Request queuing for concurrent operation safety

### Dependencies

- `homebridge-kasa-hub` - Hub communication library

### Performance

- Device cache (5 second TTL) reduces hub queries
- Request queue serializes commands (prevents conflicts)
- Typical command response: 1-3 seconds

## Documentation

- [Quick Start Guide](QUICKSTART.md)
- [Migration Guide](MIGRATION_GUIDE.md)
- [Troubleshooting](TROUBLESHOOTING.md)
- [Deployment Guide](PRODUCTION_DEPLOYMENT.md)

## Contributing

Contributions welcome! Please:
1. Test with actual hardware
2. Follow existing code style
3. Update documentation
4. Submit clear pull requests

## Credits

- [homebridge-kasa-hub](https://github.com/zmx264/homebridge-kasa-hub) - Hub communication
- [home-assistant-tapo-p100](https://github.com/petretiandrea/home-assistant-tapo-p100) - Architecture inspiration

## License

Apache-2.0 - See [LICENSE](LICENSE) file

## Disclaimer

This is an unofficial integration. TP-Link and Tapo are trademarks of TP-Link Technologies Co., Ltd. This project is not affiliated with or endorsed by TP-Link.

The code uses reverse-engineered protocols for home automation purposes only. Use at your own risk.
