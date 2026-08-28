import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { connectSocket, getSocket } from "../socket.js";
import { setupPushNotifications } from "../push.js";
import CallWindow from "../CallWindow";
import { getMoodScore, moodToColors } from "../utils/mood";
import VoiceRecorder from "../VoiceRecorder";
import DoodleCanvas from "../DoodleCanvas";
import "./Chat.css";
import ThemeToggle from "../ThemeToggle";

const STICKERS = ["😀", "😂", "😍", "😎", "🥳", " 😢", "😮", "🔥", "👍", "👎", "❤️", "🎉", "🙏", "👋", "🤔", "💀"];

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:4000";
const toAbsoluteUrl = (relativeUrl) => `${SERVER_URL}${relativeUrl}`;

const BURN_DURATION_MS = 24 * 60 * 60 * 1000;

const CAPSULE_DURATIONS = [
  { label: "1 hour", ms: 60 * 60 * 1000 },
  { label: "24 hours", ms: 24 * 60 * 60 * 1000 },
  { label: "3 days", ms: 3 * 24 * 60 * 60 * 1000 },
  { label: "1 week", ms: 7 * 24 * 60 * 60 * 1000 },
];

const AVATAR_COLORS = ["#4fd1c5", "#ff7a45", "#8a8aff", "#5fd98a", "#e0c341", "#ff6b9d"];

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

