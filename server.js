const express = require("express");
const {
  default: makeWASocket,
  DisconnectReason,
  useMultiFileAuthState
} = require("@whiskeysockets/baileys");
const qrcode = require("qrcode");
const pino = require("pino");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

let sock = null;
let waReady = false;
let qrDataUrl = null;
let isStarting = false;

async function startWhatsApp() {
  if (isStarting) return;
  isStarting = true;

  try {
    console.log("🔄 بدء تشغيل WhatsApp...");

    const { state, saveCreds } = await useMultiFileAuthState("./wa-session-new");

    sock = makeWASocket({
      auth: state,
      logger: pino({ level: "silent" }),
      printQRInTerminal: true,
      browser: ["Attendance Server", "Chrome", "1.0"]
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
      console.log("📡 update:", connection, "qr:", !!qr);

      if (qr) {
        qrDataUrl = await qrcode.toDataURL(qr);
        console.log("📱 QR جاهز!");
      }

      if (connection === "open") {
        waReady = true;
        qrDataUrl = null;
        isStarting = false;
        console.log("✅ WhatsApp متصل!");
      }

      if (connection === "close") {
        waReady = false;
        qrDataUrl = null;
        isStarting = false;

        const reason = lastDisconnect?.error?.output?.statusCode;
        console.log("❌ connection closed, reason:", reason);

        const shouldReconnect = reason !== DisconnectReason.loggedOut;

        if (shouldReconnect) {
          console.log("🔁 إعادة المحاولة بعد 15 ثانية...");
          setTimeout(startWhatsApp, 15000);
        } else {
          console.log("🚪 Logged out. Change session folder name to generate new QR.");
        }
      }
    });
  } catch (e) {
    isStarting = false;
    console.error("❌ خطأ في startWhatsApp:", e.message);
    setTimeout(startWhatsApp, 15000);
  }
}

startWhatsApp();

app.get("/", (req, res) => {
  res.send("Attendance Server Running");
});

app.get("/status", (req, res) => {
  res.json({
    server: "online",
    whatsapp: waReady ? "connected" : "disconnected",
    qr: qrDataUrl ? "ready" : "not_ready"
  });
});

app.get("/qr", (req, res) => {
  if (waReady) {
    return res.send("<h2 style='color:green'>✅ WhatsApp متصل!</h2>");
  }

  if (!qrDataUrl) {
    return res.send(`
      <h2>⏳ جاري توليد QR...</h2>
      <p>استنى 10 ثواني واعمل Refresh</p>
      <script>setTimeout(()=>location.reload(),3000)</script>
    `);
  }

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>WhatsApp QR</title>
    </head>
    <body style="text-align:center;padding:40px;font-family:sans-serif">
      <h2>📱 امسح QR بواتساب</h2>
      <img src="${qrDataUrl}" width="280"/>
      <p>WhatsApp → Linked devices → Link a device</p>
      <script>setTimeout(()=>location.reload(),5000)</script>
    </body>
    </html>
  `);
});

app.post("/send", async (req, res) => {
  try {
    const { phone, message } = req.body;

    if (!waReady || !sock) {
      return res.status(503).json({ success: false, error: "WhatsApp not connected" });
    }

    if (!phone || !message) {
      return res.status(400).json({ success: false, error: "phone and message are required" });
    }

    const jid = phone + "@s.whatsapp.net";

    await sock.sendMessage(jid, { text: message });

    res.json({ success: true, sentTo: phone });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post("/attendance", async (req, res) => {
  try {
    const { name, phone, lecture, status, time } = req.body;

    if (!waReady || !sock) {
      return res.status(503).json({ success: false, error: "WhatsApp not connected" });
    }

    const message = `مرحباً ${name || ""}

تم تسجيل حضورك بنجاح.
المحاضرة: ${lecture || "-"}
الحالة: ${status || "-"}
الوقت: ${time || new Date().toLocaleString("en-GB", { timeZone: "Africa/Cairo" })}`;

    const jid = phone + "@s.whatsapp.net";

    await sock.sendMessage(jid, { text: message });

    res.json({ success: true, sentTo: phone, message });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server on port ${PORT}`);
});
