import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { connectSocket, getSocket } from "../socket.js";
import CallWindow from"../CallWindow";

export default function Chat() {
  const me = JSON.parse(localStorage.getItem("user"));
  const navigate = useNavigate();

  const [users, setUsers] = useState([]);
  const [onlineIds, setOnlineIds] = useState([]);
  const [activeUser, setActiveUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const bottomRef = useRef(null);

  // Connect socket once on mount
  useEffect(() => {
    const socket = connectSocket();

    socket.on("presence:update", (ids) => setOnlineIds(ids));

    socket.on("message:new", (msg) => {
      setMessages((prev) => {
        // Only append if it belongs to the currently open conversation
        const belongsToOpenChat =
          activeUserRef.current &&
          (msg.sender_id === activeUserRef.current.id || msg.receiver_id === activeUserRef.current.id);
        return belongsToOpenChat ? [...prev, msg] : prev;
      });
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
    api.getHistory(activeUser.id).then(setMessages);
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
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={m.sender_id === me.id ? "bubble mine" : "bubble theirs"}
                >
                  {m.content}
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
            <form className="composer" onSubmit={sendMessage}>
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
