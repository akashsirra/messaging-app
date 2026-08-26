import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { connectSocket, getSocket } from "../socket.js";
import { setupPushNotifications } from "../push.js";
import CallWindow from "../CallWindow";
import "./Chat.css";

const STICKERS = ["😀", "😂", "😍", "😎", "🥳", "😢", "😮", "🔥", "👍", "👎", "❤️", "🎉", "🙏", "👋", "🤔", "💀"];

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:4000";
const toAbsoluteUrl = (relativeUrl) => `${SERVER_URL}${relativeUrl}`;

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
  const activeUserRef = useRef(null);

  useEffect(() => {
    activeUserRef.current = activeUser;
  }, [activeUser]);

  useEffect(() => {
    if (!me) {
      navigate("/login");
      return;
    }

    const socket = connectSocket();

    socket.on("presence:update", (ids) => setOnlineIds(ids));

    // Server echoes every sent message back to the sender too, so this is
    // the ONLY place messages get added to state — no optimistic append,
    // to avoid duplicates.
    socket.on("message:new", (msg) => {
      const openUser = activeUserRef.current;
      const belongsToOpenChat =
        openUser && (msg.sender_id === openUser.id || msg.receiver_id === openUser.id);
      const involvesMe = msg.sender_id === me.id || msg.receiver_id === me.id;

      if (involvesMe) {
        setMessages((prev) => (belongsToOpenChat ? [...prev, msg] : prev));
      }

      if (belongsToOpenChat && msg.sender_id === openUser.id) {
        socket.emit("message:seen", { otherUserId: openUser.id });
      }
    });

    socket.on("message:seen", ({ byUserId }) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.sender_id === me.id && m.receiver_id === byUserId
            ? { ...m, seen: true }
            : m
        )
      );
    });

    setupPushNotifications();

    return () => {
      socket.off("presence:update");
      socket.off("message:new");
      socket.off("message:seen");
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    api.getUsers().then(setUsers).catch((err) => console.error("Failed to load users", err));
  }, []);

  useEffect(() => {
    if (!activeUser) return;
    api
      .getHistory(activeUser.id)
      .then((history) => {
        setMessages(history);
        const socket = getSocket();
        socket?.emit("message:seen", { otherUserId: activeUser.id });
      })
      .catch((err) => console.error("Failed to load history", err));
  }, [activeUser]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    if (!draft.trim() || !activeUser) return;
    const socket = getSocket();
    socket.emit("message:send", {
      receiverId: activeUser.id,
      type: "text",
      content: draft.trim(),
    });
    setDraft("");
  };

  const handleStickerPick = (emoji) => {
    if (!activeUser) return;
    const socket = getSocket();
    socket.emit("message:send", {
      receiverId: activeUser.id,
      type: "text",
      content: emoji,
    });
    setShowStickers(false);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !activeUser) return;
    setUploading(true);
    try {
      const { url } = await api.uploadFile(file);
      const isImage = file.type.startsWith("image/");
      const socket = getSocket();
      socket.emit("message:send", {
        receiverId: activeUser.id,
        type: isImage ? "image" : "file",
        content: JSON.stringify({ url, filename: file.name }),
      });
    } catch (err) {
      console.error("Upload failed", err);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleLogout = () => {
    getSocket()?.disconnect();
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login");
  };

  return (
    <div className="chat-page">
      <aside className="user-list">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <h3 style={{ margin: 0 }}>Chats</h3>
          <button onClick={handleLogout} title="Log out" style={{ background: "none", border: "none", color: "#d4af37", cursor: "pointer", fontSize: 13 }}>
            Logout
          </button>
        </div>
        {users.map((u) => (
          <div
            key={u.id}
            className={`user-item ${activeUser?.id === u.id ? "active" : ""}`}
            onClick={() => setActiveUser(u)}
          >
            <span className={`status-dot ${onlineIds.includes(u.id) ? "online" : ""}`} />
            {u.username}
          </div>
        ))}
      </aside>

      <main className="chat-window">
        {!activeUser ? (
          <div className="empty-state">Select a chat to start messaging</div>
        ) : (
          <>
            <header className="chat-header">
              <span>{activeUser.username}</span>
              <CallWindow
                currentUserId={me.id}
                targetUserId={activeUser.id}
                targetName={activeUser.username}
              />
            </header>

            <div className="message-list">
              {messages.map((m, i) => (
                <div
                  key={m.id || i}
                  className={`message ${m.sender_id === me.id ? "sent" : "received"}`}
                >
                  {renderMessageContent(m)}
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            {showStickers && (
              <div className="sticker-picker">
                {STICKERS.map((s) => (
                  <span key={s} onClick={() => handleStickerPick(s)}>
                    {s}
                  </span>
                ))}
              </div>
            )}

            <div className="message-input">
              <button onClick={() => setShowStickers((s) => !s)}>😀</button>
              <input
                type="file"
                ref={fileInputRef}
                style={{ display: "none" }}
                onChange={handleFileUpload}
              />
              <button onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                📎
              </button>
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                placeholder="Type a message..."
              />
              <button onClick={handleSend}>Send</button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}