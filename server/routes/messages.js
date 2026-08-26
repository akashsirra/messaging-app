import { Router } from "express";
import db from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.get("/:otherUserId", requireAuth, async (req, res) => {
  const me = req.user.id;
  const other = Number(req.params.otherUserId);

  const result = await db.query(
    `SELECT * FROM messages
     WHERE ((sender_id = $1 AND receiver_id = $2) OR (sender_id = $2 AND receiver_id = $1))
       AND (expires_at IS NULL OR expires_at > now())
       AND (
         unlock_at IS NULL
         OR unlock_at <= now()
         OR sender_id = $1
       )
     ORDER BY created_at ASC`,
    [me, other]
  );

  res.json(result.rows);
});

export default router;
