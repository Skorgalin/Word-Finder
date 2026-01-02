const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static("public"));

const ADMIN_EMAIL = "till.behner@icloud.com";
const ADMIN_PASSWORD = "X9$QvR7!eM2#A8wK@C";

// Pfade zu JSON-Dateien
const USERS_FILE = path.join(__dirname, "users.json");
const ITEMS_FILE = path.join(__dirname, "items.json");
const ANNOUNCE_FILE = path.join(__dirname, "announcements.json");

// Hilfsfunktionen für JSON speichern/lesen
function load(file) {
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify({}));
  return JSON.parse(fs.readFileSync(file));
}

function save(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// Items speichern
let items = load(ITEMS_FILE); // { input1: {output, firstBy}, ... }
let announcements = load(ANNOUNCE_FILE); // [{text, timestamp}]
let users = load(USERS_FILE); // {email: {password}}

// Zufallsgenerator für Input
const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-={}[];:'\"<>,.?/\\|~` ";

function randomInput(len = 6) {
  let s = "";
  while (s.length < len) {
    s += chars[Math.floor(Math.random() * chars.length)];
  }
  return s;
}

// --- Login/Register ---
app.post("/checkEmail", (req, res) => {
  const { email } = req.body;
  if (!email) return res.json({ ok: false });
  const exists = users[email] ? true : false;
  res.json({ exists });
});

app.post("/register", (req, res) => {
  const { email, password } = req.body;
  if (users[email]) return res.json({ ok: false, error: "Email existiert" });
  users[email] = { password };
  save(USERS_FILE, users);
  res.json({ ok: true });
});

app.post("/login", (req, res) => {
  const { email, password } = req.body;
  if (!users[email] || users[email].password !== password)
    return res.json({ ok: false });
  res.json({ ok: true, admin: email === ADMIN_EMAIL });
});

// --- Admin Login für Dashboard ---
app.post("/adminCheck", (req, res) => {
  const { password } = req.body;
  res.json({ ok: password === ADMIN_PASSWORD });
});

// --- Items generieren ---
app.post("/submitItem", (req, res) => {
  const { email, input } = req.body;
  if (!input) return res.json({ ok: false });

  let outputEntry = null;
  // Prüfen ob Input schon existiert
  for (const key in items) {
    if (items[key].input === input) {
      outputEntry = items[key];
      break;
    }
  }

  // Neues Item generieren, falls nicht existiert
  if (!outputEntry) {
    const newOutput = randomInput();
    items[newOutput] = { input, firstBy: email === ADMIN_EMAIL ? null : email };
    save(ITEMS_FILE, items);
    outputEntry = items[newOutput];
    outputEntry.key = newOutput;
  } else {
    outputEntry.key = Object.keys(items).find(k => items[k] === outputEntry);
  }

  res.json({ ok: true, key: outputEntry.key, input: outputEntry.input, output: outputEntry.key, first: outputEntry.firstBy ? true : false });
});

// --- Admin Suche ---
app.post("/adminSearch", (req, res) => {
  const { search } = req.body;
  if (!search) return res.json({ ok: false });

  // Prüfen ob Output schon existiert
  let foundKey = null;
  for (const key in items) {
    if (key === search) {
      foundKey = key;
      break;
    }
  }

  // Neues Input generieren, falls Output noch nicht existiert
  if (!foundKey) {
    const newInput = randomInput();
    items[search] = { input: newInput, firstBy: null };
    foundKey = search;
    save(ITEMS_FILE, items);
  }

  res.json({ ok: true, input: items[foundKey].input, output: foundKey });
});

// --- Admin Input ändern ---
app.post("/adminChangeInput", (req, res) => {
  const { output, newInput } = req.body;
  if (!items[output]) return res.json({ ok: false });

  // Prüfen ob newInput schon existiert
  let existingOutput = null;
  for (const key in items) {
    if (items[key].input === newInput) {
      existingOutput = key;
      break;
    }
  }

  if (existingOutput) {
    // Switch Inputs
    const temp = items[existingOutput].input;
    items[existingOutput].input = items[output].input;
    items[output].input = temp;
  } else {
    items[output].input = newInput;
  }

  save(ITEMS_FILE, items);
  res.json({ ok: true });
});

// --- Admin Ankündigungen ---
app.post("/adminAnnounce", (req, res) => {
  const { text } = req.body;
  if (!text) return res.json({ ok: false });
  const t = { text, timestamp: Date.now() };
  announcements.push(t);
  save(ANNOUNCE_FILE, announcements);
  res.json({ ok: true });
});

// --- Items + Ankündigungen abrufen ---
app.get("/getItems", (req, res) => {
  res.json(items);
});

app.get("/getAnnouncements", (req, res) => {
  res.json(announcements);
});

app.listen(PORT, () => console.log("Server läuft auf Port " + PORT));
