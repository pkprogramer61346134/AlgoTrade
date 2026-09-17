const fs = require('fs');
const path = require('path');
const { generateTOTP } = require('./totpGenerator');

const CONFIG_PATH = path.join(__dirname, 'config.js');
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');

let lastTokenGenerationAttempt = 0;

async function autoRefreshDhanToken() {
    console.log("=================================================================================");
    console.log("🔑 AUTOMATED DHAN TOTP TOKEN REFRESH SERVICE");
    console.log("=================================================================================\n");

    const timeSinceLastAttempt = Date.now() - lastTokenGenerationAttempt;
    if (timeSinceLastAttempt < 120000) {
        try {
            if (fs.existsSync(CONFIG_PATH)) {
                delete require.cache[require.resolve('./config')];
                const freshConfig = require('./config');
                if (freshConfig && freshConfig.ACCESS_TOKEN) {
                    return {
                        status: "success",
                        accessToken: freshConfig.ACCESS_TOKEN,
                        clientId: freshConfig.CLIENT_ID
                    };
                }
            }
        } catch (e) {}
        const remainingSec = Math.ceil((120000 - timeSinceLastAttempt) / 1000);
        console.warn(`⏳ [DHAN AUTH COOLDOWN] Dhan API limits token generation to once every 2 minutes. Waiting ${remainingSec}s before retrying.`);
        return { status: "cooldown", remainingSeconds: remainingSec };
    }

    lastTokenGenerationAttempt = Date.now();

    // Check credentials file
    if (!fs.existsSync(CREDENTIALS_PATH)) {
        console.error(`❌ Credentials file not found: ${CREDENTIALS_PATH}`);
        return { status: "missing_credentials" };
    }

    let creds;

    try {
        creds = JSON.parse(
            fs.readFileSync(CREDENTIALS_PATH, 'utf-8')
        );
    } catch (error) {
        console.error("❌ Failed to read credentials.json:", error.message);
        return { status: "invalid_credentials_file" };
    }

    const { dhanClientId, pin, totpSecret } = creds;

    if (!dhanClientId || !pin || !totpSecret) {
        console.error(
            "❌ credentials.json must contain dhanClientId, pin and totpSecret"
        );
        return { status: "invalid_credentials" };
    }

    if (
        totpSecret.includes("YOUR_GOOGLE_AUTHENTICATOR") ||
        totpSecret === "YOUR_TOTP_SECRET"
    ) {
        console.error("❌ TOTP Secret is not configured.");
        return { status: "unconfigured" };
    }

    // ---------------------------------------------------------
    // 1. Generate current TOTP (Avoid window boundary race condition)
    // ---------------------------------------------------------

    let epochSeconds = Math.floor(Date.now() / 1000);
    let remainingSeconds = 30 - (epochSeconds % 30);
    if (remainingSeconds < 4) {
        console.log(`⏳ Near TOTP window boundary (${remainingSeconds}s remaining). Waiting ${remainingSeconds + 1}s for fresh window...`);
        await new Promise(res => setTimeout(res, (remainingSeconds + 1) * 1000));
    }

    const liveTOTP = generateTOTP(totpSecret);

    console.log(
        `📌 Generated Live 6-Digit TOTP Code: ${liveTOTP} (Valid for ~30s)`
    );

    // Helper function for Auth API POST
    async function requestToken(totpCode) {
        const url = new URL("https://auth.dhan.co/app/generateAccessToken");
        url.searchParams.set("dhanClientId", dhanClientId);
        url.searchParams.set("pin", pin);
        url.searchParams.set("totp", totpCode);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        try {
            const response = await fetch(url.toString(), {
                method: "POST",
                headers: { "Accept": "application/json" },
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            const responseText = await response.text();
            let resData;
            try { resData = JSON.parse(responseText); } catch { resData = { raw: responseText }; }
            return { ok: response.ok, status: response.status, data: resData };
        } catch (err) {
            clearTimeout(timeoutId);
            return { ok: false, status: 500, data: { status: "error", message: err.message || "Auth network timeout" } };
        }
    }

    // ---------------------------------------------------------
    // 2. Generate Dhan Access Token (With Clock Drift Fallback)
    // ---------------------------------------------------------

    try {
        console.log(
            `📡 Requesting Dhan Access Token for Client ID ${dhanClientId}...`
        );

        let result = await requestToken(liveTOTP);

        // If Invalid TOTP returned, try clock drift offsets (-30s, +30s)
        if (result.data?.message === "Invalid TOTP" || result.data?.status === "error" && result.data?.message?.includes("TOTP")) {
            console.warn("⚠️ Initial TOTP was rejected by Dhan. Checking clock drift offsets (-30s, +30s)...");
            const prevTOTP = generateTOTP(totpSecret, 30, -30);
            const nextTOTP = generateTOTP(totpSecret, 30, 30);

            let retryResult = await requestToken(prevTOTP);
            if (retryResult.data?.accessToken) {
                result = retryResult;
            } else {
                retryResult = await requestToken(nextTOTP);
                if (retryResult.data?.accessToken) {
                    result = retryResult;
                }
            }
        }

        const resData = result.data;
        const responseOk = result.ok;
        const responseStatus = result.status;

        // ---------------------------------------------------------
        // 3. Check API response
        // ---------------------------------------------------------

        if (!responseOk) {
            console.error(
                `❌ Dhan Token Generation Failed: ${JSON.stringify(resData)}`
            );

            return {
                status: "failed",
                httpStatus: responseStatus,
                response: resData
            };
        }

        const newToken = resData?.accessToken;

        if (!newToken) {
            console.error(
                `❌ Access Token not found in response: ${JSON.stringify(resData)}`
            );

            return {
                status: "failed",
                response: resData
            };
        }

        // ---------------------------------------------------------
        // 4. Save new token into config.js
        // ---------------------------------------------------------

        const newConfigContent = `/** 
 * Dhan API Credentials Configuration
 * Auto-Updated by TOTP Token Refresh Service
 */

module.exports = {
    CLIENT_ID: "${dhanClientId}",
    ACCESS_TOKEN: "${newToken}",
    BASE_URL: "https://api.dhan.co/v2"
};
`;

        fs.writeFileSync(
            CONFIG_PATH,
            newConfigContent,
            'utf-8'
        );

        console.log("\n=================================================================================");
        console.log("✅ SUCCESS: Dhan Access Token Generated");
        console.log("=================================================================================");
        console.log(`📁 Saved to: ${CONFIG_PATH}`);

        if (resData.expiryTime) {
            console.log(`⏰ Token Expiry: ${resData.expiryTime}`);
        }

        console.log("=================================================================================\n");

        return {
            status: "success",
            accessToken: newToken,
            expiryTime: resData.expiryTime
        };

    } catch (error) {
        console.error(
            `❌ Dhan Auto-Login Exception: ${error.message}`
        );

        return {
            status: "failed",
            error: error.message
        };
    }
}

/**
 * Checks if current Dhan Access Token in config.js is valid and active.
 * If expired, missing, or forceRefresh = true, automatically generates a new token using TOTP.
 */
async function ensureValidDhanToken(forceRefresh = false) {
    let config = null;

    if (!forceRefresh) {
        try {
            if (fs.existsSync(CONFIG_PATH)) {
                delete require.cache[require.resolve('./config')];
                config = require('./config');
            }
        } catch (e) {
            console.warn(`⚠️ Could not load config.js: ${e.message}`);
        }

        if (config && config.ACCESS_TOKEN && config.CLIENT_ID) {
            try {
                const testUrl = `${config.BASE_URL || 'https://api.dhan.co/v2'}/fundlimit`;
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 5000);

                const response = await fetch(testUrl, {
                    method: 'GET',
                    headers: {
                        'access-token': config.ACCESS_TOKEN,
                        'client-id': config.CLIENT_ID,
                        'Content-Type': 'application/json'
                    },
                    signal: controller.signal
                });
                clearTimeout(timeoutId);

                if (response.ok) {
                    const data = await response.json();
                    if (data.status === 'success' || response.status === 200) {
                        console.log("✅ [DHAN AUTH] Access Token is VALID & ACTIVE. No refresh needed.");
                        return {
                            status: "valid",
                            accessToken: config.ACCESS_TOKEN,
                            clientId: config.CLIENT_ID
                        };
                    }
                } else {
                    console.warn(`⚠️ [DHAN AUTH] Token check failed with HTTP ${response.status}. Token is expired.`);
                }
            } catch (e) {
                console.warn(`⚠️ [DHAN AUTH] Error checking token online: ${e.message}`);
            }
        }
    }

    console.log("🔄 [DHAN AUTH] Token missing or expired. Automatically generating new Dhan Access Token via TOTP...");
    const refreshRes = await autoRefreshDhanToken();
    if (refreshRes.status === "success") {
        try {
            delete require.cache[require.resolve('./config')];
            const freshConfig = require('./config');
            return {
                status: "refreshed",
                accessToken: freshConfig.ACCESS_TOKEN,
                clientId: freshConfig.CLIENT_ID,
                expiryTime: refreshRes.expiryTime
            };
        } catch (e) {}
    }
    return refreshRes;
}

module.exports = {
    autoRefreshDhanToken,
    ensureValidDhanToken
};

// Run directly
if (require.main === module) {
    ensureValidDhanToken()
        .then((result) => {
            if (result.status !== "success" && result.status !== "valid" && result.status !== "refreshed") {
                process.exitCode = 1;
            }
        })
        .catch((error) => {
            console.error(error);
            process.exitCode = 1;
        });
}