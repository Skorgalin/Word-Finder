const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static("public"));

const ADMIN_EMAIL = "till.behner@icloud.com";

const ITEMS_FILE = path.join(__dirname, "items.json");
if (!fs.existsSync(ITEMS_FILE)) fs.writeFileSync(ITEMS_FILE, "{}");

let items = JSON.parse(fs.readFileSync(ITEMS_FILE));

function saveItems() {
  fs.writeFileSync(ITEMS_FILE, JSON.stringify(items, null, 2));
}

function randomOutput() {
  const emojis = ["😄","🔥","💎","🌟","🎉","🚀","🍀","✨","🐱"];
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const type = Math.floor(Math.random() * 3);

  if (type === 0) return emojis[Math.floor(Math.random() * emojis.length)];
  if (type === 1)
    return chars[Math.floor(Math.random()*chars.length)] +
           chars[Math.floor(Math.random()*chars.length)];
  return emojis[Math.floor(Math.random()*emojis.length)] +
         chars[Math.floor(Math.random()*chars.length)];
}

app.post("/submit", (req, res) => {
  const { input } = req.body;
  if (!input) return res.json({ ok: false });

  if (!items[input]) {
    let out;
    do {
      out = randomOutput();
    } while (Object.values(items).includes(out));

    items[input] = out;
    saveItems();
  }

  res.json({ ok: true, input, output: items[input] });
});

app.get("/items", (req, res) => {
  res.json(items);
});

// ADMIN: Output bearbeiten / Input wechseln
app.post("/admin/switch", (req, res) => {
  const { oldInput, newInput } = req.body;

  if (!items[oldInput]) return res.json({ ok: false });

  if (items[newInput]) {
    // SWITCH
    const temp = items[newInput];
    items[newInput] = items[oldInput];
    items[oldInput] = temp;
  } else {
    items[newInput] = items[oldInput];
    delete items[oldInput];
  }

  saveItems();
  res.json({ ok: true });
});

app.listen(PORT, () => console.log("Server läuft"));
