const express = require("express");
const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require("@whiskeysockets/baileys");
const qrcode  = require("qrcode");
const cron    = require("node-cron");
const pino    = require("pino");

const app = express();
app.use(express.json());

const PORT         = process.env.PORT || 3000;
const API_KEY      = process.env.API_KEY || "your-secret-key";
const SUMMARY_HOUR = process.env.SUMMARY_HOUR || "21";
const ADMIN_PHONE  = process.env.ADMIN_PHONE || "201XXXXXXXXX";

let sock      = null;
let waReady   = false;
let qrDataUrl = null;
let todayLog  = [];

async function startWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState("./wa-session");

  sock = makeWASocket({
    auth: state,
    logger: pino({ level: "silent" }),
    printQRInTerminal: true
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      qrDataUrl = await qrcode.toDataURL(qr);
      console.log("📱 QR جاهز");
    }
    if (connection === "open") {
      waReady = true;
      console.log("✅ WhatsApp متصل!");
      await sendMessage(ADMIN_PHONE, "✅ سيرفر الحضور شغّال وجاهز!");
    }
    if (connection === "close") {
      waReady = false;
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) setTimeout(startWhatsApp, 5000);
    }
  });
}

startWhatsApp();

async function sendMessage(phone, text) {
  if (!waReady || !sock) return false;
  try {
    const jid = phone.replace(/\D/g, "") + "@s.whatsapp.net";
    await sock.sendMessage(jid, { text });
    return true;
  } catch(e) {
    console.error("Send error:", e.message);
    return false;
  }
}

function authCheck(req, res, next) {
  if ((req.headers["x-api-key"] || req.query.key) !== API_KEY)
    return res.status(401).json({ error: "Unauthorized" });
  next();
}

app.get("/status", (req, res) => {
  res.json({ server: "online", whatsapp: waReady ? "connected" : "disconnected" });
});

app.get("/qr", (req, res) => {
  if (waReady) return res.send("<h2 style='color:green;font-family:sans-serif'>✅ WhatsApp متصل!</h2>");
  if (!qrDataUrl) return res.send("<h2 style='font-family:sans-serif'>⏳ جاري توليد QR...</h2><script>setTimeout(()=>location.reload(),2000)</script>");
  res.send(`<!DOCTYPE html><html><head><meta charset='UTF-8'><title>QR</title></head>
    <body style='text-align:center;padding:40px;font-family:sans-serif'>
    <h2>📱 امسح بواتساب</h2>
    <img src='${qrDataUrl}' width='280'/>
    <p>واتساب ← النقاط الثلاث ← الأجهزة المرتبطة ← ربط جهاز</p>
    <script>setTimeout(()=>location.reload(),5000)</script>
    </body></html>`);
});

app.post("/attendance", authCheck, async (req, res) => {
  const { uid, id, name, phone, lecture, status, fine, timestamp } = req.body;
  if (!uid || !name || !status) return res.status(400).json({ error: "missing data" });

  todayLog.push({ uid, id, name, phone, lecture, status, fine, time: timestamp });

  let waSent = false;
  if (phone && waReady) {
    let msg = null;
    if (status.includes("Late"))
      msg = `⚠️ *تأخير*\n👤 ${name}\n📚 ${lecture}\n⏱ ${status}\n💰 غرامة: ${fine} جنيه`;
    else if (status === "Absent")
      msg = `🔴 *غياب*\n👤 ${name}\n📚 ${lecture}`;
    if (msg) waSent = await sendMessage(phone, msg);
  }
  res.json({ ok: true, waSent });
});

cron.schedule(`0 ${SUMMARY_HOUR} * * *`, async () => {
  const present = todayLog.filter(r => r.status === "Present").length;
  const late    = todayLog.filter(r => r.status.includes("Late")).length;
  const absent  = todayLog.filter(r => r.status === "Absent").length;
  const fines   = todayLog.reduce((s,r) => s+(Number(r.fine)||0), 0);
  const msg = `📊 *ملخص اليوم*\n✅ حاضر: ${present}\n🟡 متأخر: ${late}\n🔴 غائب: ${absent}\n💰 غرامات: ${fines} جنيه`;
  await sendMessage(ADMIN_PHONE, msg);
  todayLog = [];
}, { timezone: "Africa/Cairo" });

app.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));
