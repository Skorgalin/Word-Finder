const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const fs = require("fs-extra");
const bcrypt = require("bcrypt");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

/* ================= BASIC ================= */
app.use(express.json());
app.use(express.static("public"));

/* ================= FILES ================= */
const USERS_FILE = "./users.json";
const WORDS_FILE = "./words.json";

/* ================= INIT FILES ================= */
if (!fs.existsSync(USERS_FILE)) fs.writeJsonSync(USERS_FILE, {});
if (!fs.existsSync(WORDS_FILE)) fs.writeJsonSync(WORDS_FILE, {});

/* ================= MEMORY ================= */
const onlinePlayers = {};     // email -> socket.id
const bannedPlayers = {};     // email -> { reason, until }
const spectatingAdmins = {};  // adminSocketId -> playerEmail

/* ================= HELPERS ================= */
function loadUsers() {
  return fs.readJsonSync(USERS_FILE);
}
function saveUsers(users) {
  fs.writeJsonSync(USERS_FILE, users, { spaces: 2 });
}
function loadWords() {
  return fs.readJsonSync(WORDS_FILE);
}
function saveWords(words) {
  fs.writeJsonSync(WORDS_FILE, words, { spaces: 2 });
}

/* ================= RANDOM OUTPUT ================= */
const RARITY_LEVELS = [
  { name: "common", weight: 60 },
  { name: "selten", weight: 25 },
  { name: "legendär", weight: 10 },
  { name: "mythisch", weight: 4 },
  { name: "godly", weight: 1 }
];

function pickRarity() {
  const total = RARITY_LEVELS.reduce((sum, item) => sum + item.weight, 0);
  let roll = Math.random() * total;

  for (const rarity of RARITY_LEVELS) {
    if (roll < rarity.weight) return rarity.name;
    roll -= rarity.weight;
  }

  return "common";
}

function randomOutputLength() {
  return 4 + Math.floor(Math.random() * 9); // 4..12
}

function makeOutput(length) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let output = "";
  for (let i = 0; i < length; i++) {
    output += chars[Math.floor(Math.random() * chars.length)];
  }
  return output;
}

function getExistingOutputMap(words) {
  const outputToInput = {};
  for (const inputKey in words) {
    const existingOutput = words[inputKey]?.output;
    if (existingOutput) outputToInput[existingOutput] = inputKey;
  }
  return outputToInput;
}

function makeUniqueOutput(words) {
  const outputToInput = getExistingOutputMap(words);
  let output = makeOutput(randomOutputLength());

  while (outputToInput[output]) {
    output = makeOutput(randomOutputLength());
  }

  return output;
}

function calculateSuspectPlayers(words) {
  const statsByPlayer = {};

  for (const inputKey in words) {
    const entry = words[inputKey] || {};
    const playerEmail = entry.discoveredBy;
    if (!playerEmail) continue;

    if (!statsByPlayer[playerEmail]) {
      statsByPlayer[playerEmail] = {
        email: playerEmail,
        totalDiscoveries: 0,
        legendärCount: 0,
        mythischCount: 0,
        godlyCount: 0
      };
    }

    const stats = statsByPlayer[playerEmail];
    stats.totalDiscoveries += 1;

    const rarity = entry.rarity || "common";
    if (rarity === "legendär") stats.legendärCount += 1;
    if (rarity === "mythisch") stats.mythischCount += 1;
    if (rarity === "godly") stats.godlyCount += 1;
  }

  const suspects = Object.values(statsByPlayer)
    .map((stats) => {
      const rareCount = stats.legendärCount + stats.mythischCount + stats.godlyCount;
      const score = stats.godlyCount * 8 + stats.mythischCount * 5 + stats.legendärCount * 3;
      return {
        ...stats,
        rareCount,
        score,
        suspicious: stats.godlyCount > 0 || stats.mythischCount >= 2 || rareCount >= 4
      };
    })
    .filter((stats) => stats.suspicious)
    .sort((a, b) => b.score - a.score || b.rareCount - a.rareCount || b.totalDiscoveries - a.totalDiscoveries);

  return suspects;
}

/* ================= AUTH ================= */

// CHECK EMAIL
app.post("/checkEmail", (req, res) => {
  const { email } = req.body;
  const users = loadUsers();
  res.json({ exists: !!users[email] });
});

// REGISTER
app.post("/register", async (req, res) => {
  const { email, password } = req.body;
  const users = loadUsers();

  if (users[email]) return res.json({ ok: false, error: "exists" });

  const hash = await bcrypt.hash(password, 10);

  users[email] = {
    password: hash,
    admin: email === "till.behner@icloud.com"
  };

  saveUsers(users);
  res.json({ ok: true, admin: users[email].admin });
});

// LOGIN
app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const users = loadUsers();

  if (!users[email]) return res.json({ ok: false });

  const ok = await bcrypt.compare(password, users[email].password);
  if (!ok) return res.json({ ok: false });

  res.json({ ok: true, admin: users[email].admin });
});

