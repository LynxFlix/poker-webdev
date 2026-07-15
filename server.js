const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { MongoClient } = require('mongodb');

const {
  makeDeck, shuffle, evaluateBest, compareScores, describeScore, computeSidePots
} = require('./engine');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 8000;
const JWT_SECRET = process.env.JWT_SECRET || 'poker-super-secret-lobby-key';
const MONGODB_URI = process.env.MONGODB_URI;

// ---------------- Database Setup (MongoDB) ----------------
let db = null;

async function connectDB() {
  if (!MONGODB_URI) {
    console.warn('⚠️  No MONGODB_URI set. Using in-memory user store (data will reset on restart).');
    return;
  }
  try {
    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db('poker');
    console.log('✅ Connected to MongoDB Atlas');
  } catch (err) {
    console.error('❌ MongoDB connection failed:', err.message);
    console.warn('⚠️  Falling back to in-memory user store.');
  }
}

// In-memory fallback (for local dev without MongoDB)
const memUsers = {};

async function loadUser(username) {
  if (db) {
    return await db.collection('users').findOne({ _id: username });
  }
  return memUsers[username] || null;
}

async function saveUser(username, data) {
  if (db) {
    await db.collection('users').updateOne(
      { _id: username },
      { $set: { ...data, _id: username } },
      { upsert: true }
    );
  } else {
    memUsers[username] = data;
  }
}

async function updateUserBalance(username, balance) {
  if (db) {
    await db.collection('users').updateOne({ _id: username }, { $set: { balance } });
  } else {
    if (memUsers[username]) memUsers[username].balance = balance;
  }
}

// ---------------- REST APIs for Auth ----------------
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/signup', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  const cleanUsername = username.trim();
  if (cleanUsername.length < 3 || cleanUsername.length > 12) {
    return res.status(400).json({ error: 'Username must be 3-12 characters' });
  }

  const lowerName = cleanUsername.toLowerCase();
  const existing = await loadUser(lowerName);
  if (existing) {
    return res.status(400).json({ error: 'Username already exists' });
  }

  const hashedPassword = bcrypt.hashSync(password, 8);
  await saveUser(lowerName, {
    username: cleanUsername,
    password: hashedPassword,
    balance: 5000
  });

  const token = jwt.sign({ username: cleanUsername }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, username: cleanUsername, balance: 5000 });
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  const cleanUsername = username.trim();
  const lowerName = cleanUsername.toLowerCase();
  const user = await loadUser(lowerName);

  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(400).json({ error: 'Invalid username or password' });
  }

  const token = jwt.sign({ username: user.username }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, username: user.username, balance: user.balance });
});

// ---------------- Game Rooms State ----------------
const rooms = {};

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return rooms[code] ? generateRoomCode() : code;
}

function handleFold(room, player) {
  player.folded = true;
  room.toActQueue = room.toActQueue.filter(id => id !== player.id);
  logMsg(room, `${player.name} folds`);
}

function logMsg(room, msg) {
  room.log.unshift(msg);
  if (room.log.length > 30) room.log.pop();
}

function playerById(room, id) {
  return room.players.find(p => p.id === id);
}

function nonFoldedPlayers(room) {
  return room.ring.map(id => playerById(room, id)).filter(p => p && !p.folded);
}

function nextDealer(room) {
  const n = room.players.length;
  let idx = room.dealerIndex;
  for (let i = 0; i < n; i++) {
    idx = (idx + 1) % n;
    if (room.players[idx].chips > 0) return idx;
  }
  return room.dealerIndex;
}

function postBlind(player, amount) {
  const pay = Math.min(amount, player.chips);
  player.chips -= pay;
  player.currentBet += pay;
  player.totalContributed += pay;
  if (player.chips === 0) player.allIn = true;
}

function buildQueueFrom(room, pos) {
  const q = [];
  const n = room.ring.length;
  for (let i = 0; i < n; i++) {
    const id = room.ring[(pos + i) % n];
    const p = playerById(room, id);
    if (p && !p.folded && !p.allIn) q.push(id);
  }
  return q;
}

function applyBet(room, player, targetTotal) {
  const maxTotal = player.currentBet + player.chips;
  targetTotal = Math.min(targetTotal, maxTotal);
  const delta = targetTotal - player.currentBet;
  player.chips -= delta;
  player.totalContributed += delta;
  player.currentBet = targetTotal;
  if (player.chips === 0) player.allIn = true;

  if (targetTotal > room.currentBet) {
    const raiseAmount = targetTotal - room.currentBet;
    room.currentBet = targetTotal;
    room.minRaiseIncrement = Math.max(room.minRaiseIncrement, raiseAmount);
    const pos = room.ring.indexOf(player.id);
    room.toActQueue = buildQueueFrom(room, (pos + 1) % room.ring.length);
    return;
  }
  room.toActQueue = room.toActQueue.filter(id => id !== player.id);
}

