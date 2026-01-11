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
function makeOutput(input) {
  return input.split("").reverse().join("");
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

  if (users[email]) {
    return res.json({ ok: false });
  }

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

  if (!users[email]) {
    return res.json({ ok: false });
  }

  const ok = await bcrypt.compare(password, users[email].password);
  if (!ok) {
    return res.json({ ok: false });
  }

  res.json({ ok: true, admin: users[email].admin });
});

/* ================= GAME ================= */

// WORD SUBMIT + FIRST DISCOVERY
app.post("/submitItem", (req, res) => {
  const { email, input } = req.body;
  if (!input) return res.json({ ok: false });

  const words = loadWords();
  const output = makeOutput(input);

  let firstDiscovery = false;

  if (!words[input]) {
    words[input] = {
      output,
      discoveredBy: email,
      time: Date.now()
    };
    saveWords(words);
    firstDiscovery = true;
  }

  res.json({
    ok: true,
    input,
    output,
    firstDiscovery
  });
});

// ADMIN SEARCH
app.post("/adminSearch", (req, res) => {
  const { query } = req.body;
  const words = loadWords();

  if (!words[query]) {
    return res.json({ ok: false });
  }

  res.json({
    ok: true,
    input: query,
    output: words[query].output
  });
});

/* ================= SOCKET.IO ================= */
io.on("connection", (socket) => {

  /* PLAYER ONLINE */
  socket.on("player:online", ({ email }) => {
    const ban = bannedPlayers[email];
    if (ban && Date.now() < ban.until) {
      socket.emit("player:banned", {
        reason: ban.reason,
        remaining: Math.ceil((ban.until - Date.now()) / 1000)
      });
      return;
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

  // BAN PLAYER
  socket.on("admin:banPlayer", ({ email, reason, duration }) => {
    bannedPlayers[email] = {
      reason,
      until: Date.now() + duration * 1000
    };

    const target = onlinePlayers[email];
    if (target) {
      io.to(target).emit("player:banned", {
        reason,
        remaining: duration
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