/* ================= GAME ================= */

// WORD SUBMIT + FIRST DISCOVERY
app.post("/submitItem", (req, res) => {
  const { email, input } = req.body;
  const normalizedInput = String(input || "").trim();
  if (!normalizedInput) return res.json({ ok: false });

  const words = loadWords();
  let firstDiscovery = false;

  // Bereits bekannt: immer denselben gespeicherten Output zurückgeben.
  if (words[normalizedInput]) {
    const existing = words[normalizedInput];
    return res.json({
      ok: true,
      input: normalizedInput,
      output: existing.output,
      rarity: existing.rarity || "common",
      firstDiscovery
    });
  }

  const output = makeUniqueOutput(words);
  const rarity = pickRarity();

  words[normalizedInput] = {
    output,
    rarity,
    discoveredBy: email,
    time: Date.now()
  };
  saveWords(words);
  firstDiscovery = true;

  res.json({
    ok: true,
    input: normalizedInput,
    output,
    rarity,
    firstDiscovery
  });
});

// ADMIN SEARCH
app.post("/adminSearch", (req, res) => {
  const { query } = req.body;
  const words = loadWords();

  if (!words[query]) return res.json({ ok: false });

  res.json({
    ok: true,
    input: query,
    output: words[query].output,
    rarity: words[query].rarity || "common"
  });
});

/* ================= SOCKET.IO ================= */
io.on("connection", (socket) => {

  /* PLAYER ONLINE */
  socket.on("player:online", ({ email }) => {
    const ban = bannedPlayers[email];
    if (ban) {
      const isPermanent = ban.until === null;
      const stillBanned = isPermanent || Date.now() < ban.until;

      if (stillBanned) {
        socket.emit("player:banned", {
          reason: ban.reason,
          remaining: isPermanent ? null : Math.ceil((ban.until - Date.now()) / 1000),
          permanent: isPermanent
        });
        return;
      }

      delete bannedPlayers[email];
    }

    onlinePlayers[email] = socket.id;
    io.emit("admin:onlineCount", Object.keys(onlinePlayers).length);
  });

  /* PLAYER OFFLINE */
  socket.on("disconnect", () => {
    for (const email in onlinePlayers) {
      if (onlinePlayers[email] === socket.id) {
        delete onlinePlayers[email];
        break;
      }
    }
    io.emit("admin:onlineCount", Object.keys(onlinePlayers).length);
    delete spectatingAdmins[socket.id];
  });

  /* LIVE TYPING (SPECTATE) */
  socket.on("player:typing", ({ email, text }) => {
    for (const adminId in spectatingAdmins) {
      if (spectatingAdmins[adminId] === email) {
        io.to(adminId).emit("spectate:typing", { email, text });
      }
    }
  });

  /* ITEM FOUND (SPECTATE) */
  socket.on("player:itemFound", ({ email, input, output }) => {
    for (const adminId in spectatingAdmins) {
      if (spectatingAdmins[adminId] === email) {
        io.to(adminId).emit("spectate:itemFound", {
          email, input, output
        });
      }
    }
  });

  /* ================= ADMIN ================= */

  // ONLINE COUNT
  socket.on("admin:getOnlineCount", () => {
    socket.emit("admin:onlineCount", Object.keys(onlinePlayers).length);
  });

  // PLAYER LIST
  socket.on("admin:getPlayers", () => {
    const players = Object.keys(onlinePlayers).map(email => ({
      email
    }));
    socket.emit("admin:playersList", players);
  });

  // SUSPECT PLAYERS (seltene/godly discovery Muster)
  socket.on("admin:getSuspectPlayers", () => {
    const words = loadWords();
    const suspects = calculateSuspectPlayers(words);
    socket.emit("admin:suspectPlayers", suspects);
  });

  // BAN PLAYER
  socket.on("admin:banPlayer", ({ email, reason, duration }) => {
    const permanent = duration === null || duration === undefined;
    bannedPlayers[email] = {
      reason,
      until: permanent ? null : Date.now() + duration * 1000
    };

    const target = onlinePlayers[email];
    if (target) {
      io.to(target).emit("player:banned", {
        reason,
        remaining: permanent ? null : duration,
        permanent
      });
      io.sockets.sockets.get(target)?.disconnect(true);
      delete onlinePlayers[email];
    }

    io.emit("admin:onlineCount", Object.keys(onlinePlayers).length);
  });

  // SPECTATE START
  socket.on("admin:spectateStart", ({ email }) => {
    spectatingAdmins[socket.id] = email;
  });

  // SPECTATE STOP
  socket.on("admin:spectateStop", () => {
    delete spectatingAdmins[socket.id];
  });

  // ANNOUNCEMENTS
  socket.on("adminAnnouncement", ({ text }) => {
    io.emit("announcement", { text });
  });
});

/* ================= START ================= */
server.listen(PORT, () => {
  console.log("Server läuft auf Port", PORT);
});
