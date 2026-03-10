const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const multer = require("multer");
const { createClient } = require("@supabase/supabase-js");

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

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || "photos";
const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : null;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

function emptyNotes() {
  return {
    story: { text: "", updatedAt: null },
    today: { text: "", updatedAt: null },
  };
}

function sanitizeFilename(name) {
  return (name || "photo").replace(/[^a-zA-Z0-9._-]/g, "_");
}

async function readNotesSupabase() {
  if (!supabase) return emptyNotes();
  const { data, error } = await supabase.from("notes").select("key,text,updated_at");
  if (error) throw error;
  const notes = emptyNotes();
  (data || []).forEach((row) => {
    if (row.key === "story") {
      notes.story = { text: row.text || "", updatedAt: row.updated_at || null };
    }
    if (row.key === "today") {
      notes.today = { text: row.text || "", updatedAt: row.updated_at || null };
    }
  });
  return notes;
}

async function writeNotesSupabase(storyText, todayText) {
  if (!supabase) return emptyNotes();
  const now = new Date().toISOString();
  const rows = [];
  if (typeof storyText === "string") {
    rows.push({ key: "story", text: storyText.slice(0, 2000), updated_at: now });
  }
  if (typeof todayText === "string") {
    rows.push({ key: "today", text: todayText.slice(0, 1000), updated_at: now });
  }
  if (rows.length === 0) return readNotesSupabase();
  const { error } = await supabase.from("notes").upsert(rows, { onConflict: "key" });
  if (error) throw error;
  return readNotesSupabase();
}

async function readMessagesSupabase() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("messages")
    .select("id,text,author,created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data || []).map((row) => ({
    id: row.id,
    text: row.text,
    author: row.author,
    createdAt: row.created_at,
  }));
}

