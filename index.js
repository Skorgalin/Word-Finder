const express = require("express");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static("public"));

const ADMIN_EMAIL = "till.behner@icloud.com";
const ADMIN_PASSWORD_HASH = crypto
  .createHash("sha256")
  .update("X9$QvR7!eM2#A8wK@C")
  .digest("hex");

// Speicher
let users = {};              // email -> passwordHash
let items = {};              // input -> { output, firstBy }
let outputs = {};            // output -> input
let announcements = [];      // globale Admin-Ankündigungen

function hash(v) {
  return crypto.createHash("sha256").update(v).digest("hex");
}

function randomOutput() {
  const pool =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789😄🔥💎👑⚡🎲🍀";
  let len = 1 + Math.floor(Math.random() * 3);
  let out = "";
  for (let i = 0; i < len; i++) {
    out += pool[Math.floor(Math.random() * pool.length)];
  }
  return out;
}

/* ---------------- AUTH ---------------- */

// 🔍 E-Mail prüfen
app.post("/check-email", (req, res) => {
  const { email } = req.body;
  res.json({ exists: !!users[email] });
});

app.post("/register", (req, res) => {
  const { email, password } = req.body;
  if (users[email]) return res.json({ ok: false });
  users[email] = hash(password);
  res.json({ ok: true });
});

app.post("/login", (req, res) => {
  const { email, password } = req.body;
  if (!users[email]) return res.json({ ok: false });
  if (users[email] !== hash(password)) return res.json({ ok: false });
  res.json({ ok: true, admin: email === ADMIN_EMAIL });
});

/* ---------------- GAME ---------------- */

app.post("/find", (req, res) => {
  const { input, email } = req.body;

  if (items[input]) {
    return res.json({
      input,
      output: items[input].output,
      first: false
    });
  }

  let output;
  do {
    output = randomOutput();
  } while (outputs[output]);

  items[input] = {
    output,
    firstBy: email === ADMIN_EMAIL ? null : email
  };
  outputs[output] = input;

  res.json({
    input,
    output,
    first: email !== ADMIN_EMAIL
  });
});

/* ---------------- ADMIN ---------------- */

app.post("/admin/login", (req, res) => {
  const { password } = req.body;
  res.json({ ok: hash(password) === ADMIN_PASSWORD_HASH });
});

app.post("/admin/announce", (req, res) => {
  const { text } = req.body;
  announcements.push(text);
  res.json({ ok: true });
});

app.post("/get-announcements", (req, res) => {
  res.json(announcements);
});

/* ---------------- SERVER ---------------- */

app.listen(PORT, () => console.log("Server läuft"));
