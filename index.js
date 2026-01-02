const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static("public"));

const ADMIN_EMAIL = "till.behner@icloud.com";
const ADMIN_PASSWORD = "X9$QvR7!eM2#A8wK@C";

// Benutzer und Passwörter speichern (JSON, keine DB)
let users = {}; // email -> password

// Items speichern: input -> output
let items = {};

// Admin-Ankündigungen speichern
let announcements = [];

// --- LOGIN / REGISTER ---
app.post("/check-email", (req, res) => {
  const { email } = req.body;
  if(!email) return res.json({ ok:false });
  res.json({ exists: users[email] ? true : false });
});

app.post("/register", (req,res)=>{
  const { email, password } = req.body;
  if(!email || !password) return res.json({ ok:false });
  if(users[email]) return res.json({ ok:false, msg:"User exists" });
  users[email] = password;
  res.json({ ok:true, admin: email===ADMIN_EMAIL });
});

app.post("/login", (req,res)=>{
  const { email, password } = req.body;
  if(!email || !password) return res.json({ ok:false });
  if(users[email] !== password) return res.json({ ok:false, msg:"Wrong password" });
  res.json({ ok:true, admin: email===ADMIN_EMAIL });
});

app.post("/logout", (req,res)=>{
  res.json({ ok:true });
});

// --- ITEMS ---
app.post("/submit-item", (req,res)=>{
  const { input, output } = req.body;
  if(!input || !output) return res.json({ ok:false });
  // nur speichern wenn noch nicht existiert
  if(!items[input]) items[input] = output;
  res.json({ ok:true, output: items[input] });
});

// Admin-Suche: Output -> Input
app.post("/admin-search", (req,res)=>{
  const { output } = req.body;
  if(!output) return res.json({ ok:false });
  let foundInput = null;
  for(let key in items){
    if(items[key] === output){
      foundInput = key;
      break;
    }
  }
  if(!foundInput){
    // Neues Item generieren
    const randomInput = Math.random().toString(36).substring(2,8);
    items[randomInput] = output;
    foundInput = randomInput;
  }
  res.json({ ok:true, input: foundInput, output });
});

// Admin ändert Input für ein bestehendes Output
app.post("/admin-update-input", (req,res)=>{
  const { oldInput, newInput } = req.body;
  if(!oldInput || !newInput) return res.json({ ok:false });
  if(items[oldInput]){
    items[newInput] = items[oldInput];
    delete items[oldInput];
    res.json({ ok:true });
  } else res.json({ ok:false });
});

// --- ADMIN ANKÜNDIGUNGEN ---
app.post("/admin-announcement", (req,res)=>{
  const { text } = req.body;
  if(!text) return res.json({ ok:false });
  announcements.push({ text, timestamp: Date.now() });
  res.json({ ok:true });
});

app.get("/get-announcements", (req,res)=>{
  const now = Date.now();
  const active = announcements.filter(a=>now-a.timestamp <= 5000); // nur 5 Sekunden anzeigen
  res.json(active);
});

app.listen(PORT, ()=>console.log("Server läuft"));
