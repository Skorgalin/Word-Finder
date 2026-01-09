const socket = io();

/* ===== ONLINE COUNT ===== */
socket.on("admin:onlineCount", count => {
  const el = document.getElementById("onlineCount");
  if (el) el.innerText = count;
});

/* ===== PLAYERS ===== */
function loadPlayers() {
  socket.emit("admin:getPlayers");
}

socket.on("admin:playersList", players => {
  const list = document.getElementById("playersList");
  list.innerHTML = "";

  players.forEach(p => {
    const div = document.createElement("div");
    div.innerHTML = `
      ${p.email}
      <button onclick="spectate('${p.email}')">Spectate</button>
      <button onclick="ban('${p.email}')">Bannen</button>
    `;
    list.appendChild(div);
  });
});

/* ===== BAN ===== */
function ban(email) {
  const reason = prompt("Grund:");
  const duration = Number(prompt("Dauer (Sekunden):"));

  socket.emit("admin:banPlayer", {
    email,
    reason,
    duration
  });
}

/* ===== SPECTATE ===== */
function spectate(email) {
  socket.emit("admin:spectateStart", { email });
}

/* ===== LIVE VIEW ===== */
socket.on("spectate:typing", data => {
  const box = document.getElementById("spectateBox");
  box.innerText = `${data.email} tippt: ${data.text}`;
});
