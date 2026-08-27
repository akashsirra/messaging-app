// Runs in the background, separate from the page - this is what lets a
// notification show up even when the Themartiane tab isn't open or focused.

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Themartiane", body: event.data?.text() || "New message" };
  }

  const isCall = data.type === "call";

  const title = isCall
    ? `\u{1F4DE} ${data.title || "Incoming call"}`
    : (data.title || "Themartiane");

  const options = {
    body: data.body || "New message",
    // icon: "/icon-192.png", // add an icon file here later and uncomment
    tag: data.senderId ? `themartiane-${data.senderId}` : undefined,
    renotify: true,
    requireInteraction: isCall,
    data: { senderId: data.senderId, senderName: data.senderName, type: data.type },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Clicking the notification focuses an existing Themartiane tab if one is open,
// otherwise opens a new one. Call notifications go straight into that chat.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const notifData = event.notification.data || {};
  const targetUrl = notifData.type === "call" && notifData.senderId
    ? `/?user=${notifData.senderId}`
    : "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientsArr) => {
      const existing = clientsArr.find((c) => "focus" in c);
      if (existing) {
        existing.focus();
        if ("navigate" in existing) existing.navigate(targetUrl);
        return;
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
