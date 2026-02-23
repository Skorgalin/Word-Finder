/* =====================================================
   PLAYER.JS
   - Spielerstatus & Live Typing
   - Spectate / Owner Funktionen
   ===================================================== */

window.playerSocket = window.playerSocket || io();
const playerSocket = window.playerSocket;

/* ================= SPIELER STATUS ================= */
let currentPlayerEmail = "";
let isSpectating = false;

/* ================= FOUND ITEMS SET ================= */
const foundSet = new Set(); // NEU: für keine Duplikate in Found Items

/* Wird von index.html beim Login aufgerufen */
function initPlayer(email, role = {}) {
  currentPlayerEmail = email;

  playerSocket.emit("player:online", {
    email: currentPlayerEmail,
    owner: !!role.owner,
    admin: !!role.admin
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
  const key = input + "->" + output;
  if (foundSet.has(key)) return; // Schon gemeldet, nichts tun
  foundSet.add(key);

  playerSocket.emit("player:itemFound", {
    email: currentPlayerEmail,
    input,
    output
  });
}

/* ================= BAN / OFFLINE ================= */
playerSocket.on("player:banned", (data) => {
  const overlay = document.createElement("div");
  overlay.style.position = "fixed";
  overlay.style.top = "0";
  overlay.style.left = "0";
  overlay.style.width = "100%";
  overlay.style.height = "100%";
  overlay.style.background = "rgba(0,0,0,0.95)";
  overlay.style.color = "red";
  overlay.style.fontSize = "20px";
  overlay.style.display = "flex";
  overlay.style.flexDirection = "column";
  overlay.style.justifyContent = "center";
  overlay.style.alignItems = "center";
  overlay.style.zIndex = "9999";
  overlay.innerHTML = `
    <h1>Du wurdest gebannt!</h1>
    <p>Grund: ${data.reason}</p>
    <p>Dauer: ${data.permanent ? "Permanent" : `${data.remaining} Sekunden`}</p>
  `;
  document.body.appendChild(overlay);
  if(wordInput) wordInput.disabled = true;
});

/* ================= SPECTATE ================= */
playerSocket.on("spectate:start", (data) => {
  isSpectating = true;
  alert("Owner beobachtet dich jetzt (Spectate aktiv).");
});

playerSocket.on("spectate:stop", () => {
  isSpectating = false;
  alert("Owner hat Spectate beendet.");
});

/* ================= OWNER EVENTS ================= */
// Owner-Panel-Events werden zentral in index.html gehandhabt.

/* ================= OFFLINE ================= */
window.addEventListener("beforeunload", () => {
  playerSocket.emit("player:offline", {
    email: currentPlayerEmail
  });
});
