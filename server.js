const express = require("express");
const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require("@whiskeysockets/baileys");
const qrcode = require("qrcode");
const pino   = require("pino");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

let sock      = null;
let waReady   = false;
let qrDataUrl = null;

async function startWhatsApp() {
  try {
    console.log("🔄 بدء تشغيل WhatsApp...");
const { state, saveCreds } = await useMultiFileAuthState("./wa-session-new");
    console.log("✅ session loaded");

    sock = makeWASocket({
      auth: state,
      logger: pino({ level: "silent" }),
      printQRInTerminal: true
    });
    console.log("✅ socket created");

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
      console.log("📡 update:", connection, "qr:", !!qr);
      if (qr) {
        qrDataUrl = await qrcode.toDataURL(qr);
        console.log("📱 QR جاهز!");
      }
      if (connection === "open") {
        waReady = true;
        console.log("✅ WhatsApp متصل!");
      }
     if (connection === "close") {
  waReady = false;
  qrDataUrl = null;

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
  } catch(e) {
    console.error("❌ خطأ في startWhatsApp:", e.message);
  }
}

startWhatsApp();

app.get("/status", (req, res) => {
  res.json({ server: "online", whatsapp: waReady ? "connected" : "disconnected" });
});

app.get("/qr", (req, res) => {
  if (waReady) return res.send("<h2 style='color:green'>✅ WhatsApp متصل!</h2>");
  if (!qrDataUrl) return res.send("<h2>⏳ جاري توليد QR...</h2><script>setTimeout(()=>location.reload(),2000)</script>");
  res.send(`<!DOCTYPE html><html><head><meta charset='UTF-8'></head>
    <body style='text-align:center;padding:40px;font-family:sans-serif'>
    <h2>📱 امسح بواتساب</h2>
    <img src='${qrDataUrl}' width='280'/>
    <p>واتساب ← النقاط الثلاث ← الأجهزة المرتبطة ← ربط جهاز</p>
    <script>setTimeout(()=>location.reload(),5000)</script>
    </body></html>`);
});

app.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));
