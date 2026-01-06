/* =====================================================
   PLAYER.JS
   - Realtime Spielerstatus
   - Live Typing
   - Found Items Updates
   - Spectate & Admin Player Management
   ===================================================== */

const playerSocket = io();

/* ================= SPIELER STATUS ================= */
let currentPlayerEmail = "";
let isSpectating = false;
let spectateTarget = null; // E-Mail des Spielers den Admin gerade beobachtet

/* ================= INIT SPIELER ================= */
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

/* ================= ADMIN: SPIELER VERWALTEN ================= */
function openPlayerManagement() {
  playerSocket.emit("admin:getPlayers", {}, (players) => {
    // Hier kannst du z.B. ein Overlay oder Modal öffnen
    // und die Spieler auflisten
    showPlayerList(players);
  });
}

function showPlayerList(players) {
  // Beispiel: Erstelle HTML-Liste
  const container = document.getElementById("adminPlayerList");
  container.innerHTML = "";
  players.forEach(p => {
    const div = document.createElement("div");
    div.textContent = p.email + (p.online ? " (online)" : " (offline)");
    
    // Spectate Button
    const specBtn = document.createElement("button");
    specBtn.textContent = "Spectate";
    specBtn.onclick = () => startSpectate(p.email);

    // Ban Button
    const banBtn = document.createElement("button");
    banBtn.textContent = "Bannen";
    banBtn.onclick = () => openBanModal(p.email);

    div.appendChild(specBtn);
    div.appendChild(banBtn);
    container.appendChild(div);
  });
}

/* ================= SPECTATE ================= */
function startSpectate(email) {
  spectateTarget = email;
  isSpectating = true;
  playerSocket.emit("spectate:start", { target: email });

  // Hier könntest du Overlay/Modal für Spectate öffnen
}

playerSocket.on("spectate:update", (data) => {
  if (!isSpectating || data.email !== spectateTarget) return;
  // Aktualisiere Spectate-View mit data
  updateSpectateView(data);
});

function stopSpectate() {
  if (!isSpectating) return;
  playerSocket.emit("spectate:stop", { target: spectateTarget });
  isSpectating = false;
  spectateTarget = null;
  // Overlay/Modal schließen
}

/* ================= BAN ================= */
function openBanModal(email) {
  const reason = prompt("Grund für Bann:");
  const duration = prompt("Dauer in Minuten:");

  if (!reason || !duration) return;

  playerSocket.emit("admin:banPlayer", {
    email,
    reason,
    duration: parseInt(duration)
  });
}

/* ================= OFFLINE ================= */
window.addEventListener("beforeunload", () => {
  playerSocket.emit("player:offline", {
    email: currentPlayerEmail
  });
});

/* ================= ONLINE ZÄHLER ================= */
playerSocket.on("players:onlineCount", (count) => {
  const el = document.getElementById("onlineCount");
  if (el) el.textContent = `Online Spieler: ${count}`;
});

/* ================= HILFSFUNKTIONEN ================= */
function updateSpectateView(data) {
  const overlay = document.getElementById("spectateOverlay");
  if (!overlay) return;
  overlay.textContent = `Spieler: ${data.email}\nEingabe: ${data.text}\nItems gefunden: ${data.items.map(i => i.input + "→" + i.output).join(", ")}`;
}
