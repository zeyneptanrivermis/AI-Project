import httpx, os
from pathlib import Path

if os.getenv("VERCEL"):
    CACHE_DIR = Path("/tmp") / "cache"
else:
    CACHE_DIR = Path(__file__).parent.parent / "cache"

DOOR_PROMPT_TEMPLATE = (
    "A cinematic representation of a personalized door in an 1881 Western setting. You can make the door creative and a little fantasy like."
    "Personality traits: {summary}. Wide angle, night/day/in between according to user feeling."
)

def generate_door(summary: str) -> dict:
    token = os.getenv("HF_API_TOKEN")
    if not token:
        return {"success": False, "error": "HF_API_TOKEN not configured"}

    try:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        cache_file = CACHE_DIR / "door.png"

        response = httpx.post(
            "https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "inputs": DOOR_PROMPT_TEMPLATE.format(summary=summary),
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