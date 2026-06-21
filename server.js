const express = require("express");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;

const INSTANCE = process.env.ULTRAMSG_INSTANCE;
const TOKEN = process.env.ULTRAMSG_TOKEN;
const GAS_URL = process.env.GAS_URL;

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

function isWhatsAppSent(waResult) {
  if (!waResult) return false;

  if (waResult.sent === true) return true;
  if (waResult.success === true) return true;

  if (waResult.id) return true;
  if (waResult.message && String(waResult.message).toLowerCase().includes("sent")) return true;

  return false;
}

async function markWhatsAppSentInSheet(data) {
  const response = await fetch(GAS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      action: "markWhatsAppSent",
      uid: data.uid,
      lecture: data.lecture,
      date: data.date
    })
  });

  return await response.json();
}

async function processScan(uid) {
  try {
    console.log("📥 Processing UID:", uid);

    const response = await fetch(GAS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ uid })
    });

    const data = await response.json();

    console.log("📊 GAS Response:", data);

    if (!data.success) {
      console.log("❌ GAS Error:", data.error);
      return;
    }

    if (data.alreadyRecorded) {
      console.log("⚠️ Already recorded:", {
        uid: data.uid,
        name: data.name,
        lecture: data.lecture,
        date: data.date,
        scanTime: data.scanTime
      });
      return;
    }

    if (data.sendWhatsApp === true && data.phone) {
      const message = `مرحباً ${data.name}

⚠️ تم تسجيلك كمتأخر في ${data.lecture}

التاريخ: ${data.date || "-"}
وقت الحضور: ${data.scanTime}
مدة التأخير: ${data.lateMinutes} دقيقة
الغرامة: ${data.fine} جنيه`;

      const waResult = await sendWhatsApp(data.phone, message);

      console.log("📨 UltraMsg result:", waResult);

      if (isWhatsAppSent(waResult)) {
        const updateResult = await markWhatsAppSentInSheet(data);
        console.log("✅ Sheet WhatsApp updated:", updateResult);
      } else {
        console.log("❌ WhatsApp not confirmed, sheet kept NO:", waResult);
      }

    } else {
      console.log("ℹ️ No WhatsApp needed", {
        status: data.status,
        sendWhatsApp: data.sendWhatsApp,
        phone: data.phone
      });
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
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server on port ${PORT}`);
});
