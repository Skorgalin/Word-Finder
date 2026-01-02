const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static("public"));

const ADMIN_EMAIL = "till.behner@icloud.com";
const ADMIN_PASS = "X9$QvR7!eM2#A8wK@C";

const DATA_FILE = path.join(__dirname,"data.json");
if(!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify({users:{}, items:{}, announcements:[]}))

function readData(){ return JSON.parse(fs.readFileSync(DATA_FILE)); }
function writeData(d){ fs.writeFileSync(DATA_FILE, JSON.stringify(d,null,2)); }

// --- Check if email exists ---
app.post("/checkEmail",(req,res)=>{
  const {email}=req.body;
  const data=readData();
  res.json({exists:!!data.users[email]});
});

// --- Register ---
app.post("/register",(req,res)=>{
  const {email,password}=req.body;
  if(!email || !password) return res.json({ok:false,error:"E-Mail und Passwort erforderlich"});
  const data=readData();
  if(data.users[email]) return res.json({ok:false,error:"E-Mail existiert"});
  const admin = email === ADMIN_EMAIL;
  data.users[email] = {password, admin};
  writeData(data);
  res.json({ok:true,admin});
});

// --- Login ---
app.post("/login",(req,res)=>{
  const {email,password}=req.body;
  const data=readData();
  if(!data.users[email] || data.users[email].password!==password) return res.json({ok:false,error:"Falsches Passwort"});
  res.json({ok:true,admin:data.users[email].admin});
});

// --- Logout ---
app.post("/logout",(req,res)=>{ res.json({ok:true}); });

// --- Submit Item ---
app.post("/submitItem",(req,res)=>{
  const {email,input}=req.body;
  if(!email||!input) return res.json({ok:false});
  const data=readData();
  const items=data.items;
  let output;
  let firstDiscovery=false;

  if(items[input]){
    output=items[input].output;
  } else {
    const chars="abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789😀😄😂🤣😎👍🔥💎🎯⚡❤️";
    output="";
    for(let i=0;i<3+Math.floor(Math.random()*3);i++){
      output+=chars[Math.floor(Math.random()*chars.length)];
    }
    items[input]={output,firstDiscovery:true};
    firstDiscovery=true;
  }

  writeData(data);
  res.json({ok:true,input,output,firstDiscovery});
});

// --- Admin Search ---
app.post("/adminSearch",(req,res)=>{
  const {query}=req.body;
  if(!query) return res.json({ok:false});
  const data=readData();
  const foundEntry=Object.entries(data.items).find(([k,v])=>v.output===query);
  if(foundEntry){
    res.json({ok:true,input:foundEntry[0],output:foundEntry[1].output});
  } else {
    const chars="abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789😀😄😂🤣😎👍🔥💎🎯⚡❤️";
    let output="";
    for(let i=0;i<3+Math.floor(Math.random()*3);i++) output+=chars[Math.floor(Math.random()*chars.length)];
    data.items[query]={output,firstDiscovery:false};
    writeData(data);
    res.json({ok:true,input:query,output});
  }
});

// --- Admin Change Input ---
app.post("/adminChangeInput",(req,res)=>{
  const {oldInput,newInput}=req.body;
  const data=readData();
  if(data.items[oldInput]){
    data.items[newInput]=data.items[oldInput];
    delete data.items[oldInput];
    writeData(data);
    res.json({ok:true});
  } else res.json({ok:false});
});

// --- Admin Announcements ---
app.post("/announce",(req,res)=>{
  const {text,adminPassword}=req.body;
  if(adminPassword!==ADMIN_PASS) return res.json({ok:false,error:"Falsches Admin Passwort"});
  const data=readData();
  data.announcements.push({text});
  writeData(data);
  res.json({ok:true});
});

// --- Get Announcements ---
app.get("/getAnnouncements",(req,res)=>{
  const data=readData();
  res.json(data.announcements);
});

app.listen(PORT,()=>console.log(`Server läuft auf Port ${PORT}`));
