const fetch = require('node-fetch');

console.log(`[KeepAlive] Script started at ${new Date().toISOString()}`);

setInterval(() => {
  console.log(`[KeepAlive] Sending ping at ${new Date().toISOString()}...`);

  fetch('https://your-render-url.onrender.com/api/health')
    .then(res => res.json())
    .then(data => {
      console.log(`[KeepAlive] Response received:`);
      console.log(`  Status: ${data.status}`);
      console.log(`  Timestamp: ${data.timestamp}`);
      console.log(`  Endpoints: ${data.endpoints.length} available`);
    })
    .catch(err => {
      console.error('[KeepAlive] Error during ping:', err.message);
    });
}, 5 * 60 * 1000); // every 5 minutes