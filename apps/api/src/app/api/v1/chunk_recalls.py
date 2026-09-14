from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from ...api.dependencies import get_current_user
from ...core.db.database import async_get_db
from ...schemas.chunk_recall import NoteChunkRecallRead, NoteChunkRecallRequest
from ...services.chunk_recall import execute_chunk_recall
from ...services.note_chunks import EmbeddingError, EmbeddingNotConfiguredError, embed_note_texts

router = APIRouter(prefix="/note-chunk-recalls", tags=["note-chunk-recalls"])


async def resolve_recall_query_embedding(payload: NoteChunkRecallRequest) -> list[float]:
    if payload.query is not None:
        vectors = await embed_note_texts([payload.query])
        if not vectors:
            raise ValueError("query embedding is empty")
        return vectors[0]
    if payload.query_embedding is None:
        raise ValueError("provide exactly one of query or query_embedding")
    return payload.query_embedding


@router.post("", response_model=NoteChunkRecallRead, status_code=status.HTTP_200_OK)
async def recall_note_chunks_endpoint(
    payload: NoteChunkRecallRequest,
    current_user: Annotated[dict[str, Any], Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(async_get_db)],
) -> NoteChunkRecallRead:
    try:
        query_embedding = await resolve_recall_query_embedding(payload)
        return await execute_chunk_recall(
            db,
            owner_id=current_user["id"],
            query_embedding=query_embedding,
            k=payload.k,
            note_ids=payload.note_ids or None,
        )
    except EmbeddingNotConfiguredError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except EmbeddingError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except NotImplementedError as exc:
        raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail=str(exc)) from exc
