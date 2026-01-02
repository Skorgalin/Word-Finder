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
if(!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify({users:{}, items:{}, announcements:[], usedOutputs:[]}));

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
  data.users[email] = {password, admin, seenAnnouncements:[]};
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

// --- Submit Item (normal Spieler) ---
app.post("/submitItem",(req,res)=>{
  const {email,input}=req.body;
  if(!email||!input) return res.json({ok:false});
  const data=readData();
  if(!data.usedOutputs) data.usedOutputs=[];
  const items=data.items;
  let output;
  let firstDiscovery=false;

  if(items[input]){
    output=items[input].output;
  } else {
    const chars="abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789😀😄😂🤣😎👍🔥💎🎯⚡❤️";
    do {
      output="";
      for(let i=0;i<3+Math.floor(Math.random()*3);i++){
        output+=chars[Math.floor(Math.random()*chars.length)];
      }
    } while(data.usedOutputs.includes(output));
    items[input]={output,firstDiscovery:true};
    data.usedOutputs.push(output);
    firstDiscovery=true;
  }

  writeData(data);
  res.json({ok:true,input,output,firstDiscovery});
});

// --- Admin Search (Output eingeben, Input anzeigen, speichern wie Found) ---
app.post("/adminSearch",(req,res)=>{
  const {query}=req.body;
  if(!query) return res.json({ok:false});
  const data=readData();
  if(!data.usedOutputs) data.usedOutputs=[];

  // Prüfen, ob Output schon existiert
  let foundEntry=Object.entries(data.items).find(([k,v])=>v.output===query);

  if(!foundEntry){
    // Neues Item erstellen (keine First Discovery)
    const chars="abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789😀😄😂🤣😎👍🔥💎🎯⚡❤️";
    let output;
    do {
      output="";
      for(let i=0;i<3+Math.floor(Math.random()*3);i++){
        output+=chars[Math.floor(Math.random()*chars.length)];
      }
    } while(data.usedOutputs.includes(output));
    data.items[query]={output,firstDiscovery:false}; // Input = query
    data.usedOutputs.push(output);
    foundEntry=[query,data.items[query]];
  }

  writeData(data);
  res.json({ok:true,input:foundEntry[0],output:foundEntry[1].output});
});

// --- Admin Change Input ---
app.post("/adminChangeInput",(req,res)=>{
  const {oldInput,newInput}=req.body;
  if(!oldInput||!newInput) return res.json({ok:false});
  const data=readData();
  if(!data.items[oldInput]) return res.json({ok:false});

  // Wenn neuer Input schon existiert, switch Inputs
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

// --- Admin Announcements ---
app.post("/announce",(req,res)=>{
  const {text,adminPassword}=req.body;
  if(adminPassword!==ADMIN_PASS) return res.json({ok:false,error:"Falsches Admin Passwort"});
  const data=readData();
  if(!data.announcements) data.announcements=[];
  // jede Ankündigung bekommt eindeutige ID
  const id=Date.now()+"-"+Math.floor(Math.random()*10000);
  data.announcements.push({id,text});
  writeData(data);
  res.json({ok:true,id});
});

// --- Load Announcements für Spieler ---
app.post("/getAnnouncements",(req,res)=>{
  const {email}=req.body;
  if(!email) return res.json([]);
  const data=readData();
  const user=data.users[email];
  if(!user) return res.json([]);

  // nur neue Ankündigungen, die der Spieler noch nicht gesehen hat
  const newAnns=data.announcements.filter(a=>!user.seenAnnouncements.includes(a.id));

  // IDs der neuen Ankündigungen für den Spieler speichern
  newAnns.forEach(a=>user.seenAnnouncements.push(a.id));
  writeData(data);

  res.json(newAnns);
});

app.listen(PORT,()=>console.log(`Server läuft auf Port ${PORT}`));
