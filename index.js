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
if(!fs.existsSync(DATA_FILE))
  fs.writeFileSync(DATA_FILE, JSON.stringify({users:{}, items:{}}));

function readData(){ return JSON.parse(fs.readFileSync(DATA_FILE)); }
function writeData(d){ fs.writeFileSync(DATA_FILE, JSON.stringify(d,null,2)); }

// ---------- LOGIN / REGISTER ----------
app.post("/checkEmail",(req,res)=>{
  const {email}=req.body;
  const data=readData();
  res.json({exists:!!data.users[email]});
});

app.post("/register",(req,res)=>{
  const {email,password}=req.body;
  if(!email || !password) return res.json({ok:false});
  const data=readData();
  if(data.users[email]) return res.json({ok:false});
  const admin = email === ADMIN_EMAIL;
  data.users[email] = {password, admin};
  writeData(data);
  res.json({ok:true,admin});
});

app.post("/login",(req,res)=>{
  const {email,password}=req.body;
  const data=readData();
  if(!data.users[email] || data.users[email].password!==password)
    return res.json({ok:false});
  res.json({ok:true,admin:data.users[email].admin});
});

// ---------- ITEMS ----------
function randomOutput(){
  const chars="abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789😀😄😂🤣😎👍🔥💎🎯⚡❤️";
  let o="";
  for(let i=0;i<3+Math.floor(Math.random()*3);i++)
    o+=chars[Math.floor(Math.random()*chars.length)];
  return o;
}

app.post("/submitItem",(req,res)=>{
  const {email,input}=req.body;
  const data=readData();
  let firstDiscovery=false;
  let output;

  if(data.items[input]){
    output=data.items[input].output;
  } else {
    output=randomOutput();
    data.items[input]={output};
    firstDiscovery=true;
  }

  writeData(data);
  res.json({ok:true,input,output,firstDiscovery});
});

// ---------- ADMIN SEARCH ----------
app.post("/adminSearch",(req,res)=>{
  const {query}=req.body; // query = OUTPUT
  const data=readData();

  const found = Object.entries(data.items)
    .find(([_,v])=>v.output===query);

  if(found){
    res.json({ok:true,input:found[0],output:query});
  } else {
    let input=randomOutput();
    data.items[input]={output:query};
    writeData(data);
    res.json({ok:true,input,output:query});
  }
});

app.post("/adminChangeInput",(req,res)=>{
  const {oldInput,newInput}=req.body;
  const data=readData();

  if(!data.items[oldInput]) return res.json({ok:false});

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

// ---------- LIVE ANNOUNCEMENTS (WEBSOCKET) ----------
io.on("connection",(socket)=>{
  socket.on("adminAnnouncement",(data)=>{
    if(data.password!==ADMIN_PASS) return;
    io.emit("announcement", {text:data.text});
  });
});

server.listen(PORT,()=>console.log("Server läuft auf Port "+PORT));
