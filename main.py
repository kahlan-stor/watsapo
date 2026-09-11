import os
import asyncio
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from dotenv import load_dotenv
import google.generativeai as genai
from playwright.async_api import async_playwright

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent
PORT = int(os.getenv("PORT", "8000"))
GEMINI_KEY = os.getenv("GEMINI_API_KEY")

if GEMINI_KEY:
    genai.configure(api_key=GEMINI_KEY)
    model = genai.GenerativeModel("gemini-1.5-flash")
else:
    model = None

app = FastAPI(title="WhatsApp Smart Dashboard")

bot_state = {
    "auto_reply": True,
    "status": "غير متصل",
}

class ConnectionManager:
    def __init__(self):
        self.active_connections = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, data: dict):
        dead = []
        for connection in self.active_connections:
            try:
                await connection.send_json(data)
            except Exception:
                dead.append(connection)
        for connection in dead:
            self.disconnect(connection)

manager = ConnectionManager()

async def whatsapp_engine():
    """
    Starts a Playwright browser and opens WhatsApp Web.
    Note: WhatsApp controls its own read-receipt/presence behavior;
    this project does not guarantee bypassing those controls.
    """
    async with async_playwright() as p:
        context = await p.chromium.launch_persistent_context(
            str(BASE_DIR / "user_data"),
            headless=True,
        )
        page = await context.new_page()

        await page.goto("https://web.whatsapp.com", wait_until="domcontentloaded")
        bot_state["status"] = "تم فتح WhatsApp Web — بانتظار تسجيل الدخول"
        await manager.broadcast({"type": "status", "msg": bot_state["status"]})

        while True:
            try:
                await asyncio.sleep(5)

                if bot_state["auto_reply"] and model:
                    # Placeholder for an explicit, user-authorized
                    # message-processing workflow.
                    pass

            except Exception as exc:
                print(f"Engine Loop Error: {exc}")
                await asyncio.sleep(3)

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(whatsapp_engine())

@app.get("/")
async def get_dashboard():
    return FileResponse(BASE_DIR / "index.html")

@app.get("/api/state")
async def get_state():
    return bot_state

@app.post("/api/toggle-auto-reply")
async def toggle_auto_reply():
    bot_state["auto_reply"] = not bot_state["auto_reply"]
    return {"auto_reply": bot_state["auto_reply"]}

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    await websocket.send_json({
        "type": "status",
        "msg": bot_state["status"],
    })
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
