// Cross-origin isolation is limited to /fsrs-trainer/; no global Vault routes are intercepted.
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.mode!=='navigate'||!new URL(req.url).pathname.startsWith(new URL(self.registration.scope).pathname)) return;
  event.respondWith(fetch(req).then(response=>{
    const headers=new Headers(response.headers);
    headers.set('Cross-Origin-Opener-Policy','same-origin');
    headers.set('Cross-Origin-Embedder-Policy','require-corp');
    return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
  }));
});
