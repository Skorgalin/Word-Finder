const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static("public"));

// Admin
const ADMIN_EMAIL = "till.behner@icloud.com";
const ADMIN_PASSWORD = "X9$QvR7!eM2#A8wK@C";

// JSON Dateien
const USERS_FILE = path.join(__dirname, "users.json");
const ITEMS_FILE = path.join(__dirname, "items.json");
const ANNOUNCE_FILE = path.join(__dirname, "announcements.json");

// Dateien erstellen, falls sie fehlen
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, "{}");
if (!fs.existsSync(ITEMS_FILE)) fs.writeFileSync(ITEMS_FILE, "{}");
if (!fs.existsSync(ANNOUNCE_FILE)) fs.writeFileSync(ANNOUNCE_FILE, "[]");

let users = JSON.parse(fs.readFileSync(USERS_FILE));
let items = JSON.parse(fs.readFileSync(ITEMS_FILE));
let announcements = JSON.parse(fs.readFileSync(ANNOUNCE_FILE));

// Helper
function saveUsers() { fs.writeFileSync(USERS_FILE, JSON.stringify(users, null,2)); }
function saveItems() { fs.writeFileSync(ITEMS_FILE, JSON.stringify(items, null,2)); }
function saveAnnouncements() { fs.writeFileSync(ANNOUNCE_FILE, JSON.stringify(announcements, null,2)); }

// Random Output Generator
function randomOutput() {
  const emojis = ["😄","🔥","💎","🌟","🎉","🚀","🍀","✨","🐱"];
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const type = Math.floor(Math.random() * 3);

  if (type === 0) return emojis[Math.floor(Math.random() * emojis.length)];
  if (type === 1) return chars[Math.floor(Math.random()*chars.length)] + chars[Math.floor(Math.random()*chars.length)];
  return emojis[Math.floor(Math.random()*emojis.length)] + chars[Math.floor(Math.random()*chars.length)];
}

// --- ROUTES ---

// Registrierung
app.post("/register", (req,res)=>{
  const {email,password} = req.body;
  if (!email || !password) return res.json({ok:false, msg:"Fehlt"});
  if (users[email]) return res.json({ok:false, msg:"Existiert"});
  users[email] = { password };
  saveUsers();
  res.json({ok:true});
});

// Login
app.post("/login", (req,res)=>{
  const {email,password} = req.body;
  if (!email || !password) return res.json({ok:false, msg:"Fehlt"});
  if (!users[email] || users[email].password !== password) return res.json({ok:false, msg:"Falsch"});
  res.json({ok:true, admin: email===ADMIN_EMAIL});
});

// Submit Input → Output
app.post("/submit", (req,res)=>{
  const {input,email} = req.body;
  if (!input || !email) return res.json({ok:false});

  let isAdmin = email===ADMIN_EMAIL;
  let firstDiscovery = false;

  if (!items[input]) {
    let out;
    do {
      out = randomOutput();
    } while (Object.values(items).includes(out));
    items[input] = out;
    saveItems();
    if (!isAdmin) firstDiscovery = true;
  }

  res.json({ok:true, input, output: items[input], firstDiscovery});
});

// Admin: Suche / Switch Input
app.post("/admin/switch", (req,res)=>{
  const {oldInput,newInput} = req.body;
  if (!items[oldInput]) return res.json({ok:false});

  if (items[newInput]) {
    // Switch Inputs
    const temp = items[newInput];
    items[newInput] = items[oldInput];
    items[oldInput] = temp;
  } else {
    items[newInput] = items[oldInput];
    delete items[oldInput];
  }
  saveItems();
  res.json({ok:true});
});

// Admin: Ankündigungen erstellen
app.post("/admin/announce", (req,res)=>{
  const {text,email} = req.body;
  if (!text || email!==ADMIN_EMAIL) return res.json({ok:false});
  const msg = {text,date:Date.now()};
  announcements.push(msg);
  saveAnnouncements();
  res.json({ok:true, msg});
});

// Get Items / Announcements
app.get("/items", (req,res)=>res.json(items));
app.get("/announcements", (req,res)=>res.json(announcements));

app.listen(PORT,()=>console.log("Server läuft auf Port",PORT));
