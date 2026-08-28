import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { createServer } from "http";
import { Server } from "socket.io";

import authRoutes from "./routes/auth.js";
import messageRoutes from "./routes/messages.js";
import uploadRoutes from "./routes/upload.js";
import pushRoutes from "./routes/push.js";
import contactsRoutes from "./routes/contacts.js";
import { setupChatSocket } from "./sockets/chat.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const httpServer = createServer(app);

const allowedOrigins = process.env.CLIENT_URL
  ? process.env.CLIENT_URL.split(",")
  : ["http://localhost:5173"];

const io = new Server(httpServer, {
  cors: { origin: allowedOrigins },
  pingTimeout: 60000,
  pingInterval: 25000,
});

app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

app.get("/health", (req, res) => {
  res.status(200).send("OK");
});

app.use("/api/auth", authRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/push", pushRoutes);
app.use("/api/contacts", contactsRoutes);

// Serves whatever's in server/uploads/ so the client can load shared images/files directly.
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

setupChatSocket(io);

const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});