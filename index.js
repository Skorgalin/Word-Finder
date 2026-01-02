const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static("public"));

const ADMIN_EMAIL = "till.behner@icloud.com";
const ADMIN_PASSWORD = "X9$QvR7!eM2#A8wK@C";

const USERS_FILE = "./users.json";
const ITEMS_FILE = "./foundItems.json";
const ANNOUNCEMENTS_FILE = "./announcements.json";

// Hilfsfunktionen für JSON-Dateien
function readJSON(file) {
  if (!fs.existsSync(file)) return {};
  return JSON.parse(fs.readFileSync(file));
}
function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// Zufallsgenerator für Outputs
const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,.<>?";
function makeRandomOutput(length = 1) {
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

// Route: Registrierung / Login prüfen
app.post("/check-email", (req, res) => {
  const { email } = req.body;
  const users = readJSON(USERS_FILE);
  if (!email) return res.json({ ok: false });
  const exists = !!users[email];
  res.json({ exists });
});

// Route: Registrieren
app.post("/register", (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.json({ ok: false, msg: "E-Mail und Passwort nötig" });
  const users = readJSON(USERS_FILE);
  if (users[email]) return res.json({ ok: false, msg: "User existiert schon" });
  users[email] = { password, admin: email === ADMIN_EMAIL };
  writeJSON(USERS_FILE, users);
  res.json({ ok: true, admin: email === ADMIN_EMAIL });
});

// Route: Login
app.post("/login", (req, res) => {
  const { email, password } = req.body;
  const users = readJSON(USERS_FILE);
  if (!users[email] || users[email].password !== password) {
    return res.json({ ok: false, msg: "Falsches Passwort oder E-Mail" });
  }
  res.json({ ok: true, admin: users[email].admin });
});

// Route: Item eingeben
app.post("/submit-item", (req, res) => {
  const { input, email } = req.body;
  const items = readJSON(ITEMS_FILE);
  const users = readJSON(USERS_FILE);

  if (!input || !email || !users[email]) return res.json({ ok: false });

  // Wenn schon gefunden, gleiche Ausgabe
  let output = items[input]?.output;
  let firstDiscovery = false;

  if (!output) {
    output = makeRandomOutput(Math.floor(Math.random() * 3) + 1); // 1-3 chars
    items[input] = { output, firstDiscovery: email !== ADMIN_EMAIL ? true : false };
    firstDiscovery = items[input].firstDiscovery;
    writeJSON(ITEMS_FILE, items);
  }

  res.json({ ok: true, output, firstDiscovery });
});

// Route: Admin sucht Input für Output
app.post("/admin-search", (req, res) => {
  const { output } = req.body;
  if (!output) return res.json({ ok: false });

  const items = readJSON(ITEMS_FILE);
  let foundInput = Object.keys(items).find(i => items[i].output === output);

  // Wenn nicht gefunden → neu generieren
  if (!foundInput) {
    foundInput = makeRandomOutput(Math.floor(Math.random() * 3) + 1);
    items[foundInput] = { output, firstDiscovery: false };
    writeJSON(ITEMS_FILE, items);
  }

  res.json({ ok: true, input: foundInput, output });
});

// Route: Admin ändert Input
app.post("/admin-change-input", (req, res) => {
  const { oldInput, newInput } = req.body;
  const items = readJSON(ITEMS_FILE);
  if (!items[oldInput] || !newInput) return res.json({ ok: false });

  // Wenn neuer Input schon existiert → switch
  if (items[newInput]) {
    const tmp = items[newInput];
    items[newInput] = items[oldInput];
    items[oldInput] = tmp;
  } else {
    items[newInput] = items[oldInput];
    delete items[oldInput];
  }

  writeJSON(ITEMS_FILE, items);
  res.json({ ok: true });
});

// Route: Admin Ankündigung
app.post("/admin-announcement", (req, res) => {
  const { text } = req.body;
  if (!text) return res.json({ ok: false });
  const announcements = readJSON(ANNOUNCEMENTS_FILE);
  const id = Date.now();
  announcements[id] = { text };
  writeJSON(ANNOUNCEMENTS_FILE, announcements);
  res.json({ ok: true, id });
});

// Route: Alle Items + Ankündigungen abrufen
app.get("/data", (req, res) => {
  const items = readJSON(ITEMS_FILE);
  const announcements = readJSON(ANNOUNCEMENTS_FILE);
  res.json({ items, announcements });
});

app.listen(PORT, () => console.log(`Server läuft auf Port ${PORT}`));
