import { Router } from "express";
import db from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.get("/vapid-public-key", (req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY || null });
});

router.post("/subscribe", requireAuth, async (req, res) => {
  const { subscription } = req.body;
  if (!subscription?.endpoint) {
    return res.status(400).json({ error: "Invalid subscription." });
  }

  // A browser/device only has one push subscription at a time. If a
  // different user logs in on the same browser, re-point this subscription
  // to them instead of leaving it pointed at whoever subscribed first.
  await db.query(
    `INSERT INTO push_subscriptions (user_id, endpoint, keys)
     VALUES ($1, $2, $3)
     ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, keys = EXCLUDED.keys`,
    [req.user.id, subscription.endpoint, subscription.keys]
  );

  res.json({ ok: true });
});

router.post("/unsubscribe", requireAuth, async (req, res) => {
  const { endpoint } = req.body;
  await db.query("DELETE FROM push_subscriptions WHERE endpoint = $1", [endpoint]);
  res.json({ ok: true });
});

export default router;