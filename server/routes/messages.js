import { Router } from "express";
import db from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.get("/:otherUserId", requireAuth, async (req, res) => {
  const me = req.user.id;
  const other = Number(req.params.otherUserId);

  await db.read();
  const now = Date.now();
  const messages = db.data.messages
    .filter(
      (m) =>
        ((m.sender_id === me && m.receiver_id === other) ||
          (m.sender_id === other && m.receiver_id === me)) &&
        (!m.expires_at || new Date(m.expires_at).getTime() > now)
    )
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  res.json(messages);
});

export default router;