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
const OWNER_EMAIL = "till.behner@icloud.com";
const REQUIRE_SUPABASE = process.env.REQUIRE_SUPABASE === "true";

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
const spectatingOwners = {};  // privilegedSocketId -> playerEmail
const socketRoles = {};        // socket.id -> { email, owner, admin }
const ownerSockets = new Set();
const playerRecentActions = {}; // email -> [{ input, output, rarity, time }]
const chatServers = {};           // serverId -> Set<email>
const userChatServer = {};        // email -> serverId
const MAX_CHAT_SERVER_SIZE = 20;

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


function canFallbackToLocal(error) {
  if (REQUIRE_SUPABASE) return false;
  console.warn("Supabase Fehler, fallback auf lokale Dateien:", error?.message || error);
  return true;
}

function ensurePersistentStore(res) {
  if (supabase) return true;

  if (REQUIRE_SUPABASE) {
    res.status(503).json({
      ok: false,
      error: "Persistenz benötigt Supabase. Bitte SUPABASE_URL und SUPABASE_KEY setzen."
    });
    return false;
  }

  // Default: lokaler Fallback erlaubt (users.json / words.json)
  return true;
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
  return data || [];
}


async function getUserByEmail(email) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) return null;

  if (!supabase) {
    const users = loadUsers();
    return users[normalizedEmail] ? normalizeUserRole({ email: normalizedEmail, ...users[normalizedEmail] }, normalizedEmail) : null;
  }

  const selectCandidates = [
    "email,password,admin,role,nickname",
    "email,password,owner,role,nickname",
    "email,password,admin,nickname",
    "email,password,owner,nickname",
    "email,password,admin,role",
    "email,password,owner,role",
    "email,password,admin",
    "email,password,owner"
  ];

  let data = null;
  let error = null;
  for (const selectFields of selectCandidates) {
    ({ data, error } = await supabase
      .from("users")
      .select(selectFields)
      .eq("email", normalizedEmail)
      .maybeSingle());
    if (!error) break;
  }

  if (error) {
    if (canFallbackToLocal(error)) {
      const users = loadUsers();
      return users[normalizedEmail] ? normalizeUserRole({ email: normalizedEmail, ...users[normalizedEmail] }, normalizedEmail) : null;
    }
    throw error;
  }
  return normalizeUserRole(data, normalizedEmail);
}

async function createUser(email, passwordHash, nickname) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) throw new Error("email_required");
  const safeNickname = String(nickname || "").trim() || normalizedEmail.split("@")[0];

  if (!supabase) {
    const users = loadUsers();
    users[normalizedEmail] = { password: passwordHash, admin: normalizedEmail === OWNER_EMAIL, role: normalizedEmail === OWNER_EMAIL ? "owner" : "player", nickname: safeNickname };
    saveUsers(users);
    return;
  }

  const insertCandidates = [
    { email: normalizedEmail, password: passwordHash, admin: normalizedEmail === OWNER_EMAIL, role: normalizedEmail === OWNER_EMAIL ? "owner" : "player", nickname: safeNickname },
    { email: normalizedEmail, password: passwordHash, owner: normalizedEmail === OWNER_EMAIL, role: normalizedEmail === OWNER_EMAIL ? "owner" : "player", nickname: safeNickname },
    { email: normalizedEmail, password: passwordHash, admin: normalizedEmail === OWNER_EMAIL, nickname: safeNickname },
    { email: normalizedEmail, password: passwordHash, owner: normalizedEmail === OWNER_EMAIL, nickname: safeNickname },
    { email: normalizedEmail, password: passwordHash, admin: normalizedEmail === OWNER_EMAIL },
    { email: normalizedEmail, password: passwordHash, owner: normalizedEmail === OWNER_EMAIL }
  ];

  let result = null;
  for (const payload of insertCandidates) {
    result = await supabase.from("users").insert([payload]);
    if (!result.error) break;
  }

  if (!result || result.error) {
    if (canFallbackToLocal(result?.error)) {
      const users = loadUsers();
      users[normalizedEmail] = { password: passwordHash, admin: normalizedEmail === OWNER_EMAIL, role: normalizedEmail === OWNER_EMAIL ? "owner" : "player", nickname: safeNickname };
      saveUsers(users);
      return;
    }
    throw result?.error || new Error("create_user_failed");
  }
}