async function addMessageSupabase(text, author) {
  if (!supabase) return [];
  const msg = {
    id: `${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    text: text.slice(0, 300),
    author: (author || "未知").slice(0, 20),
    created_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("messages").insert(msg);
  if (error) throw error;
  return readMessagesSupabase();
}

async function deleteMessageSupabase(id) {
  if (!supabase) return [];
  const { error } = await supabase.from("messages").delete().eq("id", id);
  if (error) throw error;
  return readMessagesSupabase();
}

async function listPhotosSupabase() {
  if (!supabase) return [];
  const { data, error } = await supabase.storage.from(SUPABASE_BUCKET).list("", {
    limit: 200,
    offset: 0,
    sortBy: { column: "name", order: "desc" },
  });
  if (error) throw error;
  const items = (data || []).filter((item) => /\.(png|jpe?g|gif|webp)$/i.test(item.name));
  return items.map((item) => {
    const { data: publicData } = supabase.storage.from(SUPABASE_BUCKET).getPublicUrl(item.name);
    return publicData.publicUrl;
  });
}

async function uploadPhotosSupabase(files) {
  if (!supabase || !files || files.length === 0) return;
  for (const file of files) {
    const safeName = sanitizeFilename(file.originalname);
    const unique = `${Date.now()}-${Math.floor(Math.random() * 1e6)}-${safeName}`;
    const { error } = await supabase.storage.from(SUPABASE_BUCKET).upload(unique, file.buffer, {
      contentType: file.mimetype,
      upsert: false,
    });
    if (error) throw error;
  }
}

async function deletePhotoSupabase(nameOrUrl) {
  if (!supabase) return;
  const raw = nameOrUrl || "";
  const name = path.basename(raw.split("?")[0] || "");
  if (!name) return;
  const { error } = await supabase.storage.from(SUPABASE_BUCKET).remove([name]);
  if (error) throw error;
}

app.get("/api/photos", async (req, res) => {
  try {
    const images = await listPhotosSupabase();
    res.json({ ok: true, images });
  } catch (err) {
    res.status(500).json({ ok: false, error: err?.message || "photo_list_failed" });
  }
});

app.post("/api/photos", upload.array("photos", 12), async (req, res) => {
  try {
    await uploadPhotosSupabase(req.files || []);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err?.message || "photo_upload_failed" });
  }
});

app.delete("/api/photos/:name", async (req, res) => {
  try {
    await deletePhotoSupabase(req.params.name || "");
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err?.message || "photo_delete_failed" });
  }
});

app.get("/api/notes", async (req, res) => {
  try {
    const notes = await readNotesSupabase();
    res.json({ ok: true, notes });
  } catch (err) {
    res.status(500).json({ ok: false, error: err?.message || "notes_load_failed" });
  }
});

app.post("/api/notes", async (req, res) => {
  try {
    const { story, today } = req.body || {};
    const notes = await writeNotesSupabase(story?.text, today?.text);
    io.emit("notes", notes);
    res.json({ ok: true, notes });
  } catch (err) {
    res.status(500).json({ ok: false, error: err?.message || "notes_save_failed" });
  }
});

app.get("/api/messages", async (req, res) => {
  try {
    const messages = await readMessagesSupabase();
    res.json({ ok: true, messages });
  } catch (err) {
    res.status(500).json({ ok: false, error: err?.message || "messages_load_failed" });
  }
});

app.post("/api/messages", async (req, res) => {
  try {
    const text = (req.body?.text || "").toString().trim();
    const author = (req.body?.author || "").toString().trim();
    if (!text) return res.status(400).json({ ok: false });
    const messages = await addMessageSupabase(text, author);
    io.emit("messages", messages);
    res.json({ ok: true, messages });
  } catch (err) {
    res.status(500).json({ ok: false, error: err?.message || "messages_save_failed" });
  }
});

app.delete("/api/messages/:id", async (req, res) => {
  try {
    const messages = await deleteMessageSupabase(req.params.id);
    io.emit("messages", messages);
    res.json({ ok: true, messages });
  } catch (err) {
    res.status(500).json({ ok: false, error: err?.message || "messages_delete_failed" });
  }
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
      aiEnabled: false,
      aiRole: null,
      aiTimeout: null,
    });
  }
  return rooms.get(roomId);
}

function emitState(roomId) {
  const room = getRoom(roomId);
  io.to(roomId).emit("state", {
    board: room.board,
    turn: room.turn,
    players: room.players,
    winner: room.winner,
    lastMove: room.lastMove,
    aiEnabled: room.aiEnabled,
    aiRole: room.aiRole,
  });
}

function otherRole(role) {
  return role === "B" ? "W" : "B";
}

function countPlayers(room) {
  return (room.players.B ? 1 : 0) + (room.players.W ? 1 : 0);
}

function analyzeLine(board, r, c, dr, dc, role) {
  let countA = 0;
  let rr = r + dr;
  let cc = c + dc;
  while (rr >= 0 && rr < BOARD_SIZE && cc >= 0 && cc < BOARD_SIZE && board[rr][cc] === role) {
    countA += 1;
    rr += dr;
    cc += dc;
  }
  const openA = rr >= 0 && rr < BOARD_SIZE && cc >= 0 && cc < BOARD_SIZE && !board[rr][cc];

  let countB = 0;
  rr = r - dr;
  cc = c - dc;
  while (rr >= 0 && rr < BOARD_SIZE && cc >= 0 && cc < BOARD_SIZE && board[rr][cc] === role) {
    countB += 1;
    rr -= dr;
    cc -= dc;
  }
  const openB = rr >= 0 && rr < BOARD_SIZE && cc >= 0 && cc < BOARD_SIZE && !board[rr][cc];

  return { total: countA + countB + 1, open: (openA ? 1 : 0) + (openB ? 1 : 0) };
}

function lineScore(total, open) {
  if (total >= 5) return 1000000;
  if (total === 4 && open === 2) return 100000;
  if (total === 4 && open === 1) return 10000;
  if (total === 3 && open === 2) return 2000;
  if (total === 3 && open === 1) return 200;
  if (total === 2 && open === 2) return 100;
  if (total === 2 && open === 1) return 10;
  if (total === 1 && open === 2) return 5;
  return 1;
}

function evaluatePoint(board, r, c, role) {
  const dirs = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1],
  ];
  let score = 0;
  for (const [dr, dc] of dirs) {
    const info = analyzeLine(board, r, c, dr, dc, role);
    score += lineScore(info.total, info.open);
  }
  return score;
}

function isWinningMove(board, r, c, role) {
  board[r][c] = role;
  const win = checkWin(board, r, c, role);
  board[r][c] = null;
  return win;
}

function findBestMove(board, aiRole) {
  const humanRole = otherRole(aiRole);
  let hasStone = false;
  for (let r = 0; r < BOARD_SIZE; r += 1) {
    for (let c = 0; c < BOARD_SIZE; c += 1) {
      if (board[r][c]) {
        hasStone = true;
        break;
      }
    }
    if (hasStone) break;
  }
  if (!hasStone) {
    const center = Math.floor(BOARD_SIZE / 2);
    return { r: center, c: center };
  }

  for (let r = 0; r < BOARD_SIZE; r += 1) {
    for (let c = 0; c < BOARD_SIZE; c += 1) {
      if (board[r][c]) continue;
      if (isWinningMove(board, r, c, aiRole)) return { r, c };
    }
  }
  for (let r = 0; r < BOARD_SIZE; r += 1) {
    for (let c = 0; c < BOARD_SIZE; c += 1) {
      if (board[r][c]) continue;
      if (isWinningMove(board, r, c, humanRole)) return { r, c };
    }
  }

  let best = null;
  let bestScore = -Infinity;
  const center = (BOARD_SIZE - 1) / 2;
  for (let r = 0; r < BOARD_SIZE; r += 1) {
    for (let c = 0; c < BOARD_SIZE; c += 1) {
      if (board[r][c]) continue;
      const scoreAI = evaluatePoint(board, r, c, aiRole);
      const scoreHuman = evaluatePoint(board, r, c, humanRole);
      const dist = Math.abs(r - center) + Math.abs(c - center);
      const score = scoreAI * 1.15 + scoreHuman - dist * 0.8;
      if (score > bestScore) {
        bestScore = score;
        best = { r, c };
      }
    }
  }
  return best;
}

function aiCanMove(room) {
  return room.aiEnabled && room.aiRole && !room.winner && room.turn === room.aiRole;
}

function scheduleAi(roomId) {
  const room = getRoom(roomId);
  if (!aiCanMove(room)) return;
  if (room.aiTimeout) clearTimeout(room.aiTimeout);
  room.aiTimeout = setTimeout(() => {
    room.aiTimeout = null;
    if (!aiCanMove(room)) return;
    const move = findBestMove(room.board, room.aiRole);
    if (!move) return;
    room.board[move.r][move.c] = room.aiRole;
    room.lastMove = { r: move.r, c: move.c, role: room.aiRole };
    if (checkWin(room.board, move.r, move.c, room.aiRole)) {
      room.winner = room.aiRole;
    } else {
      room.turn = otherRole(room.aiRole);
    }
    emitState(roomId);
  }, 320);
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
    if (room.aiEnabled && countPlayers(room) >= 2) {
      room.aiEnabled = false;
      room.aiRole = null;
    }
    if (room.aiEnabled && countPlayers(room) === 1) {
      const humanRole = room.players.B ? "B" : "W";
      room.aiRole = otherRole(humanRole);
    }
    emitState(roomId);
    scheduleAi(roomId);
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

    emitState(roomId);
    cb?.({ ok: true });
    scheduleAi(roomId);
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
    emitState(roomId);
    scheduleAi(roomId);
  });

  socket.on("ai:toggle", (payload, cb) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const room = getRoom(roomId);
    const enabled = !!payload?.enabled;
    if (enabled) {
      if (countPlayers(room) >= 2) {
        cb?.({ ok: false, error: "已有两位玩家，无法开启AI" });
        return;
      }
      const humanRole = room.players.B ? "B" : room.players.W ? "W" : "B";
      room.aiEnabled = true;
      room.aiRole = otherRole(humanRole);
    } else {
      room.aiEnabled = false;
      room.aiRole = null;
    }
    emitState(roomId);
    cb?.({ ok: true });
    scheduleAi(roomId);
  });

  socket.on("disconnect", () => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const room = getRoom(roomId);
    if (room.players.B === socket.id) room.players.B = null;
    if (room.players.W === socket.id) room.players.W = null;
    if (room.aiEnabled && countPlayers(room) === 0) {
      room.aiEnabled = false;
      room.aiRole = null;
    }
    emitState(roomId);
  });
});

server.listen(PORT, () => {
  console.log(`五子棋服务已启动：http://localhost:${PORT}`);
});