function dealStreetCards(room) {
  if (room.community.length === 0) {
    room.community.push(room.deck.pop(), room.deck.pop(), room.deck.pop());
    room.street = 'flop';
  } else if (room.community.length === 3) {
    room.community.push(room.deck.pop());
    room.street = 'turn';
  } else if (room.community.length === 4) {
    room.community.push(room.deck.pop());
    room.street = 'river';
  }
}

function dealRemainingBoardThenShowdown(room) {
  while (room.community.length < 5) {
    dealStreetCards(room);
  }
  room.street = 'river';
  goToShowdown(room);
}

function resolveNoMoreBetting(room) {
  const remaining = nonFoldedPlayers(room);
  if (remaining.length === 1) { concludeUncontested(room, remaining[0]); return; }
  dealRemainingBoardThenShowdown(room);
}

function advanceStreet(room) {
  if (room.street === 'river') { goToShowdown(room); return; }

  room.ring.forEach(id => {
    const p = playerById(room, id);
    if (p) p.currentBet = 0;
  });
  room.currentBet = 0;
  room.minRaiseIncrement = room.bigBlind;

  dealStreetCards(room);

  const canAct = room.ring.map(id => playerById(room, id)).filter(p => p && !p.folded && !p.allIn);
  if (canAct.length <= 1) {
    if (nonFoldedPlayers(room).length === 1) { concludeUncontested(room, nonFoldedPlayers(room)[0]); return; }
    if (room.street === 'river') { goToShowdown(room); return; }
    advanceStreet(room);
    return;
  }

  const sbPos = room.ring.length === 2 ? 0 : 1;
  room.toActQueue = buildQueueFrom(room, sbPos);
  room.actingId = room.toActQueue[0];
  logMsg(room, `Board updated: ${room.street.toUpperCase()}`);
  broadcastRoomState(room);
}

function advanceTurn(room) {
  const remaining = nonFoldedPlayers(room);
  if (remaining.length === 1) { concludeUncontested(room, remaining[0]); return; }

  if (room.toActQueue.length === 0) {
    advanceStreet(room);
  } else {
    room.actingId = room.toActQueue[0];
    broadcastRoomState(room);
  }
}

function concludeUncontested(room, winner) {
  const total = room.players.reduce((s, p) => s + p.totalContributed, 0);
  winner.chips += total;
  logMsg(room, `${winner.name} wins pot of ${total} chips (uncontested)`);

  room.handoverResult = {
    uncontested: true,
    board: room.community.slice(),
    pots: [{ amount: total, winners: [{ name: winner.name, amount: total }] }],
    shows: [],
  };
  room.screen = 'handover';
  updateUserDatabaseBalances(room);
  broadcastRoomState(room);
}

function goToShowdown(room) {
  const potInputs = room.ring.map(id => {
    const p = playerById(room, id);
    return { id: p.id, folded: p.folded, totalContributed: p.totalContributed };
  });
  const pots = computeSidePots(potInputs);

  const shows = nonFoldedPlayers(room).map(p => {
    const best = evaluateBest(p.holeCards, room.community);
    return { id: p.id, name: p.name, holeCards: p.holeCards, score: best.score, desc: describeScore(best.score), bestCards: best.cards };
  });

  const potResults = pots.map(pot => {
    const eligible = shows.filter(s => pot.eligibleIds.includes(s.id));
    if (eligible.length === 0) return { amount: pot.amount, winners: [] };
    let best = eligible[0];
    for (const e of eligible) if (compareScores(e.score, best.score) > 0) best = e;
    const winners = eligible.filter(e => compareScores(e.score, best.score) === 0);
    const share = Math.floor(pot.amount / winners.length);
    let remainder = pot.amount - share * winners.length;
    const winnerResults = winners.map((w, i) => {
      const amount = share + (i < remainder ? 1 : 0);
      const p = playerById(room, w.id);
      if (p) p.chips += amount;
      return { name: w.name, amount, desc: w.desc };
    });
    return { amount: pot.amount, winners: winnerResults };
  });

  potResults.forEach(pr => {
    pr.winners.forEach(w => logMsg(room, `${w.name} wins ${w.amount} with ${w.desc}`));
  });

  room.handoverResult = {
    uncontested: false,
    board: room.community.slice(),
    pots: potResults,
    shows,
  };
  room.screen = 'handover';
  updateUserDatabaseBalances(room);
  broadcastRoomState(room);
}

