const socket = io();

const roomInput = document.getElementById("roomInput");
const joinBtn = document.getElementById("joinBtn");
const copyBtn = document.getElementById("copyBtn");
const roleLabel = document.getElementById("roleLabel");
const statusLabel = document.getElementById("statusLabel");
const turnLabel = document.getElementById("turnLabel");
const playersLabel = document.getElementById("playersLabel");
const lastMoveLabel = document.getElementById("lastMoveLabel");
const resetBtn = document.getElementById("resetBtn");
const aiBtn = document.getElementById("aiBtn");
const canvas = document.getElementById("board");
const ctx = canvas.getContext("2d");
const musicBtn = document.getElementById("musicBtn");
const volumeSlider = document.getElementById("volume");
const bgm = document.getElementById("bgm");
const resultOverlay = document.getElementById("resultOverlay");
const resultTitle = document.getElementById("resultTitle");
const resultSubtitle = document.getElementById("resultSubtitle");
const playAgainBtn = document.getElementById("playAgainBtn");
const closeOverlayBtn = document.getElementById("closeOverlayBtn");
const turnBanner = document.getElementById("turnBanner");
const storyNote = document.getElementById("storyNote");
const todayNote = document.getElementById("todayNote");
const storyTime = document.getElementById("storyTime");
const todayTime = document.getElementById("todayTime");
const photoInput = document.getElementById("photoInput");
const uploadBtn = document.getElementById("uploadBtn");
const photoCarousel = document.getElementById("photoCarousel");
const photoMain = document.getElementById("photoMain");
const photoPrev = document.getElementById("photoPrev");
const photoNext = document.getElementById("photoNext");
const photoDelete = document.getElementById("photoDelete");
const photoDots = document.getElementById("photoDots");
const messageInput = document.getElementById("messageInput");
const messageBtn = document.getElementById("messageBtn");
const messageList = document.getElementById("messageList");
const toast = document.getElementById("toast");
const photoLightbox = document.getElementById("photoLightbox");
const lightboxImg = document.getElementById("lightboxImg");
const lightboxClose = document.getElementById("lightboxClose");

const BOARD_SIZE = 15;
const DEFAULT_ROOM = "DUET";
let role = "S";
let state = {
  board: Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null)),
  turn: "B",
  players: { B: null, W: null },
  winner: null,
  lastMove: null,
  aiEnabled: false,
  aiRole: null,
};

const cell = canvas.width / (BOARD_SIZE + 1);
const offset = cell;
const stoneRadius = cell * 0.38;
let desiredVolume = Number(volumeSlider.value) / 100;