function burnCountdown(expiresAt, now) {
  const msLeft = new Date(expiresAt).getTime() - now;
  if (msLeft <= 0) return "0s left";
  const s = Math.floor(msLeft / 1000);
  if (s < 60) return `${s}s left`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m left`;
  const h = Math.floor(m / 60);
  return `${h}h left`;
}

function capsuleCountdown(unlockAt, now) {
  const msLeft = new Date(unlockAt).getTime() - now;
  if (msLeft <= 0) return "unlocking…";
  const s = Math.floor(msLeft / 1000);
  if (s < 60) return `unlocks in ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `unlocks in ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `unlocks in ${h}h`;
  const d = Math.floor(h / 24);
  return `unlocks in ${d}d`;
}

// Presence trail: turns a raw last_active timestamp into a friendly,
// low-pressure label instead of a stark online/offline dot.
function activityLabel(isOnline, lastActive, now) {
  if (isOnline) return "online";
  if (!lastActive) return "no activity yet";
  const msAgo = now - new Date(lastActive).getTime();
  if (msAgo < 0) return "active just now";
  const s = Math.floor(msAgo / 1000);
  if (s < 60) return "active just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `active ${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `active ${h}h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return "active yesterday";
  if (d < 7) return `active ${d}d ago`;
  const w = Math.floor(d / 7);
  if (w === 1) return "active last week";
  return "active a while ago";
}

function renderMessageContent(message) {
  if (message.type !== "image" && message.type !== "file" && message.type !== "audio") {
    return message.content;
  }
  let url, filename;
  try {
    ({ url, filename } = JSON.parse(message.content));
  } catch {
    return "[Attachment unavailable]";
  }
  const fullUrl = toAbsoluteUrl(url);
  if (message.type === "audio") {
    return <audio controls src={fullUrl} style={{ maxWidth: "220px" }} />;
  }
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
  const moodColors = useMemo(() => moodToColors(getMoodScore(messages)), [messages]);
  const [replyTarget, setReplyTarget] = useState(null);
  const longPressTimer = useRef(null);
  const [draft, setDraft] = useState("");
  const [showStickers, setShowStickers] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [burnMode, setBurnMode] = useState(false);
  const [expiringIds, setExpiringIds] = useState([]);
  const [now, setNow] = useState(Date.now());
  const [otherTyping, setOtherTyping] = useState(false);
  const typingTimeoutRef = useRef(null);
  const [sendBurst, setSendBurst] = useState(0);
  const [missYouToast, setMissYouToast] = useState(null);
  const [kissBurst, setKissBurst] = useState(0);
  const [petNames, setPetNames] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("petNames") || "{}");
    } catch {
      return {};
    }
  });

  const getDisplayName = (user) => (user && petNames[user.id]) || user?.username || "";

  const handleEditPetName = (user) => {
    if (!user) return;
    const current = petNames[user.id] || "";
    const input = window.prompt(`Set a pet name for ${user.username} (leave blank to remove):`, current);
    if (input === null) return;
    const updated = { ...petNames };
    if (input.trim()) {
      updated[user.id] = input.trim();
    } else {
      delete updated[user.id];
    }
    setPetNames(updated);
    localStorage.setItem("petNames", JSON.stringify(updated));
  };
  const [newContactName, setNewContactName] = useState("");
  const [addContactError, setAddContactError] = useState("");
  const [addingContact, setAddingContact] = useState(false);
  const [capsuleDurationMs, setCapsuleDurationMs] = useState(null);
  const [showCapsuleMenu, setShowCapsuleMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [actionMenuFor, setActionMenuFor] = useState(null);
  const wasLongPressRef = useRef(false);
  const [showDoodle, setShowDoodle] = useState(false);
  const [sendingDoodle, setSendingDoodle] = useState(false);
  const bottomRef = useRef(null);
  const fileInputRef = useRef(null);
  const activeUserRef = useRef(null);

  useEffect(() => {
    activeUserRef.current = activeUser;
    const socket = getSocket();
    socket?.emit("presence:focus", {
      focused: document.visibilityState === "visible",
      openWith: activeUser?.id ?? null,
    });
  }, [activeUser]);

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
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!me) {
      navigate("/login");
      return;
    }

    const socket = connectSocket();

    socket.on("presence:update", (ids) => setOnlineIds(ids));

    socket.on("typing:start", ({ from }) => {
      if (activeUserRef.current && activeUserRef.current.id === from) {
        setOtherTyping(true);
      }
    });

    socket.on("message:edited", (msg) => {
      setMessages((prev) => prev.map((m) => (m.id === msg.id ? msg : m)));
    });

    socket.on("message:unsent", ({ id }) => {
      setMessages((prev) => prev.filter((m) => m.id !== id));
    });

    socket.on("kiss:received", () => {
      setKissBurst((b) => b + 1);
    });

    socket.on("missyou:received", ({ senderName }) => {
      setMissYouToast(senderName || "They");
      setTimeout(() => setMissYouToast(null), 4000);
    });

    socket.on("typing:stop", ({ from }) => {
      if (activeUserRef.current && activeUserRef.current.id === from) {
        setOtherTyping(false);
      }
    });

    socket.on("message:new", (msg) => {
      if (msg.sender_id !== me.id) {
        const audio = new Audio("/sounds/notify.wav");
        audio.play().catch(() => {});
      }
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

    socket.on("capsule:incoming", ({ id, senderId, unlockAt }) => {
      const openUser = activeUserRef.current;
      const belongsToOpenChat = openUser && senderId === openUser.id;
      if (!belongsToOpenChat) return;
      setMessages((prev) => [
        ...prev,
        {
          id,
          sender_id: senderId,
          receiver_id: me.id,
          type: "text",
          content: null,
          created_at: new Date().toISOString(),
          expires_at: null,
          unlock_at: unlockAt,
          seen: false,
          _locked: true,
        },
      ]);
    });

    socket.on("capsule:unlocked", (msg) => {
      setMessages((prev) =>
        prev.some((m) => m.id === msg.id)
          ? prev.map((m) => (m.id === msg.id ? { ...msg, _locked: false } : m))
          : prev
      );
    });

    socket.on("message:seen", ({ byUserId }) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.sender_id === me.id && m.receiver_id === byUserId ? { ...m, seen: true } : m
        )
      );
    });

    socket.on("message:deleted", ({ ids }) => {
      setExpiringIds((prev) => [...prev, ...ids]);
      setTimeout(() => {
        setMessages((prev) => prev.filter((m) => !ids.includes(m.id)));
        setExpiringIds((prev) => prev.filter((id) => !ids.includes(id)));
      }, 480);
    });

    socket.on("contact:added", (contact) => {
      setUsers((prev) => (prev.some((u) => u.id === contact.id) ? prev : [...prev, contact]));
    });

    socket.on("chat:deleted", ({ byUserId }) => {
      const openUser = activeUserRef.current;
      if (openUser && openUser.id === byUserId) {
        setMessages([]);
      }
    });

    setupPushNotifications();

    return () => {
      socket.off("presence:update");
      socket.off("typing:start");
      socket.off("typing:stop");
      socket.off("missyou:received");
      socket.off("kiss:received");
      socket.off("message:edited");
      socket.off("message:unsent");
      socket.off("message:new");
      socket.off("capsule:incoming");
      socket.off("capsule:unlocked");
      socket.off("message:seen");
      socket.off("message:deleted");
      socket.off("contact:added");
      socket.off("chat:deleted");
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    api
      .getContacts()
      .then(setUsers)
      .catch((err) => console.error("Failed to load contacts", err))
      .finally(() => setLoadingUsers(false));
  }, []);

  useEffect(() => {
    if (loadingUsers || users.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const userId = params.get("user");
    if (!userId) return;
    const match = users.find((u) => String(u.id) === String(userId));
    if (match) {
      setActiveUser(match);
      window.history.replaceState({}, "", "/");
    }
  }, [loadingUsers, users]);

  useEffect(() => {
    setOtherTyping(false);
  }, [activeUser]);

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

  const computeUnlockAt = () =>
    capsuleDurationMs ? new Date(Date.now() + capsuleDurationMs).toISOString() : null;

  const handleSend = () => {
    if (!draft.trim() || !activeUser) return;
    const socket = getSocket();
    if (!socket || !socket.connected) {
      alert("Not connected to server. Please wait a moment and try again.");
      return;
    }
    socket.emit("message:send", {
      receiverId: activeUser.id,
      type: "text",
      content: draft.trim(),
      burnAfter: burnMode ? BURN_DURATION_MS : null,
      unlockAt: computeUnlockAt(),
    });
    setDraft("");
    setSendBurst((b) => b + 1);
  };

  const handleStickerPick = (emoji) => {
    if (!activeUser) return;
    const socket = getSocket();
    socket.emit("message:send", {
      receiverId: activeUser.id,
      type: "text",
      content: emoji,
      burnAfter: burnMode ? BURN_DURATION_MS : null,
      unlockAt: computeUnlockAt(),
    });
    setShowStickers(false);
  };

  const handleDoodleSend = async (blob) => {
    if (!activeUser) return;
    setSendingDoodle(true);
    try {
      const file = new File([blob], `doodle-${Date.now()}.png`, { type: "image/png" });
      const { url } = await api.uploadFile(file);
      const socket = getSocket();
      if (!socket || !socket.connected) {
        alert("Not connected to server. Please wait a moment and try again.");
        return;
      }
      socket.emit("message:send", {
        receiverId: activeUser.id,
        type: "image",
        content: JSON.stringify({ url, filename: "doodle.png" }),
        burnAfter: burnMode ? BURN_DURATION_MS : null,
        unlockAt: computeUnlockAt(),
      });
      setShowDoodle(false);
    } catch (err) {
      console.error("Doodle send failed", err);
      alert("Couldn't send doodle. Please try again.");
    } finally {
      setSendingDoodle(false);
    }
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
        burnAfter: burnMode ? BURN_DURATION_MS : null,
        unlockAt: computeUnlockAt(),
      });
    } catch (err) {
      console.error("Upload failed", err);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleVoiceReply = async (file) => {
    if (!activeUser || !replyTarget) return;
    try {
      const { url } = await api.uploadFile(file);
      const socket = getSocket();
      socket.emit("message:send", {
        receiverId: activeUser.id,
        type: "audio",
        content: JSON.stringify({ url, filename: file.name }),
        replyTo: replyTarget.id,
      });
    } catch (err) {
      console.error("Voice reply upload failed", err);
    } finally {
      setReplyTarget(null);
    }
  };

  const handleLogout = () => {
    getSocket()?.disconnect();
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login");
  };

  const handleAddContact = async (e) => {
    e.preventDefault();
    if (!newContactName.trim()) return;
    setAddingContact(true);
    setAddContactError("");
    try {
      const contact = await api.addContact(newContactName.trim());
      setUsers((prev) => [...prev, contact]);
      setNewContactName("");
    } catch (err) {
      setAddContactError(err.message || "Couldn't add that person.");
    } finally {
      setAddingContact(false);
    }
  };

  const handleDeleteContact = async (e, contact) => {
    e.stopPropagation();
    if (!window.confirm(`Remove ${contact.username} from your contacts?`)) return;
    try {
      await api.deleteContact(contact.id);
      setUsers((prev) => prev.filter((u) => u.id !== contact.id));
      if (activeUser?.id === contact.id) {
        setActiveUser(null);
        setMessages([]);
      }
    } catch (err) {
      console.error("Failed to delete contact", err);
    }
  };

  const handleEditMessage = (m) => {
    const newContent = window.prompt("Edit message:", m.content);
    if (newContent === null || !newContent.trim() || newContent === m.content) return;
    getSocket()?.emit("message:edit", { messageId: m.id, newContent: newContent.trim() });
  };

  const handleUnsendMessage = (m) => {
    if (!window.confirm("Unsend this message for both of you?")) return;
    getSocket()?.emit("message:unsend", { messageId: m.id });
  };

  const handleDeleteForMe = (m) => {
    if (!window.confirm("Delete this message just for you?")) return;
    getSocket()?.emit("message:delete-for-me", { messageId: m.id });
  };

  const handleKiss = () => {
    if (!activeUser) return;
    const socket = getSocket();
    if (!socket || !socket.connected) {
      alert("Not connected to server. Please wait a moment and try again.");
      return;
    }
    socket.emit("kiss:send", { receiverId: activeUser.id });
  };

  const handleMissYou = () => {
    if (!activeUser) return;
    const socket = getSocket();
    if (!socket || !socket.connected) {
      alert("Not connected to server. Please wait a moment and try again.");
      return;
    }
    socket.emit("missyou:send", { receiverId: activeUser.id });
  };

  const handleDeleteChat = () => {
    if (!activeUser) return;
    if (!window.confirm(`Delete this entire chat with ${activeUser.username}? This can't be undone.`)) {
      return;
    }
    getSocket()?.emit("chat:delete", { otherUserId: activeUser.id });
    setMessages([]);
  };

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

  const capsuleLabel = capsuleDurationMs
    ? CAPSULE_DURATIONS.find((d) => d.ms === capsuleDurationMs)?.label
    : null;

  return (
    <div className={`chat-page ${activeUser ? "chat-open" : ""}`}>
      {kissBurst > 0 && (
        <div className="kiss-overlay" key={kissBurst}>
          {Array.from({ length: 12 }).map((_, i) => (
            <span
              key={i}
              className="kiss-particle"
              style={{
                left: `${Math.random() * 90 + 5}%`,
                animationDelay: `${Math.random() * 0.4}s`,
                fontSize: `${20 + Math.random() * 20}px`,
              }}
            >
              {Math.random() > 0.5 ? "💋" : "❤️"}
            </span>
          ))}
        </div>
      )}

      {missYouToast && (
        <div className="missyou-toast">{missYouToast} misses you 🥺❤️</div>
      )}
      <aside className="user-list">
        <div className="sidebar-header">
          <h3>Chats</h3>
          <ThemeToggle />
          <button className="logout-btn" onClick={handleLogout}>
            Logout
          </button>
        </div>

        <form className="add-contact-form" onSubmit={handleAddContact}>
          <input
            type="text"
            value={newContactName}
            onChange={(e) => setNewContactName(e.target.value)}
            placeholder="Add by username..."
          />
          <button type="submit" disabled={addingContact || !newContactName.trim()}>
            {addingContact ? "…" : "Add"}
          </button>
        </form>
        {addContactError && <div className="add-contact-error">{addContactError}</div>}

        {loadingUsers &&
          [1, 2, 3].map((i) => (
            <div className="list-skeleton" key={i}>
              <div className="skeleton-circle" />
              <div className="skeleton-line" />
            </div>
          ))}

        {!loadingUsers &&
          users.map((u) => {
            const isOnline = onlineIds.includes(u.id);
            return (
              <div
                key={u.id}
                className={`user-item ${activeUser?.id === u.id ? "active" : ""}`}
                onClick={() => setActiveUser(u)}
              >
                <div className="avatar" style={{ background: avatarColor(u.username) }}>
                  {initial(u.username)}
                </div>
                <div className="user-item-info">
                  <span className="user-item-name">{getDisplayName(u)}</span>
                  <span className="user-item-status">
                    {activityLabel(isOnline, u.last_active, now)}
                  </span>
                </div>
                <span
                  className={`status-dot ${isOnline ? "online" : ""}`}
                  style={{ marginLeft: "auto" }}
                />
                <button
                  className="remove-contact-btn"
                  onClick={(e) => handleDeleteContact(e, u)}
                  title={`Remove ${u.username}`}
                >
                  ×
                </button>
              </div>
            );
          })}
        {!loadingUsers && users.length === 0 && (
          <div className="user-item-status" style={{ padding: "8px 20px" }}>
            No contacts yet — add someone by username above.
          </div>
        )}
      </aside>

      <main className="chat-window" style={{ backgroundColor: moodColors.bg, "--mood-accent": moodColors.accent, transition: "background-color 1.2s ease" }}>
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
                  <span
                    className="chat-header-name"
                    onClick={() => handleEditPetName(activeUser)}
                    style={{ cursor: "pointer" }}
                    title="Tap to set a pet name"
                  >
                    {getDisplayName(activeUser)} ✏️
                  </span>
                  <span className="chat-header-status">
                    {activityLabel(onlineIds.includes(activeUser.id), activeUser.last_active, now)}
                  </span>
                </div>
              </div>
              <div style={{ position: "relative" }}>
                <button
                  className="burn-toggle"
                  onClick={() => setShowMoreMenu((s) => !s)}
                  title="More options"
                >
                  ⋯
                </button>
                {showMoreMenu && (
                  <div className="sticker-picker" style={{ right: 0, left: "auto", minWidth: 190 }}>
                    <div className="more-menu-item" onClick={() => { handleKiss(); setShowMoreMenu(false); }}>
                      💋 Send a kiss
                    </div>
                    <div className="more-menu-item" onClick={() => { handleMissYou(); setShowMoreMenu(false); }}>
                      🥺 Miss you ping
                    </div>
                    <div className="more-menu-item" onClick={() => setBurnMode((b) => !b)}>
                      🔥 {burnMode ? "Turn off auto-delete" : "Turn on auto-delete (24h)"}
                    </div>
                    <div style={{ position: "relative" }}>
                      <div className="more-menu-item" onClick={() => setShowCapsuleMenu((s) => !s)}>
                        ⏳ {capsuleLabel ? `Time Capsule: ${capsuleLabel}` : "Send as Time Capsule"}
                      </div>
                      {showCapsuleMenu && (
                        <div className="sticker-picker" style={{ right: "100%", left: "auto", top: 0, minWidth: 140 }}>
                          {CAPSULE_DURATIONS.map((d) => (
                            <div
                              key={d.label}
                              style={{ padding: "6px 10px", cursor: "pointer", whiteSpace: "nowrap" }}
                              onClick={() => {
                                setCapsuleDurationMs(d.ms);
                                setShowCapsuleMenu(false);
                              }}
                            >
                              {d.label}
                            </div>
                          ))}
                          <div
                            style={{ padding: "6px 10px", cursor: "pointer", opacity: 0.7 }}
                            onClick={() => {
                              setCapsuleDurationMs(null);
                              setShowCapsuleMenu(false);
                            }}
                          >
                            Off
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="more-menu-item" onClick={() => { handleDeleteChat(); setShowMoreMenu(false); }}>
                      🗑️ Delete chat
                    </div>
                  </div>
                )}
              </div>
              <CallWindow
                currentUserId={me.id}
                targetUserId={activeUser.id}
                targetName={activeUser.username}
              />
            </header>

            {burnMode && (
              <div className="burn-banner">New messages in this chat will burn 24h after sending</div>
            )}
            {capsuleLabel && (
              <div className="burn-banner">New messages will stay locked for {capsuleLabel} 🔒</div>
            )}

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
                const isBurning = !!m.expires_at;
                const isExpiring = expiringIds.includes(m.id);
                const isLockedCapsule =
                  !isMine && m.unlock_at && new Date(m.unlock_at) > now;
                let fusePct = null;
                if (isBurning) {
                  const total = new Date(m.expires_at) - new Date(m.created_at);
                  const remaining = new Date(m.expires_at) - now;
                  fusePct = Math.max(0, Math.min(100, (remaining / total) * 100));
                }
                return (
                  <div
                    key={item.key}
                    className={`message-row ${isMine ? "sent" : ""} ${item.grouped ? "grouped" : ""} ${isExpiring ? "expiring" : ""}`}
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
                      <div className={`message ${isMine ? "sent bubble-me" : "received bubble-them"} ${isBurning ? "burning" : ""}`} onTouchStart={() => { wasLongPressRef.current = false; longPressTimer.current = setTimeout(() => { wasLongPressRef.current = true; setActionMenuFor(m.id); }, 500); }} onTouchEnd={() => clearTimeout(longPressTimer.current)} onMouseDown={() => { wasLongPressRef.current = false; longPressTimer.current = setTimeout(() => { wasLongPressRef.current = true; setActionMenuFor(m.id); }, 500); }} onMouseUp={() => clearTimeout(longPressTimer.current)} onContextMenu={(e) => e.preventDefault()} onClick={() => { if (!wasLongPressRef.current) { setReplyTarget(m); } }}>
                        {isLockedCapsule ? (
                          <span style={{ opacity: 0.75 }}>
                            🔒 Time Capsule — {capsuleCountdown(m.unlock_at, now)}
                          </span>
                        ) : (
                          renderMessageContent(m)
                        )}
                        {isBurning && fusePct !== null && (
                          <span className="burn-fuse" style={{ width: `${fusePct}%` }} />
                        )}
                        {m.edited && <span style={{ fontSize: 11, opacity: 0.6, marginLeft: 6 }}>(edited)</span>}
                      </div>
                      {actionMenuFor === m.id && (
                        <div className="sticker-picker" style={{ position: "static", marginTop: 4 }}>
                          <div className="more-menu-item" onClick={() => { setReplyTarget(m); setActionMenuFor(null); }}>
                            ↩️ Reply
                          </div>
                          {isMine && m.type === "text" && (
                            <div className="more-menu-item" onClick={() => { handleEditMessage(m); setActionMenuFor(null); }}>
                              ✏️ Edit
                            </div>
                          )}
                          {isMine && (
                            <div className="more-menu-item" onClick={() => { handleUnsendMessage(m); setActionMenuFor(null); }}>
                              🗑️ Unsend for everyone
                            </div>
                          )}
                          <div className="more-menu-item" onClick={() => { handleDeleteForMe(m); setActionMenuFor(null); }}>
                            🙈 Delete for me
                          </div>
                          <div className="more-menu-item" onClick={() => setActionMenuFor(null)}>
                            ✖ Cancel
                          </div>
                        </div>
                      )}
                      {!item.grouped && (
                        <span className="message-meta">
                          <span>{formatTime(m.created_at)}</span>
                          {isMine && m.seen && <span className="seen">· seen</span>}
                          {isBurning && (
                            <span className="burn-countdown">· 🔥 {burnCountdown(m.expires_at, now)}</span>
                          )}
                          {m.unlock_at && isMine && (
                            <span className="burn-countdown">
                              · ⏳ {new Date(m.unlock_at) > now ? capsuleCountdown(m.unlock_at, now) : "unlocked"}
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            {otherTyping && (
              <div className="typing-indicator">
                <span>❤️</span><span>❤️</span><span>❤️</span>
              </div>
            )}

            {showStickers && (
              <div className="sticker-picker">
                {STICKERS.map((s) => (
                  <span key={s} onClick={() => handleStickerPick(s)}>
                    {s}
                  </span>
                ))}
              </div>
            )}

            {showDoodle && (
              <DoodleCanvas
                onSend={handleDoodleSend}
                onClose={() => setShowDoodle(false)}
                sending={sendingDoodle}
              />
            )}

            <div className="message-input">
              <button onClick={() => setShowStickers((s) => !s)} title="Stickers">
                😀
              </button>
              <input
                type="file"
                ref={fileInputRef}
                style={{ display: "none" }}
                onChange={handleFileUpload}
              />
              <button onClick={() => fileInputRef.current?.click()} disabled={uploading} title="Attach file">
                📎
              </button>
              <button onClick={() => setShowDoodle(true)} title="Doodle">
                🎨
              </button>
              {replyTarget && (
                <VoiceRecorder onRecorded={handleVoiceReply} onCancel={() => setReplyTarget(null)} />
              )}
              <input
                type="text"
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  const socket = getSocket();
                  if (!socket || !activeUser) return;
                  socket.emit("typing:start", { receiverId: activeUser.id });
                  clearTimeout(typingTimeoutRef.current);
                  typingTimeoutRef.current = setTimeout(() => {
                    socket.emit("typing:stop", { receiverId: activeUser.id });
                  }, 1500);
                }}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                placeholder="Type a message..."
              />
              <span className="send-btn-wrap">
                <button onClick={handleSend} disabled={!draft.trim()}>
                  Send
                </button>
                {sendBurst > 0 && (
                  <span className="heart-burst" key={sendBurst}>
                    <span>❤️</span><span>❤️</span><span>❤️</span>
                  </span>
                )}
              </span>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
