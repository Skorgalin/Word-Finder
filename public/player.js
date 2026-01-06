/* =====================================================
   PLAYER.JS
   - Realtime Spielerstatus
   - Live Typing
   - Grundlage für Spectate
   - Admin: Spieler suchen, bannen, spectaten, Online-Zähler
   ===================================================== */

const playerSocket = io();

/* ================= SPIELER STATUS ================= */
let currentPlayerEmail = "";
let isSpectating = false;

/* Admin Bereich */
let onlinePlayers = {}; // email -> {online: bool, currentText: string, foundItems: []}
let bannedPlayers = {}; // email -> {reason, expires}

/* Wird von index.html aufgerufen */
function initPlayer(email) {
  currentPlayerEmail = email;

  playerSocket.emit("player:online", {
    email: currentPlayerEmail
  });
}

/* ================= LIVE TYPING ================= */
const wordInput = document.getElementById("word");

if (wordInput) {
  wordInput.addEventListener("input", () => {
    playerSocket.emit("player:typing", {
      email: currentPlayerEmail,
      text: wordInput.value
    });
  });
}

/* ================= ITEM GEFUNDEN ================= */
function notifyItemFound(input, output) {
  playerSocket.emit("player:itemFound", {
    email: currentPlayerEmail,
    input,
    output
  });
}

/* ================= SPECTATE ================= */
playerSocket.on("spectate:start", (data) => {
  isSpectating = true;
  console.log("Spectate gestartet für: ", data.email);
});

playerSocket.on("spectate:stop", () => {
  isSpectating = false;
});

/* ================= ADMIN: SPIELER ================= */
// Admin sendet Anfrage, um alle Spieler zu sehen
function requestAllPlayers() {
  playerSocket.emit("admin:getPlayers");
}

// Spieler bannen
function adminBanPlayer(email, reason, durationSeconds) {
  const expires = Date.now() + durationSeconds * 1000;
  playerSocket.emit("admin:banPlayer", { email, reason, expires });
}

// Spieler spectaten
function adminSpectatePlayer(email) {
  playerSocket.emit("admin:spectatePlayer", { email });
}

/* ================= OFFLINE ================= */
window.addEventListener("beforeunload", () => {
  playerSocket.emit("player:offline", {
    email: currentPlayerEmail
  });
});

/* ================= SOCKET EVENTS ================= */

// Spieler Status aktualisieren (Online/Offline)
playerSocket.on("update:onlinePlayers", (data) => {
  onlinePlayers = data; // data: { email: {online, currentText, foundItems} }
  updateOnlineCounter();
});

// Spieler gebannt
playerSocket.on("banned", (data) => {
  if (data.email === currentPlayerEmail) {
    document.body.innerHTML = `
      <div style="color:red; text-align:center; margin-top:50px;">
        <h2>Du wurdest gebannt!</h2>
        <p>Grund: ${data.reason}</p>
        <p>Dauer: ${Math.ceil((data.expires - Date.now()) / 1000)} Sekunden</p>
      </div>
    `;
  }
});

// Realtime Input von spectated Spieler
playerSocket.on("spectate:update", (data) => {
  if (isSpectating) {
    console.log(`Spectate: ${data.email} tippt: ${data.text}`);
  }
});

// Online-Zähler aktualisieren
function updateOnlineCounter() {
  const count = Object.values(onlinePlayers).filter(p => p.online).length;
  console.log("Spieler online:", count);
}
