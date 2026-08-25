import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { connectSocket, getSocket } from "../socket.js";
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
          m.sender_id === me.id && m.receiver_id === byUserId ? { ...m, seen: true } : m
        )
      );
    });

    api.getUsers().then((all) => setUsers(all.filter((u) => u.id !== me.id)));

    return () => socket.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep a ref to activeUser so the socket listener (created once) can read the latest value
  const activeUserRef = useRef(null);
  useEffect(() => {
    activeUserRef.current = activeUser;
  }, [activeUser]);

  useEffect(() => {
    if (!activeUser) return;
    setShowStickers(false);
    api.getHistory(activeUser.id).then((history) => {
      setMessages(history);
      // Opening the conversation counts as seeing whatever they've sent so far.
      getSocket()?.emit("message:seen", { otherUserId: activeUser.id });
    });
  }, [activeUser]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function sendMessage(e) {
    e.preventDefault();
    if (!draft.trim() || !activeUser) return;
    getSocket().emit("message:send", {
      receiverId: activeUser.id,
      type: "text",
      content: draft.trim(),
    });
    setDraft("");
  }

  function sendSticker(emoji) {
    if (!activeUser) return;
    getSocket().emit("message:send", {
      receiverId: activeUser.id,
      type: "sticker",
      content: emoji,
    });
    setShowStickers(false);
  }

  async function handleFilePicked(e) {
    const file = e.target.files?.[0];
    e.target.value = ""; // let the same file be picked again later
    if (!file || !activeUser) return;

    setUploading(true);
    try {
      const { url, filename, kind } = await api.uploadFile(file);
      getSocket().emit("message:send", {
        receiverId: activeUser.id,
        type: kind, // "image" or "file"
        content: JSON.stringify({ url, filename }),
      });
    } catch (err) {
      alert(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function logout() {
    localStorage.clear();
    navigate("/login");
  }

  return (
    <div className="chat-layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <span className="wordmark small">whisper</span>
          <button className="logout" onClick={logout}>
            Log out
          </button>
        </div>
        <p className="me">Signed in as {me.username}</p>
        <ul className="contact-list">
          {users.map((u) => (
            <li
              key={u.id}
              className={activeUser?.id === u.id ? "contact active" : "contact"}
              onClick={() => setActiveUser(u)}
            >
              <span className={onlineIds.includes(u.id) ? "dot online" : "dot"} />
              {u.username}
            </li>
          ))}
          {users.length === 0 && <li className="empty">No other users yet.</li>}
        </ul>
      </aside>

      <main className="conversation">
        {!activeUser ? (
          <div className="empty-state">Pick someone to start whispering.</div>
        ) : (
          <>
            <header className="conversation-header">
              <span>{activeUser.username}</span>
              <CallWindow
              currentUserId={me.id}
              targetUserId={activeUser.id}
              targetName={activeUser.username}
             />
             </header> 
            <div className="message-list">
              {messages.map((m, i) => {
                const mine = m.sender_id === me.id;
                const isLastMine = mine && i === messages.length - 1;
                const bubbleClass =
                  m.type === "sticker"
                    ? "bubble sticker"
                    : m.type === "image" || m.type === "file"
                    ? mine
                      ? "bubble mine bubble-media"
                      : "bubble theirs bubble-media"
                    : mine
                    ? "bubble mine"
                    : "bubble theirs";

                return (
                  <div key={m.id} className="message-row">
                    <div className={bubbleClass}>
                      {renderMessageContent(m)}
                    </div>
                    {isLastMine && (
                      <span className="seen-status">{m.seen ? "Seen" : "Sent"}</span>
                    )}
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>
            {showStickers && (
              <div className="sticker-picker">
                {STICKERS.map((s) => (
                  <button key={s} type="button" className="sticker-option" onClick={() => sendSticker(s)}>
                    {s}
                  </button>
                ))}
              </div>
            )}
            <form className="composer" onSubmit={sendMessage}>
              <button
                type="button"
                className="sticker-toggle"
                onClick={() => setShowStickers((v) => !v)}
                aria-label="Stickers"
              >
                🙂
              </button>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFilePicked}
                style={{ display: "none" }}
              />
              <button
                type="button"
                className="attach-toggle"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                aria-label="Attach file"
                title="Share a photo or file"
              >
                {uploading ? "⏳" : "📎"}
              </button>
              <input
                placeholder="Type a message..."
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
              />
              <button type="submit">Send</button>
            </form>
          </>
        )}
      </main>
    </div>
  );
}
