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

// ================== MIDDLEWARE ==================
app.use(express.static("public"));
app.use(express.json());

// ================== INIT USERS.JSON ==================
if (!fs.existsSync(usersFile)) {
  fs.writeJsonSync(usersFile, {}, { spaces: 2 });
}

// ================== PLAYER STATE ==================
const onlinePlayers = {}; // email -> socket.id
const bannedPlayers = {}; // email -> { reason, until }
const spectatingAdmins = {}; // adminSocketId -> playerEmail

// ================== USER MANAGEMENT ==================

// Prüfen, ob E-Mail existiert (für Button-Anzeige)
app.post("/checkEmail", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.json({ exists: false });

  const users = await fs.readJson(usersFile);
  res.json({ exists: !!users[email] });
});

// Registrieren
app.post("/register", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.json({ ok: false });

  let users = await fs.readJson(usersFile);

  if (users[email]) return res.json({ ok: false }); // existiert schon

  users[email] = { password, admin: false };
  await fs.writeJson(usersFile, users, { spaces: 2 });

  res.json({ ok: true, admin: false }); // direkt ins Game
});

// Login
app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.json({ ok: false });

  const users = await fs.readJson(usersFile);

  if (!users[email] || users[email].password !== password) {
    return res.json({ ok: false });
  }

  res.json({ ok: true, admin: users[email].admin || false });
});

// ================== SOCKET.IO ==================
io.on("connection", (socket) => {

  // Spieler online
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

  // Spieler offline
  socket.on("player:offline", ({ email }) => {
    delete onlinePlayers[email];
    io.emit("admin:onlineCount", Object.keys(onlinePlayers).length);
  });

  socket.on("disconnect", () => {
    for (const email in onlinePlayers) {
      if (onlinePlayers[email] === socket.id) {
        delete onlinePlayers[email];
        break;
      }
    }
    io.emit("admin:onlineCount", Object.keys(onlinePlayers).length);
  });

  // Live-Typing für Spectate
  socket.on("player:typing", ({ email, text }) => {
    for (const adminId in spectatingAdmins) {
      if (spectatingAdmins[adminId] === email) {
        io.to(adminId).emit("spectate:typing", { email, text });
      }
    }
  });

  // Spectate Start
  socket.on("admin:spectateStart", ({ email }) => {
    spectatingAdmins[socket.id] = email;
  });

  // Spectate Stop
  socket.on("admin:spectateStop", () => {
    delete spectatingAdmins[socket.id];
  });

  // Admin: Spielerliste
  socket.on("admin:getPlayers", () => {
    const players = Object.keys(onlinePlayers).map(email => ({ email }));
    socket.emit("admin:playersList", players);
  });

  // Admin: Bann
  socket.on("admin:banPlayer", ({ email, reason, duration }) => {
    bannedPlayers[email] = { reason, until: Date.now() + duration * 1000 };

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

});

// ================== START SERVER ==================
server.listen(PORT, () => {
  console.log("Server läuft auf Port", PORT);
});
