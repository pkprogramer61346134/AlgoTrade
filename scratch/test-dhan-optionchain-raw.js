const config = require('../utility/token/config');

async function rawTest() {
    // Token fresh load करो
    delete require.cache[require.resolve('../utility/token/config')];
    const fresh = require('../utility/token/config');

    const baseUrl = fresh.BASE_URL;
    const accessToken = fresh.ACCESS_TOKEN;
    const clientId = fresh.CLIENT_ID;

    console.log('BASE_URL:', baseUrl);
    console.log('Token length:', accessToken ? accessToken.length : 0);
    console.log('Client ID:', clientId);
    console.log('---');

    const response = await fetch(`${baseUrl}/optionchain`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'access-token': accessToken,
            'client-id': clientId
        },
        body: JSON.stringify({
            UnderlyingScrip: 13,
            UnderlyingSeg: 'IDX_I',
            Expiry: '2026-10-13'
        })
    });

    console.log('HTTP status:', response.status);

    const result = await response.json();

    // पूरा response print करो
    console.log('--- FULL RESPONSE ---');
    console.log(JSON.stringify(result, null, 2));

    // Selected strike 22550 का CE देखो
    const oc = result?.data?.oc || result?.oc || {};
    const strikeRow = oc['22550'];
    if (strikeRow && strikeRow.ce) {
        console.log('--- 22550 CE FULL ---');
        console.log(JSON.stringify(strikeRow.ce, null, 2));
    }
}

rawTest().catch(e => console.error('ERROR:', e.message));