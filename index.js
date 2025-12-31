const express = require("express");
const nodemailer = require("nodemailer");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static("public"));

const ADMIN_EMAIL = "till.behner@icloud.com";
let loginCodes = {}; // email -> code

// ⚠️ HIER DEINE GMAIL-DATEN EINTRAGEN
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "DEINE_GMAIL@gmail.com",
    pass: "DEIN_APP_PASSWORT"
  }
});

function makeCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Login: nur E-Mail eingeben
app.post("/login", (req, res) => {
  const { email } = req.body;
  if (!email) return res.json({ ok: false });

  const code = makeCode();
  loginCodes[email] = code;

  transporter.sendMail({
    from: "Word Finder Game",
    to: email,
    subject: "Dein Login-Code",
    text: `Dein 6-stelliger Code: ${code}`
  }).then(() => {
    res.json({ ok: true, admin: email === ADMIN_EMAIL });
  }).catch(err => {
    console.log(err);
    res.json({ ok: false });
  });
});

// Code bestätigen
app.post("/verify", (req, res) => {
  const { email, code } = req.body;
  if (loginCodes[email] === code) {
    delete loginCodes[email];
    res.json({ ok: true, admin: email === ADMIN_EMAIL });
  } else {
    res.json({ ok: false });
  }
});

app.listen(PORT, () => console.log("Server läuft"));
