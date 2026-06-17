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

const PORT = process.env.PORT || 10000;

let sock = null;
let waReady = false;
let qrDataUrl = null;
let isStarting = false;

async function startWhatsApp() {
  if (isStarting) return;

  isStarting = true;

  try {
    console.log("🔄 بدء تشغيل WhatsApp...");

    const { state, saveCreds } =
      await useMultiFileAuthState("./wa-session-new2");

    console.log("✅ session loaded");

    sock = makeWASocket({
      auth: state,
      logger: pino({ level: "info" }),
      printQRInTerminal: true,
      browser: ["Ubuntu", "Chrome", "20.0.04"],
      syncFullHistory: false,
      markOnlineOnConnect: false
    });

    console.log("✅ socket created");

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on(
      "connection.update",
      async ({ connection, lastDisconnect, qr }) => {
        console.log("📡 update:", connection, "qr:", !!qr);

        if (qr) {
          console.log("📱 QR RECEIVED");

          try {
            qrDataUrl = await qrcode.toDataURL(qr);
            console.log("✅ QR GENERATED");
          } catch (err) {
            console.log("❌ QR ERROR:", err.message);
          }
        }

        if (connection === "open") {
          waReady = true;
          qrDataUrl = null;
          isStarting = false;

          console.log("✅ WhatsApp Connected");
        }

        if (connection === "close") {
          waReady = false;
          qrDataUrl = null;
          isStarting = false;

          const reason =
            lastDisconnect?.error?.output?.statusCode;

          console.log("❌ Connection Closed");
          console.log("Reason:", reason);

          const shouldReconnect =
            reason !== DisconnectReason.loggedOut;

          if (shouldReconnect) {
            console.log("🔁 Reconnect after 15 sec");

            setTimeout(() => {
              startWhatsApp();
            }, 15000);
          }
        }
      }
    );
  } catch (err) {
    console.error("❌ Start Error:", err);

    isStarting = false;

    setTimeout(() => {
      startWhatsApp();
    }, 15000);
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
    return res.send(`
      <h2 style="color:green">
        ✅ WhatsApp Connected
      </h2>
    `);
  }

  if (!qrDataUrl) {
    return res.send(`
      <h2>⏳ جاري توليد QR...</h2>
      <p>استنى 10 ثواني واعمل Refresh</p>
      <script>
        setTimeout(() => location.reload(), 3000);
      </script>
    `);
  }

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>WhatsApp QR</title>
    </head>
    <body style="
      text-align:center;
      padding:40px;
      font-family:sans-serif;
    ">
      <h2>📱 امسح QR بواتساب</h2>

      <img
        src="${qrDataUrl}"
        width="300"
      />

      <p>
        WhatsApp → Linked Devices → Link Device
      </p>

      <script>
        setTimeout(() => location.reload(), 5000);
      </script>
    </body>
    </html>
  `);
});

app.post("/send", async (req, res) => {
  try {
    const { phone, message } = req.body;

    if (!waReady) {
      return res.status(500).json({
        success: false,
        error: "WhatsApp not connected"
      });
    }

    const jid = `${phone}@s.whatsapp.net`;

    await sock.sendMessage(jid, {
      text: message
    });

    res.json({
      success: true
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
