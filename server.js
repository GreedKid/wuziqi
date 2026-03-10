const path = require("path");
const fs = require("fs");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const multer = require("multer");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

const PORT = process.env.PORT || 3000;
const BOARD_SIZE = 15;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

const uploadDir = path.join(__dirname, "uploads");
const dataDir = path.join(__dirname, "data");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const notesPath = path.join(dataDir, "notes.json");
const messagesPath = path.join(dataDir, "messages.json");

function readNotes() {
  if (!fs.existsSync(notesPath)) {
    return {
      story: { text: "", updatedAt: null },
      today: { text: "", updatedAt: null },
    };
  }
  try {
    const raw = fs.readFileSync(notesPath, "utf8");
    const data = JSON.parse(raw);
    return {
      story: data.story || { text: "", updatedAt: null },
      today: data.today || { text: "", updatedAt: null },
    };
  } catch {
    return {
      story: { text: "", updatedAt: null },
      today: { text: "", updatedAt: null },
    };
  }
}

function writeNotes(notes) {
  fs.writeFileSync(notesPath, JSON.stringify(notes, null, 2), "utf8");
}

function readMessages() {
  if (!fs.existsSync(messagesPath)) return [];
  try {
    const raw = fs.readFileSync(messagesPath, "utf8");
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function writeMessages(messages) {
  fs.writeFileSync(messagesPath, JSON.stringify(messages, null, 2), "utf8");
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    const unique = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    cb(null, `${unique}-${safeName}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
});

app.get("/api/photos", (req, res) => {
  fs.readdir(uploadDir, (err, files) => {
    if (err) return res.status(500).json({ ok: false });
    const images = files
      .filter((name) => /\.(png|jpe?g|gif|webp)$/i.test(name))
      .sort()
      .reverse()
      .map((name) => `/uploads/${name}`);
    res.json({ ok: true, images });
  });
});

app.post("/api/photos", upload.array("photos", 12), (req, res) => {
  res.json({ ok: true });
});

app.delete("/api/photos/:name", (req, res) => {
  const name = path.basename(req.params.name || "");
  const target = path.join(uploadDir, name);
  if (!target.startsWith(uploadDir)) return res.status(400).json({ ok: false });
  if (fs.existsSync(target)) fs.unlinkSync(target);
  res.json({ ok: true });
});

app.get("/api/notes", (req, res) => {
  res.json({ ok: true, notes: readNotes() });
});

app.post("/api/notes", (req, res) => {
  const { story, today } = req.body || {};
  const notes = readNotes();
  if (story && typeof story.text === "string") {
    notes.story = { text: story.text.slice(0, 2000), updatedAt: new Date().toISOString() };
  }
  if (today && typeof today.text === "string") {
    notes.today = { text: today.text.slice(0, 1000), updatedAt: new Date().toISOString() };
  }
  writeNotes(notes);
  io.emit("notes", notes);
  res.json({ ok: true, notes });
});

app.get("/api/messages", (req, res) => {
  res.json({ ok: true, messages: readMessages() });
});

app.post("/api/messages", (req, res) => {
  const text = (req.body?.text || "").toString().trim();
  const author = (req.body?.author || "").toString().trim();
  if (!text) return res.status(400).json({ ok: false });
  const messages = readMessages();
  const msg = {
    id: `${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    text: text.slice(0, 300),
    author: author.slice(0, 20) || "未知",
    createdAt: new Date().toISOString(),
  };
  messages.unshift(msg);
  writeMessages(messages);
  io.emit("messages", messages);
  res.json({ ok: true, messages });
});

app.delete("/api/messages/:id", (req, res) => {
  const id = req.params.id;
  const messages = readMessages().filter((m) => m.id !== id);
  writeMessages(messages);
  io.emit("messages", messages);
  res.json({ ok: true, messages });
});

function emptyBoard() {
  return Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));
}

