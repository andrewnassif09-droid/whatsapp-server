const express = require("express");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;

const INSTANCE = process.env.ULTRAMSG_INSTANCE;
const TOKEN = process.env.ULTRAMSG_TOKEN;
const GAS_URL = process.env.GAS_URL;

function formatPhone(phone) {
  let p = String(phone).trim();

  p = p.replace(/\s+/g, "");
  p = p.replace("+", "");

  // لو الرقم مصري يبدأ بـ 01
  if (p.startsWith("01")) {
    p = "2" + p;
  }

  // لو الرقم يبدأ بـ 201 تمام
  return p;
}

async function sendWhatsApp(phone, message) {
  if (!INSTANCE || !TOKEN) {
    throw new Error("UltraMsg INSTANCE or TOKEN is missing");
  }

  const formattedPhone = formatPhone(phone);

  console.log("📞 Sending WhatsApp to:", formattedPhone);

  const response = await fetch(
    `https://api.ultramsg.com/${INSTANCE}/messages/chat`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        token: TOKEN,
        to: formattedPhone,
        body: message
      })
    }
  );

  const text = await response.text();

  console.log("📩 UltraMsg raw response:", text);

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    throw new Error(`UltraMsg HTTP Error: ${response.status}`);
  }

  return data;
}

async function processScan(uid) {
  try {
    if (!GAS_URL) {
      throw new Error("GAS_URL is missing");
    }

    console.log("📥 Processing UID:", uid);

    const response = await fetch(GAS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ uid })
    });

    const text = await response.text();
    console.log("📊 GAS raw response:", text);

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error("GAS did not return valid JSON");
    }

    if (!data.success) {
      console.log("❌ GAS Error:", data.error);
      return;
    }

    console.log("✅ GAS parsed:", data);

    if (data.sendWhatsApp === true && data.phone) {
      const message = `مرحباً ${data.name || "طالب"}

⚠️ تم تسجيلك كمتأخر في ${data.lecture || ""}

اليوم: ${data.day || ""}
وقت الحضور: ${data.scanTime || ""}
مدة التأخير: ${data.lateMinutes || 0} دقيقة
الغرامة: ${data.fine || 0} جنيه`;

      const waResult = await sendWhatsApp(data.phone, message);

      console.log("✅ WhatsApp result:", waResult);
    } else {
      console.log("ℹ️ No WhatsApp needed");
      console.log("sendWhatsApp:", data.sendWhatsApp);
      console.log("phone:", data.phone);
    }

  } catch (err) {
    console.log("❌ processScan error:", err.message);
  }
}

app.get("/", (req, res) => {
  res.send("Fast Attendance Server Running");
});

app.get("/status", (req, res) => {
  res.json({
    server: "online",
    gas_url: GAS_URL ? "set" : "missing",
    ultramsg_instance: INSTANCE ? "set" : "missing",
    ultramsg_token: TOKEN ? "set" : "missing"
  });
});

app.post("/scan", (req, res) => {
  const { uid } = req.body;

  if (!uid) {
    return res.status(400).json({
      success: false,
      error: "uid is required"
    });
  }

  res.json({
    success: true,
    message: "Scan received"
  });

  setImmediate(() => {
    processScan(uid);
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
    console.log("❌ /send error:", err.message);

    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server on port ${PORT}`);
});
