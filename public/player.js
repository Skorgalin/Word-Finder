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
let banOverlay = null;
let banCountdownInterval = null;

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
  if (foundSet.has(key)) return;
  foundSet.add(key);

  playerSocket.emit("player:itemFound", {
    email: currentPlayerEmail,
    input,
    output
  });
}

function formatDuration(totalSeconds) {
  const safe = Math.max(0, Number(totalSeconds) || 0);
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function clearBanOverlay() {
  if (banCountdownInterval) {
    clearInterval(banCountdownInterval);
    banCountdownInterval = null;
  }
  if (banOverlay && banOverlay.parentNode) {
    banOverlay.parentNode.removeChild(banOverlay);
  }
  banOverlay = null;
  if (wordInput) wordInput.disabled = false;
}

function showBanOverlay(data) {
  clearBanOverlay();

  let remaining = data.permanent ? null : Math.max(0, Number(data.remaining) || 0);
  banOverlay = document.createElement("div");
  banOverlay.style.position = "fixed";
  banOverlay.style.top = "0";
  banOverlay.style.left = "0";
  banOverlay.style.width = "100%";
  banOverlay.style.height = "100%";
  banOverlay.style.background = "rgba(0,0,0,0.95)";
  banOverlay.style.color = "red";
  banOverlay.style.fontSize = "20px";
  banOverlay.style.display = "flex";
  banOverlay.style.flexDirection = "column";
  banOverlay.style.justifyContent = "center";
  banOverlay.style.alignItems = "center";
  banOverlay.style.zIndex = "9999";

  const reason = document.createElement("p");
  reason.textContent = `Grund: ${data.reason || "-"}`;

  const duration = document.createElement("p");
  duration.textContent = data.permanent
    ? "Dauer: Permanent"
    : `Verbleibend: ${formatDuration(remaining)}`;

  banOverlay.innerHTML = "<h1>Du wurdest gebannt!</h1>";
  banOverlay.appendChild(reason);
  banOverlay.appendChild(duration);
  document.body.appendChild(banOverlay);

  if (!data.permanent) {
    banCountdownInterval = setInterval(() => {
      remaining = Math.max(0, remaining - 1);
      duration.textContent = `Verbleibend: ${formatDuration(remaining)}`;
    }, 1000);
  }

  if (wordInput) wordInput.disabled = true;
}

/* ================= BAN / OFFLINE ================= */
playerSocket.on("player:banned", (data) => {
  showBanOverlay(data || {});
});

playerSocket.on("player:unbanned", () => {
  clearBanOverlay();
  alert("Du wurdest entbannt.");
});

/* ================= SPECTATE ================= */
playerSocket.on("spectate:start", () => {
  isSpectating = true;
  alert("Owner beobachtet dich jetzt (Spectate aktiv).");
});

playerSocket.on("spectate:stop", () => {
  isSpectating = false;
  alert("Owner hat Spectate beendet.");
});

/* ================= OFFLINE ================= */
window.addEventListener("beforeunload", () => {
  playerSocket.emit("player:offline", {
    email: currentPlayerEmail
  });
});
