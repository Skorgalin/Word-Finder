const express = require("express");
const fs = require("fs");
const path = require("path");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static("public"));

const ADMIN_EMAIL = "till.behner@icloud.com";
const ADMIN_PASS = "X9$QvR7!eM2#A8wK@C";

const DATA_FILE = path.join(__dirname, "data.json");

/* ================= INIT ================= */
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify({ users: {}, items: {} }, null, 2)
  );
}

function readData() { return JSON.parse(fs.readFileSync(DATA_FILE)); }
function writeData(data) { fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2)); }

/* ================= CHECK EMAIL ================= */
app.post("/checkEmail", (req,res)=>{
  const { email } = req.body;
  const data = readData();
  res.json({ exists: !!data.users[email] });
});

/* ================= REGISTER ================= */
app.post("/register", (req,res)=>{
  const { email,password } = req.body;
  if(!email || !password) return res.json({ok:false});

  const data = readData();
  if(data.users[email]) return res.json({ok:false});

  const admin = email === ADMIN_EMAIL;

  data.users[email] = { password, admin };
  writeData(data);

  // Direkt einloggen
  res.json({ ok:true, admin });
});

/* ================= LOGIN ================= */
app.post("/login", (req,res)=>{
  const { email,password } = req.body;
  const data = readData();
  if(!data.users[email] || data.users[email].password!==password)
    return res.json({ ok:false });

  res.json({ ok:true, admin:data.users[email].admin });
});

/* ================= ITEM ================= */
app.post("/submitItem", (req,res)=>{
  const { email,input } = req.body;
  if(!email || !input) return res.json({ ok:false });

  const data = readData();
  let output;
  let firstDiscovery = false;

  if(data.items[input]){
    output = data.items[input].output;
  } else {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789😀🔥💎⚡";
    output = "";
    for(let i=0;i<4;i++) output += chars[Math.floor(Math.random()*chars.length)];
    data.items[input] = { output };
    // Admin bekommt kein First Discovery
    if(email !== ADMIN_EMAIL) firstDiscovery = true;
  }

  writeData(data);
  res.json({ ok:true, input, output, firstDiscovery });
});

/* ================= ADMIN SEARCH ================= */
app.post("/adminSearch", (req,res)=>{
  const { query } = req.body;
  const data = readData();

  // Prüfen ob Output bereits existiert
  for(const [input,obj] of Object.entries(data.items)){
    if(obj.output===query){
      return res.json({ ok:true, input, output: obj.output });
    }
  }

  // Neues Item generieren (normales Input, kein admin_)
  let newInput = "item_" + Math.random().toString(36).slice(2,7);
  data.items[newInput] = { output: query };
  writeData(data);
  res.json({ ok:true, input: newInput, output: query });
});

/* ================= ADMIN CHANGE INPUT ================= */
app.post("/adminChangeInput", (req,res)=>{
  const { oldInput,newInput } = req.body;
  const data = readData();

  if(!data.items[oldInput]) return res.json({ ok:false });

  // Wenn newInput schon existiert => swap
  if(data.items[newInput]){
    const tmp = data.items[newInput];
    data.items[newInput] = data.items[oldInput];
    data.items[oldInput] = tmp;
  } else {
    data.items[newInput] = data.items[oldInput];
    delete data.items[oldInput];
  }

  writeData(data);
  res.json({ ok:true });
});

/* ================= SOCKET ================= */
io.on("connection", (socket)=>{
  socket.on("adminAnnouncement",(data)=>{
    if(data.password!==ADMIN_PASS) return;
    if(!data.text) return;
    io.emit("announcement",{ text:data.text });
  });
});

/* ================= START ================= */
server.listen(PORT,()=>console.log("Server läuft auf Port",PORT));
