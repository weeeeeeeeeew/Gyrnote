from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from src.app.api.v1.graph_recalls import recall_graph_passages_endpoint
from src.app.schemas.graph_rag import GraphRagRead, GraphRagRequest
from src.app.services.note_chunks import EmbeddingNotConfiguredError


@pytest.mark.asyncio
async def test_graph_rag_endpoint_returns_scoped_hits(
    mock_db, current_user_dict, monkeypatch: pytest.MonkeyPatch
) -> None:
    payload = GraphRagRequest(query_embedding=[1.0, 0.0], k=3, node_k=4)
    expected = GraphRagRead(nodes=[], hits=[], scoped_block_count=0, empty_reason="no_confirmed_nodes")
    execute = AsyncMock(return_value=expected)
    monkeypatch.setattr("src.app.api.v1.graph_recalls.execute_graph_rag", execute)
    result = await recall_graph_passages_endpoint(payload, current_user_dict, mock_db)
    assert result == expected
    assert execute.await_args.kwargs["k"] == 3
    assert execute.await_args.kwargs["node_k"] == 4


@pytest.mark.asyncio
async def test_graph_rag_maps_missing_embeddings_to_503(
    mock_db, current_user_dict, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        "src.app.api.v1.graph_recalls.embed_note_texts",
        AsyncMock(side_effect=EmbeddingNotConfiguredError("note embeddings are disabled")),
    )
    with pytest.raises(HTTPException) as error:
        await recall_graph_passages_endpoint(
            GraphRagRequest(query="T0 目标是什么"),
            current_user_dict,
            mock_db,
        )
    assert error.value.status_code == 503


def test_graph_rag_request_requires_exactly_one_query() -> None:
    with pytest.raises(ValidationError, match="exactly one"):
        GraphRagRequest()
    with pytest.raises(ValidationError, match="exactly one"):
        GraphRagRequest(query="T0", query_embedding=[1.0, 0.0])
    assert GraphRagRequest(query=" T0 ").query == "T0"
