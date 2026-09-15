import uuid as uuid_pkg
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from ...api.dependencies import get_current_user
from ...core.db.database import async_get_db
from ...core.exceptions.http_exceptions import NotFoundException
from ...schemas.note import NoteCreate, NoteListItem, NoteRead, NoteVersionCreate
from ...services.embedding_runtime import embedding_override_from_values
from ...services.note_chunks import EmbeddingError, EmbeddingNotConfiguredError, embed_note_texts
from ...services.notes import (
    NoteNotFoundError,
    NoteRevisionConflictError,
    create_note,
    get_note,
    list_notes,
    save_note_version,
)

router = APIRouter(prefix="/notes", tags=["notes"])


def _embed_texts_for_request(
    api_key: str | None,
    base_url: str | None,
    model: str | None,
) -> tuple:
    override = embedding_override_from_values(api_key, base_url, model)

    async def embed(texts: list[str]) -> list[list[float]]:
        return await embed_note_texts(texts, override)

    return embed, override is not None


@router.get("", response_model=list[NoteListItem])
@router.get("/", response_model=list[NoteListItem], include_in_schema=False)
async def list_notes_endpoint(
    current_user: Annotated[dict[str, Any], Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(async_get_db)],
) -> list[NoteListItem]:
    return await list_notes(db, owner_id=current_user["id"])


@router.post("", response_model=NoteRead, status_code=status.HTTP_201_CREATED)
async def create_note_endpoint(
    payload: NoteCreate,
    current_user: Annotated[dict[str, Any], Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(async_get_db)],
    x_gyrnote_embedding_key: Annotated[str | None, Header()] = None,
    x_gyrnote_embedding_base_url: Annotated[str | None, Header()] = None,
    x_gyrnote_embedding_model: Annotated[str | None, Header()] = None,
) -> NoteRead:
    embed_texts, fail_closed = _embed_texts_for_request(
        x_gyrnote_embedding_key,
        x_gyrnote_embedding_base_url,
        x_gyrnote_embedding_model,
    )
    try:
        return await create_note(
            db,
            owner_id=current_user["id"],
            payload=payload,
            embed_texts=embed_texts,
            fail_closed_embeddings=fail_closed,
        )
    except EmbeddingNotConfiguredError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except EmbeddingError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc


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
    x_gyrnote_embedding_key: Annotated[str | None, Header()] = None,
    x_gyrnote_embedding_base_url: Annotated[str | None, Header()] = None,
    x_gyrnote_embedding_model: Annotated[str | None, Header()] = None,
) -> NoteRead:
    embed_texts, fail_closed = _embed_texts_for_request(
        x_gyrnote_embedding_key,
        x_gyrnote_embedding_base_url,
        x_gyrnote_embedding_model,
    )
    try:
        return await save_note_version(
            db,
            owner_id=current_user["id"],
            note_id=note_id,
            payload=payload,
            embed_texts=embed_texts,
            fail_closed_embeddings=fail_closed,
        )
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
    except EmbeddingNotConfiguredError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except EmbeddingError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
