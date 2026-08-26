import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import db from "../db.js";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

router.post("/register", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password || password.length < 6) {
    return res.status(400).json({
      error: "Username required, password must be at least 6 characters.",
    });
  }

  await db.read();
  const existing = db.data.users.find((u) => u.username === username);
  if (existing) {
    return res.status(409).json({ error: "That username is already taken." });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const id = db.data.users.length
    ? Math.max(...db.data.users.map((u) => u.id)) + 1
    : 1;

  const user = { id, username, password_hash: passwordHash };
  db.data.users.push(user);
  await db.write();

  const token = jwt.sign({ id, username }, JWT_SECRET, { expiresIn: "7d" });
  res.json({ token, user: { id, username } });
});

router.post("/login", async (req, res) => {
  const { username, password } = req.body;

  await db.read();
  const user = db.data.users.find((u) => u.username === username);
  if (!user) {
    return res.status(401).json({ error: "Invalid username or password." });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: "Invalid username or password." });
  }

  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, {
    expiresIn: "7d",
  });

  res.json({ token, user: { id: user.id, username: user.username } });
});

// List all other users, so the client can start a chat with someone
router.get("/users", async (req, res) => {
  await db.read();
  res.json(db.data.users.map((u) => ({ id: u.id, username: u.username })));
});

export default router;