const crypto = require('crypto');

/**
 * Pure Node.js Zero-Dependency TOTP Generator (RFC 6238 / RFC 4226)
 * Compatible with Google Authenticator Base32 Secret Keys.
 */
function base32ToBuffer(base32Str) {
    const cleanStr = base32Str.replace(/=+$/, '').toUpperCase().replace(/\s+/g, '');
    const charMap = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    let bits = "";
    for (let i = 0; i < cleanStr.length; i++) {
        const val = charMap.indexOf(cleanStr.charAt(i));
        if (val === -1) continue;
        bits += val.toString(2).padStart(5, '0');
    }
    const bytes = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) {
        bytes.push(parseInt(bits.substr(i, 8), 2));
    }
    return Buffer.from(bytes);
}

function generateTOTP(secretBase32, timeStepSeconds = 30) {
    if (!secretBase32) throw new Error("Secret key is required");
    const key = base32ToBuffer(secretBase32);
    const epoch = Math.floor(Date.now() / 1000);
    const timeStep = Math.floor(epoch / timeStepSeconds);

    const buffer = Buffer.alloc(8);
    buffer.writeBigInt64BE(BigInt(timeStep), 0);

    const hmac = crypto.createHmac('sha1', key);
    hmac.update(buffer);
    const digest = hmac.digest();

    const offset = digest[digest.length - 1] & 0xf;
    const code = (
        ((digest[offset] & 0x7f) << 24) |
        ((digest[offset + 1] & 0xff) << 16) |
        ((digest[offset + 2] & 0xff) << 8) |
        (digest[offset + 3] & 0xff)
    ) % 1000000;

    return code.toString().padStart(6, '0');
}

module.exports = {
    generateTOTP
};
