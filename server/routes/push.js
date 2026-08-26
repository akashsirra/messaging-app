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

  await db.read();
  db.data.pushSubscriptions ||= [];
  const exists = db.data.pushSubscriptions.some(
    (s) => s.endpoint === subscription.endpoint
  );
  if (!exists) {
    db.data.pushSubscriptions.push({
      userId: req.user.id,
      endpoint: subscription.endpoint,
      keys: subscription.keys,
    });
    await db.write();
  }

  res.json({ ok: true });
});

router.post("/unsubscribe", requireAuth, async (req, res) => {
  const { endpoint } = req.body;
  await db.read();
  db.data.pushSubscriptions ||= [];
  db.data.pushSubscriptions = db.data.pushSubscriptions.filter(
    (s) => s.endpoint !== endpoint
  );
  await db.write();
  res.json({ ok: true });
});

export default router;