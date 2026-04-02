/**
 * Tapo Switch Node (S220, S210, S200)
 * Controls Tapo smart switches via H100 hub
 * Uses tapo-hub config node for shared hub connection
 */

module.exports = function(RED) {
    function TapoSwitchNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        
        // Get hub configuration
        node.hubConfig = RED.nodes.getNode(config.hub);
        node.deviceId = config.deviceId;
        node.deviceName = config.deviceName || config.name;
        
        // Validation
        if (!node.hubConfig) {
            node.status({fill: "red", shape: "ring", text: "no hub config"});
            node.error("No hub configuration selected. Please configure a tapo-hub first.");
            return;
        }
        
        if (!node.deviceId) {
            node.status({fill: "grey", shape: "ring", text: "no device ID"});
        } else {
            node.status({fill: "yellow", shape: "ring", text: "ready"});
        }
        
        // Handle incoming messages
        node.on('input', async function(msg, send, done) {
            // Compatibility: send/done were added in Node-RED 1.0
            send = send || function() { node.send.apply(node, arguments); };
            done = done || function(err) { if (err) node.error(err, msg); };
            
            try {
                const hubConnection = await node.hubConfig.getConnection();
                
                if (!hubConnection) {
                    msg.payload = { success: false, error: 'Not connected to H100 hub' };
                    send(msg);
                    done();
                    return;
                }
                
                const command = (msg.payload.command || msg.payload).toString().toLowerCase();
                const deviceId = msg.payload.deviceId || node.deviceId;
                
                node.status({fill: "blue", shape: "dot", text: "processing..."});
                
                switch(command) {
                    case 'discover':
                    case 'list':
                    case 'listdevices':
                        const allDevices = await hubConnection.getChildDevices(true);
                        const switches = allDevices.filter(d => 
                            d.model && (d.model.includes('S220') || d.model.includes('S210') || d.model.includes('S200'))
                        );
                        
                        msg.payload = {
                            success: true,
                            command: 'discover',
                            switches: switches,
                            allDevices: allDevices,
                            totalDevices: allDevices.length
                        };
                        break;
                        
                    case 'on':
                    case 'turnon':
                    case 'turn_on':
                        if (!deviceId) {
                            msg.payload = { success: false, error: 'Device ID required. Use "discover" command first.' };
                            break;
                        }
                        await hubConnection.turnOn(deviceId);
                        msg.payload = { 
                            success: true, 
                            state: 'on', 
                            command: 'turnOn',
                            deviceId: deviceId 
                        };
                        break;
                        
                    case 'off':
                    case 'turnoff':
                    case 'turn_off':
                        if (!deviceId) {
                            msg.payload = { success: false, error: 'Device ID required. Use "discover" command first.' };
                            break;
                        }
                        await hubConnection.turnOff(deviceId);
                        msg.payload = { 
                            success: true, 
                            state: 'off', 
                            command: 'turnOff',
                            deviceId: deviceId 
                        };
                        break;
                        
                    case 'toggle':
                        if (!deviceId) {
                            msg.payload = { success: false, error: 'Device ID required. Use "discover" command first.' };
                            break;
                        }
                        const devices = await hubConnection.getChildDevices();
                        const device = devices.find(d => d.device_id === deviceId);
                        
                        if (!device) {
                            msg.payload = { success: false, error: `Device ${deviceId} not found` };
                            break;
                        }
                        
                        if (device.device_on) {
                            await hubConnection.turnOff(deviceId);
                            msg.payload = { success: true, state: 'off', command: 'toggle', deviceId: deviceId };
                        } else {
                            await hubConnection.turnOn(deviceId);
                            msg.payload = { success: true, state: 'on', command: 'toggle', deviceId: deviceId };
                        }
                        break;
                        
                    case 'status':
                    case 'getinfo':
                    case 'get_info':
                        if (!deviceId) {
                            msg.payload = { success: false, error: 'Device ID required. Use "discover" command first.' };
                            break;
                        }
                        
                        const allDevicesForInfo = await hubConnection.getChildDevices();
                        const deviceInfo = allDevicesForInfo.find(d => d.device_id === deviceId);
                        
                        if (!deviceInfo) {
                            msg.payload = { success: false, error: `Device ${deviceId} not found` };
                            break;
                        }
                        
                        msg.payload = {
                            success: true,
                            command: 'getInfo',
                            deviceInfo: deviceInfo
                        };
                        break;
                        
                    default:
                        msg.payload = {
                            success: false,
                            error: `Unknown command: ${command}`,
                            availableCommands: ['on', 'off', 'toggle', 'status', 'discover']
                        };
                }
                
                node.status({fill: "green", shape: "dot", text: deviceId ? "connected" : "ready"});
                send(msg);
                done();
                
            } catch (error) {
                node.hubConfig.reconnect();
                msg.payload = {
                    success: false,
                    error: error.message
                };
                node.status({fill: "red", shape: "ring", text: "error"});
                send(msg);
                done(error);
            }
        });
        
        // Clean up on node close
        node.on('close', function(done) {
            node.status({fill: "grey", shape: "ring", text: "disconnected"});
            done();
        });
    }
    
    // Register node (no credentials - they're in the config node)
    RED.nodes.registerType("tapo-switch", TapoSwitchNode);
}

