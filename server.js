const express = require("express");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;

const INSTANCE = process.env.ULTRAMSG_INSTANCE;
const TOKEN = process.env.ULTRAMSG_TOKEN;

app.get("/", (req, res) => {
  res.send("Attendance WhatsApp Server Running");
});

app.get("/status", (req, res) => {
  res.json({
    server: "online",
    ultramsg_instance: INSTANCE ? "set" : "missing",
    ultramsg_token: TOKEN ? "set" : "missing"
  });
});

app.post("/send", async (req, res) => {
  try {
    const { phone, message } = req.body;

    if (!phone || !message) {
      return res.status(400).json({
        success: false,
        error: "phone and message are required"
      });
    }

    const response = await fetch(
      `https://api.ultramsg.com/${INSTANCE}/messages/chat`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          token: TOKEN,
          to: phone,
          body: message
        })
      }
    );

    const data = await response.json();

    res.json({
      success: true,
      ultramsg: data
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

app.post("/attendance", async (req, res) => {
  try {
    const { name, phone, lecture, status, time } = req.body;

    const message = `مرحباً ${name || ""}

تم تسجيل حضورك بنجاح ✅

المحاضرة: ${lecture || "-"}
الحالة: ${status || "-"}
الوقت: ${time || new Date().toLocaleString("en-GB", { timeZone: "Africa/Cairo" })}`;

    const response = await fetch(
      `https://api.ultramsg.com/${INSTANCE}/messages/chat`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          token: TOKEN,
          to: phone,
          body: message
        })
      }
    );

    const data = await response.json();

    res.json({
      success: true,
      sentTo: phone,
      message,
      ultramsg: data
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server on port ${PORT}`);
});
