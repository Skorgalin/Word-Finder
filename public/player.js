const playerSocket = io();

let currentPlayerEmail = "";
let isSpectating = false;

function initPlayer(email) {
  currentPlayerEmail = email;
  playerSocket.emit("player:online", { email });
}

// Live-Typing
const wordInput = document.getElementById("word");
if (wordInput) {
  wordInput.addEventListener("input", () => {
    playerSocket.emit("player:typing", { email: currentPlayerEmail, text: wordInput.value });
  });
}

// Item gefunden
function notifyItemFound(input, output) {
  playerSocket.emit("player:itemFound", { email: currentPlayerEmail, input, output });
}

// Spectate
playerSocket.on("spectate:start", () => {
  isSpectating = true;
  alert("Admin beobachtet dich jetzt (Spectate aktiv).");
});
playerSocket.on("spectate:stop", () => {
  isSpectating = false;
  alert("Admin hat Spectate beendet.");
});

// Admin Events
playerSocket.on("admin:playersList", (players) => {
  const panel = document.getElementById("playerAdminPanel");
  if (!panel) return;
  panel.innerHTML = "";
  players.forEach(p => {
    const div = document.createElement("div");
    div.textContent = `${p.email}`;
    panel.appendChild(div);
  });
});

// Bann / Offline
window.addEventListener("beforeunload", () => {
  playerSocket.emit("player:offline", { email: currentPlayerEmail });
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
