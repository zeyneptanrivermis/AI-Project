from pydantic import BaseModel
from typing import Optional, List, Dict, Any


class ChatRequest(BaseModel):
    message: str
    character: str = "A"
    history: List[Dict[str, Any]] = []


class StartRequest(BaseModel):
    character: str = "A"


class GenerateDoorRequest(BaseModel):
    summary: str = ""


class ChatResponse(BaseModel):
    phase: int
    dialogue: str
    intensity: float
    lock_look: bool
