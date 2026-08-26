import jwt from "jsonwebtoken";
import db from "../db.js";
import { JWT_SECRET } from "../middleware/auth.js";
import webpush from "../push.js";

// Tracks which socket belongs to which user, so we know where to deliver messages.
// { userId: socketId }
const onlineUsers = new Map();

// Tracks whether each online user currently has the app tab focused/visible,
// and which conversation (if any) they have open. Used to decide whether a
// new message needs a push notification, the same way WhatsApp/etc only
// notify you for chats you're not actively looking at.
// { userId: { focused: boolean, openWith: userId|null } }
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
        // 404/410 means the subscription is dead (browser cleared it, etc.) — clean it up.
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
  // Verify the JWT before allowing a socket connection
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

    // Client reports tab focus + which conversation is open, so we know
    // whether a new message needs a push or they're already looking at it.
    socket.on("presence:focus", ({ focused, openWith }) => {
      presenceState.set(userId, { focused: !!focused, openWith: openWith ?? null });
    });

    // --- Text / media / sticker messages ---
    socket.on("message:send", async ({ receiverId, type, content }) => {
      await db.read();
      const id = db.data.messages.length
        ? Math.max(...db.data.messages.map((m) => m.id)) + 1
        : 1;

      const message = {
        id,
        sender_id: userId,
        receiver_id: receiverId,
        type: type || "text",
        content,
        created_at: new Date().toISOString(),
      };

      db.data.messages.push(message);
      await db.write();

      // Send to the receiver if they're online
      const receiverSocketId = onlineUsers.get(receiverId);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("message:new", message);
      }
      // Echo back to sender so their own UI updates
      socket.emit("message:new", message);

      // Decide whether the receiver needs a push notification: skip it only
      // if they're online, tab-focused, AND already looking at this exact
      // conversation — otherwise (offline, backgrounded, or on a different
      // chat) they wouldn't see the message land, so we notify.
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

    // --- WebRTC call signaling (used in Phase 4) ---
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

    socket.on("disconnect", () => {
      onlineUsers.delete(userId);
      presenceState.delete(userId);
      io.emit("presence:update", Array.from(onlineUsers.keys()));
    });
  });
}