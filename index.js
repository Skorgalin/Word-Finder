const express = require("express");
const fs = require("fs-extra");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static("public"));

const ADMIN_EMAIL = "till.behner@icloud.com";
const ADMIN_PASSWORD = "X9$QvR7!eM2#A8wK@C";

const USERS_FILE = path.join(__dirname, "users.json");
const ITEMS_FILE = path.join(__dirname, "items.json");
const ANNOUNCEMENTS_FILE = path.join(__dirname, "announcements.json");

// Load or create JSON files
if (!fs.existsSync(USERS_FILE)) fs.writeJsonSync(USERS_FILE, {});
if (!fs.existsSync(ITEMS_FILE)) fs.writeJsonSync(ITEMS_FILE, {});
if (!fs.existsSync(ANNOUNCEMENTS_FILE)) fs.writeJsonSync(ANNOUNCEMENTS_FILE, []);

let users = fs.readJsonSync(USERS_FILE);
let items = fs.readJsonSync(ITEMS_FILE);
let announcements = fs.readJsonSync(ANNOUNCEMENTS_FILE);

function saveUsers() { fs.writeJsonSync(USERS_FILE, users); }
function saveItems() { fs.writeJsonSync(ITEMS_FILE, items); }
function saveAnnouncements() { fs.writeJsonSync(ANNOUNCEMENTS_FILE, announcements); }

function generateRandomResult() {
  const emojis = ["😄","🔥","🍀","🌟","💎","🎵","🎉","✨","🚀","🐱"];
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const type = Math.floor(Math.random()*4);
  if(type===0) return emojis[Math.floor(Math.random()*emojis.length)];
  if(type===1) return letters[Math.floor(Math.random()*letters.length)];
  if(type===2) return letters[Math.floor(Math.random()*letters.length)]+letters[Math.floor(Math.random()*letters.length)];
  return emojis[Math.floor(Math.random()*emojis.length)]+letters[Math.floor(Math.random()*letters.length)];
}

app.post("/register", (req,res)=>{
  const {email,password} = req.body;
  if(users[email]) return res.json({ok:false,msg:"E-Mail existiert"});
  users[email] = {password};
  saveUsers();
  res.json({ok:true});
});

app.post("/login", (req,res)=>{
  const {email,password} = req.body;
  if(users[email] && users[email].password === password) {
    res.json({ok:true,admin:email===ADMIN_EMAIL});
  } else res.json({ok:false,msg:"Falsches Passwort"});
});

app.post("/submit", (req,res)=>{
  const {email,input} = req.body;
  if(!input) return res.json({ok:false});
  let result;
  if(items[input]) {
    result = items[input];
  } else {
    result = generateRandomResult();
    items[input] = result;
    saveItems();
    // Mark First Discovery
    if(email!==ADMIN_EMAIL) users[email].firstDiscovery = users[email].firstDiscovery||[];
    if(email!==ADMIN_EMAIL) users[email].firstDiscovery.push(input);
  }
  res.json({ok:true,result});
});

app.get("/items", (req,res)=>{
  res.json(items);
});

app.post("/updateItem", (req,res)=>{
  const {key,value} = req.body;
  if(key && value) {
    items[key]=value;
    saveItems();
    res.json({ok:true});
  } else res.json({ok:false});
});

app.get("/announcements", (req,res)=>{
  res.json(announcements);
});

app.post("/announcement", (req,res)=>{
  const {text,email} = req.body;
  if(email!==ADMIN_EMAIL) return res.json({ok:false});
  const entry = {text,time:Date.now()};
  announcements.push(entry);
  saveAnnouncements();
  res.json({ok:true,entry});
});

app.listen(PORT,()=>console.log("Server läuft auf PORT "+PORT));
