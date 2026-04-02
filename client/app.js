/* ═══════════════════════════════════════════════════
NIGHT HAS COME — app.js
Full client logic with Thai TTS + Audio + Particles
═══════════════════════════════════════════════════ */

// ── Socket ──
const socket = io(“http://localhost:3000”);

// ── State ──
let myName = “”;
let myId = “”;
let myRole = “”;
let players = [];
let currentPhase = “lobby”;
let currentRound = 1;
let phaseEndTime = 0;
let timerInterval = null;
let audioUnlocked = false;
let votes = {};
let nightActionDone = false;

// ── Audio Setup ──
const killAudio = new Audio(”/sounds/kill.mp3”);
const nightAudio = new Audio(”/sounds/night.mp3”);
killAudio.preload = “auto”;
nightAudio.preload = “auto”;

// Unlock audio on first user interaction
function unlockAudio() {
if (audioUnlocked) return;
audioUnlocked = true;

[killAudio, nightAudio].forEach(a => {
a.play().then(() => a.pause()).catch(() => {});
});

// Also preload TTS
const u = new SpeechSynthesisUtterance(””);
speechSynthesis.speak(u);
speechSynthesis.cancel();

// Load voices
speechSynthesis.getVoices();
}

document.addEventListener(“click”, unlockAudio, { once: false });
document.addEventListener(“touchstart”, unlockAudio, { once: false });

// Fix iOS/Chrome voice loading
if (speechSynthesis.onvoiceschanged !== undefined) {
speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices();
}

// ── Thai TTS ──
function speakThai(text, delay = 0) {
setTimeout(() => {
try {
speechSynthesis.cancel();
const msg = new SpeechSynthesisUtterance(text);
const voices = speechSynthesis.getVoices();

```
  // Find Thai female voice
  const thaiVoice = voices.find(v =>
    v.lang.includes("th") && (v.name.toLowerCase().includes("female") || v.name.includes("Kanya") || v.name.includes("Narisa"))
  ) || voices.find(v => v.lang.includes("th"))
    || voices.find(v => v.lang.includes("zh")) // fallback
    || null;

  if (thaiVoice) msg.voice = thaiVoice;
  msg.lang = "th-TH";
  msg.pitch = 1.15;
  msg.rate = 0.88;
  msg.volume = 0.9;

  speechSynthesis.speak(msg);
} catch (e) {
  console.log("TTS error:", e);
}
```

}, delay);
}

function translateRole(role) {
const map = {
mafia: “มาเฟีย”,
doctor: “หมอ”,
police: “ตำรวจ”,
villager: “ชาวบ้าน”
};
return map[role] || role;
}

function roleIcon(role) {
const icons = { mafia: “🔪”, doctor: “💊”, police: “🔍”, villager: “🌾” };
return icons[role] || “👤”;
}

function roleDesc(role) {
const desc = {
mafia: “เลือกเหยื่อในตอนกลางคืน\nพยายามอยู่รอดและกำจัดชาวบ้าน”,
doctor: “รักษาผู้เล่นหนึ่งคนต่อคืน\nป้องกันไม่ให้ถูกมาเฟียสังหาร”,
police: “ตรวจสอบตัวตนของผู้เล่นหนึ่งคน\nค้นหาว่าใครเป็นมาเฟีย”,
villager: “ใช้การอ้างเหตุผลและโหวต\nเพื่อกำจัดมาเฟียทั้งหมด”
};
return desc[role] || “”;
}

// ── Play Sounds ──
function playKillSound() {
try {
killAudio.currentTime = 0;
killAudio.play().catch(() => {});
} catch (e) {}
}

function playNightSound() {
try {
nightAudio.currentTime = 0;
nightAudio.play().catch(() => {});
} catch (e) {}
}

// ── DOM Helpers ──
const $ = id => document.getElementById(id);

function showScreen(name) {
document.querySelectorAll(”.screen”).forEach(s => {
s.classList.remove(“active”);
s.classList.add(“hidden”);
});
const s = $(name + “Screen”);
if (s) {
s.classList.remove(“hidden”);
s.classList.add(“active”);
}
}

function showToast(msg, dur = 3000) {
const t = $(“toast”);
t.textContent = msg;
t.classList.remove(“hidden”);
clearTimeout(t._timer);
t._timer = setTimeout(() => t.classList.add(“hidden”), dur);
}

// ── JOIN SCREEN ──────────────────────────────────────
$(“nameInput”).addEventListener(“keypress”, e => {
if (e.key === “Enter”) doJoin();
});
$(“joinBtn”).addEventListener(“click”, doJoin);

function doJoin() {
unlockAudio();
const name = $(“nameInput”).value.trim();
if (!name) { showToast(“กรุณาใส่ชื่อของคุณ”); return; }
myName = name;
socket.emit(“join”, name);
showScreen(“lobby”);
}

// ── LOBBY SCREEN ──────────────────────────────────────
let isFirstPlayer = false;

socket.on(“init”, (data) => {
players = data.players || [];
currentPhase = data.phase;
renderLobbyPlayers();
});

socket.on(“players”, (list) => {
players = list;
renderLobbyPlayers();

// First player joined = host
if (players.length > 0 && players[0].id === socket.id) {
isFirstPlayer = true;
$(“startBtn”).classList.remove(“hidden”);
$(“waitMsg”).classList.add(“hidden”);
}

updatePlayerList();
});

function renderLobbyPlayers() {
const el = $(“lobbyPlayers”);
if (!el) return;
el.innerHTML = “”;
players.forEach(p => {
const chip = document.createElement(“div”);
chip.className = “lobby-chip”;
chip.textContent = p.id === socket.id ? `${p.name} (คุณ)` : p.name;
el.appendChild(chip);
});
$(“playerCount”).textContent = players.length;

// Show start button if we’re first
const firstPlayer = players[0];
if (firstPlayer && firstPlayer.id === socket.id) {
$(“startBtn”).classList.remove(“hidden”);
$(“waitMsg”).classList.add(“hidden”);
}
}

$(“startBtn”).addEventListener(“click”, () => {
if (players.length < 4) {
showToast(“ต้องการผู้เล่นอย่างน้อย 4 คน!”);
return;
}
socket.emit(“startGame”);
});

socket.on(“error”, (msg) => showToast(msg));

// ── ROLE REVEAL ──────────────────────────────────────
socket.on(“role”, (role) => {
myRole = role;

// Show envelope screen
const envScreen = $(“envelopeScreen”);
envScreen.classList.remove(“hidden”);
envScreen.classList.add(“active”);

$(“roleDisplay”).innerHTML = `${roleIcon(role)} ${translateRole(role)}`;
$(“roleDesc”).textContent = roleDesc(role);

// Speak role reveal
speakThai(`บทบาทของคุณคือ ${translateRole(role)}`, 800);

// Click to open
const envBody = $(“envelopeBody”);
const envWrap = document.querySelector(”.envelope-wrap”);

function openEnvelope() {
envBody.classList.add(“opened”);
envWrap.querySelector(”.tap-hint”).style.opacity = “0”;

```
// Hide after 5s
setTimeout(() => {
  envScreen.classList.add("hidden");
  envScreen.classList.remove("active");
  showScreen("game");
  updateMyRoleBadge();
}, 5000);
```

}

envWrap.addEventListener(“click”, openEnvelope, { once: true });

// Auto-open after 2s if not tapped
setTimeout(() => {
if (!envBody.classList.contains(“opened”)) openEnvelope();
}, 2000);
});

function updateMyRoleBadge() {
if (!myRole) return;
$(“myRoleBadge”).innerHTML = `${roleIcon(myRole)}<br>${translateRole(myRole)}`;
}

// ── PHASE HANDLING ──────────────────────────────────────
socket.on(“phase”, (data) => {
currentPhase = data.type;
currentRound = data.round;
votes = {};
nightActionDone = false;

$(“roundNum”).textContent = data.round;

if (data.type === “day”) {
showDayPhase(data);
} else if (data.type === “night”) {
showNightPhase(data);
}

startTimer(data.duration);
});

function showDayPhase(data) {
$(“phaseIcon”).textContent = “☀”;
$(“phaseText”).textContent = “กลางวัน”;

$(“dayPanel”).classList.remove(“hidden”);
$(“nightPanel”).classList.add(“hidden”);

// Enable chat
$(“chatInput”).disabled = !isAlive();
updatePlayerList();

// System message
addSystemMessage(`── รอบที่ ${data.round} เริ่มต้นขึ้น ──`);
addSystemMessage(“กล่าวหาและโหวตเนรเทศผู้ต้องสงสัย”);

speakThai(`เข้าสู่รอบกลางวัน รอบที่ ${data.round}`);
}

function showNightPhase(data) {
$(“phaseIcon”).textContent = “☽”;
$(“phaseText”).textContent = “กลางคืน”;

$(“dayPanel”).classList.add(“hidden”);
$(“nightPanel”).classList.remove(“hidden”);

// Show night overlay
showNightOverlay();
playNightSound();
speakThai(“เข้าสู่ช่วงกลางคืน โปรดระวังตัว”, 800);

// Hide overlay after 4s
setTimeout(() => {
hideNightOverlay();
setupNightActions();
}, 4000);
}

function showNightOverlay() {
$(“nightOverlay”).classList.remove(“hidden”);
}
function hideNightOverlay() {
$(“nightOverlay”).classList.add(“hidden”);
}

function setupNightActions() {
const me = players.find(p => p.id === socket.id);
if (!me || !me.alive) {
$(“nightInstruction”).textContent = “คุณเสียชีวิตแล้ว… รอดูผลลัพธ์”;
$(“nightTargets”).innerHTML = “”;
return;
}

const alivePlayers = players.filter(p => p.alive && p.id !== socket.id);
const targets = $(“nightTargets”);
targets.innerHTML = “”;

if (myRole === “mafia”) {
$(“nightInstruction”).textContent = “🔪 เลือกเหยื่อที่คุณต้องการสังหาร”;

```
alivePlayers
  .filter(p => {
    // Don't show other mafia if visible
    return true;
  })
  .forEach(p => {
    const btn = document.createElement("button");
    btn.className = "night-target-btn";
    btn.textContent = p.name;
    btn.addEventListener("click", () => {
      if (nightActionDone) return;
      nightActionDone = true;
      socket.emit("mafiaVote", p.id);
      document.querySelectorAll(".night-target-btn").forEach(b => b.classList.remove("selected"));
      btn.classList.add("selected");
      $("nightStatus").textContent = `✓ คุณเลือก ${p.name} แล้ว`;
      speakThai(`คุณเลือก ${p.name}`);
    });
    targets.appendChild(btn);
  });
```

} else if (myRole === “doctor”) {
$(“nightInstruction”).textContent = “💊 เลือกผู้ที่คุณต้องการรักษา”;

```
// Doctor can also heal themselves
const allAlive = players.filter(p => p.alive);
allAlive.forEach(p => {
  const btn = document.createElement("button");
  btn.className = "night-target-btn";
  btn.textContent = p.id === socket.id ? `${p.name} (ตัวคุณเอง)` : p.name;
  btn.addEventListener("click", () => {
    if (nightActionDone) return;
    nightActionDone = true;
    socket.emit("doctorHeal", p.id);
    document.querySelectorAll(".night-target-btn").forEach(b => b.classList.remove("selected"));
    btn.classList.add("selected");
    const targetName = p.id === socket.id ? "ตัวเอง" : p.name;
    $("nightStatus").textContent = `✓ คุณรักษา ${targetName} แล้ว`;
    speakThai(`คุณรักษา ${targetName}`);
  });
  targets.appendChild(btn);
});
```

} else if (myRole === “police”) {
$(“nightInstruction”).textContent = “🔍 เลือกผู้เล่นที่ต้องการตรวจสอบ”;

```
alivePlayers.forEach(p => {
  const btn = document.createElement("button");
  btn.className = "night-target-btn";
  btn.textContent = p.name;
  btn.addEventListener("click", () => {
    if (nightActionDone) return;
    nightActionDone = true;
    socket.emit("policeCheck", p.id);
    document.querySelectorAll(".night-target-btn").forEach(b => b.classList.remove("selected"));
    btn.classList.add("selected");
    $("nightStatus").textContent = `✓ กำลังตรวจสอบ ${p.name}...`;
  });
  targets.appendChild(btn);
});
```

} else {
$(“nightInstruction”).textContent = “คุณเป็นชาวบ้าน\nหลับตาลงและรอให้คืนนี้ผ่านไป…”;
}
}

// ── NIGHT RESULTS ──────────────────────────────────────
socket.on(“nightResult”, (data) => {
if (data.killed) {
if (data.killed.saved) {
showSaveOverlay(data.killed.name);
} else {
showKillOverlay(data.killed.name, data.killed.role);
playKillSound();
speakThai(`${data.killed.name} เสียชีวิต สถานะ${translateRole(data.killed.role)}`, 400);
}
} else {
addSystemMessage(“✦ ไม่มีผู้เสียชีวิตในคืนนี้”);
speakThai(“ไม่มีผู้เสียชีวิตในคืนนี้”);
}

players = data.players || players;
updatePlayerList();
});

socket.on(“dayResult”, (data) => {
if (data.killed) {
addSystemMessage(`⚖ ${data.killed.name} ถูกเนรเทศ (${translateRole(data.killed.role)})`);
speakThai(`${data.killed.name} ถูกเนรเทศ สถานะ${translateRole(data.killed.role)}`);
} else {
addSystemMessage(“⚖ ไม่มีผู้ถูกเนรเทศในวันนี้”);
}

players = data.players || players;
updatePlayerList();
votes = {};
updateVoteBar();
});

socket.on(“policeResult”, (data) => {
const isMafia = data.isMafia;
$(“policeText”).innerHTML = `<strong>${data.name}</strong> คือ <br> <span class="${isMafia ? 'is-mafia' : 'not-mafia'}"> ${isMafia ? '🔪 มาเฟีย!' : '✓ ไม่ใช่มาเฟีย'} </span>`;
$(“policePopup”).classList.remove(“hidden”);
speakThai(`${data.name} ${isMafia ? "คือมาเฟีย!" : "ไม่ใช่มาเฟีย"}`);
});

socket.on(“doctorConfirm”, (data) => {
if (data.targetName) {
showToast(`💊 คุณรักษา ${data.targetName} สำเร็จ`);
}
});

function closePolice() {
$(“policePopup”).classList.add(“hidden”);
}
window.closePolice = closePolice;

// ── KILL OVERLAY ──────────────────────────────────────
function showKillOverlay(name, role) {
$(“killName”).textContent = name;
$(“killRole”).textContent = `${roleIcon(role)} ${translateRole(role)}`;
$(“killOverlay”).classList.remove(“hidden”);
setTimeout(() => $(“killOverlay”).classList.add(“hidden”), 5000);
}

function showSaveOverlay(name) {
$(“saveName”).textContent = name;
$(“saveOverlay”).classList.remove(“hidden”);
speakThai(`${name} ได้รับการรักษา!`);
setTimeout(() => $(“saveOverlay”).classList.add(“hidden”), 4000);
}

// ── VOTING (DAY) ──────────────────────────────────────
socket.on(“voteUpdate”, (data) => {
votes = data.votes;
updateVoteBar();
updatePlayerList();
});

function updateVoteBar() {
const bar = $(“voteBar”);
if (!bar) return;
bar.innerHTML = “”;

const total = Object.values(votes).reduce((a, b) => a + b, 0);
if (total === 0) return;

Object.entries(votes)
.sort((a, b) => b[1] - a[1])
.forEach(([id, count]) => {
const p = players.find(x => x.id === id);
if (!p) return;
const chip = document.createElement(“div”);
chip.className = “vote-chip”;
chip.innerHTML = `<span class="vc-name">${p.name}</span><span class="vc-count">${count}</span>`;
bar.appendChild(chip);
});
}

function updatePlayerList() {
const list = $(“playerList”);
if (!list) return;
list.innerHTML = “”;

players.forEach(p => {
const div = document.createElement(“div”);
div.className = `player-item${!p.alive ? " dead" : ""}${p.id === socket.id ? " me" : ""}`;

```
// Vote count
const voteCount = votes[p.id] || 0;
if (voteCount > 0) div.classList.add("voting");

div.innerHTML = `
  <div class="player-dot"></div>
  <span class="player-name-text">${p.name}${p.id === socket.id ? " ★" : ""}</span>
  ${voteCount > 0 ? `<span class="vote-count-badge">${voteCount}</span>` : ""}
`;

// Click to vote (day) or night action
div.addEventListener("click", () => {
  if (!isAlive()) return;
  if (p.id === socket.id) return;
  if (!p.alive) return;

  if (currentPhase === "day") {
    socket.emit("vote", p.id);
    showToast(`โหวต ${p.name}`);
  }
});

list.appendChild(div);
```

});
}

function isAlive() {
const me = players.find(p => p.id === socket.id);
return me ? me.alive : false;
}

// ── CHAT ──────────────────────────────────────────────
$(“chatInput”).addEventListener(“keypress”, e => {
if (e.key === “Enter”) sendChat();
});
$(“sendBtn”).addEventListener(“click”, sendChat);

function sendChat() {
const input = $(“chatInput”);
const text = input.value.trim();
if (!text || !isAlive() || currentPhase !== “day”) return;

socket.emit(“chat”, text);
input.value = “”;
}

socket.on(“chat”, (msg) => {
addChatMessage(msg);
});

function addChatMessage(msg) {
const box = $(“chatBox”);
if (!box) return;

const div = document.createElement(“div”);
div.className = `chat-msg${msg.id === socket.id ? " me" : ""}`;

const time = new Date(msg.time).toLocaleTimeString(“th-TH”, {
hour: “2-digit”, minute: “2-digit”
});

div.innerHTML = `<div class="msg-header"> <span class="msg-name${msg.id === socket.id ? " me" : ""}">${msg.name}</span> <span class="msg-time">${time}</span> </div> <div class="msg-text">${escapeHTML(msg.text)}</div>`;

box.appendChild(div);
box.scrollTop = box.scrollHeight;
}

function addSystemMessage(text) {
const box = $(“chatBox”);
if (!box) return;

const div = document.createElement(“div”);
div.className = “chat-msg system”;
div.innerHTML = `<div class="msg-text">${text}</div>`;
box.appendChild(div);
box.scrollTop = box.scrollHeight;
}

function escapeHTML(str) {
return str
.replace(/&/g, “&”)
.replace(/</g, “<”)
.replace(/>/g, “>”)
.replace(/”/g, “"”);
}

// ── END DAY BUTTON ──────────────────────────────────────
// Show end day button to first player
socket.on(“phase”, (data) => {
const endBtn = $(“endDayBtn”);
if (data.type === “day”) {
const firstPlayer = players[0];
if (firstPlayer && firstPlayer.id === socket.id) {
endBtn.classList.remove(“hidden”);
}
} else {
endBtn.classList.add(“hidden”);
}
});

$(“endDayBtn”).addEventListener(“click”, () => {
socket.emit(“endDay”);
});

// ── TIMER ──────────────────────────────────────────────
const CIRCUMFERENCE = 119.4;

function startTimer(seconds) {
clearInterval(timerInterval);
phaseEndTime = Date.now() + seconds * 1000;

const ring = $(“timerRing”);
const text = $(“timerText”);

function tick() {
const remaining = Math.max(0, Math.ceil((phaseEndTime - Date.now()) / 1000));
const fraction = remaining / seconds;

```
ring.style.strokeDashoffset = CIRCUMFERENCE * (1 - fraction);

// Color urgency
ring.classList.remove("urgent", "critical");
if (remaining <= 30) ring.classList.add("critical");
else if (remaining <= 60) ring.classList.add("urgent");

const m = Math.floor(remaining / 60);
const s = remaining % 60;
text.textContent = `${m}:${s.toString().padStart(2, "0")}`;

if (remaining === 0) clearInterval(timerInterval);
```

}

tick();
timerInterval = setInterval(tick, 500);
}

// ── GAME OVER ──────────────────────────────────────────
socket.on(“gameover”, (data) => {
clearInterval(timerInterval);

const overlay = $(“gameoverOverlay”);
const title = $(“gameoverTitle”);
const sub = $(“gameoverSub”);
const roles = $(“finalRoles”);

if (data.winner === “mafia”) {
title.textContent = “มาเฟียชนะ!”;
title.className = “gameover-title mafia-wins glitch”;
title.dataset.text = “มาเฟียชนะ!”;
sub.textContent = “ความมืดครอบครองเมืองนี้แล้ว”;
speakThai(“มาเฟียชนะ! ความมืดครอบครองเมืองนี้แล้ว”, 500);
} else {
title.textContent = “ชาวบ้านชนะ!”;
title.className = “gameover-title villagers-win”;
sub.textContent = “ความยุติธรรมได้รับชัยชนะ”;
speakThai(“ชาวบ้านชนะ! ความยุติธรรมได้รับชัยชนะ”, 500);
}

// Show all roles
roles.innerHTML = “”;
(data.players || []).forEach((p, i) => {
const chip = document.createElement(“div”);
chip.className = `final-role-chip ${p.role}${!p.alive ? " dead" : ""}`;
chip.style.animationDelay = `${i * 0.1}s`;
chip.innerHTML = `${roleIcon(p.role)} ${p.name}`;
roles.appendChild(chip);
});

overlay.classList.remove(“hidden”);
});

$(“resetBtn”).addEventListener(“click”, () => {
socket.emit(“resetGame”);
});

socket.on(“gameReset”, () => {
// Reset all state
players = [];
myRole = “”;
currentPhase = “lobby”;
votes = {};

$(“gameoverOverlay”).classList.add(“hidden”);
$(“killOverlay”).classList.add(“hidden”);
$(“nightOverlay”).classList.add(“hidden”);
$(“chatBox”).innerHTML = “”;

isFirstPlayer = false;
$(“startBtn”).classList.add(“hidden”);
$(“waitMsg”).classList.remove(“hidden”);
$(“lobbyPlayers”).innerHTML = “”;
$(“playerCount”).textContent = “0”;

showScreen(“join”);
$(“nameInput”).value = “”;
myName = “”;
});

// ── PARTICLES BACKGROUND ──────────────────────────────
const canvas = $(“particles”);
const ctx = canvas.getContext(“2d”);

function resizeCanvas() {
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener(“resize”, resizeCanvas);

const particles = [];
for (let i = 0; i < 60; i++) {
particles.push({
x: Math.random() * window.innerWidth,
y: Math.random() * window.innerHeight,
r: Math.random() * 1.5 + 0.3,
vx: (Math.random() - 0.5) * 0.3,
vy: -Math.random() * 0.4 - 0.1,
alpha: Math.random() * 0.4 + 0.05,
color: Math.random() > 0.5 ? “#cc0000” : “#550000”
});
}

function animateParticles() {
ctx.clearRect(0, 0, canvas.width, canvas.height);

particles.forEach(p => {
ctx.beginPath();
ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
ctx.fillStyle = p.color;
ctx.globalAlpha = p.alpha;
ctx.fill();

```
p.x += p.vx;
p.y += p.vy;

if (p.y < -5) {
  p.y = canvas.height + 5;
  p.x = Math.random() * canvas.width;
}
if (p.x < 0) p.x = canvas.width;
if (p.x > canvas.width) p.x = 0;
```

});

ctx.globalAlpha = 1;
requestAnimationFrame(animateParticles);
}
animateParticles();

// ── SOCKET ID ──────────────────────────────────────────
socket.on(“connect”, () => {
myId = socket.id;
});

console.log(“🌑 Night Has Come — Client ready”);
