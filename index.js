const express = require("express");
const fs = require("fs-extra");
const path = require("path");
const bcrypt = require("bcrypt");

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static("public"));

const ADMIN_EMAIL = "till.behner@icloud.com";
const ADMIN_PASSWORD = "X9$QvR7!eM2#A8wK@C";

const USERS = "users.json";
const ITEMS = "items.json";
const ANNOUNCE = "announcements.json";

let users = fs.existsSync(USERS) ? fs.readJsonSync(USERS) : {};
let items = fs.existsSync(ITEMS) ? fs.readJsonSync(ITEMS) : {};
let announcements = fs.existsSync(ANNOUNCE) ? fs.readJsonSync(ANNOUNCE) : [];

/* ---------- Utils ---------- */

function save() {
  fs.writeJsonSync(USERS, users);
  fs.writeJsonSync(ITEMS, items);
  fs.writeJsonSync(ANNOUNCE, announcements);
}

function randomOutput() {
  const chars = "😀😄😎🔥⭐💎🍀🌀🎉🍯ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  const len = 2 + Math.floor(Math.random() * 4);
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

/* ---------- Auth ---------- */

app.post("/checkEmail", (req, res) => {
  res.json({ exists: !!users[req.body.email] });
});

app.post("/register", async (req, res) => {
  const { email, password } = req.body;
  if (users[email]) return res.json({ ok: false });
  users[email] = { pw: await bcrypt.hash(password, 10) };
  save();
  res.json({ ok: true });
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!users[email]) return res.json({ ok: false });
  const ok = await bcrypt.compare(password, users[email].pw);
  res.json({ ok, admin: email === ADMIN_EMAIL });
});

/* ---------- Game ---------- */

app.post("/submit", (req, res) => {
  const { email, input, isAdmin } = req.body;

  if (items[input]) {
    return res.json(items[input]);
  }

  let out;
  do {
    out = randomOutput();
  } while (Object.values(items).some(i => i.output === out));

  items[input] = {
    output: out,
    firstDiscovery: isAdmin ? null : email
  };
  save();
  res.json(items[input]);
});

/* ---------- Admin ---------- */

app.post("/admin/search", (req, res) => {
  const { query } = req.body;
  if (!items[query]) {
    let out;
    do {
      out = randomOutput();
    } while (Object.values(items).some(i => i.output === out));
    items[query] = { output: out, firstDiscovery: null };
    save();
  }
  res.json(items[query]);
});

app.post("/admin/announce", (req, res) => {
  announcements.push({ text: req.body.text, time: Date.now() });
  save();
  res.json({ ok: true });
});

app.get("/announcements", (req, res) => res.json(announcements));

app.listen(PORT, () => console.log("Server läuft"));
