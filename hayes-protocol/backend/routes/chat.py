import os
from fastapi import APIRouter, HTTPException
from models import ChatRequest, StartRequest
from services import claude_service

router = APIRouter()


def _check_key():
    if not os.getenv("GROQ_API_KEY"):
        raise HTTPException(status_code=500, detail="GROQ_API_KEY .env dosyasında eksik — console.groq.com/keys adresinden ücretsiz al")


@router.post("/chat")
async def chat_endpoint(req: ChatRequest):
    _check_key()
    try:
        return claude_service.chat(req.message)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/start")
async def start_session(req: StartRequest):
    """Reset conversation and get the judge's opening statement."""
    claude_service.reset()
    _check_key()
    try:
        return claude_service.get_opening()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
