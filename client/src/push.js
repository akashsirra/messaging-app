import { api } from "./api.js";

// Push subscription keys arrive base64url-encoded; the browser's
// PushManager needs them as a Uint8Array.
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

// Registers the service worker and subscribes for push, sending the
// subscription to the server. Safe to call multiple times (e.g. every
// login) — browsers return the existing subscription if one already exists.
export async function setupPushNotifications() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    console.warn("Push notifications aren't supported in this browser.");
    return;
  }

  try {
    const registration = await navigator.serviceWorker.register("/sw.js");

    const permission = await Notification.requestPermission();
    if (permission !== "granted") return;

    const { publicKey } = await api.getVapidPublicKey();
    if (!publicKey) {
      console.warn("Server has no VAPID public key configured — push is disabled.");
      return;
    }

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }

    await api.subscribePush(subscription.toJSON());
  } catch (err) {
    console.error("Failed to set up push notifications:", err);
  }
}