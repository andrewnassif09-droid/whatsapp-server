const express = require("express");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;

const INSTANCE = process.env.ULTRAMSG_INSTANCE;
const TOKEN = process.env.ULTRAMSG_TOKEN;

function calculateLateFine(scanTime, lateAfter, stepMinutes = 5, stepAmount = 5) {
  const [scanHour, scanMinute] = scanTime.split(":").map(Number);
  const [lateHour, lateMinute] = lateAfter.split(":").map(Number);

  const scanTotalMinutes = scanHour * 60 + scanMinute;
  const lateTotalMinutes = lateHour * 60 + lateMinute;

  if (scanTotalMinutes <= lateTotalMinutes) {
    return {
      status: "Present",
      lateMinutes: 0,
      fine: 0
    };
  }

  const lateMinutes = scanTotalMinutes - lateTotalMinutes;
  const fine = Math.ceil(lateMinutes / stepMinutes) * stepAmount;

  return {
    status: "Late",
    lateMinutes,
    fine
  };
}

async function sendWhatsApp(phone, message) {
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

  return await response.json();
}

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

    const data = await sendWhatsApp(phone, message);

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
    const {
      name,
      phone,
      lecture,
      scanTime,
      lateAfter,
      stepMinutes,
      stepAmount
    } = req.body;

    if (!name || !phone || !lecture || !scanTime || !lateAfter) {
      return res.status(400).json({
        success: false,
        error: "name, phone, lecture, scanTime and lateAfter are required"
      });
    }

    const result = calculateLateFine(
      scanTime,
      lateAfter,
      Number(stepMinutes) || 5,
      Number(stepAmount) || 5
    );

    let whatsappStatus = "Not Sent";

    if (result.status === "Late") {
      const message = `مرحباً ${name}

⚠️ تم تسجيلك كمتأخر في ${lecture}

وقت الحضور: ${scanTime}
مدة التأخير: ${result.lateMinutes} دقيقة
الغرامة: ${result.fine} جنيه`;

      await sendWhatsApp(phone, message);

      whatsappStatus = "Sent";
    }

    res.json({
      success: true,
      name,
      phone,
      lecture,
      scanTime,
      lateAfter,
      status: result.status,
      lateMinutes: result.lateMinutes,
      fine: result.fine,
      whatsapp: whatsappStatus
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
