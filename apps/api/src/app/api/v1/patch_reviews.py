from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, status

from ...api.dependencies import get_current_user
from ...schemas.patch_review import PatchReviewRead, PatchReviewResumeRequest, PatchReviewStartRequest
from ...services.patch_review import (
    PatchReviewConflictError,
    PatchReviewDecisionError,
    PatchReviewError,
    PatchReviewInvalidOpsError,
    PatchReviewNotFoundError,
    resume_patch_review,
    start_patch_review,
)

router = APIRouter(prefix="/patch-reviews", tags=["patch-reviews"])


def _to_read(snapshot: Any) -> PatchReviewRead:
    return PatchReviewRead(
        thread_id=snapshot.thread_id,
        patch_id=snapshot.patch_id,
        status=snapshot.status,
        ops=snapshot.ops,
    )


@router.post("", response_model=PatchReviewRead, status_code=status.HTTP_201_CREATED)
async def start_patch_review_endpoint(
    payload: PatchReviewStartRequest,
    current_user: Annotated[dict[str, Any], Depends(get_current_user)],
) -> PatchReviewRead:
    try:
        snapshot = start_patch_review(
            payload.patch_id,
            payload.ops,
            owner_id=current_user["id"],
        )
    except PatchReviewInvalidOpsError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except PatchReviewError as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc
    return _to_read(snapshot)


@router.post("/{thread_id}/resume", response_model=PatchReviewRead)
async def resume_patch_review_endpoint(
    thread_id: str,
    payload: PatchReviewResumeRequest,
    current_user: Annotated[dict[str, Any], Depends(get_current_user)],
) -> PatchReviewRead:
    try:
        snapshot = resume_patch_review(
            thread_id,
            payload.decision,
            owner_id=current_user["id"],
        )
    except PatchReviewNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patch review not found") from exc
    except PatchReviewDecisionError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except PatchReviewConflictError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except PatchReviewError as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc
    return _to_read(snapshot)