function drawBoard() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();

  ctx.strokeStyle = "rgba(48, 26, 12, 0.55)";
  ctx.lineWidth = 2;
  for (let i = 0; i < BOARD_SIZE; i += 1) {
    const p = offset + i * cell;
    ctx.beginPath();
    ctx.moveTo(offset, p);
    ctx.lineTo(offset + cell * (BOARD_SIZE - 1), p);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(p, offset);
    ctx.lineTo(p, offset + cell * (BOARD_SIZE - 1));
    ctx.stroke();
  }

  const starPoints = [3, 7, 11];
  ctx.fillStyle = "rgba(35, 18, 8, 0.6)";
  for (const r of starPoints) {
    for (const c of starPoints) {
      const x = offset + c * cell;
      const y = offset + r * cell;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  for (let r = 0; r < BOARD_SIZE; r += 1) {
    for (let c = 0; c < BOARD_SIZE; c += 1) {
      const v = state.board[r][c];
      if (!v) continue;
      const x = offset + c * cell;
      const y = offset + r * cell;
      drawStone(x, y, v === "B" ? "#141414" : "#f7f1e8", v === "B");
    }
  }

  if (state.lastMove) {
    const x = offset + state.lastMove.c * cell;
    const y = offset + state.lastMove.r * cell;
    ctx.strokeStyle = "rgba(200, 80, 60, 0.8)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, stoneRadius + 4, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

function drawStone(x, y, color, dark) {
  ctx.save();
  const gradient = ctx.createRadialGradient(
    x - stoneRadius * 0.3,
    y - stoneRadius * 0.3,
    stoneRadius * 0.2,
    x,
    y,
    stoneRadius
  );
  if (dark) {
    gradient.addColorStop(0, "#555555");
    gradient.addColorStop(0.45, "#1f1f1f");
    gradient.addColorStop(1, "#050505");
  } else {
    gradient.addColorStop(0, "#ffffff");
    gradient.addColorStop(0.5, "#f4efe8");
    gradient.addColorStop(1, "#d8d1c6");
  }
  ctx.fillStyle = gradient;
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 2;
  ctx.beginPath();
  ctx.arc(x, y, stoneRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowColor = "rgba(255,255,255,0.35)";
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = -2;
  ctx.globalCompositeOperation = "screen";
  ctx.beginPath();
  ctx.arc(x - stoneRadius * 0.25, y - stoneRadius * 0.25, stoneRadius * 0.35, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.fill();
  ctx.restore();
}

function coordFromEvent(evt) {
  const rect = canvas.getBoundingClientRect();
  const x = ((evt.clientX - rect.left) / rect.width) * canvas.width;
  const y = ((evt.clientY - rect.top) / rect.height) * canvas.height;
  const c = Math.round((x - offset) / cell);
  const r = Math.round((y - offset) / cell);
  return { r, c };
}

function updateLabels() {
  roleLabel.textContent = `身份：${role === "B" ? "黑棋" : role === "W" ? "白棋" : "旁观者"}`;
  const bothReady = (state.players?.B && state.players?.W) || state.aiEnabled;
  statusLabel.textContent = state.winner
    ? `状态：${state.winner === "B" ? "黑棋" : "白棋"}获胜`
    : bothReady
      ? "状态：对局中"
      : "状态：等待中";
  const turnText = state.turn === "B" ? "黑棋" : "白棋";
  turnLabel.textContent = turnText;
  if (playersLabel) {
    const bState = state.aiEnabled && state.aiRole === "B"
      ? "AI"
      : state.players?.B ? "已进入" : "等待";
    const wState = state.aiEnabled && state.aiRole === "W"
      ? "AI"
      : state.players?.W ? "已进入" : "等待";
    playersLabel.textContent = `玩家状态：黑棋${bState} / 白棋${wState}`;
  }
  if (lastMoveLabel) {
    if (state.lastMove) {
      const who = state.lastMove.role === "B" ? "黑棋" : "白棋";
      lastMoveLabel.textContent = `${who} (${state.lastMove.r + 1}, ${state.lastMove.c + 1})`;
    } else {
      lastMoveLabel.textContent = "—";
    }
  }
  if (turnBanner) {
    if (state.winner) {
      turnBanner.textContent = "对局已结束";
    } else if (role === "S") {
      turnBanner.textContent = "观战中";
    } else if (state.aiEnabled && state.turn === state.aiRole) {
      turnBanner.textContent = "AI思考中";
    } else if (state.turn === role) {
      turnBanner.textContent = "轮到你落子";
    } else {
      turnBanner.textContent = "等待对方落子";
    }
  }
  if (aiBtn) {
    aiBtn.disabled = !!(state.players?.B && state.players?.W);
    aiBtn.textContent = state.aiEnabled ? "关闭AI对局" : "开启AI对局（超难）";
  }
  if (state.winner) {
    if (role === "S") {
      resultTitle.textContent = state.winner === "B" ? "黑棋获胜" : "白棋获胜";
    } else {
      const isWinner = state.winner === role;
      resultTitle.textContent = isWinner ? "恭喜你！你赢了。" : "很遗憾！你输了";
    }
    resultSubtitle.textContent = "想再来一局吗？";
    resultOverlay.classList.remove("hidden");
  }
}

if (bgm) {
  bgm.pause();
}

function joinRoom(roomId) {
  socket.emit("join", { roomId }, (res) => {
    if (!res?.ok) {
      statusLabel.textContent = `状态：${res?.error || "加入失败"}`;
      return;
    }
    role = res.role;
    updateLabels();
  });
}

if (joinBtn && roomInput) {
  joinBtn.addEventListener("click", () => {
    const roomId = roomInput.value.trim().toUpperCase();
    if (!roomId) return;
    joinRoom(roomId);
    const url = new URL(window.location.href);
    url.searchParams.set("room", roomId);
    window.history.replaceState(null, "", url.toString());
  });
}

if (copyBtn) {
  copyBtn.addEventListener("click", async () => {
    const url = new URL(window.location.href);
    if (roomInput && roomInput.value.trim()) {
      url.searchParams.set("room", roomInput.value.trim().toUpperCase());
    }
    try {
      await navigator.clipboard.writeText(url.toString());
      copyBtn.textContent = "已复制";
      setTimeout(() => {
        copyBtn.textContent = "复制邀请";
      }, 1200);
    } catch {
      copyBtn.textContent = "复制失败";
      setTimeout(() => {
        copyBtn.textContent = "复制邀请";
      }, 1200);
    }
  });
}

resetBtn.addEventListener("click", () => {
  socket.emit("reset");
});

if (aiBtn) {
  aiBtn.addEventListener("click", () => {
    const target = !state.aiEnabled;
    aiBtn.disabled = true;
    socket.emit("ai:toggle", { enabled: target }, (res) => {
      aiBtn.disabled = false;
      if (!res?.ok) {
        showToast(res?.error || "操作失败");
        return;
      }
      showToast(target ? "已开启AI对局" : "已关闭AI对局");
    });
  });
}

playAgainBtn.addEventListener("click", () => {
  socket.emit("reset");
  resultOverlay.classList.add("hidden");
});

closeOverlayBtn.addEventListener("click", () => {
  resultOverlay.classList.add("hidden");
});

canvas.addEventListener("click", (evt) => {
  if (role === "S") return;
  const { r, c } = coordFromEvent(evt);
  socket.emit("move", { r, c });
});

socket.on("state", (payload) => {
  const prevWinner = state.winner;
  const prevLast = state.lastMove;
  state = payload;
  drawBoard();
  updateLabels();
  if (!state.winner) {
    resultOverlay.classList.add("hidden");
  }
  if (!prevWinner && state.winner) {
    playWin();
  }
  if (state.lastMove && (!prevLast || prevLast.r !== state.lastMove.r || prevLast.c !== state.lastMove.c)) {
    playClick();
  }
});

socket.on("role", (payload) => {
  if (payload?.role) {
    role = payload.role;
    updateLabels();
  }
});

function getRoomFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const room = params.get("room");
  return room ? room.toUpperCase() : "";
}

const initialRoom = getRoomFromUrl() || DEFAULT_ROOM;
if (roomInput) roomInput.value = initialRoom;
joinRoom(initialRoom);

drawBoard();
updateLabels();

let audioCtx = null;
let ambientGain = null;
let ambientTimer = null;
let ambientStarted = false;
let sfxGain = null;

function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (!sfxGain) {
    sfxGain = audioCtx.createGain();
    sfxGain.gain.value = 0.35;
    sfxGain.connect(audioCtx.destination);
  }
}

function scheduleAmbient() {
  if (!audioCtx || !ambientGain) return;
  const now = audioCtx.currentTime;
  const chord = [196, 247, 294, 392];
  chord.forEach((freq, i) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.value = 0.0001;
    osc.connect(gain).connect(ambientGain);
    const start = now + i * 0.06;
    const end = start + 1.6;
    gain.gain.exponentialRampToValueAtTime(0.05, start + 0.2);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.start(start);
    osc.stop(end + 0.1);
  });
}

function startAmbient() {
  initAudio();
  if (bgm) {
    bgm.volume = desiredVolume;
    bgm.play()
      .then(() => {
        ambientStarted = true;
        musicBtn.textContent = "暂停音乐";
      })
      .catch(() => {});
    return;
  }
  if (!ambientGain) {
    ambientGain = audioCtx.createGain();
    ambientGain.gain.value = desiredVolume * 0.3;
    const filter = audioCtx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 800;
    ambientGain.connect(filter).connect(audioCtx.destination);
  }
  audioCtx.resume().then(() => {
    scheduleAmbient();
    ambientTimer = setInterval(scheduleAmbient, 1800);
    ambientStarted = true;
    musicBtn.textContent = "暂停音乐";
  });
}

function stopAmbient() {
  if (bgm && !bgm.paused) {
    bgm.pause();
    musicBtn.textContent = "播放音乐";
    return;
  }
  if (ambientTimer) clearInterval(ambientTimer);
  ambientTimer = null;
  musicBtn.textContent = "播放音乐";
}

musicBtn.addEventListener("click", async () => {
  if (!audioCtx) {
    startAmbient();
    return;
  }
  if (ambientTimer || (bgm && !bgm.paused)) {
    stopAmbient();
  } else {
    startAmbient();
  }
});

volumeSlider.addEventListener("input", (e) => {
  const value = Number(e.target.value) / 100;
  desiredVolume = value;
  if (bgm) {
    bgm.volume = value;
    return;
  }
  if (!ambientGain) return;
  ambientGain.gain.value = value * 0.3;
});

volumeSlider.addEventListener("change", (e) => {
  const value = Number(e.target.value) / 100;
  desiredVolume = value;
  if (bgm) {
    bgm.volume = value;
    return;
  }
  if (!ambientGain) return;
  ambientGain.gain.value = value * 0.3;
});

function playClick() {
  initAudio();
  if (!audioCtx || !sfxGain) return;
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = "sine";
  osc.frequency.value = 392;
  gain.gain.value = 0.0001;
  osc.connect(gain).connect(sfxGain);
  gain.gain.exponentialRampToValueAtTime(0.12, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
  osc.start(now);
  osc.stop(now + 0.24);
}

function playWin() {
  initAudio();
  if (!audioCtx || !sfxGain) return;
  const now = audioCtx.currentTime;
  const notes = [330, 392, 494, 659, 784];
  notes.forEach((freq, i) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.value = 0.0001;
    osc.connect(gain).connect(sfxGain);
    const start = now + i * 0.14;
    const end = start + 0.6;
    gain.gain.exponentialRampToValueAtTime(0.18, start + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.start(start);
    osc.stop(end + 0.05);
  });
}

// 背景音乐默认关闭，需点击按钮手动开启

function formatDate(iso) {
  if (!iso) return "未保存";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "未保存";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
}

function renderNotes(notes) {
  if (!notes) return;
  if (storyNote && notes.story) {
    storyNote.value = notes.story.text || "";
    if (storyTime) storyTime.textContent = `更新于：${formatDate(notes.story.updatedAt)}`;
  }
  if (todayNote && notes.today) {
    todayNote.value = notes.today.text || "";
    if (todayTime) todayTime.textContent = `更新于：${formatDate(notes.today.updatedAt)}`;
  }
}

async function loadNotes() {
  const res = await fetch("/api/notes");
  const data = await res.json();
  if (data.ok) renderNotes(data.notes);
}

let saveTimer = null;
function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        story: { text: storyNote ? storyNote.value : "" },
        today: { text: todayNote ? todayNote.value : "" },
      }),
    });
  }, 600);
}