function startHand(room) {
  const contenders = room.players.filter(p => p.chips > 0);
  if (contenders.length <= 1) {
    room.screen = 'gameover';
    logMsg(room, `Game over! Not enough active players.`);
    broadcastRoomState(room);
    return;
  }

  room.handNumber++;
  room.players.forEach(p => {
    p.folded = p.chips <= 0;
    p.allIn = false;
    p.currentBet = 0;
    p.totalContributed = 0;
    p.holeCards = [];
  });

  room.dealerIndex = nextDealer(room);
  const n = room.players.length;
  const ring = [];
  for (let i = 0; i < n; i++) {
    const idx = (room.dealerIndex + i) % n;
    if (room.players[idx].chips > 0) ring.push(room.players[idx].id);
  }
  room.ring = ring;

  room.deck = shuffle(makeDeck());
  ring.forEach(id => {
    const p = playerById(room, id);
    p.holeCards = [room.deck.pop(), room.deck.pop()];
  });

  const sbPos = ring.length === 2 ? 0 : 1;
  const bbPos = ring.length === 2 ? 1 : 2;

  const sbPlayer = playerById(room, ring[sbPos]);
  const bbPlayer = playerById(room, ring[bbPos]);
  postBlind(sbPlayer, room.smallBlind);
  postBlind(bbPlayer, room.bigBlind);

  room.community = [];
  room.street = 'preflop';
  room.currentBet = bbPlayer.currentBet;
  room.minRaiseIncrement = room.bigBlind;

  const firstActPos = (bbPos + 1) % ring.length;
  room.toActQueue = buildQueueFrom(room, firstActPos);

  logMsg(room, `— Hand #${room.handNumber} — ${sbPlayer.name} SB ${room.smallBlind}, ${bbPlayer.name} BB ${room.bigBlind}`);

  if (room.toActQueue.length <= 1) {
    resolveNoMoreBetting(room);
  } else {
    room.actingId = room.toActQueue[0];
    room.screen = 'reveal';
  }
  broadcastRoomState(room);
}

function updateUserDatabaseBalances(room) {
  room.players.forEach(p => {
    updateUserBalance(p.id.toLowerCase(), p.chips).catch(err => {
      console.error('Failed to update balance for', p.id, err.message);
    });
  });
}

// ---------------- Secure State Serializer ----------------
function serializeStateForPlayer(room, targetUsername) {
  const serializedPlayers = room.players.map(p => {
    const isTarget = p.id === targetUsername;
    const revealCards = (room.screen === 'handover') || isTarget;
    const showHole = revealCards && !p.folded && p.holeCards && p.holeCards.length === 2;

    return {
      id: p.id,
      name: p.name,
      chips: p.chips,
      folded: p.folded,
      allIn: p.allIn,
      currentBet: p.currentBet,
      totalContributed: p.totalContributed,
      holeCards: showHole ? p.holeCards : null,
      connected: !!p.socketId
    };
  });

  return {
    screen: room.screen,
    code: room.code,
    creator: room.creator,
    smallBlind: room.smallBlind,
    bigBlind: room.bigBlind,
    startingChips: room.startingChips,
    players: serializedPlayers,
    dealerIndex: room.dealerIndex,
    community: room.community,
    street: room.street,
    currentBet: room.currentBet,
    minRaiseIncrement: room.minRaiseIncrement,
    ring: room.ring,
    toActQueue: room.toActQueue,
    actingId: room.actingId,
    handNumber: room.handNumber,
    log: room.log,
    handoverResult: room.screen === 'handover' ? room.handoverResult : null
  };
}

function broadcastRoomState(room) {
  room.players.forEach(p => {
    if (p.socketId) {
      const stateUpdate = serializeStateForPlayer(room, p.id);
      io.to(p.socketId).emit('state_update', stateUpdate);
    }
  });
}

