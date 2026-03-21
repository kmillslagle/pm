import os
import tempfile
from pathlib import Path

import pytest
from starlette.testclient import TestClient

# Override DB path before importing the app
_test_db = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
_test_db.close()

import app.database as db_module
db_module.DB_PATH = Path(_test_db.name)

from app.main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def reset_db():
    """Reinitialize DB before each test."""
    if Path(_test_db.name).exists():
        os.unlink(_test_db.name)
    db_module.DB_PATH = Path(_test_db.name)
    db_module.init_db()
    # Clear sessions
    from app.auth import sessions
    sessions.clear()
    yield


def login() -> TestClient:
    resp = client.post("/api/auth/login", json={"username": "user", "password": "password"})
    assert resp.status_code == 200
    return client


class TestAuth:
    def test_login_success(self):
        resp = client.post("/api/auth/login", json={"username": "user", "password": "password"})
        assert resp.status_code == 200
        assert resp.json() == {"username": "user"}
        assert "session" in resp.cookies

    def test_login_bad_password(self):
        resp = client.post("/api/auth/login", json={"username": "user", "password": "wrong"})
        assert resp.status_code == 401

    def test_me_authenticated(self):
        login()
        resp = client.get("/api/auth/me")
        assert resp.status_code == 200
        assert resp.json() == {"username": "user"}

    def test_me_unauthenticated(self):
        resp = client.get("/api/auth/me")
        assert resp.status_code == 401

    def test_logout(self):
        login()
        resp = client.post("/api/auth/logout")
        assert resp.status_code == 200
        resp = client.get("/api/auth/me")
        assert resp.status_code == 401


class TestBoard:
    def test_get_board(self):
        login()
        resp = client.get("/api/board")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["columns"]) == 5
        assert data["columns"][0]["title"] == "Backlog"

    def test_get_board_unauthenticated(self):
        resp = client.get("/api/board")
        assert resp.status_code == 401

    def test_rename_column(self):
        login()
        resp = client.put("/api/columns/col-backlog", json={"title": "To Do"})
        assert resp.status_code == 200
        board = client.get("/api/board").json()
        assert board["columns"][0]["title"] == "To Do"

    def test_create_card(self):
        login()
        resp = client.post("/api/columns/col-backlog/cards", json={"title": "Test", "details": "Desc"})
        assert resp.status_code == 200
        card = resp.json()
        assert card["title"] == "Test"
        assert card["details"] == "Desc"
        assert card["id"].startswith("card-")
        board = client.get("/api/board").json()
        assert card["id"] in board["columns"][0]["cardIds"]

    def test_delete_card(self):
        login()
        card = client.post("/api/columns/col-backlog/cards", json={"title": "Del me"}).json()
        resp = client.delete(f"/api/cards/{card['id']}")
        assert resp.status_code == 200
        board = client.get("/api/board").json()
        assert card["id"] not in board["columns"][0]["cardIds"]

    def test_move_card(self):
        login()
        card = client.post("/api/columns/col-backlog/cards", json={"title": "Move me"}).json()
        resp = client.put(f"/api/cards/{card['id']}/move", json={"column_id": "col-review", "position": 0})
        assert resp.status_code == 200
        board = client.get("/api/board").json()
        assert card["id"] not in board["columns"][0]["cardIds"]
        assert card["id"] in board["columns"][3]["cardIds"]

    def test_update_card(self):
        login()
        card = client.post("/api/columns/col-backlog/cards", json={"title": "Old"}).json()
        resp = client.put(f"/api/cards/{card['id']}", json={"title": "New", "details": "Updated"})
        assert resp.status_code == 200
        assert resp.json()["title"] == "New"
        assert resp.json()["details"] == "Updated"

    def test_health(self):
        resp = client.get("/api/health")
        assert resp.status_code == 200
        assert resp.json() == {"status": "ok"}
