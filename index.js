const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static("public"));

const ADMIN_EMAIL = "till.behner@icloud.com";
const ADMIN_PASSWORD = "X9$QvR7!eM2#A8wK@C";

// Nutzerdaten werden in users.json gespeichert
const DATA_FILE = path.join(__dirname, "users.json");

// Lade gespeicherte Nutzerdaten oder erstelle neues
let users = {};
if (fs.existsSync(DATA_FILE)) {
  users = JSON.parse(fs.readFileSync(DATA_FILE));
}

// Wörter / Items Speicher (Input → Output)
let items = {};

// Speichere Nutzerdaten
function saveUsers() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(users, null, 2));
}

// Zufallsgenerator
const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{};:'\",.<>/?|";

function generateRandomItem(length = 3) {
  let result = "";
  for (let i = 0; i < length; i++) {
    result += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return result;
}

// --- Endpoints ---

// Registrieren
app.post("/register", (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.json({ ok: false, msg: "Email oder Passwort fehlt" });
  if (users[email]) return res.json({ ok: false, msg: "Email existiert bereits" });
  users[email] = { password, found: [] };
  saveUsers();
  res.json({ ok: true });
});

// Login
app.post("/login", (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.json({ ok: false, msg: "Email oder Passwort fehlt" });
  if (!users[email]) return res.json({ ok: false, msg: "Email existiert nicht" });
  if (users[email].password !== password) return res.json({ ok: false, msg: "Falsches Passwort" });
  res.json({ ok: true, admin: email === ADMIN_EMAIL });
});

// Logout
app.post("/logout", (req, res) => {
  res.json({ ok: true });
});

// Spieler gibt Input ein
app.post("/find", (req, res) => {
  const { email, input } = req.body;
  if (!email || !input || !users[email]) return res.json({ ok: false });

  let output;
  if (items[input]) {
    output = items[input];
  } else {
    output = generateRandomItem();
    items[input] = output;
  }

  // First Discovery
  const firstBy = users[email].found.includes(input) ? false : true;
  if (firstBy) users[email].found.push({ input, output });
  
  res.json({ ok: true, output, firstBy });
});

// Admin Suche
app.post("/admin/find", (req, res) => {
  const { query } = req.body;
  if (!query) return res.json({ ok: false });
  let output = Object.keys(items).find(key => items[key] === query);
  if (!output) {
    const newInput = generateRandomItem();
    items[newInput] = query;
    output = newInput;
  }
  res.json({ ok: true, input: output, output: query });
});

// Admin Input ändern
app.post("/admin/change", (req, res) => {
  const { oldInput, newInput } = req.body;
  if (!oldInput || !newInput) return res.json({ ok: false });
  if (items[newInput]) {
    // Inputs swappen
    const temp = items[oldInput];
    items[oldInput] = items[newInput];
    items[newInput] = temp;
  } else {
    items[newInput] = items[oldInput];
    delete items[oldInput];
  }

  // Update bei allen Nutzern
  for (const email in users) {
    users[email].found.forEach(f => {
      if (f.input === oldInput) f.input = newInput;
    });
  }

  res.json({ ok: true });
});

// Admin Ankündigung
app.post("/admin/announce", (req, res) => {
  const { text } = req.body;
  if (!text) return res.json({ ok: false });
  res.json({ ok: true, text });
});

app.listen(PORT, () => console.log(`Server läuft auf ${PORT}`));
