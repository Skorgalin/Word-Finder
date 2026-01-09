/* =====================================================
   PLAYER.JS
   - Spielerstatus & Live Typing
   - Spectate / Admin Funktionen
   ===================================================== */

const playerSocket = io();

/* ================= SPIELER STATUS ================= */
let currentPlayerEmail = "";
let isSpectating = false;

/* Wird von index.html beim Login aufgerufen */
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
    <p>Du wurdest gebannt!</p>
    <p>Grund: ${data.reason}</p>
    <p>Dauer: ${data.remaining} Sekunden</p>
  `;
  document.body.appendChild(overlay);
  wordInput.disabled = true;
});

/* ================= SPECTATE ================= */
playerSocket.on("spectate:start", (data) => {
  isSpectating = true;
  alert("Admin beobachtet dich jetzt (Spectate aktiv).");
});

playerSocket.on("spectate:stop", () => {
  isSpectating = false;
  alert("Admin hat Spectate beendet.");
});

/* ================= ADMIN EVENTS ================= */

/* Admin: Spielerliste empfangen */
playerSocket.on("admin:playersList", (players) => {
  const panel = document.getElementById("playerAdminPanel");
  if (!panel) return;
  panel.innerHTML = "";
  players.forEach(p => {
    const div = document.createElement("div");
    div.style.border = "1px solid #555";
    div.style.padding = "5px";
    div.style.margin = "3px";
    div.textContent = `${p.email} | Online: ${p.online} | Banned: ${p.banned ? p.banned.reason : "Nein"}`;
    
    // Buttons für Spectate / Ban
    const spectateBtn = document.createElement("button");
    spectateBtn.textContent = "Spectate";
    spectateBtn.onclick = () => {
      playerSocket.emit("spectate:start", { targetEmail: p.email });
    };
    const banBtn = document.createElement("button");
    banBtn.textContent = "Bannen";
    banBtn.onclick = () => {
      const reason = prompt("Grund für Ban:");
      const duration = parseInt(prompt("Dauer in Sekunden:"));
      if (!reason || !duration) return;
      playerSocket.emit("admin:banPlayer", { email: p.email, reason, duration });
    };
    div.appendChild(spectateBtn);
    div.appendChild(banBtn);

    panel.appendChild(div);
  });
});

/* Admin: Bann erfolgreich */
playerSocket.on("admin:banSuccess", (data) => {
  alert(`${data.email} wurde gebannt.`);
});

/* ================= OFFLINE ================= */
window.addEventListener("beforeunload", () => {
  playerSocket.emit("player:offline", {
    email: currentPlayerEmail
  });
});
playerSocket.on("player:banned", data => {
  document.body.innerHTML = `
    <div style="color:red;text-align:center;margin-top:50px;">
      <h1>Du wurdest gebannt</h1>
      <p>${data.reason}</p>
      <p>Restzeit: ${data.remaining}s</p>
    </div>
  `;
});