async function setUserRole(email, roleName) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const role = String(roleName || "player").toLowerCase();
  const admin = role === "admin" || role === "owner";
  if (!normalizedEmail) return false;

  if (!supabase) {
    const users = loadUsers();
    if (!users[normalizedEmail]) return false;
    users[normalizedEmail].admin = !!admin;
    users[normalizedEmail].role = role;
    saveUsers(users);
    return true;
  }

  const updateCandidates = [
    { admin: !!admin, role },
    { owner: !!admin, role },
    { admin: !!admin },
    { owner: !!admin }
  ];

  let query = null;
  for (const payload of updateCandidates) {
    query = await supabase
      .from("users")
      .update(payload)
      .eq("email", normalizedEmail)
      .select("email")
      .maybeSingle();
    if (!query.error) break;
  }

  if (!query || query.error) {
    if (canFallbackToLocal(query?.error)) {
      const users = loadUsers();
      if (!users[normalizedEmail]) return false;
      users[normalizedEmail].admin = !!admin;
      users[normalizedEmail].role = role;
      saveUsers(users);
      return true;
    }
    throw query?.error || new Error("set_user_role_failed");
  }
  return !!query.data;
}

async function setUserAdmin(email, admin) {
  return setUserRole(email, admin ? "admin" : "player");
}

async function updateUserNickname(email, nickname) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const safeNickname = String(nickname || "").trim();
  if (!normalizedEmail || !safeNickname) return;

  if (!supabase) {
    const users = loadUsers();
    if (!users[normalizedEmail]) return;
    users[normalizedEmail].nickname = safeNickname;
    saveUsers(users);
    return;
  }

  let query = await supabase.from("users").update({ nickname: safeNickname }).eq("email", normalizedEmail);
  if (query.error) {
    query = await supabase.from("users").update({ nickname: safeNickname, updated_at: Date.now() }).eq("email", normalizedEmail);
  }

  const { error } = query;
  if (error && canFallbackToLocal(error)) {
    const users = loadUsers();
    if (!users[normalizedEmail]) return;
    users[normalizedEmail].nickname = safeNickname;
    saveUsers(users);
    return;
  }
  if (error) throw error;
}

function canModerate(role) {
  return !!(role && (role.owner || role.admin || role.moderator));
}

async function isPrivilegedEmail(email) {
  if (!email) return false;
  if (email === OWNER_EMAIL) return true;
  const user = await getUserByEmail(email);
  return !!(user && (user.admin || user.moderator));
}