if (storyNote) storyNote.addEventListener("input", scheduleSave);
if (todayNote) todayNote.addEventListener("input", scheduleSave);

socket.on("notes", (notes) => {
  renderNotes(notes);
});

function showToast(text) {
  if (!toast) return;
  toast.textContent = text;
  toast.classList.remove("hidden");
  setTimeout(() => {
    toast.classList.add("hidden");
  }, 1600);
}

let photoList = [];
let photoIndex = 0;
let photoTimer = null;

function renderPhotoDots() {
  if (!photoDots) return;
  photoDots.innerHTML = "";
  photoList.forEach((_, i) => {
    const dot = document.createElement("div");
    dot.className = `photo-dot${i === photoIndex ? " active" : ""}`;
    dot.addEventListener("click", () => {
      photoIndex = i;
      renderPhoto();
      restartCarousel();
    });
    photoDots.appendChild(dot);
  });
}

function renderPhoto() {
  if (!photoMain) return;
  if (photoList.length === 0) {
    photoMain.src = "";
    photoMain.alt = "暂无照片";
    if (photoDelete) photoDelete.style.display = "none";
    return;
  }
  const src = photoList[photoIndex];
  photoMain.src = src;
  photoMain.alt = "合照";
  if (photoDelete) photoDelete.style.display = "inline-flex";
  renderPhotoDots();
}

