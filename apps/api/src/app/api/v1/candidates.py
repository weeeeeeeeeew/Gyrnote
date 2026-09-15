from typing import Annotated, Any

from fastapi import APIRouter, Depends, Header, HTTPException, status

from ...api.dependencies import get_current_user
from ...schemas.candidate import CandidateCompileRequest, CandidateThoughtModel
from ...services.candidate_compile import (
    CandidateCompileError,
    LLMNotConfiguredError,
    LLMResponseInvalidError,
    compile_candidate_model,
)
from ...services.llm_runtime import llm_override_from_values

router = APIRouter(prefix="/candidates", tags=["candidates"])


@router.post("/compile", response_model=CandidateThoughtModel, status_code=status.HTTP_200_OK)
async def compile_candidate_endpoint(
    payload: CandidateCompileRequest,
    current_user: Annotated[dict[str, Any], Depends(get_current_user)],
    x_gyrnote_llm_key: Annotated[str | None, Header()] = None,
    x_gyrnote_llm_base_url: Annotated[str | None, Header()] = None,
    x_gyrnote_llm_model: Annotated[str | None, Header()] = None,
) -> CandidateThoughtModel:
    _ = current_user
    try:
        return await compile_candidate_model(
            payload,
            llm_override=llm_override_from_values(
                x_gyrnote_llm_key,
                x_gyrnote_llm_base_url,
                x_gyrnote_llm_model,
            ),
        )
    except LLMNotConfiguredError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except LLMResponseInvalidError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
    except CandidateCompileError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
    except NotImplementedError as exc:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail=str(exc),
        ) from exc
