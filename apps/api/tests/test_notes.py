import uuid as uuid_pkg
from unittest.mock import AsyncMock, Mock, patch

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from src.app.api.v1.notes import get_note_endpoint, save_note_version_endpoint
from src.app.core.exceptions.http_exceptions import NotFoundException
from src.app.models.note import Note
from src.app.schemas.note import (
    NoteCreate,
    NoteVersionCreate,
    PersistedGraphLayout,
    PersistedThoughtModel,
    PersistedThoughtNode,
    SourceAnchorCreate,
)
from src.app.services.note_chunks import EmbeddingProviderError
from src.app.services.notes import (
    NoteNotFoundError,
    NoteRevisionConflictError,
    calculate_content_hash,
    create_note,
    save_note_version,
)


def create_payload() -> NoteCreate:
    return NoteCreate(
        title="原文锚定",
        content_json={"type": "doc", "content": [{"type": "paragraph"}]},
        source_anchors=[
            SourceAnchorCreate(
                block_id="block-source",
                start_offset=0,
                end_offset=2,
                quote="原文",
                quote_hash="fnv1a32-v1:12345678",
            )
        ],
    )


def create_payload_with_blocks() -> NoteCreate:
    payload = create_payload()
    return payload.model_copy(
        update={
            "content_json": {
                "type": "doc",
                "content": [
                    {
                        "type": "paragraph",
                        "attrs": {"blockId": "block-a"},
                        "content": [{"type": "text", "text": "有内容"}],
                    }
                ],
            }
        }
    )


def create_payload_with_thought_model() -> NoteCreate:
    payload = create_payload()
    return payload.model_copy(
        update={
            "thought_model": PersistedThoughtModel(
                id="model-1",
                note_id="placeholder",
                version=1,
                title="原文锚定",
                nodes=[
                    PersistedThoughtNode(
                        id="n1",
                        type="claim",
                        label=None,
                        text="确认主张",
                        origin="user_created",
                        explicitness="explicit",
                        review_status="confirmed",
                        confidence=None,
                        source_anchor_ids=[],
                    )
                ],
                edges=[],
            )
        }
    )


def test_note_schema_rejects_non_tiptap_content_and_invalid_anchor() -> None:
    with pytest.raises(ValidationError, match="Tiptap doc"):
        NoteCreate(title="笔记", content_json={"type": "paragraph"})

    with pytest.raises(ValidationError, match="end_offset"):
        SourceAnchorCreate(
            block_id="block-source",
            start_offset=2,
            end_offset=2,
            quote="原文",
            quote_hash="fnv1a32-v1:12345678",
        )


def test_note_schema_rejects_duplicate_source_anchor_ids() -> None:
    anchor = create_payload().source_anchors[0]

    with pytest.raises(ValidationError, match="source anchor ids must be unique"):
        NoteCreate(
            title="笔记",
            content_json={"type": "doc"},
            source_anchors=[anchor, anchor.model_copy()],
        )


def test_content_hash_is_canonical_for_json_key_order() -> None:
    first = {"type": "doc", "attrs": {"b": 2, "a": 1}}
    second = {"attrs": {"a": 1, "b": 2}, "type": "doc"}

    assert calculate_content_hash(first) == calculate_content_hash(second)


@pytest.mark.asyncio
async def test_create_note_commits_note_version_and_anchors_together(mock_db: Mock) -> None:
    payload = create_payload()

    result = await create_note(mock_db, owner_id=7, payload=payload)

    assert result.owner_id == 7
    assert result.revision == 1
    assert result.current_version.version_no == 1
    assert result.current_version.content_hash == calculate_content_hash(payload.content_json)
    assert [anchor.block_id for anchor in result.source_anchors] == ["block-source"]
    assert result.source_anchors[0].id == payload.source_anchors[0].id
    assert result.thought_model.nodes == []
    assert result.thought_model.edges == []
    assert result.thought_model.note_id == str(result.id)
    assert result.graph_layout.node_positions == {}
    assert result.graph_layout.edge_path_style == "default"
    assert mock_db.add.call_count == 2
    mock_db.add_all.assert_called_once()
    assert mock_db.flush.await_count == 2
    mock_db.commit.assert_awaited_once()
    mock_db.rollback.assert_not_awaited()


