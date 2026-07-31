from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import _cors_origins_from_env, app


def test_default_cors_allows_nextjs_local_origin() -> None:
    client = TestClient(app)

    response = client.options(
        "/health",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "GET",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"
    assert response.headers["access-control-allow-methods"] == "GET, POST"


def test_default_cors_rejects_unconfigured_origin() -> None:
    client = TestClient(app)

    response = client.options(
        "/health",
        headers={
            "Origin": "https://example.invalid",
            "Access-Control-Request-Method": "GET",
        },
    )

    assert "access-control-allow-origin" not in response.headers


def test_cors_origin_parser_trims_and_removes_trailing_slashes(
    monkeypatch,
) -> None:
    monkeypatch.setenv(
        "CROPTWIN_CORS_ORIGINS",
        " https://crop.example.com/, http://localhost:3000 ",
    )

    assert _cors_origins_from_env() == [
        "https://crop.example.com",
        "http://localhost:3000",
    ]
