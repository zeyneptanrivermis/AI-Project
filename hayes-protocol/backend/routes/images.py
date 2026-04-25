import asyncio
from concurrent.futures import ThreadPoolExecutor
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, Response
from services import dalle_service
from models import GenerateDoorRequest

router = APIRouter()
_executor = ThreadPoolExecutor(max_workers=1)

@router.post("/generate-door")
async def generate_door(req: GenerateDoorRequest = GenerateDoorRequest()):
    import traceback
    try:
        summary = req.summary
        if not summary:
            raise HTTPException(status_code=400, detail="No summary yet.")
        mode = req.mode
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(_executor, dalle_service.generate_door, summary, mode)
        if not result.get("success"):
            raise HTTPException(status_code=500, detail=result.get("error"))
        return result
    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/door-image")
async def get_door_image():
    import traceback
    try:
        cache_file = dalle_service.CACHE_DIR / "door.png"
        if not cache_file.exists():
            return Response(status_code=204)
        return FileResponse(str(cache_file), media_type="image/png")
    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))