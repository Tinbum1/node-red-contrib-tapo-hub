/**
 * Tapo Hub Configuration Node
 * Manages connection to H100 hub and provides shared access to child devices
 * Used by tapo-switch and tapo-sensor nodes
 */

const { TapoHubConnect } = require('./tapo-hub-connect');

module.exports = function(RED) {
    function TapoHubNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        
        // Configuration - sanitize credentials
        node.email = node.credentials.email ? node.credentials.email.trim().toLowerCase() : '';
        node.password = node.credentials.password ? node.credentials.password.trim() : '';
        node.hubIp = config.hubIp ? config.hubIp.trim() : '';
        node.hubName = config.name || 'H100 Hub';
        
        // Hub connection (shared by all device nodes)
        node.hubConnection = null;
        node.isConnected = false;
        node.connectPromise = null; // Track ongoing connection attempt
        
        // Logger for hub connection
        const logger = {
            info: () => {}, // Silent
            debug: () => {}, // Silent
            error: (msg) => node.error(msg),
            warn: (msg) => node.warn(msg)
        };
        
        /**
         * Initialize connection to H100 hub
         * Returns existing connection if already connected
         */
        node.connect = async function() {
            // If already connected, return existing connection
            if (node.isConnected && node.hubConnection) {
                return node.hubConnection;
            }
            
            // If connection is in progress, wait for it
            if (node.connectPromise) {
                return node.connectPromise;
            }
            
            // Start new connection
            node.connectPromise = (async () => {
                try {
                    if (!node.email || !node.password) {
                        throw new Error("Email and password required");
                    }
                    
                    if (!node.hubIp) {
                    throw new Error("H100 Hub IP address is required");
                }
                
                // Create hub connection
                    node.hubConnection = new TapoHubConnect(logger, node.email, node.password, node.hubIp);
                await node.hubConnection.connect();
                
                node.isConnected = true;
                return node.hubConnection;
                    
                } catch (error) {
                    node.error(`Failed to connect to hub: ${error.message}`);
                    node.isConnected = false;
                    node.hubConnection = null;
                    throw error;
                } finally {
                    node.connectPromise = null;
                }
            })();
            
            return node.connectPromise;
        };
        
        /**
         * Get hub connection (connects if needed)
         */
        node.getConnection = async function() {
            if (!node.isConnected || !node.hubConnection) {
                await node.connect();
            }
            return node.hubConnection;
        };
        
        /**
         * Force a reconnection on next getConnection() call.
         * Used by device nodes when they detect a stale session.
         */
        node.reconnect = function() {
            node.isConnected = false;
            node.hubConnection = null;
            node.connectPromise = null;
        };

        /**
         * Disconnect from hub
         */
        node.disconnect = function() {
            node.isConnected = false;
            node.hubConnection = null;
            node.connectPromise = null;
        };
        
        // Clean up on node close
        node.on('close', function(done) {
            node.disconnect();
            done();
        });
    }
    
    // Register config node with credentials
    RED.nodes.registerType("tapo-hub", TapoHubNode, {
        credentials: {
            email: { type: "text" },
            password: { type: "password" }
        }
    });
}

