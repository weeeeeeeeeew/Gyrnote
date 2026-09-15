from typing import Annotated, Any

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from ...api.dependencies import get_current_user
from ...core.db.database import async_get_db
from ...schemas.note_answer import NoteAnswerRead, NoteAnswerRequest
from ...services.embedding_runtime import embedding_override_from_values
from ...services.llm_runtime import llm_override_from_values
from ...services.note_answer import (
    NoteAnswerInvalidError,
    NoteAnswerNotConfiguredError,
    NoteAnswerProviderError,
    execute_note_answer,
)
from ...services.note_chunks import EmbeddingError, EmbeddingNotConfiguredError, embed_note_texts

router = APIRouter(prefix="/note-answers", tags=["note-answers"])


@router.post("", response_model=NoteAnswerRead, status_code=status.HTTP_200_OK)
async def answer_note_question_endpoint(
    payload: NoteAnswerRequest,
    current_user: Annotated[dict[str, Any], Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(async_get_db)],
    x_gyrnote_llm_key: Annotated[str | None, Header()] = None,
    x_gyrnote_llm_base_url: Annotated[str | None, Header()] = None,
    x_gyrnote_llm_model: Annotated[str | None, Header()] = None,
    x_gyrnote_embedding_key: Annotated[str | None, Header()] = None,
    x_gyrnote_embedding_base_url: Annotated[str | None, Header()] = None,
    x_gyrnote_embedding_model: Annotated[str | None, Header()] = None,
) -> NoteAnswerRead:
    try:
        embedding_override = embedding_override_from_values(
            x_gyrnote_embedding_key,
            x_gyrnote_embedding_base_url,
            x_gyrnote_embedding_model,
        )
        llm_override = llm_override_from_values(
            x_gyrnote_llm_key,
            x_gyrnote_llm_base_url,
            x_gyrnote_llm_model,
        )

        async def embed_texts(texts: list[str]) -> list[list[float]]:
            return await embed_note_texts(texts, embedding_override)

        vectors = await embed_texts([payload.query])
        if not vectors:
            raise ValueError("query embedding is empty")
        return await execute_note_answer(
            db,
            owner_id=current_user["id"],
            query=payload.query,
            query_embedding=vectors[0],
            k=payload.k,
            node_k=payload.node_k,
            note_ids=payload.note_ids or None,
            embed_texts=embed_texts,
            llm_override=llm_override,
            history=payload.history or None,
        )
    except EmbeddingNotConfiguredError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except NoteAnswerNotConfiguredError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except EmbeddingError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    except NoteAnswerInvalidError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    except NoteAnswerProviderError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except NotImplementedError as exc:
        raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail=str(exc)) from exc
