/**
 * Tapo Water Node (T300)
 * Controls Tapo smart water sensor via H100 hub
 * Uses tapo-hub config node for shared hub connection
 */

module.exports = function(RED) {
    function TapoWaterSensorNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        
        // Get hub configuration
        node.hubConfig = RED.nodes.getNode(config.hub);
        node.deviceId = (config.deviceId || "").trim();
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
                
                const payloadContent = (msg.payload && typeof msg.payload === 'object') ? msg.payload : {};
                const command = (payloadContent.command || (typeof msg.payload === 'string' ? msg.payload : "")).toString().toLowerCase();
                const targetId = (payloadContent.deviceId || node.deviceId || "").toString().trim();
                
                node.status({fill: "blue", shape: "dot", text: "processing..."});
                
                switch(command) {
                    case 'discover':
                    case 'list':
                    case 'listdevices':
                        const allDevices = await hubConnection.getChildDevices(true);
        
                        msg.payload = {
                            success: true,
                            command: 'discover',
                            devices: allDevices,
                            totalDevices: allDevices?.length || 0
                        };
                        node.status({fill: "green", shape: "dot", text: "ready"});
                        break;

                    default:
                        // Force a targeted state refresh for just this device ID if the underlying library supports it
                        if (typeof hubConnection.getDeviceState === 'function') {
                            await hubConnection.getDeviceState(targetId).catch(() => {});
                        } else if (typeof hubConnection.refreshChildDevice === 'function') {
                            await hubConnection.refreshChildDevice(targetId).catch(() => {});
                        } else if (typeof hubConnection.refreshDevices === 'function') {
                            await hubConnection.refreshDevices().catch(() => {});
                        }

                        // Fetch child devices bypassing the standard array cache
                        const devicesList = await hubConnection.getChildDevices(true);
                        
                        if (!devicesList || !Array.isArray(devicesList)) {
                            throw new Error("Received invalid device array from Tapo Hub");
                        }
                        
                        const deviceData = devicesList.find(d => 
                            (d.deviceId && d.deviceId === targetId) || 
                            (d.id && d.id.toString() === targetId) ||
                            (d.device_id && d.device_id === targetId) ||
                            (d.mac && d.mac.replace(/:/g, '').toUpperCase() === targetId.toUpperCase()) ||
                            (d.raw && d.raw.device_id === targetId)
                        );
                        
                        if (!deviceData) {
                            node.warn({ 
                                error: "ID mismatch helper", 
                                requestedId: targetId, 
                                availableDevicesInHub: devicesList.map(d => ({ name: d.nickname || d.name, deviceId: d.device_id || d.deviceId }))
                            });
                            throw new Error(`Device ${targetId} not found on this hub`);
                        }
                        
                        // Extract metrics out of the core data blocks
                        const rawBlock = deviceData.raw || {};
                        const isOnline = deviceData.status === 'online' || rawBlock.status === 'online';
                        
                        // Check leak indicators inside the data payload
                        const leakStatus = (rawBlock.water_leak_status || "normal").toLowerCase();
                        const isInAlarm = rawBlock.in_alarm === true;
                        const isLeaking = leakStatus !== "normal" || isInAlarm;
                        
                        const batteryPercent = rawBlock.battery_percentage ?? deviceData.battery_percentage ?? 100;
                        const isBatteryLow = rawBlock.at_low_battery ?? deviceData.at_low_battery ?? false;
                        const signalStrength = rawBlock.signal_level ?? deviceData.signal_level ?? 3;
                        
                        const readableName = deviceData.nickname || node.deviceName;
                        
                        msg.payload = {
                            success: true,
                            waterLeak: isLeaking,
                            status: isLeaking ? "leak" : "normal",
                            battery: batteryPercent,
                            device: {
                                nickname: readableName,
                                model: deviceData.model || rawBlock.model || "T300",
                                status: isOnline ? "online" : "offline",
                                battery_low: isBatteryLow,
                                signal_level: signalStrength,
                                rssi: rawBlock.rssi || deviceData.rssi || null
                            },
                            raw_debug_data: deviceData,
                            timestamp: new Date().toISOString()
                        };
                        
                        if (isLeaking) {
                            node.status({fill: "red", shape: "dot", text: `LEAK DETECTED (${leakStatus})`});
                        } else {
                            node.status({fill: "green", shape: "dot", text: "Dry"});
                        }
                        break;
                }
                
                send(msg);
                done();
                
            } catch (error) {
                node.status({fill: "red", shape: "ring", text: "error"});
                done(error);
            }
        });
        
        node.on('close', function(done) {
            node.status({fill: "grey", shape: "ring", text: "disconnected"});
            done();
        });
    }
    
    RED.nodes.registerType("tapo-water", TapoWaterSensorNode);
};
