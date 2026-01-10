const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const fs = require("fs-extra");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const usersFile = path.join(__dirname, "users.json");

app.use(express.static("public"));
app.use(express.json());

/* ================== PLAYER STATE ================== */
const onlinePlayers = {}; // email -> socket.id
const bannedPlayers = {}; // email -> { reason, until }
const spectatingAdmins = {}; // adminSocketId -> playerEmail

/* ================== REGISTER ================== */
app.post("/register", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.json({ ok: false });

  let users = {};
  if (await fs.pathExists(usersFile)) {
    users = await fs.readJson(usersFile);
  }

  if (users[email]) return res.json({ ok: false }); // schon vorhanden

  users[email] = { password, admin: false };
  await fs.writeJson(usersFile, users);

  res.json({ ok: true, admin: false });
});

/* ================== LOGIN ================== */
app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.json({ ok: false });

  let users = {};
  if (await fs.pathExists(usersFile)) {
    users = await fs.readJson(usersFile);
  }

  if (users[email] && users[email].password === password) {
    return res.json({ ok: true, admin: users[email].admin });
  }

  res.json({ ok: false });
});

/* ================== CHECK EMAIL ================== */
app.post("/checkEmail", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.json({ exists: false });

  let users = {};
  if (await fs.pathExists(usersFile)) {
    users = await fs.readJson(usersFile);
  }

  res.json({ exists: !!users[email] });
});

/* ================== SUBMIT ITEM ================== */
app.post("/submitItem", (req, res) => {
  const { email, input } = req.body;
  if (!email || !input) return res.json({ ok: false });

  // Simpler Demo-Output, kann angepasst werden
  const output = input.split("").reverse().join(""); 
  const firstDiscovery = true; // Optional: Logik für First Discovery

  res.json({ ok: true, input, output, firstDiscovery });
});

/* ================== SOCKET ================== */
io.on("connection", (socket) => {

  /* ===== PLAYER ONLINE ===== */
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

  /* ===== PLAYER OFFLINE ===== */
  socket.on("disconnect", () => {
    for (const email in onlinePlayers) {
      if (onlinePlayers[email] === socket.id) {
        delete onlinePlayers[email];
        break;
      }
    }
    emitPlayersList();
    io.emit("admin:onlineCount", Object.keys(onlinePlayers).length);
  });

  /* ===== LIVE TYPING (SPECTATE) ===== */
  socket.on("player:typing", ({ email, text }) => {
    for (const adminId in spectatingAdmins) {
      if (spectatingAdmins[adminId] === email) {
        io.to(adminId).emit("spectate:typing", { email, text });
      }
    }
  });

  /* ===== ITEM FOUND (OPTIONAL) ===== */
  socket.on("player:itemFound", ({ email, input, output }) => {
    for (const adminId in spectatingAdmins) {
      if (spectatingAdmins[adminId] === email) {
        io.to(adminId).emit("spectate:itemFound", { email, input, output });
      }
    }
  });

  /* ================= ADMIN ================= */
  socket.on("admin:getPlayers", () => {
    emitPlayersList(socket);
  });

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

    emitPlayersList();
    io.emit("admin:onlineCount", Object.keys(onlinePlayers).length);
  });

  socket.on("admin:spectateStart", ({ email }) => {
    spectatingAdmins[socket.id] = email;
  });

  socket.on("admin:spectateStop", () => {
    delete spectatingAdmins[socket.id];
  });
});

/* ================= HELPER ================= */
function emitPlayersList(targetSocket) {
  const players = Object.keys(onlinePlayers).map(email => {
    const ban = bannedPlayers[email];
    return {
      email,
      online: !!onlinePlayers[email],
      banned: ban && Date.now() < ban.until ? ban : null
    };
  });
  if (targetSocket) {
    targetSocket.emit("admin:playersList", players);
  } else {
    io.emit("admin:playersList", players);
  }
}

/* ================== START ================== */
server.listen(PORT, () => {
  console.log("Server läuft auf Port", PORT);
});
