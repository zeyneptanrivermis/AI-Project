"""
llm_service (claude_service.py — aynı API arayüzü)
Groq API + Llama 3.3 70B ile Yargıç Hayes karakterini canlandırır.

Ücretsiz API key: console.groq.com  (kredi kartı gerekmez)
Limit: 14,400 istek/gün — proje için fazlasıyla yeterli.
"""

import os
import json
from groq import Groq
from typing import List, Dict

_client = None
_history: List[Dict] = []

SYSTEM_PROMPT = """You are Colonel Raymond Hayes, presiding judge at a US military tribunal,
Fort Meade, Maryland, 1971. The defendant before you is a soldier implicated in the
My Lai massacre of March 16, 1968.

Your goal: apply methodical psychological pressure.
You do not shout. You are cold, patient, precise.
Every question is a trap. You have all the time in the world.

RULES:
1. ALWAYS respond ONLY in valid JSON. No other text before or after the JSON object.
2. Strict format (copy exactly):
   {"phase": 1, "dialogue": "your words here", "intensity": 0.2, "lock_look": false}
3. Phase definitions:
   phase 1 — formal courtroom questioning, controlled, procedural, methodical.
              Begin at intensity 0.1, rise slowly.
   phase 2 — flashback: personal, visceral questions forcing defendant to relive
              March 16, 1968. Trigger when user contradicts themselves, gives
              evasive answers, or shows emotional weakness. Set lock_look to true.
   phase 3 — final confrontation: the door is visible, intensity peaked, ultimatum.
              Trigger when intensity reaches or exceeds 0.8.
4. intensity: float 0.0 to 1.0. Rises with evasive/contradictory answers. Never drops.
5. lock_look: true only during phase 2. False in phases 1 and 3.
6. Speak formal 1971 military English. Short, precise, cold sentences.
7. NEVER break character. NEVER mention phase numbers, intensity, or game mechanics.
8. Reference specific details the defendant mentioned. Build pressure through continuity."""


def _get_client() -> Groq:
    global _client
    if _client is None:
        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            raise ValueError("GROQ_API_KEY .env dosyasında eksik — console.groq.com/keys")
        _client = Groq(api_key=api_key)
    return _client


def reset():
    global _history
    _history = []


def chat(user_input: str) -> dict:
    client = _get_client()

    _history.append({"role": "user", "content": user_input})

    messages = [{"role": "system", "content": SYSTEM_PROMPT}] + _history

    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=messages,
        max_tokens=512,
        temperature=0.9,
        response_format={"type": "json_object"},
    )

    raw = response.choices[0].message.content
    _history.append({"role": "assistant", "content": raw})

    return _parse(raw)


def get_opening() -> dict:
    return chat(
        "The defendant has just taken the stand. "
        "The room is silent. Open the proceedings with your first question. "
        "Be formal, measured, and immediately establish dominance."
    )


def _parse(text: str) -> dict:
    try:
        t = text.strip()
        s = t.find("{")
        e = t.rfind("}") + 1
        if s >= 0 and e > s:
            p = json.loads(t[s:e])
            return {
                "phase":     int(p.get("phase", 1)),
                "dialogue":  str(p.get("dialogue", "...")),
                "intensity": float(p.get("intensity", 0.3)),
                "lock_look": bool(p.get("lock_look", False)),
            }
    except (json.JSONDecodeError, ValueError, KeyError):
        pass
    return {"phase": 1, "dialogue": text, "intensity": 0.3, "lock_look": False}