@pytest.mark.asyncio
async def test_save_note_version_rejects_stale_revision_and_rolls_back(mock_db: Mock) -> None:
    note = Note(owner_id=7, title="原文锚定", content_json={"type": "doc"}, revision=3)
    note_result = Mock()
    note_result.scalar_one_or_none.return_value = note
    mock_db.execute = AsyncMock(return_value=note_result)
    payload = NoteVersionCreate(expected_revision=2, **create_payload().model_dump())

    with pytest.raises(NoteRevisionConflictError) as error:
        await save_note_version(mock_db, owner_id=7, note_id=note.id, payload=payload)

    assert error.value.current_revision == 3
    mock_db.rollback.assert_awaited_once()
    mock_db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_save_note_version_appends_version_and_increments_revision(mock_db: Mock) -> None:
    note = Note(owner_id=7, title="旧标题", content_json={"type": "doc"}, revision=1)
    note_result = Mock()
    note_result.scalar_one_or_none.return_value = note
    mock_db.execute = AsyncMock(return_value=note_result)
    mock_db.scalar = AsyncMock(return_value=1)
    payload = NoteVersionCreate(expected_revision=1, **create_payload().model_dump())

    result = await save_note_version(mock_db, owner_id=7, note_id=note.id, payload=payload)

    assert result.revision == 2
    assert result.current_version.version_no == 2
    assert note.current_version_id == result.current_version.id
    assert result.source_anchors[0].id == payload.source_anchors[0].id
    assert mock_db.add.call_count == 1
    mock_db.add_all.assert_called_once()
    assert mock_db.flush.await_count == 1
    mock_db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_create_note_writes_chunks_after_embedding_outside_transaction(mock_db: Mock) -> None:
    payload = create_payload_with_blocks()
    embed_calls: list[list[str]] = []

    async def fake_embed(texts: list[str]) -> list[list[float]]:
        embed_calls.append(texts)
        assert mock_db.add.call_count == 0
        assert mock_db.flush.await_count == 0
        return [[1.0, 0.0]]

    result = await create_note(mock_db, owner_id=7, payload=payload, embed_texts=fake_embed)

    assert embed_calls == [["有内容"]]
    assert result.current_version.content_hash == calculate_content_hash(payload.content_json)
    assert mock_db.add_all.call_count == 2
    chunks = mock_db.add_all.call_args_list[1].args[0]
    assert len(chunks) == 1
    assert chunks[0].block_id == "block-a"
    assert chunks[0].text == "有内容"
    assert chunks[0].embedding == [1.0, 0.0]
    mock_db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_create_note_commits_when_embedding_fails(mock_db: Mock) -> None:
    payload = create_payload_with_blocks()

    async def fail_embed(_texts: list[str]) -> list[list[float]]:
        raise EmbeddingProviderError("provider down")

    result = await create_note(mock_db, owner_id=7, payload=payload, embed_texts=fail_embed)

    assert result.revision == 1
    mock_db.add_all.assert_called_once()
    mock_db.commit.assert_awaited_once()
    mock_db.rollback.assert_not_awaited()


@pytest.mark.asyncio
async def test_save_note_version_writes_chunks_for_new_version(mock_db: Mock) -> None:
    note = Note(owner_id=7, title="旧标题", content_json={"type": "doc"}, revision=1)
    note_result = Mock()
    note_result.scalar_one_or_none.return_value = note
    mock_db.execute = AsyncMock(return_value=note_result)
    mock_db.scalar = AsyncMock(return_value=1)
    payload = NoteVersionCreate(expected_revision=1, **create_payload_with_blocks().model_dump())

    async def fake_embed(texts: list[str]) -> list[list[float]]:
        return [[0.0, 1.0] for _ in texts]

    result = await save_note_version(
        mock_db, owner_id=7, note_id=note.id, payload=payload, embed_texts=fake_embed
    )

    assert result.revision == 2
    assert mock_db.add_all.call_count == 2
    chunks = mock_db.add_all.call_args_list[1].args[0]
    assert chunks[0].block_id == "block-a"
    assert chunks[0].embedding == [0.0, 1.0]
    mock_db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_create_note_persists_confirmed_thought_model(mock_db: Mock) -> None:
    payload = create_payload_with_thought_model()

    result = await create_note(mock_db, owner_id=7, payload=payload)

    assert result.thought_model.note_id == str(result.id)
    assert [node.id for node in result.thought_model.nodes] == ["n1"]
    assert result.thought_model.nodes[0].text == "确认主张"
    assert result.current_version.thought_model_json["nodes"][0]["id"] == "n1"


@pytest.mark.asyncio
async def test_create_note_persists_graph_layout(mock_db: Mock) -> None:
    payload = create_payload().model_copy(
        update={
            "graph_layout": PersistedGraphLayout(
                node_positions={"n1": {"x": 12.5, "y": -40}},
                edge_path_style="smoothstep",
            )
        }
    )

    result = await create_note(mock_db, owner_id=7, payload=payload)

    assert result.graph_layout.edge_path_style == "smoothstep"
    assert result.graph_layout.node_positions["n1"].x == 12.5
    assert result.graph_layout.node_positions["n1"].y == -40
    assert result.current_version.graph_layout_json["edge_path_style"] == "smoothstep"


def test_graph_layout_schema_rejects_non_finite_coordinates() -> None:
    with pytest.raises(ValidationError, match="finite"):
        PersistedGraphLayout(node_positions={"n1": {"x": float("nan"), "y": 1}})


@pytest.mark.asyncio
async def test_note_endpoints_map_not_found_and_conflict(mock_db: Mock, current_user_dict: dict) -> None:
    note_id = uuid_pkg.uuid4()

    with patch("src.app.api.v1.notes.get_note", new=AsyncMock(side_effect=NoteNotFoundError)):
        with pytest.raises(NotFoundException, match="Note not found"):
            await get_note_endpoint(note_id, current_user_dict, mock_db)

    payload = NoteVersionCreate(expected_revision=1, **create_payload().model_dump())
    with patch(
        "src.app.api.v1.notes.save_note_version",
        new=AsyncMock(side_effect=NoteRevisionConflictError(current_revision=4)),
    ):
        with pytest.raises(HTTPException) as error:
            await save_note_version_endpoint(note_id, payload, current_user_dict, mock_db)

    assert error.value.status_code == 409
    assert error.value.detail["current_revision"] == 4
