const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static("public"));

// JSON-Dateien für Benutzer und Items
const USERS_FILE = path.join(__dirname, "users.json");
const ITEMS_FILE = path.join(__dirname, "items.json");
const ANNOUNCE_FILE = path.join(__dirname, "announcements.json");

// Admin Daten
const ADMIN_EMAIL = "till.behner@icloud.com";
const ADMIN_PASSWORD = "X9$QvR7!eM2#A8wK@C";

// Hilfsfunktionen zum Laden/Speichern
function loadJSON(file, defaultData) {
  try {
    return JSON.parse(fs.readFileSync(file));
  } catch {
    return defaultData;
  }
}

function saveJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// Benutzer
let users = loadJSON(USERS_FILE, {}); // { email: { password, isAdmin } }
// Items: { input: { output, firstFinder } }
let items = loadJSON(ITEMS_FILE, {});
// Ankündigungen: [{ text, timestamp }]
let announcements = loadJSON(ANNOUNCE_FILE, []);

// Alle Buchstaben, Zahlen, Sonderzeichen für Zufallsgenerator
const CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-={}[]<>?";

// Login/Register
app.post("/checkEmail", (req, res) => {
  const { email } = req.body;
  if (!email) return res.json({ ok: false });
  res.json({ exists: !!users[email] });
});

app.post("/register", (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.json({ ok: false, error: "Email oder Passwort fehlt" });
  if (users[email]) return res.json({ ok: false, error: "Benutzer existiert schon" });

  users[email] = { password, isAdmin: email === ADMIN_EMAIL };
  saveJSON(USERS_FILE, users);
  res.json({ ok: true, admin: users[email].isAdmin });
});

app.post("/login", (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.json({ ok: false, error: "Email oder Passwort fehlt" });
  if (!users[email] || users[email].password !== password) return res.json({ ok: false, error: "Falsches Passwort" });

  res.json({ ok: true, admin: users[email].isAdmin });
});

// Logout
app.post("/logout", (req, res) => {
  res.json({ ok: true });
});

// Item-Logik
function generateOutput(input) {
  let output;
  do {
    output = Array.from({ length: 3 + Math.floor(Math.random() * 4) }, () => CHARSET[Math.floor(Math.random() * CHARSET.length)]).join("");
  } while (Object.values(items).some(i => i.output === output));
  return output;
}

// Wenn ein Spieler Input eingibt
app.post("/submitItem", (req, res) => {
  const { email, input } = req.body;
  if (!email || !input) return res.json({ ok: false });

  if (!items[input]) {
    // Neues Item generieren
    const output = generateOutput(input);
    items[input] = { output, firstFinder: email === ADMIN_EMAIL ? null : email };
    saveJSON(ITEMS_FILE, items);
  }
  const item = items[input];
  const firstDiscovery = item.firstFinder === email ? true : item.firstFinder && item.firstFinder !== ADMIN_EMAIL;
  res.json({ ok: true, input, output: item.output, firstDiscovery });
});

// Admin Suche
app.post("/adminSearch", (req, res) => {
  const { query } = req.body;
  if (!query) return res.json({ ok: false });

  // Finde Item nach Output
  let foundInput = null;
  for (let key in items) {
    if (items[key].output === query) {
      foundInput = key;
      break;
    }
  }
  // Wenn nicht existiert → neu generieren
  if (!foundInput) {
    const newOutput = generateOutput(query);
    items[query] = { output: newOutput, firstFinder: null };
    saveJSON(ITEMS_FILE, items);
    foundInput = query;
  }
  const output = items[foundInput].output;
  res.json({ ok: true, input: foundInput, output });
});

// Admin Input ändern
app.post("/adminChangeInput", (req, res) => {
  const { oldInput, newInput } = req.body;
  if (!oldInput || !newInput) return res.json({ ok: false });
  if (!items[oldInput]) return res.json({ ok: false });

  // Wenn es schon einen Output mit dem neuen Input gibt → Inputs tauschen
  let swapKey = Object.keys(items).find(k => k === newInput);
  if (swapKey) {
    const temp = items[oldInput];
    items[oldInput] = items[swapKey];
    items[swapKey] = temp;
  } else {
    items[newInput] = items[oldInput];
    delete items[oldInput];
  }
  saveJSON(ITEMS_FILE, items);
  res.json({ ok: true });
});

// Admin Ankündigungen
app.post("/announce", (req, res) => {
  const { text, adminPassword } = req.body;
  if (adminPassword !== ADMIN_PASSWORD) return res.json({ ok: false, error: "Falsches Admin Passwort" });
  const announcement = { text, timestamp: Date.now() };
  announcements.push(announcement);
  saveJSON(ANNOUNCE_FILE, announcements);
  res.json({ ok: true, announcement });
});

// Ankündigungen abrufen
app.get("/getAnnouncements", (req, res) => {
  res.json(announcements);
});

app.listen(PORT, () => console.log(`Server läuft auf Port ${PORT}`));
