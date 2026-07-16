<div align="center">

# ♠ OVERDRIVE

### Real-Time Multiplayer Texas Hold'em Poker

A modern, full-stack multiplayer **Texas Hold'em** platform built with **Node.js**, **Express**, **Socket.IO**, and **MongoDB**.

**Private Rooms • Real-Time Gameplay • Side Pots • Hand Evaluator • Railway Ready**

<br>

[![Node.js](https://img.shields.io/badge/Node.js-22-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![Express](https://img.shields.io/badge/Express-4-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-4.7-010101?style=for-the-badge&logo=socketdotio&logoColor=white)](https://socket.io)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?style=for-the-badge&logo=mongodb&logoColor=white)](https://www.mongodb.com)
[![Railway](https://img.shields.io/badge/Railway-Deploy-0B0D0E?style=for-the-badge&logo=railway)](https://railway.app)
[![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](LICENSE)

---

### 🎮 Built for competitive online poker with a smooth real-time multiplayer experience.

</div>

---

# 📑 Table of Contents

- Features
- Screenshots
- Architecture
- Project Structure
- Installation
- Environment Variables
- Running Locally
- Gameplay
- Game Flow
- Tech Stack
- Security
- Deployment
- Roadmap
- Contributing
- License

---

# ✨ Features

## 🃏 Complete Texas Hold'em Engine

- Full Pre-Flop → Flop → Turn → River progression
- Dealer rotation
- Blind posting
- Betting rounds
- Automatic showdown
- Fold / Check / Call / Raise / All-In

---

## 🏦 Advanced Betting System

- Custom starting chips
- Small & Big Blind configuration
- Multiple all-ins
- Accurate side-pot calculation
- Split pot handling
- Odd-chip distribution

---

## 🧠 Hand Evaluation

Supports every official Texas Hold'em hand.

| Rank |
|------|
| Royal Flush |
| Straight Flush |
| Four of a Kind |
| Full House |
| Flush |
| Straight |
| Three of a Kind |
| Two Pair |
| One Pair |
| High Card |

Automatically finds the best **5-card hand** from **7 available cards**.

---

## 👥 Multiplayer

- Up to **8 players**
- Private room codes
- Live synchronized gameplay
- Dynamic seating
- Automatic dealer movement
- Instant reconnect support

---

## 🎨 User Experience

- Neon Glassmorphism Interface
- Responsive Layout
- Poker Sound Effects
- Smooth Animations
- Modern Dark Theme

---

## 🔐 Authentication

- JWT Login
- bcrypt Password Hashing
- Protected Socket Events
- Secure Room Access

---

# 🏗 Architecture

```
                 Browser
                     │
                     │
              Socket.IO Client
                     │
─────────────────────┼─────────────────────
                     │
             Express + Socket.IO
                     │
        Poker Game State Machine
                     │
      Hand Evaluator + Side Pots
                     │
                 MongoDB Atlas
```

---

# 📁 Project Structure

```
poker-webdev
│
├── server.js
│   Express + Socket.IO server
│
├── engine.js
│   Poker engine
│   Hand evaluator
│   Side-pot calculator
│
├── package.json
├── railway.json
├── .env.example
│
└── public
    │
    ├── index.html
    ├── app.js
    └── style.css
```

---

# 🚀 Installation

## 1. Clone Repository

```bash
git clone https://github.com/LynxFlix/poker-webdev.git

cd poker-webdev
```

---

## 2. Install Dependencies

```bash
npm install
```

---

## 3. Configure Environment

```bash
cp .env.example .env
```

Example:

```env
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/

JWT_SECRET=replace-with-a-long-random-secret
```

If `MONGODB_URI` is left empty, the application automatically falls back to an in-memory database suitable for local development.

---

## 4. Run

```bash
npm start
```

Open

```
http://localhost:8000
```

---

# 🎮 Gameplay

```
Sign Up
     │
Login
     │
Create Room
     │
Configure Blinds
     │
Configure Starting Chips
     │
Invite Friends
     │
Players Join
     │
Host Starts Game
     │
Poker Begins
```

---

## Available Actions

| Action | Description |
|---------|-------------|
| Fold | Leave the current hand |
| Check | Pass when no bet exists |
| Call | Match current bet |
| Raise | Increase current bet |
| All-In | Bet remaining stack |

Quick Raise Presets

- MIN
- ½ POT
- POT
- ALL-IN

---

# 🔄 Complete Game Flow

```
Shuffle Deck
      │
Dealer Button
      │
Post Blinds
      │
Deal Hole Cards
      │
──────────────────────
Pre-Flop
      │
Flop
      │
Turn
      │
River
──────────────────────
Showdown
      │
Evaluate Hands
      │
Calculate Side Pots
      │
Distribute Chips
      │
Next Hand
```

Special cases handled automatically

- Multiple all-ins
- Side pots
- Split pots
- Tie breakers
- Everyone folds
- Rebuy after elimination

---

# ⚡ Performance

- Lightweight client
- Fast 7-card evaluator
- Efficient room synchronization
- Minimal Socket.IO payloads
- Optimized state updates

---

# 🛠 Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js |
| Backend | Express |
| Realtime | Socket.IO |
| Database | MongoDB Atlas |
| ODM | Mongoose |
| Authentication | JWT |
| Password Hashing | bcryptjs |
| Frontend | HTML CSS JavaScript |
| Deployment | Railway |

---

# 🔒 Security

✔ bcrypt password hashing

✔ JWT authentication

✔ Server-side action validation

✔ Hidden opponent hole cards

✔ Room ownership verification

✔ Protected socket events

✔ Secure game state serialization

---

# ☁ Deployment

## Railway

1. Push repository to GitHub

2. Create Railway Project

3. Deploy from GitHub

4. Add Environment Variables

```
MONGODB_URI
JWT_SECRET
```

5. Deploy

Railway automatically assigns a public URL.

---

# 🛣 Roadmap

- [x] Multiplayer
- [x] Poker Engine
- [x] Side Pots
- [x] JWT Authentication
- [x] Railway Deployment
- [ ] Spectator Mode
- [ ] Tournament Mode
- [ ] Friend System
- [ ] Player Statistics
- [ ] Hand History
- [ ] Mobile Layout
- [ ] Sound Settings
- [ ] AI Bots

---

# 🤝 Contributing

Contributions are welcome.

1. Fork repository

2. Create feature branch

```bash
git checkout -b feature/my-feature
```

3. Commit

```bash
git commit -m "feat: amazing feature"
```

4. Push

```bash
git push origin feature/my-feature
```

5. Open Pull Request

---

# 📄 License

Licensed under the **MIT License**.

See the `LICENSE` file for details.

---

<div align="center">

# ♠ OVERDRIVE

### Modern Multiplayer Texas Hold'em

Built with ❤️ by **LynxFlix** *&* **Mjölnir782**

⭐ **If you enjoyed this project, consider giving it a Star on GitHub!**

---

*"Play Smart. Play Fair. Play Overdrive."*

</div>
````
