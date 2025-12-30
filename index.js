const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);

app.use(express.static("public"));

let items = {};
let announcements = [];

app.get("/getItem/:input/:player", (req, res) => {
  const { input, player } = req.params;

  if (!items[input]) {
    const emojis = ["😀","😂","😎","🔥","💀"];
    const letters = "abcdefghijklmnopqrstuvwxyz";
    let value;

    if (Math.random() < 0.02) value = "💎";
    else if (Math.random() < 0.5) {
      value = "";
      for (let i = 0; i < 4; i++) {
        value += letters[Math.floor(Math.random()*letters.length)];
      }
    } else {
      value = emojis[Math.floor(Math.random()*emojis.length)];
    }

    items[input] = {
      value,
      discoveredBy: player !== "ADMIN" ? player : null
    };
  }

  res.json(items[input]);
});

io.on("connection", socket => {
  socket.emit("announcements", announcements);

  socket.on("announce", msg => {
    announcements.push(msg);
    io.emit("announcements", [msg]);
  });
});

http.listen(process.env.PORT || 3000);
