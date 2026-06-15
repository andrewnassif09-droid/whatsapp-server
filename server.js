
const express = require("express");

const app = express();

app.use(express.json());

app.get("/", (req, res) => {
  res.send("Attendance Server Running");
});

app.post("/attendance", (req, res) => {
  console.log(req.body);

  res.json({
    success: true,
    message: "Attendance received"
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
