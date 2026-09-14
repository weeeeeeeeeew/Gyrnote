import uuid as uuid_pkg
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from ...api.dependencies import get_current_user
from ...core.db.database import async_get_db
from ...core.exceptions.http_exceptions import NotFoundException
from ...schemas.note import NoteCreate, NoteRead, NoteVersionCreate
from ...services.notes import (
    NoteNotFoundError,
    NoteRevisionConflictError,
    create_note,
    get_note,
    save_note_version,
)

router = APIRouter(prefix="/notes", tags=["notes"])


@router.post("", response_model=NoteRead, status_code=status.HTTP_201_CREATED)
async def create_note_endpoint(
    payload: NoteCreate,
    current_user: Annotated[dict[str, Any], Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(async_get_db)],
) -> NoteRead:
    return await create_note(db, owner_id=current_user["id"], payload=payload)


@router.get("/{note_id}", response_model=NoteRead)
async def get_note_endpoint(
    note_id: uuid_pkg.UUID,
    current_user: Annotated[dict[str, Any], Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(async_get_db)],
) -> NoteRead:
    try:
        return await get_note(db, owner_id=current_user["id"], note_id=note_id)
    except NoteNotFoundError as exc:
        raise NotFoundException("Note not found") from exc


@router.post("/{note_id}/versions", response_model=NoteRead, status_code=status.HTTP_201_CREATED)
async def save_note_version_endpoint(
    note_id: uuid_pkg.UUID,
    payload: NoteVersionCreate,
    current_user: Annotated[dict[str, Any], Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(async_get_db)],
) -> NoteRead:
    try:
        return await save_note_version(db, owner_id=current_user["id"], note_id=note_id, payload=payload)
    except NoteNotFoundError as exc:
        raise NotFoundException("Note not found") from exc
    except NoteRevisionConflictError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": "Note has changed since it was loaded",
                "current_revision": exc.current_revision,
            },
        ) from exc
