/* Service worker แบบ passthrough: ไม่แคชอะไรเอง ไม่แตะ API/CDN แค่ทำให้ติดตั้งเป็นแอพได้
   ไฟล์ของแอพเอง (โดเมนเดียวกัน) สั่ง cache:"no-cache" = ถามเซิร์ฟเวอร์ทุกครั้งว่าเปลี่ยนไหม (ไม่เปลี่ยน = ได้ 304 ไม่โหลดซ้ำ)
   → โหมด live (APK โหลดโค้ดจาก GitHub Pages) push แล้วเปิดแอพเห็นของใหม่เลย ไม่ต้องรอแคชหมดอายุ ~10 นาที */
self.addEventListener("install", function(){ self.skipWaiting(); });
self.addEventListener("activate", function(e){ e.waitUntil(self.clients.claim()); });
self.addEventListener("fetch", function(e){
  var r = e.request;
  if(r.method !== "GET" || r.headers.has("range") || new URL(r.url).origin !== self.location.origin){ e.respondWith(fetch(r)); return; }
  e.respondWith(fetch(r, { cache:"no-cache" }));
});
