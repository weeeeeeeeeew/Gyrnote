from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import Response

from src.app.api.v1.login import login_for_access_token
from src.app.core.config import EnvironmentOption, settings


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("environment", "should_be_secure"),
    [(EnvironmentOption.LOCAL, False), (EnvironmentOption.PRODUCTION, True)],
)
async def test_login_sets_refresh_cookie_with_environment_appropriate_security(
    mock_db, monkeypatch: pytest.MonkeyPatch, environment: EnvironmentOption, should_be_secure: bool
) -> None:
    monkeypatch.setattr(settings, "ENVIRONMENT", environment)
    response = Response()
    form_data = SimpleNamespace(username="alice", password="correct-password")

    with (
        patch("src.app.api.v1.login.authenticate_user", new=AsyncMock(return_value={"username": "alice"})),
        patch("src.app.api.v1.login.create_access_token", new=AsyncMock(return_value="access-token")),
        patch("src.app.api.v1.login.create_refresh_token", new=AsyncMock(return_value="refresh-token")),
    ):
        payload = await login_for_access_token(response, form_data, mock_db)

    assert payload == {"access_token": "access-token", "token_type": "bearer"}
    cookie = response.headers["set-cookie"]
    assert "HttpOnly" in cookie
    assert ("Secure" in cookie) is should_be_secure
