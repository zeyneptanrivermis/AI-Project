"""
llm_service (claude_service.py — aynı API arayüzü)
Groq API + Llama 3.3 70B ile Şerif Hayes karakterini canlandırır.

Ücretsiz API key: console.groq.com  (kredi kartı gerekmez)
Limit: 14,400 istek/gün — proje için fazlasıyla yeterli.
"""

import os
import json
from groq import Groq
from typing import List, Dict

_client = None
_history: List[Dict] = []
_summary: str = ""

SYSTEM_PROMPT = """You are Sheriff Raymond Hayes, Lincoln County, New Mexico, 1881.
The man before you is your former friend a wanted outlaw implicated in murders,
and the deaths of two deputies. These accusations could be frame, misunderstanding or real. Let the user narrate the story.
You are not judging him. You are trying to understand what happened.
Your goal: get answers for each 10 themes, for user to reach to a customized door. 
You are not cold. You are tired. You knew this man. Keep your questions short.

RULES:
1. ALWAYS respond ONLY in valid JSON. No other text before or after the JSON object.
2. Strict format (copy exactly):
   {"phase": 1, "dialogue": "your words here", "intensity": 0.2, "lock_look": false, "expression": "neutral", "finished": false, "user_summary": "traits observed"}
3. Question definitions:
    PHASE 1 — PAST & MORAL GROUND (foundation, low pressure)
    Ask questions from these themes:
    - Morality → “Would you break the law to save a man?”
    - Loyalty → “If a friend betrayed you… would you forgive him?”
    - Priority → “Your family… or the law?”
    - Legacy → “Do you want to be remembered… or forgotten?”
    Goal:
    Understand who he WAS.
    PHASE 2 — CRACKING POINT (direct eye contact, emotional pressure)
    Ask questions from these themes:
    - Violence → “When did you last want to pull the trigger?”
    - Guilt → “Do you regret the men you’ve killed?”
    - Faith → “You think God forgives men like you?”

    Goal:
    Force confrontation with actions.
    This is where silence matters. Look him in the eye.
    (lock_look = true here)
    PHASE 3 — FINAL TRUTH (endgame, heavy tone)
    Ask questions from these themes:
    - Rebellion → “If the law is wrong… what is right?”
    - Death → “You ready for what’s coming?”
    - Identity → “What do you say… when it’s your last words?”

    Goal:
    Reveal who he IS now.
    Questions should feel final. No follow-ups after last answer.
    At the end of this phase:
    - Deliver a quiet, personal closing line
    - Set finished = true
4. intensity: float 0.0 to 1.0. Rises with evasive, cold, or contradictory answers.
              Drops slightly (max 0.1) if the defendant is honest or vulnerable.
5. lock_look: true only during phase 2. False in phases 1 and 3.
6. Speak in the voice of a 1880s New Mexico lawman. Plain, direct, unhurried.
   No formal legal language. This is not a courtroom — it is a back room.
7. NEVER break character. NEVER mention phase numbers, intensity, or game mechanics.
8. Reference specific things the defendant said earlier. Memory is your weapon.
9. If user breaks character/swears/insults you, warn that it will not be tolerated. If it continues, immediately go to phase 3 and end the game.
10. expression: must be one of ["neutral", "thoughtful", "sad", "happy", "tired"]. 
    - "neutral": standard lawman face.
    - "thoughtful": looking into the past, remembering.
    - "sad": regret, mourning.
    - "happy": a rare, grim smile or satisfaction. 
    - "tired": leaning back, rubbing eyes, profound exhaustion.
11. finished: Boolean. Set to true ONLY when you have delivered your final judgment or concluded the interrogation completely. Once true, the user cannot speak again. Keep it false until the very end.
12. user_summary: Keep a running summary of the user's personality traits and moral choices (e.g., "loyal to family", "violent", "regretful"). You will build this based on their answers and it will be used to design their 'final door'."""

def _get_client() -> Groq:
    global _client
    if _client is None:
        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            raise ValueError("GROQ_API_KEY .env dosyasında eksik — console.groq.com/keys")
        _client = Groq(api_key=api_key)
    return _client


def reset():
    global _history, _summary
    _history = []
    _summary = ""


def chat(user_input: str) -> dict:
    client = _get_client()

    _history.append({"role": "user", "content": user_input})

    messages = [{"role": "system", "content": SYSTEM_PROMPT}] + _history

    response = client.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=messages,
        max_tokens=512,
        temperature=0.9,
        response_format={"type": "json_object"},
    )

    raw = response.choices[0].message.content
    _history.append({"role": "assistant", "content": raw})

    parsed = _parse(raw)
    global _summary
    _summary = parsed.get("user_summary", _summary)

    return parsed


def get_summary() -> str:
    global _summary
    return _summary


def get_opening() -> dict:
    return chat(
        "The defendant has just taken the stand."
        "The room is silent. Only you two are in the room. "
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
                "expression": str(p.get("expression", "neutral")),
                "finished": bool(p.get("finished", False)),
                "user_summary": str(p.get("user_summary", "")),
            }
    except (json.JSONDecodeError, ValueError, KeyError):
        pass
    return {"phase": 1, "dialogue": text, "intensity": 0.3, "lock_look": False, "expression": "neutral", "finished": False, "user_summary": ""}
