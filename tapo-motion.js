module.exports = function(RED) {
    function TapoMotionNode(config) {
        RED.nodes.createNode(this, config);
        var node = this;
        node.hubConfig = RED.nodes.getNode(config.hub);
        node.deviceId = (config.deviceId || "").trim();
        node.deviceName = config.deviceName || config.name;
        
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
                
                // Safety fix for non-string command checks
                const payloadContent = msg.payload || {};
                const command = (payloadContent.command || msg.payload || "").toString().toLowerCase();
                const targetId = (payloadContent.deviceId || node.deviceId).trim();
                
                node.status({fill: "blue", shape: "dot", text: "processing..."});
                
                switch(command) {
                    case 'discover':
                    case 'list':
                    case 'listdevices':
                        // Fetches every child device connected to the active hub, bypassing model blocks
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
                        const devicesList = await hubConnection.getChildDevices(true);
                        
                        if (!devicesList || !Array.isArray(devicesList)) {
                            throw new Error("Received invalid device array from Tapo Hub");
                        }
                        
                        // Flexible multi-property fallback match to catch alternative ID definitions
                        const deviceData = devicesList.find(d => 
                            (d.deviceId && d.deviceId === targetId) || 
                            (d.id && d.id.toString() === targetId) ||
                            (d.device_id && d.device_id === targetId) ||
                            (d.mac && d.mac.replace(/:/g, '').toUpperCase() === targetId.toUpperCase())
                        );
                        
                        if (!deviceData) {
                            // Dump the active local map to the debug tab to help track correct values
                            node.warn({ 
                                error: "ID mismatch helper", 
                                requestedId: targetId, 
                                availableDevicesInHub: devicesList.map(d => ({ name: d.nickname, deviceId: d.deviceId, id: d.id, model: d.model }))
                            });
                            throw new Error(`Device ${targetId} not found on this hub`);
                        }
                        
                        const rawBlock = deviceData.raw || {};
                        
                        // FIX: Pull data safely from the .raw payload properties to prevent zero fallback wipes
                        const isOnline = deviceData.status === 'online' || rawBlock.status === 'online' || deviceData.status === true || false;
                        const isDetected = rawBlock.detected ?? deviceData.status?.motion_detected ?? deviceData.status?.detected ?? deviceData.motion_detected ?? deviceData.detected ?? false;
                        const rawTimestamp = deviceData.status?.motion_detected_time ?? deviceData.status?.last_detection_time ?? deviceData.motion_detected_time ?? deviceData.last_detection_time ?? null;
                        
                        const batteryPercent = rawBlock.battery_percentage ?? 100;
                        const isBatteryLow = rawBlock.at_low_battery ?? deviceData.status?.battery_low ?? false;
                        const signalStrength = rawBlock.signal_level ?? deviceData.signal_level ?? 3;
                        
                        msg.payload = {
                            success: true,
                            readings: {
                                motion_detected: isDetected,
                                last_motion_epoch: rawTimestamp,
                                last_motion_iso: rawTimestamp ? new Date(rawTimestamp).toISOString() : null,
                                battery_percentage: batteryPercent
                            },
                            device: {
                                nickname: deviceData.nickname || node.deviceName,
                                model: deviceData.model || "T100",
                                status: isOnline ? "online" : "offline",
                                battery_low: isBatteryLow,
                                signal_level: signalStrength
                            },
                            // EXPOSES: The raw unfiltered telemetry layout to the debug sidebar
                            raw_debug_data: deviceData,
                            timestamp: new Date().toISOString()
                        };
                        
                        if (isDetected) {
                            node.status({fill: "red", shape: "dot", text: "Motion Detected"});
                        } else {
                            node.status({fill: "green", shape: "dot", text: "Clear"});
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
    }
    RED.nodes.registerType("tapo-motion", TapoMotionNode);
};
