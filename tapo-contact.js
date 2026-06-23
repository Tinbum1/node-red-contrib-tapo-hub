module.exports = function(RED) {
    function TapoContactNode(config) {
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
                
                const payload = msg.payload;
                const targetId = (payload.deviceId || node.deviceId).trim();
                let command = "";
                
                if (typeof payload === 'string') {
                    command = payload.toLowerCase();
                } else if (payload && typeof payload === 'object' && payload.command) {
                    command = payload.command.toLowerCase();
                }
                
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
                        const devicesList = await hubConnection.getChildDevices(true);
                        const deviceData = devicesList.find(d => 
                            (d.device_id && d.device_id === targetId) ||
                            (d.deviceId && d.deviceId === targetId) || 
                            (d.id && d.id.toString() === targetId) ||
                            (d.mac && d.mac.replace(/:/g, '').toUpperCase() === targetId.toUpperCase())
                        );
                        
                        if (!deviceData) {
                            throw new Error(`Device ${targetId} not found on this hub`);
                        }
                        
                        const rawBlock = deviceData.raw || {};
                        
                        // Fallback tree to try multiple common Tapo contact sensor parameter naming conventions
                        const isOpen = rawBlock.is_open ?? 
                                       rawBlock.open ?? 
                                       rawBlock.contact_open ?? 
                                       (rawBlock.contact_state === 'open') ?? 
                                       deviceData.open ?? 
                                       false;

                        const batteryPercent = rawBlock.battery_percentage ?? 100;
                        const isBatteryLow = rawBlock.at_low_battery ?? deviceData.at_low_battery ?? false;
                        const signalStrength = rawBlock.signal_level ?? deviceData.signal_level ?? 3;
                        const isOnline = deviceData.status === 'online' || rawBlock.status === 'online' || true;

                        msg.payload = {
                            success: true,
                            readings: {
                                open: isOpen,
                                battery_percentage: batteryPercent
                            },
                            device: {
                                nickname: deviceData.nickname || node.deviceName,
                                model: deviceData.model || "T110",
                                status: isOnline ? "online" : "offline",
                                battery_low: isBatteryLow,
                                signal_level: signalStrength
                            },
                            // DEBUG LINE: Pass the raw unmapped layout structure to your debug window
                            raw_debug_data: deviceData, 
                            timestamp: new Date().toISOString()
                        };
                        
                        node.status({
                            fill: isOpen ? "goldenrod" : "green", 
                            shape: "dot", 
                            text: isOpen ? "OPEN" : "CLOSED"
                        });
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
    RED.nodes.registerType("tapo-contact", TapoContactNode);
};
