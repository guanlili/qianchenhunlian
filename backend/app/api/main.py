from fastapi import APIRouter

from app.api.routes import (
    admin,
    affinity,
    contacts,
    favorites,
    feedback,
    login,
    matches,
    private,
    profiles,
    stores,
    uploads,
    users,
    utils,
    wechat,
)
from app.core.config import settings

api_router = APIRouter()
api_router.include_router(login.router)
api_router.include_router(users.router)
api_router.include_router(utils.router)
api_router.include_router(wechat.router)
api_router.include_router(profiles.router)
api_router.include_router(matches.router)
api_router.include_router(favorites.router)
api_router.include_router(contacts.router)
api_router.include_router(affinity.router)
api_router.include_router(stores.router)
api_router.include_router(feedback.router)
api_router.include_router(admin.router)
api_router.include_router(uploads.router)


if settings.ENVIRONMENT == "local":
    api_router.include_router(private.router)
