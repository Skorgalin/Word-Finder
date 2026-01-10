const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static("public"));

/* ================== PLAYER STATE ================== */
const onlinePlayers = {}; // email -> socket.id
const bannedPlayers = {}; // email -> { reason, until }
const spectatingAdmins = {}; // adminSocketId -> playerEmail

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

    // Admin Liste aktualisieren
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

  // Spielerliste
  socket.on("admin:getPlayers", () => {
    emitPlayersList(socket);
  });

  // Bann
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

  // Spectate Start
  socket.on("admin:spectateStart", ({ email }) => {
    spectatingAdmins[socket.id] = email;
  });

  // Spectate Stop
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
  if(targetSocket){
    targetSocket.emit("admin:playersList", players);
  } else {
    io.emit("admin:playersList", players);
  }
}

/* ================== START ================== */
server.listen(PORT, () => {
  console.log("Server läuft auf Port", PORT);
});
