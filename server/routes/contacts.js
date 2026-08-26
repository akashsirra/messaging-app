import { Router } from "express";
import db from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

// List everyone the current user has added as a contact.
router.get("/", requireAuth, async (req, res) => {
  const result = await db.query(
    `SELECT u.id, u.username
     FROM contacts c
     JOIN users u ON u.id = c.contact_id
     WHERE c.owner_id = $1`,
    [req.user.id]
  );
  res.json(result.rows);
});

// Add someone by username. Case-insensitive so "Alex" and "alex" both work.
router.post("/", requireAuth, async (req, res) => {
  const { username } = req.body;
  if (!username || !username.trim()) {
    return res.status(400).json({ error: "Username is required." });
  }

  const targetResult = await db.query(
    "SELECT id, username FROM users WHERE LOWER(username) = LOWER($1)",
    [username.trim()]
  );
  const target = targetResult.rows[0];
  if (!target) {
    return res.status(404).json({ error: "No user with that username." });
  }
  if (target.id === req.user.id) {
    return res.status(400).json({ error: "You can't add yourself." });
  }

  const existing = await db.query(
    "SELECT 1 FROM contacts WHERE owner_id = $1 AND contact_id = $2",
    [req.user.id, target.id]
  );
  if (existing.rows.length > 0) {
    return res.status(409).json({ error: "Already in your contacts." });
  }

  await db.query("INSERT INTO contacts (owner_id, contact_id) VALUES ($1, $2)", [
    req.user.id,
    target.id,
  ]);

  res.json({ id: target.id, username: target.username });
});

// Remove a contact. This only removes them from *your* list — it doesn't
// touch message history and doesn't affect their contact list.
router.delete("/:contactId", requireAuth, async (req, res) => {
  const contactId = Number(req.params.contactId);

  const result = await db.query(
    "DELETE FROM contacts WHERE owner_id = $1 AND contact_id = $2",
    [req.user.id, contactId]
  );
  if (result.rowCount === 0) {
    return res.status(404).json({ error: "Contact not found." });
  }

  res.json({ ok: true });
});

export default router;