function nextPhoto() {
  if (photoList.length === 0) return;
  photoIndex = (photoIndex + 1) % photoList.length;
  renderPhoto();
}

function prevPhoto() {
  if (photoList.length === 0) return;
  photoIndex = (photoIndex - 1 + photoList.length) % photoList.length;
  renderPhoto();
}

function restartCarousel() {
  if (photoTimer) clearInterval(photoTimer);
  if (photoList.length > 1) {
    photoTimer = setInterval(nextPhoto, 4500);
  }
}

async function loadPhotos() {
  if (!photoCarousel) return;
  const res = await fetch("/api/photos");
  const data = await res.json();
  if (!data.ok || !Array.isArray(data.images)) return;
  photoList = data.images;
  photoIndex = 0;
  renderPhoto();
  restartCarousel();
}

async function uploadPhotos(files) {
  if (!files || files.length === 0) return;
  const form = new FormData();
  Array.from(files).forEach((file) => form.append("photos", file));
  uploadBtn.disabled = true;
  uploadBtn.textContent = "上传中...";
  await fetch("/api/photos", { method: "POST", body: form });
  uploadBtn.disabled = false;
  uploadBtn.textContent = "上传照片";
  photoInput.value = "";
  await loadPhotos();
  showToast("上传成功");
}

