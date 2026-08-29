# DAMN Messaging 💬

A self-hosted, real-time 1:1 messaging app. This phase covers: register/login,
online presence, and real-time text messaging. Media, stickers, and calls come
in later phases.

## How it works

- **server/** — Node + Express + Socket.io + SQLite. Handles auth (JWT) and
  real-time delivery. All data lives in `server/messaging-app.sqlite`, a
  single local file — delete it anytime to reset the app.
- **client/** — React (Vite). Talks to the server over REST (for
  login/history) and Socket.io (for live messages).

## Run it

**Terminal 1 — server:**
```
cd server
cp .env.example .env
npm install
npm run dev
```
Server runs on http://localhost:4000

**Terminal 2 — client:**
```
cd client
npm install
npm run dev
```
Client runs on http://localhost:5173

## Try it

1. Open http://localhost:5173 in two different browser windows (or one
   normal + one incognito, so you get two separate logins).
2. Register two different accounts.
3. Pick each other from the sidebar and send messages — they arrive live.

## What's next (say "next" when ready)

- **Phase 2**: media sharing — upload images/files into the chat
- **Phase 3**: stickers — a sticker picker sending sticker messages
- **Phase 4**: voice/video calls — WebRTC, using the signaling events already
  wired up in `server/sockets/chat.js` (`call:offer`, `call:answer`,
  `call:ice-candidate`, `call:end`)
- **Phase 5 (stretch)**: end-to-end encryption

## A note on "private"

Right now, messages travel only through your own server — no third party
sees them — and passwords are hashed, never stored in plain text. That's
solid privacy for a self-hosted app. What it does *not* yet have is
end-to-end encryption, meaning if someone got access to your server's
database, they could read message contents. Real E2EE (like Signal's
protocol) is a meaningful jump in complexity — worth doing once the core
app works, and I can walk you through it as a later phase.
