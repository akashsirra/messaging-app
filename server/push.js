import webpush from "web-push";

const {
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY,
  VAPID_CONTACT_EMAIL,
} = process.env;

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    VAPID_CONTACT_EMAIL || "mailto:you@example.com",
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );
} else {
  console.warn(
    "VAPID keys are missing — push notifications are disabled. " +
      "Run `npx web-push generate-vapid-keys` and add them to server/.env"
  );
}

export default webpush;
export { VAPID_PUBLIC_KEY };
