.chat-page {
  display: flex;
  height: 100vh;
  background: #0f0f14;
  color: #e8e8ec;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

/* Sidebar */
.user-list {
  width: 260px;
  min-width: 260px;
  background: #16161d;
  border-right: 1px solid #26262f;
  padding: 16px;
  overflow-y: auto;
}

.user-list h3 {
  margin: 0 0 16px;
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #8a8a96;
}

.user-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  cursor: pointer;
  margin-bottom: 4px;
  transition: background 0.15s;
}

.user-item:hover {
  background: #1e1e28;
}

.user-item.active {
  background: #2a2a3d;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #4a4a56;
  flex-shrink: 0;
}

.status-dot.online {
  background: #34c759;
}

/* Main chat area */
.chat-window {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6a6a76;
  font-size: 15px;
}

.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-bottom: 1px solid #26262f;
  font-weight: 600;
  background: #16161d;
}

/* Messages */
.message-list {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.message {
  max-width: 60%;
  padding: 10px 14px;
  border-radius: 16px;
  line-height: 1.4;
  font-size: 14.5px;
  word-wrap: break-word;
}

.message.sent {
  align-self: flex-end;
  background: #5b5bd6;
  color: white;
  border-bottom-right-radius: 4px;
}

.message.received {
  align-self: flex-start;
  background: #24242e;
  color: #e8e8ec;
  border-bottom-left-radius: 4px;
}

.shared-image {
  max-width: 220px;
  border-radius: 10px;
  display: block;
  margin-top: 4px;
}

.shared-file {
  color: inherit;
  text-decoration: underline;
}

/* Sticker picker */
.sticker-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 10px 20px;
  border-top: 1px solid #26262f;
  background: #16161d;
}

.sticker-picker span {
  font-size: 22px;
  cursor: pointer;
  padding: 4px;
  border-radius: 8px;
}

.sticker-picker span:hover {
  background: #26262f;
}

/* Input bar */
.message-input {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 20px;
  border-top: 1px solid #26262f;
  background: #16161d;
}

.message-input input[type="text"] {
  flex: 1;
  background: #24242e;
  border: 1px solid #33333f;
  border-radius: 20px;
  padding: 10px 16px;
  color: #e8e8ec;
  font-size: 14.5px;
  outline: none;
}

.message-input input[type="text"]:focus {
  border-color: #5b5bd6;
}

.message-input button {
  background: #24242e;
  border: none;
  color: #e8e8ec;
  border-radius: 50%;
  width: 38px;
  height: 38px;
  font-size: 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.message-input button:hover {
  background: #33333f;
}

.message-input button:last-child {
  background: #5b5bd6;
  border-radius: 20px;
  width: auto;
  padding: 0 18px;
  font-weight: 600;
}

.message-input button:last-child:hover {
  background: #4a4ac2;
}