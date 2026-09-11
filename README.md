# Watsapo — WhatsApp + Telegram Bot

هذه النسخة مخصصة للرفع المباشر إلى GitHub من الهاتف: كل الملفات في المستوى الرئيسي.

## Railway Variables
TELEGRAM_BOT_TOKEN=توكن البوت
TELEGRAM_ALLOWED_CHAT_ID=Chat ID الخاص بك
DEFAULT_MESSAGE=رسالة الرد

لا ترفع `.env` ولا تضع التوكن داخل GitHub.

## Railway Volume
أنشئ Volume واربطه على `/data` لحفظ جلسة WhatsApp في `/data/.wwebjs_auth`.

## التشغيل
Railway سيقرأ Dockerfile تلقائياً.
افتح نطاق Railway بعد نجاح النشر، ثم امسح QR.

## أوامر Telegram
/start
/help
/status
/awake
/sleep
/message نص
/qr

ملاحظة: whatsapp-web.js طريقة غير رسمية للتعامل مع WhatsApp Web وليست Meta Cloud API.