/* =====================================================
   PLAYER.JS
   - Realtime Spielerstatus
   - Live Typing
   - Grundlage für Spectate
   ===================================================== */

const playerSocket = io();

/* ================= SPIELER STATUS ================= */
let currentPlayerEmail = "";
let isSpectating = false;

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
/* Diese Funktion wird NUR aufgerufen, wenn ein Item
   erfolgreich gefunden wurde */
function notifyItemFound(input, output) {
  playerSocket.emit("player:itemFound", {
    email: currentPlayerEmail,
    input,
    output
  });
}

/* ================= SPECTATE ================= */
/* Admin abonniert Spieler */
playerSocket.on("spectate:start", () => {
  isSpectating = true;
});

/* Admin beendet Spectate */
playerSocket.on("spectate:stop", () => {
  isSpectating = false;
});

/* ================= OFFLINE ================= */
window.addEventListener("beforeunload", () => {
  playerSocket.emit("player:offline", {
    email: currentPlayerEmail
  });
});
