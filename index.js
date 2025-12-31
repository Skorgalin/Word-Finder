const express = require("express");
const fs = require("fs-extra");
const path = require("path");
const bcrypt = require("bcrypt");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static("public"));

const ADMIN_EMAIL = "till.behner@icloud.com";
const ADMIN_PASSWORD = "X9$QvR7!eM2#A8wK@C";

const USERS_FILE = path.join(__dirname, "users.json");
const ITEMS_FILE = path.join(__dirname, "items.json");
const ANNOUNCE_FILE = path.join(__dirname, "announcements.json");

// Lade gespeicherte Daten
let users = fs.existsSync(USERS_FILE) ? fs.readJsonSync(USERS_FILE) : {};
let items = fs.existsSync(ITEMS_FILE) ? fs.readJsonSync(ITEMS_FILE) : {};
let announcements = fs.existsSync(ANNOUNCE_FILE) ? fs.readJsonSync(ANNOUNCE_FILE) : [];

// Zufalls-Generator für neue Items
const possibleResults = ["😄","🍯","🍎","⭐","🎉","💎","🌀","🌟","🔥","🍀"]; 

function saveUsers() { fs.writeJsonSync(USERS_FILE, users); }
function saveItems() { fs.writeJsonSync(ITEMS_FILE, items); }
function saveAnnouncements() { fs.writeJsonSync(ANNOUNCE_FILE, announcements); }

// Registrierung
app.post("/register", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.json({ ok: false, msg: "E-Mail oder Passwort fehlt" });
  if (users[email]) return res.json({ ok: false, msg: "Nutzer existiert schon" });

  const hash = await bcrypt.hash(password, 10);
  users[email] = { password: hash };
  saveUsers();
  res.json({ ok: true });
});

// Login
app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.json({ ok: false, msg: "E-Mail oder Passwort fehlt" });

  if (users[email] && await bcrypt.compare(password, users[email].password)) {
    res.json({ ok: true, admin: email === ADMIN_EMAIL });
  } else {
    res.json({ ok: false, msg: "Falsche E-Mail oder Passwort" });
  }
});

// Prüfen, ob E-Mail existiert (für dynamischen Button)
app.post("/checkEmail", (req,res)=>{
  const { email } = req.body;
  res.json({ exists: !!users[email] });
});

// Item eintragen / Ergebnis generieren
app.post("/submitItem", (req,res)=>{
  const { email, input, isAdmin } = req.body;
  if(!input) return res.json({ ok:false });

  // Wenn schon existiert
  if(items[input]){
    return res.json({ ok:true, output: items[input].output, firstDiscovery: items[input].firstDiscovery });
  }

  // Neues Item generieren, das noch nicht vergeben ist
  let available = possibleResults.filter(r => !Object.values(items).map(i=>i.output).includes(r));
  let result = available.length>0 ? available[Math.floor(Math.random()*available.length)] : "❔";

  items[input] = {
    output: result,
    firstDiscovery: (!isAdmin ? email : null)
  };
  saveItems();
  res.json({ ok:true, output: result, firstDiscovery: items[input].firstDiscovery });
});

// Admin Item Edit
app.post("/admin/editItem", (req,res)=>{
  const { input, newOutput } = req.body;
  if(items[input]){
    items[input].output = newOutput;
    saveItems();
    res.json({ ok:true });
  } else res.json({ ok:false });
});

// Admin Ankündigung
app.post("/admin/announce",(req,res)=>{
  const { text } = req.body;
  const msg = { text, timestamp: Date.now() };
  announcements.push(msg);
  saveAnnouncements();
  res.json({ ok:true, msg });
});

// Get Items
app.get("/items", (req,res)=> res.json(items));

// Get Announcements
app.get("/announcements", (req,res)=> res.json(announcements));

app.listen(PORT, ()=>console.log("Server läuft"));
