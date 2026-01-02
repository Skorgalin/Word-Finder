const express = require("express");
const path = require("path");
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

// Speicher (JSON-Style, keine DB)
let users = {};        // email -> { passwordHash }
let items = {};        // input -> { output, firstBy }
let outputs = {};      // output -> input

function hash(pw) {
  return crypto.createHash("sha256").update(pw).digest("hex");
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

// AUTH
app.post("/register", (req, res) => {
  const { email, password } = req.body;
  if (users[email]) return res.json({ ok: false });
  users[email] = { passwordHash: hash(password) };
  res.json({ ok: true });
});

app.post("/login", (req, res) => {
  const { email, password } = req.body;
  if (!users[email]) return res.json({ ok: false });
  if (users[email].passwordHash !== hash(password))
    return res.json({ ok: false });
  res.json({ ok: true, admin: email === ADMIN_EMAIL });
});

// GAME
app.post("/find", (req, res) => {
  const { input, email } = req.body;

  if (items[input]) {
    return res.json({
      input,
      output: items[input].output,
      first: false,
    });
  }

  let output;
  do {
    output = randomOutput();
  } while (outputs[output]);

  items[input] = {
    output,
    firstBy: email === ADMIN_EMAIL ? null : email,
  };
  outputs[output] = input;

  res.json({
    input,
    output,
    first: email !== ADMIN_EMAIL,
  });
});

// ADMIN
app.post("/admin/login", (req, res) => {
  const { password } = req.body;
  if (hash(password) === ADMIN_PASSWORD_HASH)
    return res.json({ ok: true });
  res.json({ ok: false });
});

app.post("/admin/search", (req, res) => {
  const { output } = req.body;

  if (outputs[output]) {
    const input = outputs[output];
    return res.json({ input, output });
  }

  // neu generieren
  let newInput;
  do {
    newInput = Math.random().toString(36).substring(2, 8);
  } while (items[newInput]);

  items[newInput] = { output, firstBy: null };
  outputs[output] = newInput;

  res.json({ input: newInput, output });
});

app.post("/admin/change", (req, res) => {
  const { oldInput, newInput } = req.body;
  if (!items[oldInput]) return res.json({ ok: false });

  const output = items[oldInput].output;

  if (items[newInput]) {
    // switch
    const tmp = items[newInput].output;
    items[newInput].output = output;
    outputs[output] = newInput;

    items[oldInput].output = tmp;
    outputs[tmp] = oldInput;
  } else {
    items[newInput] = items[oldInput];
    delete items[oldInput];
    outputs[output] = newInput;
  }

  res.json({ ok: true });
});

app.listen(PORT, () => console.log("Server läuft"));
