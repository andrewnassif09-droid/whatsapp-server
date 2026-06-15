const express      = require("express");
const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode       = require("qrcode");
const qrcodeTerminal = require("qrcode-terminal");
const cron         = require("node-cron");

const app = express();
app.use(express.json());

const PORT         = process.env.PORT || 3000;
const API_KEY      = process.env.API_KEY || "your-secret-key-here";
const SUMMARY_HOUR = process.env.SUMMARY_HOUR || "21";
const ADMIN_PHONE  = process.env.ADMIN_PHONE || "201XXXXXXXXX";

let waReady  = false;
let qrDataUrl = null;
let todayLog = [];

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: "./wa-session" }),
  puppeteer: {
    args: ["--no-sandbox","--disable-setuid-sandbox","--disable-dev-shm-usage","--disable-gpu"],
    headless: true
  }
});

client.on("qr", (qr) => {
  qrcodeTerminal.generate(qr, { small: true });
  qrcode.toDataURL(qr, (err, url) => { if (!err) qrDataUrl = url; });
});

client.on("ready", () => {
  waReady = true;
  console.log("✅ WhatsApp Ready!");
  sendMessage(ADMIN_PHONE, "✅ سيرفر الحضور شغّال وجاهز!");
});

client.on("disconnected", () => { waReady = false; });
client.initialize();

async function sendMessage(phone, text) {
  if (!waReady) return false;
  try {
    await client.sendMessage(phone.replace(/\D/g,"") + "@c.us", text);
    return true;
  } catch(e) { return false; }
}

function buildDailySummary() {
  if (!todayLog.length) return "📊 لا يوجد سجلات اليوم.";
  const present = todayLog.filter(r => r.status === "Present").length;
  const late    = todayLog.filter(r => r.status.includes("Late")).length;
  const absent  = todayLog.filter(r => r.status === "Absent").length;
  const fines   = todayLog.reduce((s,r) => s + (Number(r.fine)||0), 0);
  return `📊 *ملخص اليوم*\n✅ حاضر: ${present}\n🟡 متأخر: ${late}\n🔴 غائب: ${absent}\n💰 غرامات: ${fines} جنيه`;
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
  if (waReady) return res.send("<h2 style='color:green'>✅ WhatsApp متصل!</h2>");
  if (!qrDataUrl) return res.send("<h2>⏳ جاري توليد QR...</h2><script>setTimeout(()=>location.reload(),2000)</script>");
  res.send(`<!DOCTYPE html><html><head><meta charset='UTF-8'><title>QR</title></head>
    <body style='text-align:center;padding:40px'>
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
  await sendMessage(ADMIN_PHONE, buildDailySummary());
  todayLog = [];
}, { timezone: "Africa/Cairo" });

app.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));
