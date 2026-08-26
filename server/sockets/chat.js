import jwt from "jsonwebtoken";
import db from "../db.js";
import { JWT_SECRET } from "../middleware/auth.js";
import webpush from "../push.js";

const onlineUsers = new Map();
const presenceState = new Map();

async function sendPushToUser(userId, payload) {
  const result = await db.query(
    "SELECT * FROM push_subscriptions WHERE user_id = $1",
    [userId]
  );
  const subs = result.rows;
  if (subs.length === 0) return;

  const body = JSON.stringify(payload);

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          body
        );
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await db.query("DELETE FROM push_subscriptions WHERE endpoint = $1", [
            sub.endpoint,
          ]);
        } else {
          console.error("Push send failed:", err.message);
        }
      }
    })
  );
}

export function setupChatSocket(io) {
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("No token"));
    try {
      socket.user = jwt.verify(token, JWT_SECRET);
      next();
    } catch {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket) => {
    const userId = socket.user.id;
    onlineUsers.set(userId, socket.id);
    presenceState.set(userId, { focused: true, openWith: null });
    io.emit("presence:update", Array.from(onlineUsers.keys()));

    socket.on("presence:focus", ({ focused, openWith }) => {
      presenceState.set(userId, { focused: !!focused, openWith: openWith ?? null });
    });

    socket.on("message:send", async ({ receiverId, type, content, burnAfter }) => {
      const expiresAt =
        typeof burnAfter === "number" && burnAfter > 0
          ? new Date(Date.now() + burnAfter).toISOString()
          : null;

      const insertResult = await db.query(
        `INSERT INTO messages (sender_id, receiver_id, type, content, expires_at)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [userId, receiverId, type || "text", content, expiresAt]
      );
      const message = insertResult.rows[0];

      // Auto-add the sender to the receiver's contacts so a message from
      // someone new doesn't just vanish from their sidebar.
      const existingContact = await db.query(
        "SELECT 1 FROM contacts WHERE owner_id = $1 AND contact_id = $2",
        [receiverId, userId]
      );
      const receiverAlreadyHasSender = existingContact.rows.length > 0;
      if (!receiverAlreadyHasSender) {
        await db.query(
          "INSERT INTO contacts (owner_id, contact_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
          [receiverId, userId]
        );
      }

      const receiverSocketId = onlineUsers.get(receiverId);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("message:new", message);
        if (!receiverAlreadyHasSender) {
          const senderResult = await db.query(
            "SELECT username FROM users WHERE id = $1",
            [userId]
          );
          io.to(receiverSocketId).emit("contact:added", {
            id: userId,
            username: senderResult.rows[0]?.username,
          });
        }
      }
      socket.emit("message:new", message);

      const receiverPresence = presenceState.get(receiverId);
      const alreadySeeing =
        receiverSocketId &&
        receiverPresence?.focused &&
        receiverPresence?.openWith === userId;

      if (!alreadySeeing) {
        const senderResult = await db.query(
          "SELECT username FROM users WHERE id = $1",
          [userId]
        );
        const sender = senderResult.rows[0];
        sendPushToUser(receiverId, {
          title: sender?.username || "New message",
          body: type === "text" ? content : "Sent you something",
          senderId: userId,
          senderName: sender?.username,
        }).catch((err) => console.error("Push error:", err));
      }
    });

    socket.on("message:seen", async ({ otherUserId }) => {
      await db.query(
        `UPDATE messages SET seen = true
         WHERE sender_id = $1 AND receiver_id = $2 AND seen = false`,
        [otherUserId, userId]
      );

      const otherSocketId = onlineUsers.get(otherUserId);
      if (otherSocketId) {
        io.to(otherSocketId).emit("message:seen", { byUserId: userId });
      }
    });

    socket.on("call:offer", ({ receiverId, offer }) => {
      const receiverSocketId = onlineUsers.get(receiverId);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("call:offer", { from: userId, offer });
      }
    });

    socket.on("call:answer", ({ receiverId, answer }) => {
      const receiverSocketId = onlineUsers.get(receiverId);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("call:answer", { from: userId, answer });
      }
    });

    socket.on("call:ice-candidate", ({ receiverId, candidate }) => {
      const receiverSocketId = onlineUsers.get(receiverId);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("call:ice-candidate", { from: userId, candidate });
      }
    });

    socket.on("call:end", ({ receiverId }) => {
      const receiverSocketId = onlineUsers.get(receiverId);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("call:end", { from: userId });
      }
    });

    socket.on("call:video-toggle", ({ receiverId, videoOn }) => {
      const receiverSocketId = onlineUsers.get(receiverId);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("call:video-toggle", { from: userId, videoOn });
      }
    });

    socket.on("chat:delete", async ({ otherUserId }) => {
      await db.query(
        `DELETE FROM messages
         WHERE (sender_id = $1 AND receiver_id = $2) OR (sender_id = $2 AND receiver_id = $1)`,
        [userId, otherUserId]
      );

      const otherSocketId = onlineUsers.get(otherUserId);
      if (otherSocketId) {
        io.to(otherSocketId).emit("chat:deleted", { byUserId: userId });
      }
      socket.emit("chat:deleted", { byUserId: userId });
    });

    socket.on("disconnect", () => {
      if (onlineUsers.get(userId) === socket.id) {
        onlineUsers.delete(userId);
        presenceState.delete(userId);
        io.emit("presence:update", Array.from(onlineUsers.keys()));
      }
    });
  });

  setInterval(async () => {
    const expiredResult = await db.query(
      "SELECT id, sender_id, receiver_id FROM messages WHERE expires_at IS NOT NULL AND expires_at <= now()"
    );
    const expired = expiredResult.rows;
    if (expired.length === 0) return;

    const expiredIds = expired.map((m) => m.id);
    await db.query("DELETE FROM messages WHERE id = ANY($1::int[])", [expiredIds]);

    const byUserPair = new Map();
    for (const m of expired) {
      for (const uid of [m.sender_id, m.receiver_id]) {
        if (!byUserPair.has(uid)) byUserPair.set(uid, []);
        byUserPair.get(uid).push(m.id);
      }
    }
    for (const [uid, ids] of byUserPair) {
      const socketId = onlineUsers.get(uid);
      if (socketId) io.to(socketId).emit("message:deleted", { ids });
    }
  }, 15000);
}