import { io } from "socket.io-client";

let socket = null;

export function connectSocket() {
  const token = localStorage.getItem("token");
  if (socket) socket.disconnect();

  socket = io("http://localhost:4000", {
    auth: { token },
  });

  return socket;
}

export function getSocket() {
  return socket;
}
