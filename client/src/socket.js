import { io } from "socket.io-client";

let socket = null;

export function connectSocket() {
  const token = localStorage.getItem("token");
  if (socket) socket.disconnect();

  socket = io(import.meta.env.VITE_SERVER_URL || "http://localhost:4000", {
    auth: { token },
  });

  return socket;
}

export function getSocket() {
  return socket;
}
