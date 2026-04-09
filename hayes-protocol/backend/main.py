"""
KNOCK — Design Your Door
Military Tribunal Experience | CSE 358

Backend: FastAPI + Gemini 1.5 Flash (ücretsiz API)
Karakterler: DALL-E 3 arka planlar (opsiyonel, CSS fallback var)

Çalıştırma (backend/ klasöründen):
    venv\\Scripts\\activate
    uvicorn main:app --reload --port 8000
"""

import sys
import os
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes.chat import router as chat_router
from routes.images import router as images_router

(Path(__file__).parent / "cache").mkdir(exist_ok=True)

app = FastAPI(
    title="KNOCK — Military Tribunal API",
    description="Colonel Raymond Hayes presides. You testify.",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat_router)
app.include_router(images_router)


@app.get("/health")
async def health():
    return {
        "status": "tribunal active",
        "judge": "Colonel Raymond Hayes",
        "llm_engine": "Gemini 1.5 Flash",
        "gemini": bool(os.getenv("GEMINI_API_KEY")),
        "dalle": bool(os.getenv("OPENAI_API_KEY")),
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