function rememberPlayerAction(email, input, output, rarity) {
  if (!playerRecentActions[email]) playerRecentActions[email] = [];
  playerRecentActions[email].push({ input, output, rarity, time: Date.now() });
  if (playerRecentActions[email].length > 20) {
    playerRecentActions[email] = playerRecentActions[email].slice(-20);
  }
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

async function updateWordDiscovery(input, discoveredBy, discoveredAt) {
  if (!supabase) {
    const words = loadWords();
    if (!words[input]) return;
    words[input].discoveredBy = discoveredBy;
    words[input].time = discoveredAt;
    saveWords(words);
    return;
  }

  const { error } = await supabase
    .from("word_mappings")
    .update({ discovered_by: discoveredBy, discovered_at: discoveredAt })
    .eq("input", input);

  if (error) throw error;
}

async function replaceAllWordMappings(words) {
  if (!supabase) {
    saveWords(words);
    return;
  }

  const rows = Object.entries(words).map(([input, entry]) => ({
    input,
    output: entry.output,
    rarity: entry.rarity || "common",
    discovered_by: entry.discoveredBy || null,
    discovered_at: entry.time || Date.now()
  }));

  const del = await supabase.from("word_mappings").delete().neq("input", "");
  if (del.error) throw del.error;

  if (rows.length) {
    const ins = await supabase.from("word_mappings").insert(rows);
    if (ins.error) throw ins.error;
  }
}

function findInputByOutput(words, output) {
  for (const [input, data] of Object.entries(words)) {
    if (data?.output === output) return input;
  }
  return null;
}

function makeOwnerInput(words) {
  let candidate = `${Math.random().toString(36).slice(2, 10)}`;
  while (words[candidate]) {
    candidate = `${Math.random().toString(36).slice(2, 10)}`;
  }
  return candidate;
}


function normalizeUserRole(user, emailFallback = "") {
  if (!user) return null;
  const email = user.email || emailFallback;
  const isOwner = email === OWNER_EMAIL;
  const role = isOwner ? "owner" : (user.role || (user.admin || user.owner ? "admin" : "player"));
  const isAdmin = role === "admin" || role === "owner";
  const isModerator = role === "moderator" || isAdmin;
  return {
    ...user,
    email,
    role,
    nickname: user.nickname || email.split("@")[0],
    owner: isOwner,
    admin: isAdmin,
    moderator: isModerator
  };
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
  if (!ensurePersistentStore(res)) return;
  const email = String(req.body?.email || "").trim().toLowerCase();
  if (!email) return res.json({ exists: false });
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
  if (!ensurePersistentStore(res)) return;
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  const nickname = String(req.body?.nickname || "").trim();
  if (!email || !password) return res.status(400).json({ ok: false, error: "email_password_required" });

  try {
    const existingUser = await getUserByEmail(email);
    if (existingUser) return res.json({ ok: false, error: "exists" });

    const hash = await bcrypt.hash(password, 10);
    const owner = email === OWNER_EMAIL;
    await createUser(email, hash, String(nickname || "").trim() || email.split("@")[0]);

    res.json({ ok: true, owner, admin: owner, moderator: owner, nickname: String(nickname || "").trim() || email.split("@")[0] });
  } catch (error) {
    console.error("register Fehler:", error.message);
    res.status(500).json({ ok: false, error: "server" });
  }
});

// LOGIN
app.post("/login", async (req, res) => {
  if (!ensurePersistentStore(res)) return;
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  const nickname = String(req.body?.nickname || "").trim();
  if (!email || !password) return res.json({ ok: false });

  try {
    const user = await getUserByEmail(email);
    if (!user) return res.json({ ok: false });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.json({ ok: false });

    if (nickname) {
      await updateUserNickname(email, nickname);
      user.nickname = nickname;
    }

    res.json({ ok: true, owner: !!user.owner, admin: !!user.admin, moderator: !!user.moderator, nickname: user.nickname });
  } catch (error) {
    console.error("login Fehler:", error.message);
    res.status(500).json({ ok: false });
  }
});

/* ================= GAME ================= */

