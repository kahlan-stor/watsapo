require("dotenv").config();

const express = require("express");
const QRCode = require("qrcode");
const TelegramBot = require("node-telegram-bot-api");
const { Client, LocalAuth } = require("whatsapp-web.js");
const path = require("path");
const fs = require("fs");

const PORT = Number(process.env.PORT || 3000);
const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  console.error("TELEGRAM_BOT_TOKEN is missing in Railway Variables.");
  process.exit(1);
}

const app = express();
app.disable("x-powered-by");
app.use(express.json());
app.use(express.static(__dirname));

let qrDataUrl = null;
let whatsappState = "STARTING";
let autoReplyEnabled = true;
let replyMessage = process.env.DEFAULT_MESSAGE || "مرحباً، وصلت رسالتك. سأرد عليك لاحقاً.";
let lastQrAt = null;
let lastError = null;

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, whatsapp: whatsappState });
});

app.get("/api/status", (_req, res) => {
  res.json({
    whatsapp: whatsappState,
    autoReply: autoReplyEnabled,
    hasQr: Boolean(qrDataUrl),
    message: replyMessage,
    lastQrAt,
    error: lastError
  });
});

app.get("/api/qr", (_req, res) => {
  if (!qrDataUrl) return res.status(404).json({ error: "QR not available" });
  res.json({ qr: qrDataUrl, generatedAt: lastQrAt });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Web interface running on 0.0.0.0:${PORT}`);
});

const authPath = process.env.WHATSAPP_AUTH_PATH || "/data/.wwebjs_auth";
fs.mkdirSync(authPath, { recursive: true });

const client = new Client({
  authStrategy: new LocalAuth({
    clientId: "main",
    dataPath: authPath
  }),
  puppeteer: {
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/chromium",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-first-run",
      "--no-zygote",
      "--disable-features=Translate,BackForwardCache"
    ]
  }
});

client.on("qr", async (qr) => {
  try {
    whatsappState = "QR_READY";
    lastError = null;
    qrDataUrl = await QRCode.toDataURL(qr, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 420
    });
    lastQrAt = new Date().toISOString();
    console.log("WhatsApp QR generated.");
  } catch (e) {
    whatsappState = "QR_ERROR";
    lastError = e.message;
    console.error("QR error:", e);
  }
});

client.on("authenticated", () => {
  whatsappState = "AUTHENTICATED";
  qrDataUrl = null;
  lastError = null;
  console.log("WhatsApp authenticated.");
});

client.on("ready", () => {
  whatsappState = "CONNECTED";
  qrDataUrl = null;
  lastError = null;
  console.log("WhatsApp connected.");
});

client.on("auth_failure", (msg) => {
  whatsappState = "AUTH_FAILURE";
  lastError = String(msg);
  console.error("WhatsApp auth failure:", msg);
});

client.on("disconnected", (reason) => {
  whatsappState = "DISCONNECTED";
  qrDataUrl = null;
  lastError = String(reason);
  console.log("WhatsApp disconnected:", reason);
});

client.on("message", async (message) => {
  try {
    if (message.fromMe || !autoReplyEnabled) return;
    if (message.from.endsWith("@g.us")) return;
    await message.reply(replyMessage);
  } catch (e) {
    console.error("Reply error:", e.message);
  }
});

const bot = new TelegramBot(token, { polling: true });
const allowedChatId = String(process.env.TELEGRAM_ALLOWED_CHAT_ID || "").trim();

function authorized(msg) {
  return !allowedChatId || String(msg.chat.id) === allowedChatId;
}

function reject(msg) {
  return bot.sendMessage(msg.chat.id, "⛔ غير مصرح لك باستخدام هذا البوت.");
}

function help() {
  return "🤖 WhatsApp Bot Control\n\n/status - الحالة\n/awake - تشغيل الرد\n/sleep - إيقاف الرد\n/message نص - تغيير الرسالة\n/qr - حالة QR\n/help - المساعدة";
}

bot.onText(/^\/start$/, (m) => authorized(m) ? bot.sendMessage(m.chat.id, help()) : reject(m));
bot.onText(/^\/help$/, (m) => authorized(m) ? bot.sendMessage(m.chat.id, help()) : reject(m));

bot.onText(/^\/status$/, (m) => {
  if (!authorized(m)) return reject(m);
  bot.sendMessage(m.chat.id,
    `📱 WhatsApp: ${whatsappState}\n🤖 الرد: ${autoReplyEnabled ? "مفعل ✅" : "متوقف ⛔"}\n💬 ${replyMessage}`
  );
});

bot.onText(/^\/awake$/, (m) => {
  if (!authorized(m)) return reject(m);
  autoReplyEnabled = true;
  bot.sendMessage(m.chat.id, "✅ تم تشغيل الرد التلقائي.");
});

bot.onText(/^\/sleep$/, (m) => {
  if (!authorized(m)) return reject(m);
  autoReplyEnabled = false;
  bot.sendMessage(m.chat.id, "⛔ تم إيقاف الرد التلقائي.");
});

bot.onText(/^\/message(?:\s+([\s\S]+))?$/, (m, match) => {
  if (!authorized(m)) return reject(m);
  const text = (match?.[1] || "").trim();
  if (!text) return bot.sendMessage(m.chat.id, "استخدم: /message مرحباً، سأرد عليك لاحقاً.");
  replyMessage = text;
  bot.sendMessage(m.chat.id, "✅ تم تغيير رسالة الرد.");
});

bot.onText(/^\/qr$/, async (m) => {
  if (!authorized(m)) return reject(m);
  if (whatsappState === "CONNECTED") {
    return bot.sendMessage(m.chat.id, "✅ واتساب متصل بالفعل.");
  }
  bot.sendMessage(m.chat.id, `📱 الحالة: ${whatsappState}\nافتح واجهة Railway لمشاهدة QR.`);
});

bot.on("polling_error", (e) => console.error("Telegram polling error:", e.message));

client.initialize().catch((e) => {
  whatsappState = "INIT_ERROR";
  lastError = e.message;
  console.error("WhatsApp initialization error:", e);
});

async function shutdown(signal) {
  console.log(`${signal}: shutting down...`);
  try { await client.destroy(); } catch {}
  try { bot.stopPolling(); } catch {}
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
