const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static("public"));

const ADMIN_EMAIL = "till.behner@icloud.com";
const ADMIN_PASSWORD = "DEIN_ADMIN_PASSWORT";

const USERS_FILE = path.join(__dirname, "users.json");

// Lade gespeicherte Nutzer
let users = {};
if (fs.existsSync(USERS_FILE)) {
  users = JSON.parse(fs.readFileSync(USERS_FILE));
}

// Registrierung / Passwort speichern
app.post("/register", (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.json({ ok: false, msg: "E-Mail oder Passwort fehlt" });
  if (users[email]) return res.json({ ok: false, msg: "Nutzer existiert schon" });

  users[email] = { password };
  fs.writeFileSync(USERS_FILE, JSON.stringify(users));
  res.json({ ok: true });
});

// Login
app.post("/login", (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.json({ ok: false, msg: "E-Mail oder Passwort fehlt" });

  if (users[email] && users[email].password === password) {
    res.json({ ok: true, admin: email === ADMIN_EMAIL });
  } else {
    res.json({ ok: false, msg: "Falsche E-Mail oder Passwort" });
  }
});

app.listen(PORT, () => console.log("Server läuft"));
