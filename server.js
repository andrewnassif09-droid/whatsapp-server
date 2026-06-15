async function startWhatsApp() {
  console.log("🔄 بدء تشغيل WhatsApp...");
  
  const { state, saveCreds } = await useMultiFileAuthState("./wa-session");
  console.log("✅ تم تحميل الـ session");

  sock = makeWASocket({
    auth: state,
    logger: pino({ level: "silent" }),
    printQRInTerminal: true
  });
  console.log("✅ تم إنشاء الـ socket");

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
    console.log("📡 connection.update:", { connection, hasQR: !!qr });
    
    if (qr) {
      console.log("📱 جاري تحويل QR...");
      qrDataUrl = await qrcode.toDataURL(qr);
      console.log("📱 QR جاهز!");
    }
    if (connection === "open") {
      waReady = true;
      console.log("✅ WhatsApp متصل!");
      await sendMessage(ADMIN_PHONE, "✅ سيرفر الحضور شغّال وجاهز!");
    }
    if (connection === "close") {
      waReady = false;
      console.log("❌ انقطع الاتصال:", lastDisconnect?.error?.message);
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) {
        console.log("🔄 إعادة الاتصال بعد 5 ثواني...");
        setTimeout(startWhatsApp, 5000);
      }
    }
  });
}
