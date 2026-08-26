// Runs in the background, separate from the page — this is what lets a
// notification show up even when the Whisper tab isn't open or focused.

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Whisper", body: event.data?.text() || "New message" };
  }

  const title = data.title || "Whisper";
  const options = {
    body: data.body || "New message",
    // icon: "/icon-192.png", // add an icon file here later and uncomment
    tag: data.senderId ? `whisper-${data.senderId}` : undefined, // group by sender
    renotify: true,
    data: { senderId: data.senderId, senderName: data.senderName },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Clicking the notification focuses an existing Whisper tab if one is open,
// otherwise opens a new one.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientsArr) => {
      const existing = clientsArr.find((c) => "focus" in c);
      if (existing) return existing.focus();
      return self.clients.openWindow("/");
    })
  );
});