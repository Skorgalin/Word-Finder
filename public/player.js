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

/* Owner: Spielerliste empfangen */
playerSocket.on("owner:playersList", (players) => {
  const panel = document.getElementById("playersList");
  if (!panel) return;
  panel.innerHTML = "";
  players.forEach(p => {
    const div = document.createElement("div");
    div.style.border = "1px solid #555";
    div.style.padding = "5px";
    div.style.margin = "3px";
    div.textContent = `${p.email} | Online: ${p.online || "Ja"} | Banned: ${p.banned ? p.banned.reason : "Nein"}`;
    
    // Buttons für Spectate / Ban
    const spectateBtn = document.createElement("button");
    spectateBtn.textContent = "Spectate";
    spectateBtn.onclick = () => {
      playerSocket.emit("owner:spectateStart", { email: p.email });
    };
    const banBtn = document.createElement("button");
    banBtn.textContent = "Bannen";
    banBtn.onclick = () => {
      const reason = prompt("Grund für Ban:");
      const duration = parseInt(prompt("Dauer in Sekunden:"));
      if (!reason || !duration) return;
      playerSocket.emit("owner:banPlayer", { email: p.email, reason, duration });
    };
    div.appendChild(spectateBtn);
    div.appendChild(banBtn);

    panel.appendChild(div);
  });
});

/* Owner: Bann erfolgreich */
playerSocket.on("owner:banSuccess", (data) => {
  alert(`${data.email} wurde gebannt.`);
});

/* ================= OFFLINE ================= */
window.addEventListener("beforeunload", () => {
  playerSocket.emit("player:offline", {
    email: currentPlayerEmail
  });
});
