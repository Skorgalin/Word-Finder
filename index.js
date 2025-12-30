const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);

app.use(express.static("public"));

let items = {}; // Eingabe -> Ergebnis
let ultraRare = ["🌟","💎","✨"];
let announcements = [];

const ADMIN_EMAIL = "till.behner@icloud.com";
const ADMIN_PASSWORD = "X9$QvR7!eM2#A8wK@C";

app.get("/getItem/:input/:player", (req, res) => {
  const { input, player } = req.params;
  
  if(!items[input]){
    let result;
    if(Math.random()<0.02) result = ultraRare[Math.floor(Math.random()*ultraRare.length)];
    else if(Math.random()<0.5){
      result = "";
      const letters="abcdefghijklmnopqrstuvwxyz";
      for(let i=0;i<4+Math.floor(Math.random()*3);i++) result+=letters[Math.floor(Math.random()*letters.length)];
    } else {
      const emojis=["😀","😂","😎","🔥","💀"];
      result = emojis[Math.floor(Math.random()*emojis.length)];
    }
    items[input] = { value: result, discoveredBy: player!=="ADMIN"?player:null };
  }
  res.json(items[input]);
});

io.on("connection", socket=>{
  socket.emit("announcements", announcements);

  socket.on("announce", msg=>{
    announcements.push(msg);
    io.emit("announcements", [msg]);
  });
});

http.listen(process.env.PORT || 3000, ()=>console.log("Server running"));
