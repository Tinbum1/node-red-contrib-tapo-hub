# Troubleshooting Authentication Issues

## "email or password incorrect" Error

This error comes from **line 78** of the KLAP protocol authentication in `TapoConnect.js`.

### Where the Error Occurs

```javascript
// KLAP handshake (lines 75-78 of TapoConnect.js)
const localAuthHash = sha256(concat(sha1(email), sha1(password)));
const localSeedAuthHash = sha256(concat(localSeed, remoteSeed, localAuthHash));

if (!compare(localSeedAuthHash, serverHash)) {
    throw new Error('email or password incorrect');  // ← YOUR ERROR
}
```

### Authentication Flow

1. **First attempt**: Passthrough protocol
   - Email: SHA1 hashed → base64 encoded
   - Password: base64 encoded (NOT hashed)
   
2. **Fallback**: KLAP protocol (if Passthrough fails)
   - Email: SHA1 hashed directly
   - Password: SHA1 hashed directly
   - Combined hash compared with server

### Common Causes

#### 1. Email Not Lowercase

**Problem**: Email contains uppercase letters

**Fix**: The node now automatically converts email to lowercase

**Manual check**:
```javascript
// In Node-RED debug console, you'll see:
Email lowercase: false  // ← PROBLEM!
```

#### 2. Whitespace in Credentials

**Problem**: Email or password has leading/trailing spaces

**Fix**: The node now automatically trims credentials

**Manual check**:
```javascript
Email has whitespace: true  // ← PROBLEM!
```

#### 3. Wrong Hub IP

**Problem**: IP address is incorrect or hub is unreachable

**Test**:
```bash
# From your Node-RED machine:
ping 192.168.1.100  # Replace with your hub IP

# Or test HTTP connection:
curl http://192.168.1.100/app
```

#### 4. Wrong Tapo Account

**Problem**: Using wrong Tapo account credentials

**Fix**: Verify credentials in Tapo mobile app:
1. Open Tapo app
2. Go to Settings → Account
3. Check the email address
4. Try logging out and back in with those credentials

#### 5. Hub Firmware/Protocol Mismatch

**Problem**: Hub running very old or very new firmware

**Check**: The node tries both protocols (Passthrough → KLAP)

If both fail, you'll see this in logs.

## Debugging Steps

### Step 1: Enable Debug Logging

After the latest update, the node logs detailed debug info:

```
Connecting to hub 192.168.1.100
Email length: 20
Email lowercase: true
Password length: 12
Email has whitespace: false
```

### Step 2: Check Node-RED Logs

Watch the Node-RED console for errors:

```bash
node-red
```

Look for:
```
Failed to connect to H100 hub: email or password incorrect
Hub IP: 192.168.1.100
Please verify:
1. Email is all lowercase
2. No whitespace in email/password
3. Hub IP is correct and reachable
4. Credentials work in Tapo app
```

### Step 3: Verify Hub Connectivity

```bash
# Test network connection
ping YOUR_HUB_IP

# Test HTTP connection
curl -v http://YOUR_HUB_IP/app/handshake1
```

Expected: Connection should succeed (even if response is gibberish)

### Step 4: Test Credentials in Tapo App

1. Log out of Tapo app
2. Log back in with exact credentials
3. If login fails → credentials are wrong
4. If login works → issue is with hub communication

### Step 5: Check for Special Characters

Some special characters in passwords might cause encoding issues:

**Problematic characters**:
- Quotes: `"` `'`
- Backslash: `\`
- Non-ASCII: `é` `ñ` etc.

**Try**: Change password to simple alphanumeric temporarily

### Step 6: Network Issues

Hub must be:
- On same network as Node-RED
- Not isolated by VLAN/firewall
- Accessible via local IP

**Test VLAN isolation**:
```bash
# From Node-RED machine
nc -zv YOUR_HUB_IP 80
```

## Advanced Debugging

### Check Protocol Support

The hub supports two protocols:

1. **Passthrough** (older)
   - Endpoint: `/app`
   - Uses RSA + AES encryption

2. **KLAP** (newer)
   - Endpoint: `/app/handshake1`
   - Uses symmetric encryption

**Test which protocol hub supports**:

```bash
# Test Passthrough
curl -X POST http://YOUR_HUB_IP/app \
  -H "Content-Type: application/json" \
  -d '{"method":"handshake"}'

# Test KLAP
curl -X POST http://YOUR_HUB_IP/app/handshake1 \
  -H "Content-Type: application/json"
```

If you get 404 on handshake1, hub only supports Passthrough.

### Credential Encoding Test

Add temporary logging to see how credentials are encoded:

In `tapo-hub-connect.js` line 26, add:
```javascript
this.log.info('Email: ' + this.email);  // REMOVE AFTER TESTING!
this.log.info('Pass length: ' + this.password.length);
```

⚠️ **REMOVE these logs after testing** - don't log credentials!

## Solutions

### Solution 1: Force Lowercase Email

Already implemented! Email is automatically converted to lowercase.

### Solution 2: Manual Credential Entry

Try entering credentials in Node-RED manually (not copy-paste):
- Type email character by character
- Type password character by character
- Avoid copy-paste (might include hidden characters)

### Solution 3: Create New Tapo Account

If nothing works:
1. Create a new Tapo account (different email)
2. Add your hub to the new account
3. Try with new credentials

### Solution 4: Hub Reset

Last resort:
1. Reset H100 hub to factory settings
2. Re-add to Tapo app
3. Re-pair S220 switches
4. Try again with Node-RED

## Still Not Working?

### Collect Debug Info

1. Node-RED logs (with debug output)
2. Hub IP address
3. Hub firmware version (from Tapo app)
4. Hub model (H100 vs H200)
5. Does Tapo app work?
6. Can you ping the hub?

### Test with homebridge-kasa-hub Directly

Try the underlying library directly to isolate the issue:

```javascript
// test-hub.js
const { TapoConnect } = require('homebridge-kasa-hub/dist/TapoConnect');

const logger = {
    info: console.log,
    debug: console.log,
    error: console.error,
    warn: console.warn
};

async function test() {
    const tapo = new TapoConnect(logger, 'your@email.com', 'yourpassword', '192.168.1.100');
    try {
        await tapo.login();
        console.log('SUCCESS!');
        const devices = await tapo.get_child_device_list(0);
        console.log('Devices:', devices);
    } catch (error) {
        console.error('FAILED:', error.message);
    }
}

test();
```

Run:
```bash
cd /Users/andy/cursor/node
node test-hub.js
```

If this fails the same way, the issue is with the library/hub, not our Node-RED node.

## Known Issues

### Issue: H200 Hub

Some H200 hubs use different protocol. If you have H200, report this!

### Issue: Very New Firmware

If hub just updated firmware, protocol might have changed.

**Check**: Tapo app settings → Hub → Firmware version

### Issue: Cloud-Only Mode

Some hub modes require internet. Ensure hub has internet access for initial authentication.

## Summary Checklist

- [ ] Email is all lowercase
- [ ] No spaces in email/password  
- [ ] Hub IP is correct
- [ ] Can ping hub from Node-RED machine
- [ ] Credentials work in Tapo app
- [ ] Hub has internet access
- [ ] Hub is online in Tapo app
- [ ] No firewall blocking port 80
- [ ] Password has no special characters (test with simple password)
- [ ] Hub firmware is up to date

If all checked and still failing, create an issue with debug logs!





