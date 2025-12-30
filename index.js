const express = require("express");
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static("public"));

let items = {};
let announcements = [];

const ultraRare = ["🌟","💎","✨"];

app.get("/getItem/:input/:mode",(req,res)=>{
  const input = req.params.input;

  if(!items[input]){
    let result;
    let ultra = false;
    if(Math.random() < 0.02){
      result = ultraRare[Math.floor(Math.random()*ultraRare.length)];
      ultra = true;
    } else {
      const emojis = ["😀","😂","😎","🥳","🔥","💀"];
      result = Math.random()<0.5
        ? Math.random().toString(36).substring(2,6)
        : emojis[Math.floor(Math.random()*emojis.length)];
    }
    items[input] = { result, ultra };
  }

  res.json({ input, result: items[input].result, ultra: items[input].ultra });
});

app.post("/admin/update",(req,res)=>{
  const { item, input, password } = req.body;
  if(password !== "X9$QvR7!eM2#A8wK@C") return res.status(403).end();

  if(items[item]){
    items[item].result = input;
  }
  res.json({ok:true});
});

app.post("/announcement",(req,res)=>{
  announcements.unshift(req.body.text);
  announcements = announcements.slice(0,5);
  res.json({ok:true});
});

app.get("/announcement",(req,res)=>{
  res.json(announcements);
});

app.listen(PORT, ()=>console.log("Server läuft auf", PORT));
