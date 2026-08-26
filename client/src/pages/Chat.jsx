import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { connectSocket, getSocket } from "../socket.js";
import { setupPushNotifications } from "../push.js";
import CallWindow from"../CallWindow";

const STICKERS = ["😀", "😂", "😍", "😎", "🥳", "😢", "😮", "🔥", "👍", "👎", "❤️", "🎉", "🙏", "👋", "🤔", "💀"];

// Uploaded files come back as a server-relative path like "/uploads/xyz.png" —
// this makes it an absolute URL the <img>/<a> tags can actually load.
const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:4000";
const toAbsoluteUrl = (relativeUrl) => `${SERVER_URL}${relativeUrl}`;

// Text/sticker messages store their content as a plain string; image/file
// messages store it as JSON ({ url, filename }) since they need both.
function renderMessageContent(message) {
  if (message.type !== "image" && message.type !== "file") {
    return message.content;
  }

  let url, filename;
  try {
    ({ url, filename } = JSON.parse(message.content));
  } catch {
    return "[Attachment unavailable]";
  }

  const fullUrl = toAbsoluteUrl(url);

  if (message.type === "image") {
    return (
      <a href={fullUrl} target="_blank" rel="noreferrer">
        <img src={fullUrl} alt={filename || "shared image"} className="shared-image" />
      </a>
    );
  }

  return (
    <a href={fullUrl} target="_blank" rel="noreferrer" className="shared-file">
      📎 {filename || "Download file"}
    </a>
  );
}

export default function Chat() {
  const me = JSON.parse(localStorage.getItem("user"));
  const navigate = useNavigate();

  const [users, setUsers] = useState([]);
  const [onlineIds, setOnlineIds] = useState([]);
  const [activeUser, setActiveUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [showStickers, setShowStickers] = useState(false);
  const [uploading, setUploading] = useState(false);
  const bottomRef = useRef(null);
  const fileInputRef = useRef(null);

  // Connect socket once on mount
  useEffect(() => {
    const socket = connectSocket();

    socket.on("presence:update", (ids) => setOnlineIds(ids));

    socket.on("message:new", (msg) => {
      const openUser = activeUserRef.current;
      const belongsToOpenChat =
        openUser && (msg.sender_id === openUser.id || msg.receiver_id === openUser.id);

      setMessages((prev) => (belongsToOpenChat ? [...prev, msg] : prev));

      // If the message just arrived from the person we're actively looking
      // at, mark it seen right away instead of waiting for a chat switch.
      if (belongsToOpenChat && msg.sender_id === openUser.id) {
        socket.emit("message:seen", { otherUserId: openUser.id });
      }
    });

    socket.on("message:seen", ({ byUserId }) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.sender_id === me.id && m.receiver_id === byUse