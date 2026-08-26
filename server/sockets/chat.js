import jwt from "jsonwebtoken";
import db from "../db.js";
import { JWT_SECRET } from "../middleware/auth.js";
import webpush from "../push.js";

const onlineUsers = new Map();
const presenceState = new Map();

async function sendPushToUser(userId, payload) {
  await db.read();
  const subs = db.data.pushSubscriptions.filter((s) => s.userId === userId);
  if (subs.length === 0) return;

  const body = JSON.stringify(payload);
  let changed = false;

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          body
        );
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          db.data.pushSubscriptions = db.data.pushSubscriptions.filter(
            (s) => s.endpoint !== sub.endpoint
          );
          changed = true;
        } else {
          console.error("Push send failed:", err.message);
        }
      }
    })
  );

  if (changed) await db.write();
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
      await db.read();
      const id = db.data.messages.length
        ? Math.max(...db.data.messages.map((m) => m.id)) + 1
        : 1;

      const now = new Date();
      const expiresAt =
        typeof burnAfter === "number" && burnAfter > 0
          ? new Date(now.getTime() + burnAfter).toISOString()
          : null;

      const message = {
        id,
        sender_id: userId,
        receiver_id: receiverId,
        type: type || "text",
        content,
        created_at: now.toISOString(),
        expires_at: expiresAt,
        seen: false,
      };

      db.data.messages.push(message);
      await db.write();

      const receiverSocketId = onlineUsers.get(receiverId);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("message:new", message);
      }
      socket.emit("message:new", message);

      const receiverPresence = presenceState.get(receiverId);
      const alreadySeeing =
        receiverSocketId &&
        receiverPresence?.focused &&
        receiverPresence?.openWith === userId;

      if (!alreadySeeing) {
        const sender = db.data.users.find((u) => u.id === userId);
        sendPushToUser(receiverId, {
          title: sender?.username || "New message",
          body: type === "text" ? content : "Sent you something",
          senderId: userId,
          senderName: sender?.username,
        }).catch((err) => console.error("Push error:", err));
      }
    });

    socket.on("message:seen", async ({ otherUserId }) => {
      await db.read();
      let changed = false;
      db.data.messages.forEach((m) => {
        if (m.sender_id === otherUserId && m.receiver_id === userId && !m.seen) {
          m.seen = true;
          changed = true;
        }
      });
      if (changed) await db.write();

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
    socket.on("call:video-toggle", ({ receiverId, videoOn }) => {
      const receiverSocketId = onlineUsers.get(receiverId);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("call:video-toggle", { from: userId, videoOn });
      }
    });

    socket.on("call:end", ({ receiverId }) => {
      const receiverSocketId = onlineUsers.get(receiverId);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("call:end", { from: userId });
      }
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
    await db.read();
    const now = Date.now();
    const expired = db.data.messages.filter(
      (m) => m.expires_at && new Date(m.expires_at).getTime() <= now
    );
    if (expired.length === 0) return;

    const expiredIds = expired.map((m) => m.id);
    db.data.messages = db.data.messages.filter((m) => !expiredIds.includes(m.id));
    await db.write();

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