// WORD SUBMIT + FIRST DISCOVERY
app.post("/submitItem", async (req, res) => {
  if (!ensurePersistentStore(res)) return;
  const email = String(req.body?.email || "").trim().toLowerCase();
  const input = req.body?.input;
  if (!email) return res.json({ ok: false, error: "email_required" });
  const normalizedInput = String(input || "").trim();
  if (!normalizedInput) return res.json({ ok: false });

  try {
    const ban = bannedPlayers[email];
    if (ban) {
      const permanent = ban.until === null;
      const active = permanent || Date.now() < ban.until;
      if (active) {
        return res.json({
          ok: false,
          error: "banned",
          reason: ban.reason,
          remaining: permanent ? null : Math.max(0, Math.ceil((ban.until - Date.now()) / 1000)),
          permanent
        });
      }
      delete bannedPlayers[email];
    }

    let firstDiscovery = false;
    const existing = await getWordByInput(normalizedInput);
    const currentUserPrivileged = await isPrivilegedEmail(email);

    // Bereits bekannt: immer denselben gespeicherten Output zurückgeben.
    if (existing) {
      const previousDiscovererPrivileged = await isPrivilegedEmail(existing.discovered_by || existing.discoveredBy);

      // Owner/Admin Discovery zählt nicht als First Discovery.
      if (!currentUserPrivileged && previousDiscovererPrivileged) {
        firstDiscovery = true;
        await updateWordDiscovery(normalizedInput, email, Date.now());
      }

      rememberPlayerAction(email, normalizedInput, existing.output, existing.rarity || "common");
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
    rememberPlayerAction(email, normalizedInput, output, rarity);
    firstDiscovery = !currentUserPrivileged;

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

// OWNER SEARCH
async function handleOwnerSearch(req, res) {
  if (!ensurePersistentStore(res)) return;
  const { output, desiredInput, rarity } = req.body;
  const requestedRarity = String(rarity || "").trim().toLowerCase();
  const hasRarityOverride = ["common", "selten", "legendär", "mythisch", "godly"].includes(requestedRarity);

  const normalizedOutput = String(output || "").trim();
  if (!normalizedOutput) {
    return res.status(400).json({ ok: false, error: "output_required" });
  }

  try {
    const words = await getAllWordsMap();
    const existingInput = findInputByOutput(words, normalizedOutput);

    if (!existingInput) {
      const inputToUse = String(desiredInput || "").trim() || makeOwnerInput(words);
      const rarityToUse = hasRarityOverride ? requestedRarity : pickRarity();
      words[inputToUse] = {
        output: normalizedOutput,
        rarity: rarityToUse,
        discoveredBy: words[inputToUse]?.discoveredBy || "owner",
        time: words[inputToUse]?.time || Date.now()
      };
      await replaceAllWordMappings(words);

      io.emit("owner:mappingUpdated", {
        oldInput: null,
        newInput: inputToUse,
        output: normalizedOutput,
        rarity: rarityToUse
      });

      return res.json({ ok: true, created: true, input: inputToUse, output: normalizedOutput, rarity: rarityToUse });
    }

    const current = words[existingInput] || {};
    const targetInput = String(desiredInput || "").trim() || existingInput;
    const targetRarity = hasRarityOverride ? requestedRarity : (current.rarity || "common");

    if (targetInput !== existingInput) {
      if (!words[targetInput]) {
        words[targetInput] = { ...current, rarity: targetRarity };
        delete words[existingInput];
      } else {
        const other = words[targetInput];
        words[targetInput] = { ...current, rarity: targetRarity };
        words[existingInput] = other;
      }
    } else {
      words[existingInput] = { ...current, rarity: targetRarity };
    }

    await replaceAllWordMappings(words);

    io.emit("owner:mappingUpdated", {
      oldInput: existingInput,
      newInput: targetInput,
      output: normalizedOutput,
      rarity: targetRarity
    });

    res.json({
      ok: true,
      created: false,
      input: targetInput,
      output: normalizedOutput,
      rarity: targetRarity,
      switchedWith: targetInput !== existingInput && words[existingInput]?.output ? existingInput : null
    });
  } catch (error) {
    console.error("ownerSearch Fehler:", error.message);
    res.status(500).json({ ok: false, error: "server" });
  }
}

app.post("/ownerSearch", handleOwnerSearch);


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
  socket.on("player:online", async ({ email, nickname }) => {
    try {
      email = String(email || "").trim().toLowerCase();
      if (!email) return;
      const user = await getUserByEmail(email);
      if (nickname && String(nickname).trim()) {
        await updateUserNickname(email, String(nickname).trim());
      }
      const role = {
        email,
        nickname: (nickname && String(nickname).trim()) || (user && user.nickname) || email.split("@")[0],
        owner: email === OWNER_EMAIL,
        admin: !!(user && user.admin),
        moderator: !!(user && user.moderator)
      };
      socketRoles[socket.id] = role;
      if (role.owner) ownerSockets.add(socket.id);

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

      let targetServerId = null;
      for (const [sid, members] of Object.entries(chatServers)) {
        if (members.size < MAX_CHAT_SERVER_SIZE) {
          targetServerId = sid;
          break;
        }
      }
      if (!targetServerId) {
        targetServerId = `S${Object.keys(chatServers).length + 1}`;
        chatServers[targetServerId] = new Set();
      }
      chatServers[targetServerId].add(email);
      userChatServer[email] = targetServerId;

      socket.emit("chat:assignedServer", { serverId: targetServerId });
      io.emit("chat:serverList", Object.keys(chatServers));
      io.emit("owner:onlineCount", Object.keys(onlinePlayers).length);
    } catch (error) {
      console.error("player:online Fehler:", error.message);
    }
  });

  /* PLAYER OFFLINE */
  socket.on("player:offline", ({ email }) => {
    if (email && onlinePlayers[email] === socket.id) {
      delete onlinePlayers[email];
    }
    const role = socketRoles[socket.id];
    if (role && role.email) {
      const sid = userChatServer[role.email];
      if (sid && chatServers[sid]) {
        chatServers[sid].delete(role.email);
        if (chatServers[sid].size === 0) delete chatServers[sid];
      }
      delete userChatServer[role.email];
    }
    io.emit("chat:serverList", Object.keys(chatServers));
    io.emit("owner:onlineCount", Object.keys(onlinePlayers).length);
  });

  socket.on("disconnect", () => {
    for (const email in onlinePlayers) {
      if (onlinePlayers[email] === socket.id) {
        delete onlinePlayers[email];
        break;
      }
    }
    io.emit("owner:onlineCount", Object.keys(onlinePlayers).length);
    const role = socketRoles[socket.id];
    if (role && role.email) {
      const sid = userChatServer[role.email];
      if (sid && chatServers[sid]) {
        chatServers[sid].delete(role.email);
        if (chatServers[sid].size === 0) delete chatServers[sid];
      }
      delete userChatServer[role.email];
    }
    delete spectatingOwners[socket.id];
    ownerSockets.delete(socket.id);
    delete socketRoles[socket.id];
    io.emit("chat:serverList", Object.keys(chatServers));
  });

  /* LIVE TYPING (SPECTATE) */
  socket.on("player:typing", ({ email, text }) => {
    email = String(email || "").trim().toLowerCase();
    if (!email) return;
    for (const ownerId in spectatingOwners) {
      if (spectatingOwners[ownerId] === email) {
        io.to(ownerId).emit("spectate:typing", { email, text });
      }
    }
  });

  /* ITEM FOUND (SPECTATE) */
  socket.on("player:itemFound", ({ email, input, output }) => {
    email = String(email || "").trim().toLowerCase();
    if (!email) return;
    for (const ownerId in spectatingOwners) {
      if (spectatingOwners[ownerId] === email) {
        io.to(ownerId).emit("spectate:itemFound", {
          email, input, output
        });
      }
    }
  });

  /* ================= OWNER ================= */

  // ONLINE COUNT
  socket.on("owner:getOnlineCount", () => {
    socket.emit("owner:onlineCount", Object.keys(onlinePlayers).length);
  });

  // PLAYER LIST
  socket.on("owner:getPlayers", () => {
    const requester = socketRoles[socket.id] || {};
    if (!canModerate(requester)) return;
    const players = Object.keys(onlinePlayers).map(email => {
      const sid = onlinePlayers[email];
      const role = socketRoles[sid] || { owner: email === OWNER_EMAIL, admin: false, moderator: false, nickname: email.split("@")[0] };
      return {
        email,
        emailVisible: !!requester.owner,
        nickname: role.nickname || email.split("@")[0],
        owner: !!role.owner,
        admin: !!role.admin,
        moderator: !!role.moderator
      };
    });
    socket.emit("owner:playersList", players);
  });

  // SUSPECT PLAYERS (seltene/godly discovery Muster)
  socket.on("owner:getSuspectPlayers", async () => {
    const role = socketRoles[socket.id];
    if (!canModerate(role)) return;
    try {
      const words = await getAllWordsMap();
      const suspects = calculateSuspectPlayers(words);
      socket.emit("owner:suspectPlayers", suspects);
    } catch (error) {
      console.error("getSuspectPlayers Fehler:", error.message);
      socket.emit("owner:suspectPlayers", []);
    }
  });

  // BAN PLAYER
  socket.on("owner:banPlayer", async ({ email, reason, duration }) => {
    const actor = socketRoles[socket.id];
    if (!canModerate(actor)) return;

    try {
      const targetUser = await getUserByEmail(email);
      const isTargetOwner = email === OWNER_EMAIL;
      const isTargetAdmin = !!(targetUser && targetUser.admin);
      const isTargetModerator = !!(targetUser && targetUser.moderator && !targetUser.admin);

      if (isTargetOwner) {
        socket.emit("owner:banError", { error: "Owner kann nicht gebannt werden." });
        return;
      }
      if (!actor.owner && (isTargetAdmin || isTargetModerator)) {
        socket.emit("owner:banError", { error: "Nur Owner kann Admins/Moderatoren bannen." });
        return;
      }

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
      }

      if (!actor.owner) {
        const history = (playerRecentActions[email] || []).slice(-20);
        for (const ownerSocketId of ownerSockets) {
          io.to(ownerSocketId).emit("owner:banAudit", {
            by: actor.email,
            target: email,
            reason,
            duration,
            permanent,
            recentActions: history
          });
        }
      }

      io.emit("owner:onlineCount", Object.keys(onlinePlayers).length);
    } catch (error) {
      console.error("owner:banPlayer Fehler:", error.message);
    }
  });


  // OWNER: ADMIN RECHTE VERGEBEN
  socket.on("owner:grantAdmin", async ({ email }) => {
    email = String(email || "").trim().toLowerCase();
    if (!email) return;
    const role = socketRoles[socket.id];
    if (!role || !role.owner) return;

    try {
      const ok = await setUserAdmin(email, true);

      if (ok && onlinePlayers[email]) {
        const targetSocketId = onlinePlayers[email];
        const existingRole = socketRoles[targetSocketId] || { email, owner: email === OWNER_EMAIL, admin: false, moderator: false };
        existingRole.admin = true;
        existingRole.moderator = true;
        existingRole.owner = existingRole.owner || email === OWNER_EMAIL;
        socketRoles[targetSocketId] = existingRole;
        io.to(targetSocketId).emit("player:roleUpdated", {
          owner: !!existingRole.owner,
          admin: !!existingRole.admin,
          moderator: !!existingRole.moderator,
          role: existingRole.owner ? "owner" : "admin"
        });
      }

      socket.emit("owner:grantAdminResult", {
        ok,
        email,
        error: ok ? null : "User nicht gefunden"
      });
    } catch (error) {
      console.error("owner:grantAdmin Fehler:", error.message);
      socket.emit("owner:grantAdminResult", { ok: false, email, error: "Serverfehler" });
    }
  });

  
  socket.on("owner:setUserRole", async ({ email, role }) => {
    const actor = socketRoles[socket.id];
    if (!actor || !actor.owner) return;
    email = String(email || "").trim().toLowerCase();
    role = String(role || "player").toLowerCase();
    if (!email || email === OWNER_EMAIL) return;
    if (!["player", "moderator", "admin"].includes(role)) return;

    try {
      const ok = await setUserRole(email, role);
      if (ok && onlinePlayers[email]) {
        const targetSocketId = onlinePlayers[email];
        const existingRole = socketRoles[targetSocketId] || { email, nickname: email.split("@")[0], owner: false, admin: false, moderator: false };
        existingRole.admin = role === "admin";
        existingRole.moderator = role === "moderator" || role === "admin";
        existingRole.owner = false;
        existingRole.role = role;
        socketRoles[targetSocketId] = existingRole;
        io.to(targetSocketId).emit("player:roleUpdated", {
          owner: false,
          admin: existingRole.admin,
          moderator: existingRole.moderator,
          role
        });
      }
      socket.emit("owner:setUserRoleResult", { ok, email, role, error: ok ? null : "User nicht gefunden" });
    } catch (error) {
      socket.emit("owner:setUserRoleResult", { ok: false, email, role, error: "Serverfehler" });
    }
  });
// GEBANNTE SPIELER LADEN
  socket.on("owner:getBannedPlayers", () => {
    const role = socketRoles[socket.id];
    if (!canModerate(role)) return;

    const now = Date.now();
    const data = Object.entries(bannedPlayers).map(([email, ban]) => {
      const permanent = ban.until === null;
      const remaining = permanent ? null : Math.max(0, Math.ceil((ban.until - now) / 1000));
      return { email, reason: ban.reason, permanent, remaining };
    });

    socket.emit("owner:bannedPlayers", data);
  });

  // ENTBANNEN
  socket.on("owner:unbanPlayer", ({ email }) => {
    const role = socketRoles[socket.id];
    if (!canModerate(role)) return;

    if (bannedPlayers[email]) {
      delete bannedPlayers[email];
      const target = onlinePlayers[email];
      if (target) {
        io.to(target).emit("player:unbanned", { ok: true });
      }
      socket.emit("owner:unbanResult", { ok: true, email });
    } else {
      socket.emit("owner:unbanResult", { ok: false, email, error: "Spieler ist nicht gebannt" });
    }
  });

  // SPECTATE START
  socket.on("owner:spectateStart", ({ email }) => {
    const role = socketRoles[socket.id];
    if (!canModerate(role)) return;
    spectatingOwners[socket.id] = email;
  });

  // SPECTATE STOP
  socket.on("owner:spectateStop", () => {
    delete spectatingOwners[socket.id];
  });

  // SUPPORT: Spieler/Admin -> Owner
  socket.on("support:message", ({ from, text }) => {
    const role = socketRoles[socket.id];
    if (!role || !text) return;

    const trimmed = String(text).trim();
    if (!trimmed) return;

    for (const ownerSocketId of ownerSockets) {
      io.to(ownerSocketId).emit("owner:supportMessage", {
        from: role.email || from || "unbekannt",
        nickname: role.nickname || "Player",
        text: trimmed,
        at: Date.now(),
        isAdmin: !!role.admin,
        isOwner: !!role.owner
      });
    }

    socket.emit("support:sent", { ok: true });
  });

  
  socket.on("chat:send", ({ text, serverId }) => {
    const role = socketRoles[socket.id];
    if (!role || !text) return;

    const message = String(text).trim();
    if (!message) return;

    let targetServer = userChatServer[role.email] || null;
    const canChooseServer = !!(role.owner || role.admin || role.moderator);
    if (canChooseServer && serverId && chatServers[serverId]) {
      targetServer = serverId;
    }
    if (!targetServer || !chatServers[targetServer]) return;

    for (const memberEmail of chatServers[targetServer]) {
      const sid = onlinePlayers[memberEmail];
      if (sid) {
        io.to(sid).emit("chat:message", {
          serverId: targetServer,
          nickname: role.nickname || role.email?.split("@")[0] || "Player",
          role: role.owner ? "owner" : (role.admin ? "admin" : (role.moderator ? "moderator" : "player")),
          text: message,
          at: Date.now()
        });
      }
    }
  });

// ANNOUNCEMENTS
  socket.on("ownerAnnouncement", ({ text }) => {
    const role = socketRoles[socket.id];
    if (!role || (!role.owner && !role.moderator)) return;
    io.emit("announcement", { text });
  });
});

/* ================= START ================= */
server.listen(PORT, () => {
  console.log("Server läuft auf Port", PORT);
});
