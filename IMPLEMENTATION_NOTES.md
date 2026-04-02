# Implementation Notes - Hub-Based S220 Control

## Critical Correction

**Initial Mistake:** The first implementation incorrectly tried to connect directly to S220 switches using IP addresses.

**Reality:** S220 switches communicate via **sub-GHz radio** to the H100 hub. They have NO IP addresses and cannot be directly accessed.

## Correct Architecture

```
┌─────────────┐        WiFi/LAN        ┌──────────┐      sub-GHz      ┌──────────┐
│  Node-RED   │ ◄──────────────────► │ H100 Hub │ ◄───────────────► │ S220 SW  │
│             │    (IP: 192.168.x.x)  │          │    (No IP)        │          │
└─────────────┘                       └──────────┘                   └──────────┘
```

### Communication Flow

1. **Node-RED** → **H100 Hub** (via WiFi/LAN)
   - Uses TapoConnect class
   - KLAP or Passthrough protocol
   - Hub has IP address

2. **H100 Hub** → **S220 Switch** (via sub-GHz radio)
   - Proprietary TP-Link sub-GHz protocol
   - No IP addressing
   - Hub translates commands

## Implementation Details

### Library Used

**homebridge-kasa-hub** (v0.10.0)
- Provides `TapoConnect` class for hub communication
- Supports `get_child_device_list()` for discovery
- Supports `control_child()` for device control
- Handles both KLAP and Passthrough protocols

### Custom Wrapper

**tapo-hub-connect.js**
- Wraps homebridge-kasa-hub's TapoConnect
- Provides simplified API for Node-RED
- Handles device caching
- Implements switch-specific methods

### Key Methods

```javascript
// Connect to hub
await hubConnection.connect();

// Discover child devices
const devices = await hubConnection.getChildDevices();

// Control switch
await hubConnection.turnOn(deviceId);
await hubConnection.turnOff(deviceId);

// Get status
const info = await hubConnection.getDeviceInfo(deviceId);
```

### Control Child Device Protocol

Commands are sent using this structure:

```javascript
{
    method: 'control_child',
    params: {
        device_id: 'device-id-here',
        requestData: {
            method: 'multipleRequest',
            params: {
                requests: [
                    {
                        method: 'set_device_info',
                        params: { device_on: true }
                    }
                ]
            }
        }
    }
}
```

## Device Discovery

S220 switches are identified by:
- `model`: Contains "S220", "S210", or "S200"
- `category`: Typically "subg.trigger.switch" or similar
- `status`: Should be "online"
- `device_id`: Unique identifier for control

Example device object:
```javascript
{
    device_id: "abc123...",
    nickname: "Kitchen Switch", // base64 decoded
    model: "S220",
    category: "subg.trigger.switch",
    status: "online",
    device_on: false,
    at_low_battery: false,
    signal_level: 3,
    rssi: -45
}
```

## Differences from Home Assistant Integration

| Aspect | HA Integration | Our Implementation |
|--------|---------------|-------------------|
| Language | Python | JavaScript/Node.js |
| Library | plugp100 (Python) | homebridge-kasa-hub (Node.js) |
| Hub Support | ✅ Full | ✅ Full |
| S220 Direct | ❌ (correctly) | ❌ (correctly) |
| Device Discovery | Via cloud + local | Via hub connection |
| Control Method | control_child | control_child |

## What We Learned

1. **S220 is NOT a WiFi device** - It's a sub-GHz device
2. **Hub is the gateway** - All commands go through H100
3. **Device ID is key** - Not IP address
4. **homebridge-kasa-hub works** - Proper implementation exists
5. **Protocol is complex** - KLAP + sub-GHz translation

## Testing Checklist

To test this implementation, you need:

- [ ] H100 hub powered on and connected to network
- [ ] H100 hub IP address known
- [ ] S220 switches paired with H100 in Tapo app
- [ ] S220 switches showing as "online" in Tapo app
- [ ] S220 switches have fresh batteries
- [ ] Tapo account credentials (lowercase email)
- [ ] Node-RED installed and running
- [ ] Node installed to Node-RED

### Test Sequence

1. **Discovery Test**
   - Send "discover" command
   - Verify S220 switches appear in list
   - Verify device_id is present

2. **Control Test**
   - Send "on" command with device_id
   - Physical switch should turn ON
   - Verify in Tapo app

3. **Status Test**
   - Send "status" command
   - Verify current state matches reality

4. **Toggle Test**
   - Send "toggle" command multiple times
   - Verify state changes each time

## Common Issues and Solutions

### Issue: "No switches discovered"

**Cause**: S220 not paired with hub, or offline

**Solution**:
1. Open Tapo app
2. Check S220 shows as "online"
3. If offline, replace batteries
4. Re-pair with hub if needed

### Issue: "Commands not working"

**Cause**: Wrong device_id or device offline

**Solution**:
1. Run discovery again to get fresh device list
2. Verify device_id is correct
3. Check device status in Tapo app

### Issue: "Hub not responding"

**Cause**: Hub IP incorrect or hub offline

**Solution**:
1. Verify hub IP with router
2. Ping hub IP from Node-RED machine
3. Check hub power and network connection

## Files Modified/Created

### New Files
- `tapo-hub-connect.js` - Hub communication wrapper

### Modified Files
- `tapo-s220.js` - Changed from direct device to hub-based control
- `tapo-s220.html` - Changed "Device IP" to "Hub IP" and "Device ID"
- `package.json` - Changed dependency to homebridge-kasa-hub
- `README.md` - Completely rewritten for hub architecture
- `QUICKSTART.md` - Updated for hub configuration

### Dependencies Changed
- **Removed**: `tp-link-tapo-connect` (doesn't support hubs)
- **Added**: `homebridge-kasa-hub` (supports H100 and child devices)

## Future Enhancements

- [ ] Support for S210 switches (should work already)
- [ ] Support for S200B buttons
- [ ] Battery level monitoring
- [ ] Signal strength alerts
- [ ] Multiple hub support
- [ ] Automatic hub discovery
- [ ] Config node for shared credentials

## Credits

- **homebridge-kasa-hub** by zmx264 - Core hub communication
- **Home Assistant Tapo** by petretiandrea - Architecture inspiration
- **TP-Link** - Original hardware and protocols (reverse-engineered)






