from pydantic import BaseModel
from typing import Optional, List, Dict, Any


class ChatRequest(BaseModel):
    message: str
    character: str = "A"
    history: List[Dict[str, Any]] = []
    mode: str = "classic"


class StartRequest(BaseModel):
    character: str = "A"
    mode: str = "classic"


class GenerateDoorRequest(BaseModel):
    summary: str = ""
    mode: str = "classic"


class ChatResponse(BaseModel):
    phase: int
    dialogue: str
    intensity: float
    lock_look: bool
