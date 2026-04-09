import os
import base64
from pathlib import Path

_client = None
CACHE_DIR = Path(__file__).parent.parent / "cache"

SCENE_PROMPTS = {
    1: (
        "Military courtroom interior, Fort Meade 1971, dark wood paneling, "
        "harsh fluorescent overhead lighting, American flag in corner, "
        "heavy leather chairs, empty gallery, cinematic wide angle, "
        "muted palette dark greens and browns, no people, "
        "film noir atmosphere, oppressive silence, nighttime"
    ),
    2: (
        "Vietnam jungle village at dawn, My Lai 1968, thatched huts in distance, "
        "dense tropical vegetation, pale golden mist drifting through bamboo trees, "
        "unsettling silence, desaturated warm palette, wide angle, no people, "
        "ominous and still, photorealistic mood, morning light through smoke"
    ),
    3: (
        "Military courtroom interior same room dramatically transformed, "
        "red-amber lighting casting long deep shadows, "
        "single heavy wooden door visible at far end of room, "
        "thin pale light seeping through door crack, deep surrounding darkness, "
        "claustrophobic framing, high contrast, no people, "
        "door slightly ajar, cinematic tension, oppressive atmosphere"
    ),
}


def _get_client():
    global _client
    if _client is None:
        from openai import OpenAI
        api_key = os.getenv("OPENAI_API_KEY")
        if api_key:
            _client = OpenAI(api_key=api_key)
    return _client


def generate_scene(phase: int) -> dict:
    client = _get_client()
    if not client:
        return {"success": False, "error": "OPENAI_API_KEY not configured"}

    CACHE_DIR.mkdir(exist_ok=True)
    cache_file = CACHE_DIR / f"scene_{phase}.png"

    if cache_file.exists():
        return {"success": True, "cached": True, "path": str(cache_file)}

    response = client.images.generate(
        model="dall-e-3",
        prompt=SCENE_PROMPTS[phase],
        size="1792x1024",
        quality="standard",
        n=1,
        response_format="b64_json",
    )

    image_bytes = base64.b64decode(response.data[0].b64_json)
    cache_file.write_bytes(image_bytes)

    return {"success": True, "cached": False, "path": str(cache_file)}


def generate_all_scenes() -> dict:
    results = {}
    for phase in [1, 2, 3]:
        try:
            results[phase] = generate_scene(phase)
        except Exception as e:
            results[phase] = {"success": False, "error": str(e)}
    return results


def scene_exists(phase: int) -> bool:
    return (CACHE_DIR / f"scene_{phase}.png").exists()
