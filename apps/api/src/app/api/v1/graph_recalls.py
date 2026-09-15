from typing import Annotated, Any

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from ...api.dependencies import get_current_user
from ...core.db.database import async_get_db
from ...schemas.graph_rag import GraphRagRead, GraphRagRequest
from ...services.embedding_runtime import embedding_override_from_values
from ...services.graph_rag import execute_graph_rag
from ...services.note_chunks import EmbeddingError, EmbeddingNotConfiguredError, embed_note_texts

router = APIRouter(prefix="/graph-recalls", tags=["graph-recalls"])


async def resolve_graph_rag_query_embedding(
    payload: GraphRagRequest,
    override: dict[str, str] | None = None,
) -> list[float]:
    if payload.query is not None:
        vectors = await embed_note_texts([payload.query], override)
        if not vectors:
            raise ValueError("query embedding is empty")
        return vectors[0]
    if payload.query_embedding is None:
        raise ValueError("provide exactly one of query or query_embedding")
    return payload.query_embedding


@router.post("", response_model=GraphRagRead, status_code=status.HTTP_200_OK)
async def recall_graph_passages_endpoint(
    payload: GraphRagRequest,
    current_user: Annotated[dict[str, Any], Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(async_get_db)],
    x_gyrnote_embedding_key: Annotated[str | None, Header()] = None,
    x_gyrnote_embedding_base_url: Annotated[str | None, Header()] = None,
    x_gyrnote_embedding_model: Annotated[str | None, Header()] = None,
) -> GraphRagRead:
    try:
        override = embedding_override_from_values(
            x_gyrnote_embedding_key,
            x_gyrnote_embedding_base_url,
            x_gyrnote_embedding_model,
        )

        async def embed_texts(texts: list[str]) -> list[list[float]]:
            return await embed_note_texts(texts, override)

        query_embedding = await resolve_graph_rag_query_embedding(payload, override)
        return await execute_graph_rag(
            db,
            owner_id=current_user["id"],
            query_embedding=query_embedding,
            k=payload.k,
            node_k=payload.node_k,
            note_ids=payload.note_ids or None,
            query_text=payload.query,
            embed_texts=embed_texts,
        )
    except EmbeddingNotConfiguredError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except EmbeddingError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except NotImplementedError as exc:
        raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail=str(exc)) from exc
