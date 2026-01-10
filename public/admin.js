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

  const panel = document.getElementById("playerAdminPanel");
  if(panel) panel.innerHTML = "";

  players.forEach(p => {
    // Spielerliste Hauptpanel
    const div = document.createElement("div");
    div.textContent = `${p.email} | Online: ${p.online ? "Ja":"Nein"} | Banned: ${p.banned ? p.banned.reason:"Nein"}`;
    list.appendChild(div);

    // Detailliertes Admin-Panel
    if(panel){
      const div2 = document.createElement("div");
      div2.style.border = "1px solid #555";
      div2.style.padding = "5px";
      div2.style.margin = "3px";
      div2.textContent = `${p.email} | Online: ${p.online ? "Ja":"Nein"} | Banned: ${p.banned ? p.banned.reason:"Nein"}`;

      // Buttons Spectate / Ban
      const spectateBtn = document.createElement("button");
      spectateBtn.textContent = "Spectate";
      spectateBtn.onclick = () => {
        socket.emit("admin:spectateStart", { email: p.email });
      };

      const banBtn = document.createElement("button");
      banBtn.textContent = "Bannen";
      banBtn.onclick = () => {
        const reason = prompt("Grund für Ban:");
        const duration = parseInt(prompt("Dauer in Sekunden:"));
        if (!reason || !duration) return;
        socket.emit("admin:banPlayer", { email: p.email, reason, duration });
      };

      div2.appendChild(spectateBtn);
      div2.appendChild(banBtn);

      panel.appendChild(div2);
    }
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
  if(box) box.innerText = `${data.email} tippt: ${data.text}`;
});