// ---------------- WebSockets (Socket.io) ----------------
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Auth token required'));
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return next(new Error('Invalid token'));
    socket.username = decoded.username;
    next();
  });
});

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.username} (${socket.id})`);

  socket.on('join_room', async (data, callback) => {
    const { code } = data;
    const cleanCode = code ? code.trim().toUpperCase() : '';
    const room = rooms[cleanCode];

    if (!room) {
      return callback({ error: 'Room not found' });
    }

    if (room.status === 'active' && !playerById(room, socket.username)) {
      return callback({ error: 'Game already started in this room' });
    }

    if (room.players.length >= 8 && !playerById(room, socket.username)) {
      return callback({ error: 'Room is full' });
    }

    let player = playerById(room, socket.username);
    if (!player) {
      const user = await loadUser(socket.username.toLowerCase());
      const chips = user ? user.balance : room.startingChips;

      player = {
        id: socket.username,
        name: socket.username,
        chips: chips,
        holeCards: [],
        folded: false,
        allIn: false,
        currentBet: 0,
        totalContributed: 0,
        socketId: socket.id
      };
      room.players.push(player);
    } else {
      player.socketId = socket.id;
    }

    socket.roomCode = cleanCode;
    socket.join(cleanCode);

    logMsg(room, `${socket.username} joined the table`);
    callback({ success: true, roomCode: cleanCode });
    broadcastRoomState(room);
  });

  socket.on('create_room', (data, callback) => {
    const { smallBlind, bigBlind, startingChips } = data;
    const roomCode = generateRoomCode();

    const sb = Math.max(1, Number(smallBlind) || 5);
    const bb = Math.max(sb + 1, Number(bigBlind) || 10);
    const chips = Math.max(10, Number(startingChips) || 1000);

    const room = {
      code: roomCode,
      creator: socket.username,
      status: 'waiting',
      screen: 'setup',
      smallBlind: sb,
      bigBlind: bb,
      startingChips: chips,
      players: [],
      dealerIndex: -1,
      deck: [],
      community: [],
      street: 'preflop',
      currentBet: 0,
      minRaiseIncrement: bb,
      ring: [],
      toActQueue: [],
      actingId: null,
      handNumber: 0,
      log: [],
      handoverResult: null
    };

    rooms[roomCode] = room;

    const player = {
      id: socket.username,
      name: socket.username,
      chips: chips,
      holeCards: [],
      folded: false,
      allIn: false,
      currentBet: 0,
      totalContributed: 0,
      socketId: socket.id
    };
    room.players.push(player);

    socket.roomCode = roomCode;
    socket.join(roomCode);

    logMsg(room, `Room created by ${socket.username}`);
    callback({ success: true, roomCode });
    broadcastRoomState(room);
  });

  socket.on('start_game', (callback) => {
    const room = rooms[socket.roomCode];
    if (!room) return callback({ error: 'Room not found' });
    if (room.creator !== socket.username) return callback({ error: 'Only creator can start' });
    if (room.players.length < 2) return callback({ error: 'Need at least 2 players to start' });

    room.status = 'active';
    startHand(room);
    callback({ success: true });
  });

  socket.on('game_action', (data) => {
    const room = rooms[socket.roomCode];
    if (!room || room.status !== 'active') return;
    if (room.actingId !== socket.username) return;

    const { type, amount } = data;
    const player = playerById(room, socket.username);

    if (type === 'fold') {
      handleFold(room, player);
    } else if (type === 'check') {
      logMsg(room, `${player.name} checks`);
      applyBet(room, player, player.currentBet);
    } else if (type === 'call') {
      const callTo = room.currentBet;
      logMsg(room, `${player.name} calls ${callTo - player.currentBet}`);
      applyBet(room, player, callTo);
    } else if (type === 'bet' || type === 'raise') {
      logMsg(room, `${player.name} ${type}s to ${amount}${amount === player.currentBet + player.chips ? ' (all in)' : ''}`);
      applyBet(room, player, amount);
    } else if (type === 'allin') {
      const total = player.currentBet + player.chips;
      logMsg(room, `${player.name} goes all in for ${total}`);
      applyBet(room, player, total);
    }

    advanceTurn(room);
  });

  socket.on('next_hand', () => {
    const room = rooms[socket.roomCode];
    if (!room || room.screen !== 'handover') return;
    if (room.creator !== socket.username) return;

    room.players = room.players.filter(p => p.chips > 0);
    startHand(room);
  });

  socket.on('leave_room', () => {
    handleDisconnect(socket);
  });

  socket.on('disconnect', () => {
    handleDisconnect(socket);
  });
});

function handleDisconnect(socket) {
  const room = rooms[socket.roomCode];
  if (!room) return;

  const player = playerById(room, socket.username);
  if (player) {
    if (room.status === 'waiting') {
      room.players = room.players.filter(p => p.id !== socket.username);
      logMsg(room, `${socket.username} left the room`);
    } else {
      player.socketId = null;
      logMsg(room, `${socket.username} disconnected`);

      if (room.actingId === socket.username) {
        setTimeout(() => {
          const currentRoom = rooms[socket.roomCode];
          if (currentRoom && currentRoom.actingId === socket.username) {
            const curP = playerById(currentRoom, socket.username);
            if (curP && !curP.socketId) {
              const toCall = currentRoom.currentBet - curP.currentBet;
              if (toCall > 0) {
                handleFold(currentRoom, curP);
              } else {
                logMsg(currentRoom, `${curP.name} checks (auto-action)`);
                applyBet(currentRoom, curP, curP.currentBet);
              }
              advanceTurn(currentRoom);
            }
          }
        }, 1000);
      }
    }
    broadcastRoomState(room);
  }
}

// ---------------- Start Server ----------------
connectDB().then(() => {
  server.listen(PORT, () => {
    console.log(`Server is running locally at http://localhost:${PORT}`);
  });
});
