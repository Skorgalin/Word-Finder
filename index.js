const express = require("express");
const fs = require("fs");
const crypto = require("crypto");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static("public"));

/* ================= KONFIG ================= */
const ADMIN_EMAIL = "till.behner@icloud.com";
const ADMIN_PASSWORD_HASH = crypto
  .createHash("sha256")
  .update("X9$QvR7!eM2#A8wK@C")
  .digest("hex");

/* ================= JSON ================= */
const DATA_FILE = "data.json";

let data = {
  users: {},          // email -> { passwordHash }
  items: {},          // input -> { output, firstBy }
  outputsUsed: [],    // alle Outputs (nie doppelt)
  announcements: []   // { text, time }
};

if (fs.existsSync(DATA_FILE)) {
  data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}

function save() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

/* ================= HELPERS ================= */
function hash(x) {
  return crypto.createHash("sha256").update(x).digest("hex");
}

// Random Output Generator
function randomOutput() {
  const letters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const numbers = "0123456789";
  const symbols = "!@#$%^&*()-_=+[]{};:,.<>?/|~";
  const all = letters + numbers + symbols;

  let out;

  do {
    const type = Math.floor(Math.random() * 4);

    if (type === 0) {
      // Wort
      const syllables = ["ka","zo","mi","ra","tu","lo","ne","fi","sa","vek","tor"];
      const len = 2 + Math.floor(Math.random() * 3);
      out = "";
      for (let i = 0; i < len; i++) {
        out += syllables[Math.floor(Math.random() * syllables.length)];
      }
    } 
    else if (type === 1) {
      // Buchstabenfolge
      const len = 6 + Math.floor(Math.random() * 6);
      out = "";
      for (let i = 0; i < len; i++) {
        out += letters[Math.floor(Math.random() * letters.length)];
      }
    } 
    else if (type === 2) {
      // Zeichen / Zahlen
      const len = 8 + Math.floor(Math.random() * 8);
      out = "";
      for (let i = 0; i < len; i++) {
        out += all[Math.floor(Math.random() * all.length)];
      }
    } 
    else {
      // Ultraselten
      out = "ULTRA-" + crypto.randomBytes(6).toString("base64");
    }

  } while (data.outputsUsed.includes(out));

  return out;
}

/* ================= AUTH ================= */
app.post("/check-email", (req, res) => {
  const { email } = req.body;
  res.json({ exists: !!data.users[email] });
});

app.post("/register", (req, res) => {
  const { email, password } = req.body;
  if (data.users[email]) return res.json({ ok: false });

  data.users[email] = { passwordHash: hash(password) };
  save();
  res.json({ ok: true, admin: email === ADMIN_EMAIL });
});

app.post("/login", (req, res) => {
  const { email, password } = req.body;
  const user = data.users[email];

  if (!user || user.passwordHash !== hash(password)) {
    return res.json({ ok: false });
  }

  res.json({ ok: true, admin: email === ADMIN_EMAIL });
});

app.post("/logout", (req,res)=>{
  res.json({ok:true});
});

/* ================= GAME ================= */
app.post("/submit", (req, res) => {
  const { input, email } = req.body;

  if (data.items[input]) {
    return res.json({
      output: data.items[input].output,
      first: data.items[input].firstBy === email
    });
  }

  const output = randomOutput();
  data.outputsUsed.push(output);

  data.items[input] = {
    output,
    firstBy: email === ADMIN_EMAIL ? null : email
  };

  save();

  res.json({
    output,
    first: email !== ADMIN_EMAIL
  });
});

app.get("/found/:email", (req, res) => {
  const email = req.params.email;
  const found = [];

  for (const input in data.items) {
    const it = data.items[input];
    if (it.firstBy === email || email === ADMIN_EMAIL) {
      found.push({ input, output: it.output, first: it.firstBy === email });
    }
  }
  res.json(found);
});

/* ================= ADMIN ================= */
app.post("/admin-login", (req, res) => {
  const { password } = req.body;
  res.json({ ok: hash(password) === ADMIN_PASSWORD_HASH });
});

// Admin sucht Item
app.get("/admin/items", (req, res) => {
  res.json(data.items);
});

app.post("/admin/update", (req, res) => {
  const { input, newInput } = req.body;

  if (!data.items[input]) {
    // neu generieren falls Input noch nicht existiert
    const output = randomOutput();
    data.outputsUsed.push(output);
    data.items[input] = { output, firstBy: null };
  }

  if (data.items[newInput]) {
    // Inputs switchen
    const tmp = data.items[input];
    data.items[input] = data.items[newInput];
    data.items[newInput] = tmp;
  } else {
    // Input ändern
    data.items[newInput] = data.items[input];
    delete data.items[input];
  }

  save();
  res.json({ ok: true });
});

/* ================= ANNOUNCEMENTS ================= */
app.post("/admin/announce", (req, res) => {
  const { text } = req.body;
  data.announcements.push({ text, time: Date.now() });
  save();
  res.json({ ok: true });
});

app.get("/announcements", (req, res) => {
  res.json(data.announcements);
});

/* ================= START ================= */
app.listen(PORT, () => {
  console.log("Server läuft auf Port", PORT);
});
