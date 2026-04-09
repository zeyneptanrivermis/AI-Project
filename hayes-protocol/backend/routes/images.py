import os
import asyncio
from concurrent.futures import ThreadPoolExecutor
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from services import dalle_service

router = APIRouter()
_executor = ThreadPoolExecutor(max_workers=3)


@router.post("/init")
async def init_scenes():
    """Generate all 3 background scenes with DALL-E and cache them."""
    if not os.getenv("OPENAI_API_KEY"):
        return {
            "status": "skipped",
            "reason": "OPENAI_API_KEY not configured — CSS fallback backgrounds will be used",
            "scenes": {},
        }

    try:
        loop = asyncio.get_event_loop()
        results = await loop.run_in_executor(_executor, dalle_service.generate_all_scenes)
        all_ok = all(r.get("success") for r in results.values())
        return {"status": "complete" if all_ok else "partial", "scenes": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/image/{phase}")
async def get_scene_image(phase: int):
    """Return the cached DALL-E background image for a given phase (1, 2, or 3)."""
    if phase not in (1, 2, 3):
        raise HTTPException(status_code=400, detail="Phase must be 1, 2, or 3")

    if not dalle_service.scene_exists(phase):
        raise HTTPException(
            status_code=404,
            detail=f"Scene {phase} not generated yet. Call POST /init first.",
        )

    cache_file = dalle_service.CACHE_DIR / f"scene_{phase}.png"
    return FileResponse(str(cache_file), media_type="image/png")
