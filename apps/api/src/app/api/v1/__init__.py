from fastapi import APIRouter

from .candidate_jobs import router as candidate_jobs_router
from .candidates import router as candidates_router
from .chunk_recalls import router as chunk_recalls_router
from .health import router as health_router
from .instruction_patches import router as instruction_patches_router
from .login import router as login_router
from .logout import router as logout_router
from .notes import router as notes_router
from .patch_reviews import router as patch_reviews_router
from .posts import router as posts_router
from .rate_limits import router as rate_limits_router
from .structure_queries import router as structure_queries_router
from .tasks import router as tasks_router
from .tiers import router as tiers_router
from .users import router as users_router

router = APIRouter(prefix="/v1")
router.include_router(health_router)
router.include_router(login_router)
router.include_router(logout_router)
router.include_router(notes_router)
router.include_router(candidates_router)
router.include_router(candidate_jobs_router)
router.include_router(instruction_patches_router)
router.include_router(patch_reviews_router)
router.include_router(structure_queries_router)
router.include_router(chunk_recalls_router)
router.include_router(users_router)
router.include_router(posts_router)
router.include_router(tasks_router)
router.include_router(tiers_router)
router.include_router(rate_limits_router)
