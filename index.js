const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static("public"));

const ADMIN_EMAIL = "till.behner@icloud.com";
const ADMIN_PASS = "X9$QvR7!eM2#A8wK@C";

const DATA_FILE = path.join(__dirname, "data.json");
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify({ users: {}, items: {} }, null, 2)
  );
}

function readData() {
  return JSON.parse(fs.readFileSync(DATA_FILE));
}
function writeData(d) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2));
}

/* ===================== LIVE ANNOUNCEMENTS (NICHT SPEICHERN) ===================== */
let liveAnnouncements = [];

/* ===================== AUTH ===================== */
app.post("/checkEmail", (req, res) => {
  const data = readData();
  res.json({ exists: !!data.users[req.body.email] });
});

app.post("/register", (req, res) => {
  const { email, password } = req.body;
  const data = readData();
  if (data.users[email]) return res.json({ ok: false });
  data.users[email] = {
    password,
    admin: email === ADMIN_EMAIL
  };
  writeData(data);
  res.json({ ok: true, admin: email === ADMIN_EMAIL });
});

app.post("/login", (req, res) => {
  const { email, password } = req.body;
  const data = readData();
  if (!data.users[email] || data.users[email].password !== password) {
    return res.json({ ok: false });
  }
  res.json({ ok: true, admin: data.users[email].admin });
});

/* ===================== ITEMS ===================== */
app.post("/submitItem", (req, res) => {
  const { email, input } = req.body;
  if (!email || !input) return res.json({ ok: false });

  const data = readData();
  let firstDiscovery = false;
  let output;

  if (data.items[input]) {
    output = data.items[input].output;
  } else {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789😀😄😂🤣😎👍🔥💎🎯⚡❤️";
    do {
      output = "";
      for (let i = 0; i < 4; i++) {
        output += chars[Math.floor(Math.random() * chars.length)];
      }
    } while (Object.values(data.items).some(i => i.output === output));

    data.items[input] = { output, firstDiscovery: true };
    firstDiscovery = true;
    writeData(data);
  }

  res.json({ ok: true, input, output, firstDiscovery });
});

/* ===================== ADMIN SEARCH (OUTPUT ➜ INPUT) ===================== */
app.post("/adminSearch", (req, res) => {
  const { query } = req.body; // OUTPUT
  const data = readData();

  const found = Object.entries(data.items)
    .find(([_, v]) => v.output === query);

  if (found) {
    return res.json({ ok: true, input: found[0], output: query });
  }

  let i = 1;
  let newInput = "input_" + i;
  while (data.items[newInput]) {
    i++;
    newInput = "input_" + i;
  }

  data.items[newInput] = { output: query, firstDiscovery: false };
  writeData(data);

  res.json({ ok: true, input: newInput, output: query });
});

/* ===================== ADMIN CHANGE INPUT (SWITCH) ===================== */
app.post("/adminChangeInput", (req, res) => {
  const { oldInput, newInput } = req.body;
  const data = readData();

  if (!data.items[oldInput]) return res.json({ ok: false });

  if (data.items[newInput]) {
    const tmp = data.items[newInput];
    data.items[newInput] = data.items[oldInput];
    data.items[oldInput] = tmp;
  } else {
    data.items[newInput] = data.items[oldInput];
    delete data.items[oldInput];
  }

  writeData(data);
  res.json({ ok: true });
});

/* ===================== ANNOUNCEMENTS (LIVE ONLY) ===================== */
app.post("/announce", (req, res) => {
  const { text, adminPassword } = req.body;
  if (adminPassword !== ADMIN_PASS) return res.json({ ok: false });

  const ann = { text };
  liveAnnouncements.push(ann);

  setTimeout(() => {
    liveAnnouncements = liveAnnouncements.filter(a => a !== ann);
  }, 6000);

  res.json({ ok: true });
});

app.get("/getAnnouncements", (req, res) => {
  res.json(liveAnnouncements);
});

app.listen(PORT, () => console.log("Server läuft auf Port", PORT));
