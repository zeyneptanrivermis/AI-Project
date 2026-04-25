import os
import re
import traceback
from fastapi import APIRouter, HTTPException
from models import ChatRequest, StartRequest
from services import claude_service

router = APIRouter()


def _check_key():
    if not os.getenv("GROQ_API_KEY"):
        raise HTTPException(status_code=500, detail={
            "type": "no_key",
            "message": "GROQ_API_KEY missing."
        })


def _handle_groq_error(e: Exception):
    err_str = str(e)
    cls = type(e).__name__

    if "RateLimitError" in cls or "rate_limit" in err_str.lower() or "429" in err_str:
        retry_after = 60
        m = re.search(r"try again in ([\d.]+)s", err_str, re.IGNORECASE)
        if m:
            retry_after = int(float(m.group(1))) + 1
        raise HTTPException(status_code=429, detail={
            "type": "rate_limit",
            "retry_after": retry_after,
            "message": f"Rate limit reached. Try again in {retry_after} seconds."
        })

    if "AuthenticationError" in cls or "401" in err_str or "invalid_api_key" in err_str.lower():
        raise HTTPException(status_code=401, detail={
            "type": "auth_error",
            "message": "Invalid API key."
        })

    traceback.print_exc()
    raise HTTPException(status_code=500, detail={
        "type": "server_error",
        "message": "Internal server error."
    })


@router.post("/chat")
async def chat_endpoint(req: ChatRequest):
    _check_key()
    try:
        return claude_service.chat(req.message, req.history, req.mode)
    except HTTPException:
        raise
    except Exception as e:
        _handle_groq_error(e)


@router.post("/start")
async def start_session(req: StartRequest):
    _check_key()
    try:
        return claude_service.get_opening(req.mode)
    except HTTPException:
        raise
    except Exception as e:
        _handle_groq_error(e)