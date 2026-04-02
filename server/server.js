const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Serve static files
app.use(express.static(path.join(__dirname, "../public")));
app.use(express.static(path.join(__dirname, "../client")));

// ─── Game State ───────────────────────────────────────────────────────────────
let players = [];
let phase = "lobby";
let votes = {};
let nightActions = {
  doctorHeal: null,
  policeCheck: null,
  mafiaVotes: {}
};
let phaseTimer = null;
let round = 0;
let messages = [];
let killedThisRound = null;
let policeResults = {};
let doctorSaved = false;

// ─── Role Assignment ──────────────────────────────────────────────────────────
function assignRoles() {
  const shuffled = [...players].sort(() => Math.random() - 0.5);
  const n = shuffled.length;

  shuffled.forEach((p, i) => {
    if (i === 0) p.role = "mafia";
    else if (n >= 6 && i === 1) p.role = "mafia";
    else if (i === (n >= 6 ? 2 : 1)) p.role = "doctor";
    else if (i === (n >= 6 ? 3 : 2)) p.role = "police";
    else p.role = "villager";
  });
}

// ─── Win Condition ────────────────────────────────────────────────────────────
function checkWin() {
  const alive = players.filter(p => p.alive);
  const mafiaAlive = alive.filter(p => p.role === "mafia").length;
  const villagersAlive = alive.filter(p => p.role !== "mafia").length;

  if (mafiaAlive === 0) return "villagers";
  if (mafiaAlive >= villagersAlive) return "mafia";
  return null;
}

// ─── Phase Management ─────────────────────────────────────────────────────────
function startDayPhase() {
  phase = "day";
  votes = {};
  round++;

  clearTimeout(phaseTimer);
  io.emit("phase", {
    type: "day",
    round,
    duration: 180,
    players: players.map(safePlayer)
  });

  phaseTimer = setTimeout(() => {
    endDayVote();
  }, 180 * 1000);
}

function endDayVote() {
  clearTimeout(phaseTimer);

  let max = 0, target = null;
  for (let id in votes) {
    if (votes[id] > max) {
      max = votes[id];
      target = id;
    }
  }

  let dayKilled = null;
  if (target) {
    const player = players.find(p => p.id === target);
    if (player && player.alive) {
      player.alive = false;
      dayKilled = { id: player.id, name: player.name, role: player.role };
    }
  }

  const winner = checkWin();
  if (winner) {
    endGame(winner, dayKilled);
    return;
  }

  io.emit("dayResult", {
    killed: dayKilled,
    players: players.map(safePlayer)
  });

  phaseTimer = setTimeout(() => {
    startNightPhase();
  }, 5000);
}

function startNightPhase() {
  phase = "night";
  nightActions = { doctorHeal: null, policeCheck: null, mafiaVotes: {} };
  killedThisRound = null;
  doctorSaved = false;

  clearTimeout(phaseTimer);
  io.emit("phase", {
    type: "night",
    round,
    duration: 90,
    players: players.map(safePlayer)
  });

  phaseTimer = setTimeout(() => {
    resolveNight();
  }, 90 * 1000);
}

function resolveNight() {
  clearTimeout(phaseTimer);

  let mafiaMax = 0, mafiaTarget = null;
  for (let id in nightActions.mafiaVotes) {
    if (nightActions.mafiaVotes[id] > mafiaMax) {
      mafiaMax = nightActions.mafiaVotes[id];
      mafiaTarget = id;
    }
  }

  let killed = null;
  if (mafiaTarget) {
    const saved = nightActions.doctorHeal === mafiaTarget;
    doctorSaved = saved;

    if (!saved) {
      const player = players.find(p => p.id === mafiaTarget);
      if (player && player.alive) {
        player.alive = false;
        killed = { id: player.id, name: player.name, role: player.role };
      }
    } else {
      killed = { saved: true, name: players.find(p => p.id === mafiaTarget)?.name };
    }
  }

  if (nightActions.policeCheck) {
    const policePlayer = players.find(p => p.role === "police" && p.alive);
    const checkedPlayer = players.find(p => p.id === nightActions.policeCheck);
    if (policePlayer && checkedPlayer) {
      io.to(policePlayer.id).emit("policeResult", {
        name: checkedPlayer.name,
        role: checkedPlayer.role,
        isMafia: checkedPlayer.role === "mafia"
      });
    }
  }

  const winner = checkWin();
  if (winner) {
    endGame(winner, killed);
    return;
  }

  io.emit("nightResult", {
    killed,
    players: players.map(safePlayer)
  });

  phaseTimer = setTimeout(() => {
    startDayPhase();
  }, 6000);
}

function endGame(winner, lastKilled) {
  phase = "gameover";
  io.emit("gameover", {
    winner,
    lastKilled,
    players: players.map(p => ({ ...p }))
  });
}

function safePlayer(p) {
  return { id: p.id, name: p.name, alive: p.alive };
}

io.on("connection", (socket) => {
  console.log("Connected:", socket.id);

  socket.emit("init", {
    players: players.map(safePlayer),
    phase,
    round
  });

  socket.on("join", (name) => {
    if (phase !== "lobby") return;
    const trimmed = name.trim().slice(0, 20);
    if (!trimmed) return;

    if (players.find(p => p.id === socket.id)) return;

    players.push({ id: socket.id, name: trimmed, alive: true, role: null });
    io.emit("players", players.map(safePlayer));
  });

  socket.on("disconnect", () => {
    if (phase === "lobby") {
      players = players.filter(p => p.id !== socket.id);
      io.emit("players", players.map(safePlayer));
    }
  });
});

// 🔥 สำคัญสุด (แก้ Render พัง)
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
