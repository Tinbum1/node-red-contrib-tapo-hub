/**
 * Tapo Hub Connection Handler
 * Based on homebridge-kasa-hub implementation
 * Connects to H100 hub and controls child devices like S220 switches
 */

const { TapoConnect } = require('homebridge-kasa-hub/dist/TapoConnect');

class TapoHubConnect {
    constructor(log, email, password, hubIp) {
        this.log = log;
        this.email = email;
        this.password = password;
        this.hubIp = hubIp;
        this.tapoConnect = null;
        this.childDevicesCache = null;
        this.lastUpdate = null;
        this.CACHE_SECONDS = 5;
        
        // Request queue to serialize all hub communications
        // Prevents concurrent requests from interfering with each other
        this.requestQueue = Promise.resolve();
        
        this.MAX_RETRIES = 1;
    }
    
    /**
     * Check if an error indicates a stale/broken encryption session
     * that can be recovered by reconnecting.
     */
    _isSessionError(error) {
        const msg = error && error.message ? error.message : '';
        return msg.includes('bad decrypt') ||
               msg.includes('wrong final block length') ||
               msg.includes('Invalid key length') ||
               msg.includes('KLAP') ||
               msg.includes('handshake');
    }

    /**
     * Reset the connection so the next request will re-establish it.
     */
    _resetConnection() {
        this.tapoConnect = null;
        this.childDevicesCache = null;
        this.lastUpdate = null;
    }
    
    /**
     * Queue a request to ensure serial execution
     * All hub communications must go through this queue
     */
    async _queueRequest(fn) {
        // Chain the new request to the queue
        const previousRequest = this.requestQueue;
        
        // Create a promise for this request
        let resolveRequest;
        const currentRequest = new Promise((resolve) => {
            resolveRequest = resolve;
        });
        
        // Update queue to point to current request.
        // Always resolve (never reject) the queue promise so that
        // subsequent queued requests are not blocked by earlier failures
        // and no unhandled rejection can occur.
        this.requestQueue = currentRequest;
        
        // Wait for previous request to complete, then execute this one
        await previousRequest;
        
        // Execute the actual request
        try {
            const result = await fn();
            return result;
        } finally {
            resolveRequest();
        }
    }

    /**
     * Connect to the H100 hub
     */
    async connect() {
        try {
            this.tapoConnect = new TapoConnect(this.log, this.email, this.password, this.hubIp);
            await this.tapoConnect.login();
            return true;
        } catch (error) {
            this.log.error('Failed to connect to H100 hub: ' + error.message);
            throw error;
        }
    }

    /**
     * Get list of all child devices connected to the hub
     */
    async getChildDevices(forceRefresh = false) {
        const now = Date.now();
        
        // Return cache if valid (don't queue cached reads)
        if (!forceRefresh && this.childDevicesCache && this.lastUpdate) {
            if ((now - this.lastUpdate) / 1000 < this.CACHE_SECONDS) {
                return this.childDevicesCache;
            }
        }

        // Queue the actual hub request
        return this._queueRequest(async () => {
            let lastError;
            
            for (let attempt = 0; attempt <= this.MAX_RETRIES; attempt++) {
                try {
                    if (!this.tapoConnect) {
                        await this.connect();
                    }

                    const allDevices = [];
                    let startIndex = 0;
                    let totalDevices = null;

                    do {
                        const result = await this.tapoConnect.get_child_device_list(startIndex);
                        
                        if (totalDevices === null && result.sum) {
                            totalDevices = result.sum;
                        }

                        if (result.child_device_list) {
                            for (const device of result.child_device_list) {
                                const parsedDevice = {
                                    device_id: device.device_id,
                                    category: device.category,
                                    type: device.type,
                                    model: device.model,
                                    hw_ver: device.hw_ver,
                                    fw_ver: device.fw_ver,
                                    nickname: device.nickname ? Buffer.from(device.nickname, 'base64').toString() : 'Unknown',
                                    status: device.status,
                                    device_on: device.device_on,
                                    at_low_battery: device.at_low_battery,
                                    rssi: device.rssi,
                                    signal_level: device.signal_level,
                                    raw: device
                                };
                                
                                allDevices.push(parsedDevice);
                            }
                        }

                        startIndex += 10;
                    } while (startIndex < (totalDevices || 0));

                    this.childDevicesCache = allDevices;
                    this.lastUpdate = now;
                    return allDevices;
                    
                } catch (error) {
                    lastError = error;
                    
                    if (this._isSessionError(error) && attempt < this.MAX_RETRIES) {
                        this.log.warn(`Session error getting child devices, reconnecting (attempt ${attempt + 1}): ${error.message}`);
                        this._resetConnection();
                        continue;
                    }
                    
                    this.log.error('Failed to get child devices: ' + error.message);
                }
            }
            
            throw lastError;
        });
    }

    /**
     * Control a child device (e.g., turn on/off a switch)
     */
    async controlChildDevice(deviceId, method, params = {}) {
        return this._queueRequest(async () => {
            let lastError;
            
            for (let attempt = 0; attempt <= this.MAX_RETRIES; attempt++) {
                try {
                    if (!this.tapoConnect) {
                        await this.connect();
                    }

                    const request = {
                        method: 'control_child',
                        params: {
                            device_id: deviceId,
                            requestData: {
                                method: 'multipleRequest',
                                params: {
                                    requests: [
                                        {
                                            method: method,
                                            params: params
                                        }
                                    ]
                                }
                            }
                        }
                    };

                    return await this.tapoConnect.send(request);
                } catch (error) {
                    lastError = error;
                    
                    if (this._isSessionError(error) && attempt < this.MAX_RETRIES) {
                        this.log.warn(`Session error controlling device ${deviceId}, reconnecting (attempt ${attempt + 1}): ${error.message}`);
                        this._resetConnection();
                        continue;
                    }
                    
                    this.log.error(`Failed to control device ${deviceId}: ${error.message}`);
                }
            }
            
            throw lastError;
        });
    }

    /**
     * Turn on a switch device
     */
    async turnOn(deviceId) {
        return await this.controlChildDevice(deviceId, 'set_device_info', {
            device_on: true
        });
    }

    /**
     * Turn off a switch device
     */
    async turnOff(deviceId) {
        return await this.controlChildDevice(deviceId, 'set_device_info', {
            device_on: false
        });
    }

    /**
     * Get device info
     */
    async getDeviceInfo(deviceId) {
        return await this.controlChildDevice(deviceId, 'get_device_info', {});
    }

    /**
     * Find devices by model (e.g., "S220", "S210")
     */
    async findDevicesByModel(model) {
        const devices = await this.getChildDevices();
        return devices.filter(d => d.model && d.model.toUpperCase().includes(model.toUpperCase()));
    }

    /**
     * Find devices by category
     */
    async findDevicesByCategory(category) {
        const devices = await this.getChildDevices();
        return devices.filter(d => d.category && d.category.includes(category));
    }

    /**
     * Find switch devices (S220, S210, etc.)
     */
    async findSwitches() {
        const devices = await this.getChildDevices();
        // Look for devices that are switches
        // Common categories might be: subg.trigger.switch, subg.plug.switch, etc.
        return devices.filter(d => 
            (d.model && (d.model.includes('S220') || d.model.includes('S210') || d.model.includes('S200'))) ||
            (d.category && d.category.includes('switch'))
        );
    }
}

module.exports = { TapoHubConnect };

