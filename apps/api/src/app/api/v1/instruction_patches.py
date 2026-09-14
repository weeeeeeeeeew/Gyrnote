from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, status

from ...api.dependencies import get_current_user
from ...schemas.instruction_patch import InstructionPatchRead, InstructionPatchRequest
from ...services.instruction_patch import (
    InstructionPatchError,
    InstructionPatchInvalidError,
    InstructionPatchNotConfiguredError,
    compile_instruction_patch,
)

router = APIRouter(prefix="/instruction-patches", tags=["instruction-patches"])


@router.post("", response_model=InstructionPatchRead, status_code=status.HTTP_200_OK)
async def compile_instruction_patch_endpoint(
    payload: InstructionPatchRequest,
    current_user: Annotated[dict[str, Any], Depends(get_current_user)],
) -> InstructionPatchRead:
    _ = current_user
    try:
        return await compile_instruction_patch(payload)
    except InstructionPatchNotConfiguredError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except InstructionPatchInvalidError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    except InstructionPatchError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except NotImplementedError as exc:
        raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail=str(exc)) from exc
