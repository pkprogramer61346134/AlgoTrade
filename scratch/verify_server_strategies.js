const http = require('http');

http.get('http://localhost:3000/api/strategies', (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
        console.log("Raw API Response:", data);
        const json = JSON.parse(data);
        console.log("✅ API Object keys:", Object.keys(json));
    });
}).on('error', (err) => {
    console.error("❌ Error fetching strategies:", err.message);
});
