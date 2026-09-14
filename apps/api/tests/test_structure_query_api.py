from unittest.mock import AsyncMock

import pytest

from src.app.api.v1.structure_queries import run_structure_query_endpoint
from src.app.schemas.structure_query import StructureQueryRead, StructureQueryRequest


@pytest.mark.asyncio
async def test_structure_query_endpoint_returns_hits_when_matcher_ready(
    mock_db, current_user_dict, monkeypatch: pytest.MonkeyPatch
) -> None:
    payload = StructureQueryRequest(kind="open_questions")
    expected = StructureQueryRead(kind="open_questions", hits=[])
    monkeypatch.setattr(
        "src.app.api.v1.structure_queries.execute_structure_query",
        AsyncMock(return_value=expected),
    )
    result = await run_structure_query_endpoint(payload, current_user_dict, mock_db)
    assert result == expected
