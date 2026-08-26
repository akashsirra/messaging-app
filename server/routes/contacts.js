import { Router } from "express";
import db from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

// List everyone the current user has added as a contact.
router.get("/", requireAuth, async (req, res) => {
  await db.read();
  const myContactIds = db.data.contacts
    .filter((c) => c.ownerId === req.user.id)
    .map((c) => c.contactId);

  const contacts = db.data.users
    .filter((u) => myContactIds.includes(u.id))
    .map((u) => ({ id: u.id, username: u.username }));

  res.json(contacts);
});

// Add someone by username. Case-insensitive so "Alex" and "alex" both work.
router.post("/", requireAuth, async (req, res) => {
  const { username } = req.body;
  if (!username || !username.trim()) {
    return res.status(400).json({ error: "Username is required." });
  }

  await db.read();
  const target = db.data.users.find(
    (u) => u.username.toLowerCase() === username.trim().toLowerCase()
  );
  if (!target) {
    return res.status(404).json({ error: "No user with that username." });
  }
  if (target.id === req.user.id) {
    return res.status(400).json({ error: "You can't add yourself." });
  }

  const alreadyAdded = db.data.contacts.some(
    (c) => c.ownerId === req.user.id && c.contactId === target.id
  );
  if (alreadyAdded) {
    return res.status(409).json({ error: "Already in your contacts." });
  }

  db.data.contacts.push({ ownerId: req.user.id, contactId: target.id });
  await db.write();

  res.json({ id: target.id, username: target.username });
});

// Remove a contact. This only removes them from *your* list — it doesn't
// touch message history and doesn't affect their contact list.
router.delete("/:contactId", requireAuth, async (req, res) => {
  const contactId = Number(req.params.contactId);

  await db.read();
  const before = db.data.contacts.length;
  db.data.contacts = db.data.contacts.filter(
    (c) => !(c.ownerId === req.user.id && c.contactId === contactId)
  );
  if (db.data.contacts.length === before) {
    return res.status(404).json({ error: "Contact not found." });
  }
  await db.write();

  res.json({ ok: true });
});

export default router;