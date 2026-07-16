<div align="center">

```
███╗   ██╗███████╗ ██████╗ ███╗   ██╗
████╗  ██║██╔════╝██╔═══██╗████╗  ██║
██╔██╗ ██║█████╗  ██║   ██║██╔██╗ ██║
██║╚██╗██║██╔══╝  ██║   ██║██║╚██╗██║
██║ ╚████║███████╗╚██████╔╝██║ ╚████║
╚═╝  ╚═══╝╚══════╝ ╚═════╝ ╚═╝  ╚═══╝
        OVERDRIVE  ·  ONLINE POKER
```

**A real-time, full-stack multiplayer Texas Hold'em poker platform.**  
Private rooms · Custom stacks · Full hand evaluation · Side-pot engine

[![Node.js](https://img.shields.io/badge/Node.js-22-339933?style=flat-square&logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-4.7-010101?style=flat-square&logo=socketdotio&logoColor=white)](https://socket.io)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?style=flat-square&logo=mongodb&logoColor=white)](https://www.mongodb.com/cloud/atlas)
[![Railway](https://img.shields.io/badge/Deploy-Railway-0B0D0E?style=flat-square&logo=railway&logoColor=white)](https://railway.app)
[![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](LICENSE)

</div>

---

## ✨ Features

| Category | Details |
|---|---|
| 🃏 **Game Engine** | Full Texas Hold'em — Pre-Flop → Flop → Turn → River → Showdown |
| 🏦 **Custom Stacks** | Host sets starting chips per room; no global wallet |
| 🎰 **Side Pots** | Correct all-in side-pot splitting with remainder handling |
| ♟️ **Hand Evaluator** | 7-card best-hand detection: Royal Flush → High Card |
| 👥 **Up to 8 Players** | Dynamic seat positioning around an oval felt table |
| 🔄 **Rebuys** | Free top-up to starting stack when a player busts (or leave) |
| 🔐 **JWT Auth** | Secure sign-up / login with bcrypt password hashing |
| 🌐 **Real-time** | WebSocket-driven state sync via Socket.IO |
| 🎨 **Neon UI** | Dark glassmorphism aesthetic with micro-animations & sound FX |
| 🚀 **Railway Ready** | One-click deploy with `railway.json` included |

---

## 📸 Screenshots

> *Below: the game board during an active hand, the handover result screen, and the lobby.*

| Lobby | Active Hand | Hand Result |
|:---:|:---:|:---:|
| *(Join or create a private room)* | *(Felt table with live action dock)* | *(Pot breakdown & rebuy prompt)* |

---

## 🗂️ Project Structure

```
poker-webdev/
├── server.js          # Express + Socket.IO server, game state machine
├── engine.js          # Hand evaluator + side-pot calculator
├── railway.json       # Railway deployment config
├── package.json
├── .env.example       # Environment variable template
└── public/
    ├── index.html     # Single-page shell
    ├── app.js         # Full client — rendering, socket events, actions
    └── style.css      # Neon Overdrive design system (~60 KB CSS)
```

---

## 🚀 Quick Start

### Prerequisites
- [Node.js 18+](https://nodejs.org)
- A [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) cluster *(or run without one — falls back to in-memory)*

### 1 · Clone & Install

```bash
git clone https://github.com/LynxFlix/poker-webdev.git
cd poker-webdev
npm install
```

### 2 · Configure Environment

Copy the example env file and fill in your values:

```bash
cp .env.example .env
```

```env
# .env
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/?retryWrites=true&w=majority
JWT_SECRET=replace-me-with-a-long-random-secret
```

> **No MongoDB?** Leave `MONGODB_URI` blank. The server falls back to an in-memory user store that resets on restart — perfect for local testing.

### 3 · Run Locally

```bash
npm start
```

Open **http://localhost:8000** in your browser. 🎉

---

## 🎮 How to Play

```
1.  Sign up / Log in
       ↓
2.  Create a Table  →  set Small Blind, Big Blind, Starting Chips
       ↓
3.  Share the 5-character Room Code with friends
       ↓
4.  Host clicks "Deal First Hand" when ≥ 2 players are seated
       ↓
5.  Play!  FOLD · CHECK · CALL · RAISE · ALL-IN
       ↓
6.  Bust out?  Tap "🎁 Top Up & Stay" for a free rebuy
              or "← Leave Room" to go back to the lobby
```

### Action Dock

| Button | When available |
|---|---|
| **FOLD** | Always |
| **CHECK** | When no outstanding bet |
| **CALL `n`** | When facing a bet |
| **BET / RAISE TO `n`** | Use ▲ ▼ steppers or MIN / ½POT / POT / ALL IN presets |

---

## 🃏 Game Loop Reference

```
Shuffle Deck → Move Dealer Button → Post Blinds → Deal Hole Cards
   ↓
PRE_FLOP  →  FLOP  →  TURN  →  RIVER
   ↓
SHOWDOWN  (side-pot calculation + best-hand comparison)
   ↓
HANDOVER  (results screen, next hand or rebuy)
```

- **Side pots** are computed automatically for all-in players.
- **Tie-breaking** splits the pot equally with any odd chip going to the earliest position.
- A hand ends early (uncontested) if all players but one fold.

---

## ☁️ Deploy to Railway

1. Push this repo to GitHub.
2. Go to [railway.app](https://railway.app) → **New Project → Deploy from GitHub Repo**.
3. Select your repo; Railway auto-detects `railway.json`.
4. Add environment variables in the Railway dashboard:
   - `MONGODB_URI`
   - `JWT_SECRET`
5. Click **Deploy**. Railway assigns a public URL automatically.

> The `PORT` variable is injected by Railway at runtime — no changes needed.

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Runtime** | Node.js |
| **HTTP Server** | Express 4 |
| **Real-time** | Socket.IO 4 |
| **Database** | MongoDB Atlas via Mongoose |
| **Auth** | JWT (jsonwebtoken) + bcryptjs |
| **Frontend** | Vanilla HTML · CSS · JavaScript |
| **Deployment** | Railway (Nixpacks build) |

---

## 🔐 Security Notes

- Passwords are hashed with **bcrypt** (salt rounds = 8) before storage.
- Tokens are signed **JWT** with a configurable secret — set a strong `JWT_SECRET` in production.
- The server validates the acting player on every `game_action` event, preventing spoofed moves.
- Hole cards are **only sent to the owning player** — the state serializer masks opponents' cards.

---

## 🤝 Contributing

Pull requests are welcome! For significant changes, please open an issue first to discuss what you'd like to change.

1. Fork the repository
2. Create your feature branch: `git checkout -b feat/amazing-feature`
3. Commit your changes: `git commit -m 'feat: add amazing feature'`
4. Push to the branch: `git push origin feat/amazing-feature`
5. Open a Pull Request

---

## 📄 License

Distributed under the **MIT License**. See [`LICENSE`](LICENSE) for more information.

---

<div align="center">

Made with ♠ ♥ ♦ ♣ by **LynxFlix**

*If you like this project, give it a ⭐ on GitHub!*

</div>
