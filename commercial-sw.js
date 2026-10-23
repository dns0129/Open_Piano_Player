// Network-only. Never persist authenticated HTML, API responses, scores or photos.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
 if(event.request.mode!=='navigate'||event.request.method!=='GET')return;
 event.respondWith(fetch(event.request).catch(()=>new Response('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>琴伴 · 等待连接</title><style>body{margin:15vh auto;padding:24px;max-width:480px;font:17px/1.8 system-ui;color:#24543f;background:#f6f7f2}a{display:inline-block;padding:10px 20px;background:#24543f;color:white;border-radius:10px;text-decoration:none}</style><h1>连接暂时中断</h1><p>已提交的任务仍在服务器处理，原谱和成功结果会保留。恢复网络后重新连接即可查看。</p><p>私有乐谱不会缓存在这台共享设备的离线页面中。</p><a href="/">重新连接琴伴</a></html>',{status:503,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"}})));
});
