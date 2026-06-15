const express = require("express");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

app.get("/status", (req, res) => {
  res.json({ server: "online" });
});

app.get("/qr", (req, res) => {
  res.send("<h2>test ok</h2>");
});

app.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));
