const express = require("express");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcrypt");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static("public"));

const ADMIN_EMAIL = "till.behner@icloud.com";
const USERS_FILE = path.join(__dirname, "users.json");

// Lade gespeicherte Nutzer
let users = {};
if (fs.existsSync(USERS_FILE)) {
  users = JSON.parse(fs.readFileSync(USERS_FILE));
}

// Registrierung / Passwort speichern (verschlüsselt)
app.post("/register", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.json({ ok: false, msg: "E-Mail oder Passwort fehlt" });
  if (users[email]) return res.json({ ok: false, msg: "Nutzer existiert schon" });

  const hash = await bcrypt.hash(password, 10);
  users[email] = { password: hash };
  fs.writeFileSync(USERS_FILE, JSON.stringify(users));
  res.json({ ok: true });
});

// Login prüfen
app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.json({ ok: false, msg: "E-Mail oder Passwort fehlt" });

  if (users[email] && await bcrypt.compare(password, users[email].password)) {
    res.json({ ok: true, admin: email === ADMIN_EMAIL });
  } else {
    res.json({ ok: false, msg: "Falsche E-Mail oder Passwort" });
  }
});

app.listen(PORT, () => console.log("Server läuft"));