if (uploadBtn && photoInput) {
  uploadBtn.addEventListener("click", () => {
    uploadPhotos(photoInput.files);
  });
  photoInput.addEventListener("change", () => {
    if (photoInput.files.length > 0) {
      uploadPhotos(photoInput.files);
    }
  });
}

if (photoPrev) photoPrev.addEventListener("click", () => { prevPhoto(); restartCarousel(); });
if (photoNext) photoNext.addEventListener("click", () => { nextPhoto(); restartCarousel(); });
if (photoDelete) {
  photoDelete.addEventListener("click", async () => {
    if (photoList.length === 0) return;
    if (!window.confirm("确定要删除这张照片吗？")) return;
    const name = photoList[photoIndex].split("/").pop();
    await fetch(`/api/photos/${encodeURIComponent(name)}`, { method: "DELETE" });
    await loadPhotos();
  });
}

if (photoMain) {
  photoMain.addEventListener("click", () => {
    if (photoList.length === 0 || !lightboxImg || !photoLightbox) return;
    lightboxImg.src = photoList[photoIndex];
    photoLightbox.classList.remove("hidden");
  });
}

if (lightboxClose) {
  lightboxClose.addEventListener("click", () => {
    if (photoLightbox) photoLightbox.classList.add("hidden");
  });
}

if (photoLightbox) {
  photoLightbox.addEventListener("click", (e) => {
    if (e.target === photoLightbox) {
      photoLightbox.classList.add("hidden");
    }
  });
}

function renderMessages(messages) {
  if (!messageList) return;
  messageList.innerHTML = "";
  messages.forEach((m) => {
    const item = document.createElement("div");
    item.className = "message-item";
    const left = document.createElement("div");
    const text = document.createElement("div");
    text.className = "message-text";
    text.textContent = m.text;
    const time = document.createElement("div");
    time.className = "message-time";
    time.textContent = formatDate(m.createdAt);
    left.appendChild(text);
    left.appendChild(time);
    const del = document.createElement("button");
    del.className = "message-delete";
    del.textContent = "删除";
    del.addEventListener("click", async () => {
      if (!window.confirm("确定要删除这条留言吗？")) return;
      await fetch(`/api/messages/${encodeURIComponent(m.id)}`, { method: "DELETE" });
    });
    item.appendChild(left);
    item.appendChild(del);
    messageList.appendChild(item);
  });
}

async function loadMessages() {
  const res = await fetch("/api/messages");
  const data = await res.json();
  if (data.ok) renderMessages(data.messages);
}

async function sendMessage() {
  if (!messageInput) return;
  const text = messageInput.value.trim();
  if (!text) return;
  const host = window.location.hostname;
  const author = host === "localhost" || host === "127.0.0.1" ? "浩浩大王" : "瑶瑶";
  await fetch("/api/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, author }),
  });
  messageInput.value = "";
}

if (messageBtn) {
  messageBtn.addEventListener("click", sendMessage);
}

if (messageInput) {
  messageInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      sendMessage();
    }
  });
}

socket.on("messages", (messages) => {
  renderMessages(messages);
});

loadPhotos();
loadNotes();
loadMessages();
