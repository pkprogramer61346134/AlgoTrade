const fs = require('fs');
const path = require('path');
const { generateTOTP } = require('./totpGenerator');

const CONFIG_PATH = path.join(__dirname, 'config.js');
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');

async function autoRefreshDhanToken() {
    console.log("=================================================================================");
    console.log("🔑 AUTOMATED DHAN TOTP TOKEN REFRESH SERVICE");
    console.log("=================================================================================\n");

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
    // 1. Generate current TOTP
    // ---------------------------------------------------------

    const liveTOTP = generateTOTP(totpSecret);

    console.log(
        `📌 Generated Live 6-Digit TOTP Code: ${liveTOTP} (Valid for ~30s)`
    );

    // ---------------------------------------------------------
    // 2. Generate Dhan Access Token
    // ---------------------------------------------------------

    try {
        console.log(
            `📡 Requesting Dhan Access Token for Client ID ${dhanClientId}...`
        );

        const url = new URL(
            "https://auth.dhan.co/app/generateAccessToken"
        );

        url.searchParams.set("dhanClientId", dhanClientId);
        url.searchParams.set("pin", pin);
        url.searchParams.set("totp", liveTOTP);

        const response = await fetch(url.toString(), {
            method: "POST",
            headers: {
                "Accept": "application/json"
            }
        });

        const responseText = await response.text();

        let resData;

        try {
            resData = JSON.parse(responseText);
        } catch {
            console.error("❌ Dhan returned non-JSON response:");
            console.error(responseText);
            return { status: "invalid_response" };
        }

        console.log(`📡 Dhan HTTP Status: ${response.status}`);

        // ---------------------------------------------------------
        // 3. Check API response
        // ---------------------------------------------------------

        if (!response.ok) {
            console.error(
                `❌ Dhan Token Generation Failed: ${JSON.stringify(resData)}`
            );

            return {
                status: "failed",
                httpStatus: response.status,
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

module.exports = {
    autoRefreshDhanToken
};

// Run directly
if (require.main === module) {
    autoRefreshDhanToken()
        .then((result) => {
            if (result.status !== "success") {
                process.exitCode = 1;
            }
        })
        .catch((error) => {
            console.error(error);
            process.exitCode = 1;
        });
}