function checkWin(board, r, c, color) {
  const directions = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1],
  ];
  for (const [dr, dc] of directions) {
    let count = 1;
    let rr = r + dr;
    let cc = c + dc;
    while (rr >= 0 && rr < BOARD_SIZE && cc >= 0 && cc < BOARD_SIZE && board[rr][cc] === color) {
      count += 1;
      rr += dr;
      cc += dc;
    }
    rr = r - dr;
    cc = c - dc;
    while (rr >= 0 && rr < BOARD_SIZE && cc >= 0 && cc < BOARD_SIZE && board[rr][cc] === color) {
      count += 1;
      rr -= dr;
      cc -= dc;
    }
    if (count >= 5) return true;
  }
  return false;
}

const rooms = new Map();

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      board: emptyBoard(),
      turn: "B",
      players: { B: null, W: null },
      nextStarter: "B",
      winner: null,
      lastMove: null,
    });
  }
  return rooms.get(roomId);
}

function sanitizeRoomId(raw) {
  return (raw || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6);
}

io.on("connection", (socket) => {
  socket.on("join", (payload, cb) => {
    const roomId = sanitizeRoomId(payload?.roomId);
    if (!roomId) {
      cb?.({ ok: false, error: "需要房间号" });
      return;
    }
    socket.join(roomId);

    const room = getRoom(roomId);
    let role = "S";
    if (!room.players.B) {
      room.players.B = socket.id;
      role = "B";
    } else if (!room.players.W) {
      room.players.W = socket.id;
      role = "W";
    }

    socket.data.roomId = roomId;
    socket.data.role = role;

    cb?.({ ok: true, role });
    io.to(roomId).emit("state", {
      board: room.board,
      turn: room.turn,
      players: room.players,
      winner: room.winner,
      lastMove: room.lastMove,
    });
  });

  socket.on("move", (payload, cb) => {
    const roomId = socket.data.roomId;
    const role = socket.data.role;
    if (!roomId) return;
    const room = getRoom(roomId);
    const r = payload?.r;
    const c = payload?.c;
    if (room.winner) {
      cb?.({ ok: false, error: "对局已结束" });
      return;
    }
    if (role !== room.turn) {
      cb?.({ ok: false, error: "还没轮到你" });
      return;
    }
    if (typeof r !== "number" || typeof c !== "number") {
      cb?.({ ok: false, error: "落子无效" });
      return;
    }
    if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) {
      cb?.({ ok: false, error: "超出棋盘范围" });
      return;
    }
    if (room.board[r][c]) {
      cb?.({ ok: false, error: "该位置已被占用" });
      return;
    }

    room.board[r][c] = role;
    room.lastMove = { r, c, role };
    if (checkWin(room.board, r, c, role)) {
      room.winner = role;
    } else {
      room.turn = role === "B" ? "W" : "B";
    }

    io.to(roomId).emit("state", {
      board: room.board,
      turn: room.turn,
      players: room.players,
      winner: room.winner,
      lastMove: room.lastMove,
    });
    cb?.({ ok: true });
  });

  socket.on("reset", () => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const room = getRoom(roomId);
    const prevB = room.players.B;
    const prevW = room.players.W;
    room.players.B = prevW;
    room.players.W = prevB;
    if (room.players.B) {
      const s = io.sockets.sockets.get(room.players.B);
      if (s) s.data.role = "B";
      io.to(room.players.B).emit("role", { role: "B" });
    }
    if (room.players.W) {
      const s = io.sockets.sockets.get(room.players.W);
      if (s) s.data.role = "W";
      io.to(room.players.W).emit("role", { role: "W" });
    }
    room.board = emptyBoard();
    room.turn = "B";
    room.winner = null;
    room.lastMove = null;
    io.to(roomId).emit("state", {
      board: room.board,
      turn: room.turn,
      players: room.players,
      winner: room.winner,
      lastMove: room.lastMove,
    });
  });

  socket.on("disconnect", () => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const room = getRoom(roomId);
    if (room.players.B === socket.id) room.players.B = null;
    if (room.players.W === socket.id) room.players.W = null;
    io.to(roomId).emit("state", {
      board: room.board,
      turn: room.turn,
      players: room.players,
      winner: room.winner,
      lastMove: room.lastMove,
    });
  });
});

server.listen(PORT, () => {
  console.log(`五子棋服务已启动：http://localhost:${PORT}`);
});
