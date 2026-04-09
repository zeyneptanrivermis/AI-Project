from pydantic import BaseModel
from typing import Optional


class ChatRequest(BaseModel):
    message: str
    character: str = "A"


class StartRequest(BaseModel):
    character: str = "A"


class ChatResponse(BaseModel):
    phase: int
    dialogue: str
    intensity: float
    lock_look: bool
