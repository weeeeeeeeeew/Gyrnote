from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from ...api.dependencies import get_current_user
from ...core.db.database import async_get_db
from ...schemas.structure_query import StructureQueryRead, StructureQueryRequest
from ...services.structure_query import execute_structure_query

router = APIRouter(prefix="/structure-queries", tags=["structure-queries"])


@router.post("", response_model=StructureQueryRead, status_code=status.HTTP_200_OK)
async def run_structure_query_endpoint(
    payload: StructureQueryRequest,
    current_user: Annotated[dict[str, Any], Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(async_get_db)],
) -> StructureQueryRead:
    try:
        return await execute_structure_query(db, owner_id=current_user["id"], kind=payload.kind)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except NotImplementedError as exc:
        raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail=str(exc)) from exc
