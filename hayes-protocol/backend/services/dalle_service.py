import httpx, os
from pathlib import Path

if os.getenv("VERCEL"):
    CACHE_DIR = Path("/tmp") / "cache"
else:
    CACHE_DIR = Path(__file__).parent.parent / "cache"

DOOR_PROMPT_CLASSIC = (
    "Cinematic oil painting, 1881 American West. "
    "A solitary wooden door standing alone in an open landscape — no walls around it, just the door in the earth. "
    "The wood grain, color, light, and surroundings are shaped entirely by this soul's journey: {summary}. "
    "Translate the emotional weight into visual detail: guilt becomes rotting wood or dark stain, "
    "peace becomes warm golden light pooling at the threshold, defiance becomes iron reinforcement and shadow. "
    "The door is slightly ajar. Something glows from within — it could be salvation or reckoning. "
    "Wide angle. Dramatic sky — storm or dusk or strange calm depending on the soul. Dust in the air. "
    "Style: Frederic Remington meets Andrew Wyeth. Painterly, photorealistic, emotionally specific. "
    "No text, no people, no guns. Just the door and what it means."
)

DOOR_PROMPT_CRIME = (
    "Photorealistic cinematic still, 1881 New Mexico frontier. "
    "A heavy weathered door at the end of a narrow dirt alley behind a cantina. Nighttime. "
    "The door's condition, the light beneath it, and the objects around it reflect this specific person: {summary}. "
    "If they were honest — a crack of lamplight under the door, cleaner wood, open sky above. "
    "If they were evasive — the door is bolted, shadow-pooled, stained with something dark. "
    "The door is closed. What waits behind it — freedom, a cell, or the desert — is suggested, not shown. "
    "Hard directional shadows from a single hanging lantern. Desert night cold in the air. "
    "Style: Sam Peckinpah film still, high contrast, period grain, lived-in realism. "
    "No text, no faces, no weapons visible. The door is the subject."
)

def generate_door(summary: str, mode: str = "classic") -> dict:
    token = os.getenv("HF_API_TOKEN")
    if not token:
        return {"success": False, "error": "HF_API_TOKEN not configured"}

    try:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        cache_file = CACHE_DIR / "door.png"

        template = DOOR_PROMPT_CRIME if mode == "crime" else DOOR_PROMPT_CLASSIC
        prompt = template.format(summary=summary or "a person who said very little")

        response = httpx.post(
            "https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "inputs": prompt,
                "parameters": {"width": 1024, "height": 576}
            },
            timeout=60.0
        )

        if response.status_code != 200:
            return {"success": False, "error": response.text}

        cache_file.write_bytes(response.content)
        return {"success": True, "path": str(cache_file)}

    except Exception as e:
        return {"success": False, "error": str(e)}