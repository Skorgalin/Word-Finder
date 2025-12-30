const express = require("express");
const bodyParser = require("body-parser");
const nodemailer = require("nodemailer");
const path = require("path");
const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

// Admin-Login Einstellungen
const ADMIN_EMAIL = "till.behner@icloud.com";
const ADMIN_PASSWORD = "DeinAdminPasswort";
let codes = {}; // 6-stelliger Code pro E-Mail

// E-Mail Transporter (z.B. Gmail)
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "DEINE_EMAIL@gmail.com",
    pass: "DEIN_APP_PASSWORT"
  }
});

// Generiere 6-stelligen Code
function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Login Route
app.post("/login", (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.json({ success: false, msg: "Email und Passwort erforderlich" });

  if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
    const code = generateCode();
    codes[email] = code;

    transporter.sendMail({
      from: "DEINE_EMAIL@gmail.com",
      to: email,
      subject: "Dein Login-Code für Word Finder Game",
      text: `Dein 6-stelliger Code: ${code}`
    }).then(() => {
      res.json({ success: true, admin: true, msg: "Code gesendet" });
    }).catch(() => {
      res.json({ success: false, msg: "Fehler beim Senden des Codes" });
    });
  } else {
    // normaler Spieler
    res.json({ success: true, admin: false, msg: "Login erfolgreich" });
  }
});

// Code überprüfen
app.post("/verify", (req, res) => {
  const { email, code } = req.body;
  if (email === ADMIN_EMAIL && codes[email] === code) {
    delete codes[email]; // Code nur einmalig
    res.json({ success: true, admin: true });
  } else res.json({ success: false, msg: "Falscher Code" });
});

app.listen(PORT, () => console.log(`Server läuft auf Port ${PORT}`));
