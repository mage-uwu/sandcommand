/*
 * SandCommand's service worker: online only, on purpose.
 *
 * It exists so the game can be installed (added to the home screen and run
 * full screen), not to work offline. It never caches anything: every
 * request goes straight to the network with the HTTP cache bypassed, so an
 * installed copy always runs the build that's live right now. Any caches
 * left from anything older are deleted. Offline, the page says so (and
 * retries) instead of showing a stale game that couldn't connect anyway.
 */
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

const OFFLINE = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#141012"><title>SandCommand</title>
<style>html,body{margin:0;height:100%;background:#141012;color:#9fe89f;font:15px ui-monospace,Menlo,Consolas,monospace;display:grid;place-items:center;text-align:center}
h1{color:#ffd34a;letter-spacing:.2em;font-size:22px}button{margin-top:14px;background:#1f2a1f;color:#e8ffe8;border:1px solid #4a7a4a;padding:10px 22px;font:inherit;cursor:pointer}</style></head>
<body><div><h1>SANDCOMMAND</h1><p>&gt; NO CONNECTION_</p><p>The battle is online only.<br>Reconnect and try again.</p>
<button onclick="location.reload()">RETRY</button></div>
<script>addEventListener('online',()=>location.reload())</script></body></html>`;

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // (the network handles it as usual)
  event.respondWith(
    (async () => {
      try {
        // Straight to the network, past the HTTP cache too: always the live build.
        return await fetch(req, { cache: 'no-store' });
      } catch (err) {
        if (req.mode === 'navigate') return new Response(OFFLINE, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
        throw err;
      }
    })(),
  );
});
