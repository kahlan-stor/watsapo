require("dotenv").config();

const express=require("express");
const QRCode=require("qrcode");
const TelegramBot=require("node-telegram-bot-api");
const {Client,LocalAuth}=require("whatsapp-web.js");
const path=require("path");

const PORT=Number(process.env.PORT||3000);
const token=process.env.TELEGRAM_BOT_TOKEN;

if(!token){
  console.error("TELEGRAM_BOT_TOKEN is missing in Railway Variables.");
  process.exit(1);
}

let qrDataUrl=null;
let whatsappState="STARTING";
let autoReplyEnabled=true;
let replyMessage=process.env.DEFAULT_MESSAGE||"مرحباً، وصلت رسالتك. سأرد عليك لاحقاً.";

const app=express();
app.get("/",(_req,res)=>res.sendFile(path.join(__dirname,"index.html")));
app.get("/health",(_req,res)=>res.json({ok:true,whatsapp:whatsappState}));
app.get("/api/status",(_req,res)=>res.json({
  whatsapp:whatsappState,autoReply:autoReplyEnabled,
  hasQr:Boolean(qrDataUrl),message:replyMessage
}));
app.get("/api/qr",(_req,res)=>{
  if(!qrDataUrl)return res.status(404).json({error:"QR not available"});
  res.json({qr:qrDataUrl});
});
app.listen(PORT,"0.0.0.0",()=>console.log(`Server running on port ${PORT}`));

const authPath=process.env.WHATSAPP_AUTH_PATH||"/data/.wwebjs_auth";
const client=new Client({
  authStrategy:new LocalAuth({clientId:"main",dataPath:authPath}),
  puppeteer:{
    headless:true,
    executablePath:process.env.PUPPETEER_EXECUTABLE_PATH||undefined,
    args:[
      "--no-sandbox","--disable-setuid-sandbox","--disable-dev-shm-usage",
      "--disable-gpu","--no-first-run","--no-zygote"
    ]
  }
});

client.on("qr",async qr=>{
  whatsappState="QR_READY";
  qrDataUrl=await QRCode.toDataURL(qr,{errorCorrectionLevel:"M",margin:2,width:420});
  console.log("WhatsApp QR generated.");
});
client.on("authenticated",()=>{
  whatsappState="AUTHENTICATED";qrDataUrl=null;
  console.log("WhatsApp authenticated.");
});
client.on("ready",()=>{
  whatsappState="CONNECTED";qrDataUrl=null;
  console.log("WhatsApp connected.");
});
client.on("auth_failure",msg=>{
  whatsappState="AUTH_FAILURE";console.error("WhatsApp auth failure:",msg);
});
client.on("disconnected",reason=>{
  whatsappState="DISCONNECTED";console.log("WhatsApp disconnected:",reason);
});
client.on("message",async message=>{
  try{
    if(message.fromMe||!autoReplyEnabled)return;
    if(message.from.endsWith("@g.us"))return;
    await message.reply(replyMessage);
  }catch(e){console.error("Reply error:",e.message);}
});

const bot=new TelegramBot(token,{polling:true});
const allowedChatId=String(process.env.TELEGRAM_ALLOWED_CHAT_ID||"").trim();
function authorized(msg){return !allowedChatId||String(msg.chat.id)===allowedChatId;}
function reject(msg){return bot.sendMessage(msg.chat.id,"⛔ غير مصرح لك باستخدام هذا البوت.");}
function help(){
 return "🤖 WhatsApp Bot Control\n\n/status - الحالة\n/awake - تشغيل الرد\n/sleep - إيقاف الرد\n/message نص - تغيير الرسالة\n/qr - حالة QR\n/help - المساعدة";
}
bot.onText(/^\/start$/,(m)=>authorized(m)?bot.sendMessage(m.chat.id,help()):reject(m));
bot.onText(/^\/help$/,(m)=>authorized(m)?bot.sendMessage(m.chat.id,help()):reject(m));
bot.onText(/^\/status$/,(m)=>{
 if(!authorized(m))return reject(m);
 bot.sendMessage(m.chat.id,`📱 WhatsApp: ${whatsappState}\n🤖 الرد: ${autoReplyEnabled?"مفعل ✅":"متوقف ⛔"}\n💬 ${replyMessage}`);
});
bot.onText(/^\/awake$/,(m)=>{
 if(!authorized(m))return reject(m);
 autoReplyEnabled=true;bot.sendMessage(m.chat.id,"✅ تم تشغيل الرد التلقائي.");
});
bot.onText(/^\/sleep$/,(m)=>{
 if(!authorized(m))return reject(m);
 autoReplyEnabled=false;bot.sendMessage(m.chat.id,"⛔ تم إيقاف الرد التلقائي.");
});
bot.onText(/^\/message(?:\s+([\s\S]+))?$/,(m,match)=>{
 if(!authorized(m))return reject(m);
 const text=(match?.[1]||"").trim();
 if(!text)return bot.sendMessage(m.chat.id,"استخدم: /message مرحباً، سأرد عليك لاحقاً.");
 replyMessage=text;bot.sendMessage(m.chat.id,"✅ تم تغيير رسالة الرد.");
});
bot.onText(/^\/qr$/,(m)=>{
 if(!authorized(m))return reject(m);
 bot.sendMessage(m.chat.id,whatsappState==="CONNECTED"?"✅ واتساب متصل.":"📱 الحالة: "+whatsappState+"\nافتح رابط Railway لمشاهدة QR.");
});
bot.on("polling_error",e=>console.error("Telegram polling error:",e.message));

client.initialize();

process.on("SIGTERM",async()=>{try{await client.destroy();}catch{}process.exit(0);});
process.on("SIGINT",async()=>{try{await client.destroy();}catch{}process.exit(0);});
