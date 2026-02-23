const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const fs = require("fs-extra");
const bcrypt = require("bcrypt");
let createClient = null;

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


/* ================= SUPABASE ================= */
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (supabaseUrl && supabaseKey) {
  ({ createClient } = require("@supabase/supabase-js"));
}

const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey)
  : null;

function ensureSupabase(res) {
  if (supabase) return true;
  res.status(503).json({
    ok: false,
    error: "Supabase ist nicht konfiguriert. Bitte SUPABASE_URL und SUPABASE_KEY setzen."
  });
  return false;
}

async function saveScore(username, score) {
  const { error } = await supabase.from("scores").insert([{ username, score }]);
  if (error) throw error;
}

async function getLeaderboard() {
  const { data, error } = await supabase
    .from("scores")
    .select("*")
    .order("score", { ascending: false })
    .limit(10);

  if (error) throw error;
  return data;
}


async function getUserByEmail(email) {
  if (!supabase) {
    const users = loadUsers();
    return users[email] ? { email, ...users[email] } : null;
  }

  const { data, error } = await supabase
    .from("users")
    .select("email,password,admin")
    .eq("email", email)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function createUser(email, passwordHash, admin) {
  if (!supabase) {
    const users = loadUsers();
    users[email] = { password: passwordHash, admin };
    saveUsers(users);
    return;
  }

  const { error } = await supabase
    .from("users")
    .insert([{ email, password: passwordHash, admin }]);

  if (error) throw error;
}

async function getWordByInput(input) {
  if (!supabase) {
    const words = loadWords();
    return words[input] || null;
  }

  const { data, error } = await supabase
    .from("word_mappings")
    .select("input,output,rarity,discovered_by,discovered_at")
    .eq("input", input)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function getAllWordsMap() {
  if (!supabase) return loadWords();

  const { data, error } = await supabase
    .from("word_mappings")
    .select("input,output,rarity,discovered_by,discovered_at");

  if (error) throw error;

  const words = {};
  for (const row of data || []) {
    words[row.input] = {
      output: row.output,
      rarity: row.rarity,
      discoveredBy: row.discovered_by,
      time: row.discovered_at
    };
  }
  return words;
}

async function createWordMapping(input, output, rarity, discoveredBy, discoveredAt) {
  if (!supabase) {
    const words = loadWords();
    words[input] = { output, rarity, discoveredBy, time: discoveredAt };
    saveWords(words);
    return;
  }

  const { error } = await supabase
    .from("word_mappings")
    .insert([{ input, output, rarity, discovered_by: discoveredBy, discovered_at: discoveredAt }]);

  if (error) throw error;
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
app.post("/checkEmail", async (req, res) => {
  const { email } = req.body;
  try {
    const user = await getUserByEmail(email);
    res.json({ exists: !!user });
  } catch (error) {
    console.error("checkEmail Fehler:", error.message);
    res.status(500).json({ ok: false });
  }
});

// REGISTER
app.post("/register", async (req, res) => {
  const { email, password } = req.body;

  try {
    const existingUser = await getUserByEmail(email);
    if (existingUser) return res.json({ ok: false, error: "exists" });

    const hash = await bcrypt.hash(password, 10);
    const admin = email === "till.behner@icloud.com";
    await createUser(email, hash, admin);

    res.json({ ok: true, admin });
  } catch (error) {
    console.error("register Fehler:", error.message);
    res.status(500).json({ ok: false, error: "server" });
  }
});

// LOGIN
app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await getUserByEmail(email);
    if (!user) return res.json({ ok: false });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.json({ ok: false });

    res.json({ ok: true, admin: !!user.admin });
  } catch (error) {
    console.error("login Fehler:", error.message);
    res.status(500).json({ ok: false });
  }
});

/* ================= GAME ================= */

// WORD SUBMIT + FIRST DISCOVERY
app.post("/submitItem", async (req, res) => {
  const { email, input } = req.body;
  const normalizedInput = String(input || "").trim();
  if (!normalizedInput) return res.json({ ok: false });

  try {
    let firstDiscovery = false;
    const existing = await getWordByInput(normalizedInput);

    // Bereits bekannt: immer denselben gespeicherten Output zurückgeben.
    if (existing) {
      return res.json({
        ok: true,
        input: normalizedInput,
        output: existing.output,
        rarity: existing.rarity || "common",
        firstDiscovery
      });
    }

    const words = await getAllWordsMap();
    const output = makeUniqueOutput(words);
    const rarity = pickRarity();
    const discoveredAt = Date.now();

    await createWordMapping(normalizedInput, output, rarity, email, discoveredAt);
    firstDiscovery = true;

    res.json({
      ok: true,
      input: normalizedInput,
      output,
      rarity,
      firstDiscovery
    });
  } catch (error) {
    console.error("submitItem Fehler:", error.message);
    res.status(500).json({ ok: false, error: "server" });
  }
});

// ADMIN SEARCH
app.post("/adminSearch", async (req, res) => {
  const { query } = req.body;

  try {
    const word = await getWordByInput(query);
    if (!word) return res.json({ ok: false });

    res.json({
      ok: true,
      input: query,
      output: word.output,
      rarity: word.rarity || "common"
    });
  } catch (error) {
    console.error("adminSearch Fehler:", error.message);
    res.status(500).json({ ok: false, error: "server" });
  }
});


// SCORE SPEICHERN (SUPABASE)
app.post("/save-score", async (req, res) => {
  if (!ensureSupabase(res)) return;

  const { username, score } = req.body;
  if (!username || Number.isNaN(Number(score))) {
    return res.status(400).json({ ok: false, error: "username und score sind erforderlich" });
  }

  try {
    await saveScore(String(username).trim(), Number(score));
    res.json({ ok: true });
  } catch (error) {
    console.error("save-score Fehler:", error.message);
    res.status(500).json({ ok: false, error: "score konnte nicht gespeichert werden" });
  }
});

// LEADERBOARD LADEN (SUPABASE)
app.get("/leaderboard", async (_req, res) => {
  if (!ensureSupabase(res)) return;

  try {
    const data = await getLeaderboard();
    res.json(data || []);
  } catch (error) {
    console.error("leaderboard Fehler:", error.message);
    res.status(500).json({ ok: false, error: "leaderboard konnte nicht geladen werden" });
  }
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
  socket.on("admin:getSuspectPlayers", async () => {
    try {
      const words = await getAllWordsMap();
      const suspects = calculateSuspectPlayers(words);
      socket.emit("admin:suspectPlayers", suspects);
    } catch (error) {
      console.error("getSuspectPlayers Fehler:", error.message);
      socket.emit("admin:suspectPlayers", []);
    }
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
