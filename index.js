const express = require("express");
const fs = require("fs");
const path = require("path");
const app = express();

app.use(express.json());
app.use(express.static("public"));

const DATA_FILE = "./data.json";
const ADMIN_EMAIL = "till.behner@email.de"; // DEINE ADMIN MAIL
const ADMIN_PASSWORD = "ADMINPASSWORT";     // ADMIN PASSWORT

if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify({
    users: {},
    discoveries: {},
    announcements: []
  }, null, 2));
}

const load = () => JSON.parse(fs.readFileSync(DATA_FILE));
const save = (d) => fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2));

const randomOutput = () => {
  const pool = ["😄","🔥","💎","🌀","ZORP","ULTRA","XQ9","🧠","👁️"];
  return pool[Math.floor(Math.random() * pool.length)];
};

/* AUTH */
app.post("/auth", (req,res)=>{
  const {email,password} = req.body;
  const d = load();

  if (!d.users[email]) {
    d.users[email] = { password };
    save(d);
    return res.json({status:"registered"});
  }

  if (d.users[email].password !== password) {
    return res.status(401).json({error:"wrong password"});
  }

  res.json({status:"login"});
});

/* GAME */
app.post("/discover", (req,res)=>{
  const {input,email} = req.body;
  const d = load();

  if (!d.discoveries[input]) {
    let out;
    do { out = randomOutput(); }
    while (Object.values(d.discoveries).includes(out));

    d.discoveries[input] = {
      output: out,
      first: email !== ADMIN_EMAIL ? email : null
    };
    save(d);

    return res.json({
      output: out,
      firstDiscovery: email !== ADMIN_EMAIL
    });
  }

  res.json({
    output: d.discoveries[input].output,
    firstDiscovery: false
  });
});

/* ADMIN LOGIN */
app.post("/admin/login",(req,res)=>{
  if (req.body.password === ADMIN_PASSWORD) {
    res.json({ok:true});
  } else res.status(401).json({ok:false});
});

/* ADMIN SEARCH */
app.get("/admin/search",(req,res)=>{
  const d = load();
  res.json(d.discoveries);
});

/* ANNOUNCEMENTS */
app.post("/admin/announce",(req,res)=>{
  const d = load();
  d.announcements.push({
    text:req.body.text,
    time:Date.now()
  });
  save(d);
  res.json({ok:true});
});

app.get("/announcements",(req,res)=>{
  res.json(load().announcements);
});

app.listen(3000, ()=>console.log("Server läuft"));
