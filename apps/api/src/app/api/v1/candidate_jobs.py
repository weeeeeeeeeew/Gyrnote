from typing import Annotated, Any

from fastapi import APIRouter, Depends, Header, HTTPException, status

from ...api.dependencies import get_current_user
from ...schemas.candidate_job import CandidateJobEnqueueRequest, CandidateJobRead
from ...services.candidate_jobs import (
    CandidateJobError,
    CandidateJobInvalidError,
    CandidateJobNotFoundError,
    CandidateJobQueueUnavailableError,
    enqueue_candidate_compile_job,
    read_candidate_job,
)
from ...services.llm_runtime import llm_override_from_values

router = APIRouter(prefix="/candidate-jobs", tags=["candidate-jobs"])


@router.post("", response_model=CandidateJobRead, status_code=status.HTTP_202_ACCEPTED)
async def enqueue_candidate_job_endpoint(
    payload: CandidateJobEnqueueRequest,
    current_user: Annotated[dict[str, Any], Depends(get_current_user)],
    x_gyrnote_llm_key: Annotated[str | None, Header()] = None,
    x_gyrnote_llm_base_url: Annotated[str | None, Header()] = None,
    x_gyrnote_llm_model: Annotated[str | None, Header()] = None,
) -> CandidateJobRead:
    try:
        return await enqueue_candidate_compile_job(
            current_user["id"],
            payload,
            llm_override_from_values(x_gyrnote_llm_key, x_gyrnote_llm_base_url, x_gyrnote_llm_model),
        )
    except CandidateJobQueueUnavailableError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except CandidateJobError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc


@router.get("/{job_id}", response_model=CandidateJobRead, status_code=status.HTTP_200_OK)
async def get_candidate_job_endpoint(
    job_id: str,
    current_user: Annotated[dict[str, Any], Depends(get_current_user)],
) -> CandidateJobRead:
    try:
        return await read_candidate_job(job_id, current_user["id"])
    except CandidateJobNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except CandidateJobQueueUnavailableError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except CandidateJobInvalidError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    except CandidateJobError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
