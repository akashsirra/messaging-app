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

const AVATAR_COLORS = ["#8c2f39", "#4f6f52", "#b08d47", "#5b7c99", "#a15843", "#6b4c6b"];

function avatarColor(username) {
  let hash = 0;
  for (const ch of username || "?") hash = ch.charCodeAt(0) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function initial(username) {
  return (username || "?").charAt(0).toUpperCase();
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function dayLabel(iso) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, today)) return "Today";
  if (sameDay(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString([], { month: "long", day: "numeric" });
}

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
  const [loadingUsers, setLoadingUsers] = useState(true);
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
    // Tell the server which conversation (if any) is open, so it knows
    // whether a new message needs a push notification.
    const socket = getSocket();
    socket?.emit("presence:focus", {
      focused: document.visibilityState === "visible",
      openWith: activeUser?.id ?? null,
    });
  }, [activeUser]);

  // Keep the server's picture of "is this tab focused" in sync, so
  // backgrounding the tab still gets you push notifications for the chat
  // you had open.
  useEffect(() => {
    const reportFocus = () => {
      const socket = getSocket();
      socket?.emit("presence:focus", {
        focused: document.visibilityState === "visible",
        openWith: activeUserRef.current?.id ?? null,
      });
    };
    document.addEventListener("visibilitychange", reportFocus);
    window.addEventListener("focus", reportFocus);
    window.addEventListener("blur", reportFocus);
    return () => {
      document.removeEventListener("visibilitychange", reportFocus);
      window.removeEventListener("focus", reportFocus);
      window.removeEventListener("blur", reportFocus);
    };
  }, []);

  useEffect(() => {
    if (!me) {
      navigate("/login");
      return;
    }

    const socket = connectSocket();

    socket.on("presence:update", (ids) => setOnlineIds(ids));

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
          m.sender_id === me.id && m.receiver_id === byUserId ? { ...m, seen: true } : m
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
    api
      .getUsers()
      .then(setUsers)
      .catch((err) => console.error("Failed to load users", err))
      .finally(() => setLoadingUsers(false));
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

  // Build render items: day dividers + messages, with grouping metadata
  const items = [];
  messages.forEach((m, i) => {
    const prev = messages[i - 1];
    const newDay = !prev || dayLabel(m.created_at) !== dayLabel(prev.created_at);
    if (newDay) items.push({ kind: "divider", label: dayLabel(m.created_at), key: `d-${i}` });
    const grouped =
      !newDay && prev && prev.sender_id === m.sender_id &&
      new Date(m.created_at) - new Date(prev.created_at) < 5 * 60 * 1000;
    items.push({ kind: "message", data: m, grouped, key: m.id || `m-${i}` });
  });

  return (
    <div className={`chat-page ${activeUser ? "chat-open" : ""}`}>
      <aside className="user-list">
        <div className="sidebar-header">
          <h3>Chats</h3>
          <button className="logout-btn" onClick={handleLogout}>
            Logout
          </button>
        </div>

        {loadingUsers &&
          [1, 2, 3].map((i) => (
            <div className="list-skeleton" key={i}>
              <div className="skeleton-circle" />
              <div className="skeleton-line" />
            </div>
          ))}

        {!loadingUsers &&
          users.map((u) => (
            <div
              key={u.id}
              className={`user-item ${activeUser?.id === u.id ? "active" : ""}`}
              onClick={() => setActiveUser(u)}
            >
              <div className="avatar" style={{ background: avatarColor(u.username) }}>
                {initial(u.username)}
              </div>
              <div className="user-item-info">
                <span className="user-item-name">{u.username}</span>
                <span className="user-item-status">
                  {onlineIds.includes(u.id) ? "Online" : "Offline"}
                </span>
              </div>
              <span
                className={`status-dot ${onlineIds.includes(u.id) ? "online" : ""}`}
                style={{ marginLeft: "auto" }}
              />
            </div>
          ))}
      </aside>

      <main className="chat-window">
        {!activeUser ? (
          <div className="empty-state">Select a chat to start messaging</div>
        ) : (
          <>
            <header className="chat-header">
              <button className="back-btn" onClick={() => setActiveUser(null)}>
                ←
              </button>
              <div className="chat-header-info">
                <div className="avatar" style={{ background: avatarColor(activeUser.username), width: 32, height: 32 }}>
                  {initial(activeUser.username)}
                </div>
                <div>
                  <span className="chat-header-name">{activeUser.username}</span>
                  <span className="chat-header-status">
                    {onlineIds.includes(activeUser.id) ? "Online" : "Offline"}
                  </span>
                </div>
              </div>
              <CallWindow
                currentUserId={me.id}
                targetUserId={activeUser.id}
                targetName={activeUser.username}
              />
            </header>

            <div className="message-list">
              {items.map((item) => {
                if (item.kind === "divider") {
                  return (
                    <div className="day-divider" key={item.key}>
                      {item.label}
                    </div>
                  );
                }
                const m = item.data;
                const isMine = m.sender_id === me.id;
                const person = isMine ? me : activeUser;
                return (
                  <div
                    key={item.key}
                    className={`message-row ${isMine ? "sent" : ""} ${item.grouped ? "grouped" : ""}`}
                  >
                    {!isMine && (
                      <div
                        className={`message-row-avatar ${item.grouped ? "spacer" : ""}`}
                        style={{ background: avatarColor(person.username) }}
                      >
                        {initial(person.username)}
                      </div>
                    )}
                    <div className="message-col">
                      <div className={`message ${isMine ? "sent" : "received"}`}>
                        {renderMessageContent(m)}
                      </div>
                      {!item.grouped && (
                        <span className="message-meta">
                          {formatTime(m.created_at)}
                          {isMine && m.seen ? " · Seen" : ""}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
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
              <button onClick={handleSend} disabled={!draft.trim()}>
                Send
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}