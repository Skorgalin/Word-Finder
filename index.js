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

const DATA_FILE = path.join(__dirname,"data.json");

// -------- Daten initialisieren
if(!fs.existsSync(DATA_FILE)){
  fs.writeFileSync(DATA_FILE, JSON.stringify({
    users:{},
    items:{}   // input -> { output }
  }, null, 2));
}

function readData(){
  return JSON.parse(fs.readFileSync(DATA_FILE));
}
function writeData(d){
  fs.writeFileSync(DATA_FILE, JSON.stringify(d,null,2));
}

// -------- Check E-Mail
app.post("/checkEmail",(req,res)=>{
  const {email}=req.body;
  const data=readData();
  res.json({exists: !!data.users[email]});
});

// -------- Register
app.post("/register",(req,res)=>{
  const {email,password}=req.body;
  if(!email || !password){
    return res.json({ok:false,error:"E-Mail und Passwort erforderlich"});
  }

  const data=readData();
  if(data.users[email]){
    return res.json({ok:false,error:"E-Mail existiert bereits"});
  }

  const admin = email === ADMIN_EMAIL;
  data.users[email] = { password, admin };
  writeData(data);

  res.json({ok:true, admin});
});

// -------- Login
app.post("/login",(req,res)=>{
  const {email,password}=req.body;
  const data=readData();

  if(!data.users[email]){
    return res.json({ok:false,error:"Account existiert nicht"});
  }
  if(data.users[email].password !== password){
    return res.json({ok:false,error:"Falsches Passwort"});
  }

  res.json({ok:true, admin:data.users[email].admin});
});

// -------- Submit Item (global eindeutig)
app.post("/submitItem",(req,res)=>{
  const {email,input}=req.body;
  if(!email || !input){
    return res.json({ok:false});
  }

  const data=readData();
  const items=data.items;

  let output;
  let firstDiscovery=false;

  if(items[input]){
    output = items[input].output;
  } else {
    // neues Item → EINMALIG
    const chars="abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789😀😄😂🤣😎👍🔥💎🎯⚡❤️";
    output="";
    for(let i=0;i<3+Math.floor(Math.random()*3);i++){
      output+=chars[Math.floor(Math.random()*chars.length)];
    }
    items[input]={ output };
    firstDiscovery=true;
  }

  writeData(data);
  res.json({ok:true,input,output,firstDiscovery});
});

// -------- Admin Search (OUTPUT → INPUT)
app.post("/adminSearch",(req,res)=>{
  const {query}=req.body;
  if(!query) return res.json({ok:false});

  const data=readData();
  const items=data.items;

  // Output existiert schon?
  const found = Object.entries(items)
    .find(([inp,val])=>val.output===query);

  if(found){
    return res.json({
      ok:true,
      input:found[0],
      output:found[1].output
    });
  }

  // Output neu → Input generieren
  let input="admin_"+Math.random().toString(36).slice(2,7);
  while(items[input]){
    input="admin_"+Math.random().toString(36).slice(2,7);
  }

  items[input]={ output:query };
  writeData(data);

  res.json({ok:true,input,output:query});
});

// -------- Admin Change Input (swap wenn nötig)
app.post("/adminChangeInput",(req,res)=>{
  const {oldInput,newInput}=req.body;
  const data=readData();

  if(!data.items[oldInput]){
    return res.json({ok:false});
  }

  // Falls newInput existiert → swap
  if(data.items[newInput]){
    const temp=data.items[newInput];
    data.items[newInput]=data.items[oldInput];
    data.items[oldInput]=temp;
  } else {
    data.items[newInput]=data.items[oldInput];
    delete data.items[oldInput];
  }

  writeData(data);
  res.json({ok:true});
});

// -------- SOCKET.IO (Live Announcements)
io.on("connection",(socket)=>{
  socket.on("adminAnnouncement",(data)=>{
    if(data.password !== ADMIN_PASS) return;
    if(!data.text) return;

    // LIVE an alle online Spieler
    io.emit("announcement",{text:data.text});
  });
});

// -------- Server starten
server.listen(PORT,()=>{
  console.log("Server läuft auf Port",PORT);
});
