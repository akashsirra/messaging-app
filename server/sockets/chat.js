import jwt from "jsonwebtoken";
import db from "../db.js";
import { JWT_SECRET } from "../middleware/auth.js";

// Tracks which socket belongs to which user, so we know where to deliver messages.
// { userId: socketId }
const onlineUsers = new Map();

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
    io.emit("presence:update", Array.from(onlineUsers.keys()));

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
      io.emit("presence:update", Array.from(onlineUsers.keys()));
    });
  });
}
