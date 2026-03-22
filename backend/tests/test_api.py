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


def get_default_board_id() -> int:
    """Get the default board id for the seed user."""
    resp = client.get("/api/boards")
    return resp.json()[0]["id"]


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

    def test_register_success(self):
        resp = client.post("/api/auth/register", json={"username": "newuser", "password": "pass1234"})
        assert resp.status_code == 200
        assert resp.json() == {"username": "newuser"}
        assert "session" in resp.cookies
        resp = client.get("/api/auth/me")
        assert resp.status_code == 200
        assert resp.json() == {"username": "newuser"}

    def test_register_duplicate(self):
        client.post("/api/auth/register", json={"username": "dup", "password": "pass1234"})
        resp = client.post("/api/auth/register", json={"username": "dup", "password": "pass1234"})
        assert resp.status_code == 409

    def test_register_short_password(self):
        resp = client.post("/api/auth/register", json={"username": "short", "password": "ab"})
        assert resp.status_code == 400

    def test_register_then_login(self):
        client.post("/api/auth/register", json={"username": "alice", "password": "mypass"})
        client.post("/api/auth/logout")
        resp = client.post("/api/auth/login", json={"username": "alice", "password": "mypass"})
        assert resp.status_code == 200
        assert resp.json() == {"username": "alice"}

    def test_register_creates_board(self):
        client.post("/api/auth/register", json={"username": "boarduser", "password": "pass1234"})
        resp = client.get("/api/boards")
        assert resp.status_code == 200
        boards = resp.json()
        assert len(boards) == 1
        resp = client.get(f"/api/boards/{boards[0]['id']}")
        assert resp.status_code == 200
        assert len(resp.json()["columns"]) == 5


class TestBoards:
    def test_list_boards(self):
        login()
        resp = client.get("/api/boards")
        assert resp.status_code == 200
        boards = resp.json()
        assert len(boards) == 1
        assert boards[0]["name"] == "My Board"

    def test_create_board(self):
        login()
        resp = client.post("/api/boards", json={"name": "New Project"})
        assert resp.status_code == 200
        assert resp.json()["name"] == "New Project"
        # Should now have 2 boards
        boards = client.get("/api/boards").json()
        assert len(boards) == 2

    def test_new_board_has_columns(self):
        login()
        board = client.post("/api/boards", json={"name": "Test"}).json()
        resp = client.get(f"/api/boards/{board['id']}")
        assert resp.status_code == 200
        assert len(resp.json()["columns"]) == 5

    def test_get_board_by_id(self):
        login()
        board_id = get_default_board_id()
        resp = client.get(f"/api/boards/{board_id}")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["columns"]) == 5
        assert data["columns"][0]["title"] == "Backlog"

    def test_boards_isolated_between_users(self):
        login()
        boards_user1 = client.get("/api/boards").json()
        client.post("/api/auth/logout")
        client.post("/api/auth/register", json={"username": "other", "password": "pass1234"})
        boards_user2 = client.get("/api/boards").json()
        assert len(boards_user2) == 1
        assert boards_user2[0]["id"] != boards_user1[0]["id"]

    def test_cannot_access_other_users_board(self):
        login()
        board_id = get_default_board_id()
        client.post("/api/auth/logout")
        client.post("/api/auth/register", json={"username": "other", "password": "pass1234"})
        resp = client.get(f"/api/boards/{board_id}")
        assert resp.status_code == 404


class TestBoard:
    def test_get_board_legacy(self):
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
        board_id = get_default_board_id()
        board = client.get(f"/api/boards/{board_id}").json()
        col_id = board["columns"][0]["id"]
        resp = client.put(f"/api/columns/{col_id}", json={"title": "To Do"})
        assert resp.status_code == 200
        board = client.get(f"/api/boards/{board_id}").json()
        assert board["columns"][0]["title"] == "To Do"

    def test_create_card(self):
        login()
        board_id = get_default_board_id()
        board = client.get(f"/api/boards/{board_id}").json()
        col_id = board["columns"][0]["id"]
        resp = client.post(f"/api/columns/{col_id}/cards", json={"title": "Test", "details": "Desc"})
        assert resp.status_code == 200
        card = resp.json()
        assert card["title"] == "Test"
        assert card["details"] == "Desc"
        assert card["id"].startswith("card-")
        board = client.get(f"/api/boards/{board_id}").json()
        assert card["id"] in board["columns"][0]["cardIds"]

    def test_delete_card(self):
        login()
        board_id = get_default_board_id()
        board = client.get(f"/api/boards/{board_id}").json()
        col_id = board["columns"][0]["id"]
        card = client.post(f"/api/columns/{col_id}/cards", json={"title": "Del me"}).json()
        resp = client.delete(f"/api/cards/{card['id']}")
        assert resp.status_code == 200
        board = client.get(f"/api/boards/{board_id}").json()
        assert card["id"] not in board["columns"][0]["cardIds"]

    def test_move_card(self):
        login()
        board_id = get_default_board_id()
        board = client.get(f"/api/boards/{board_id}").json()
        col_0_id = board["columns"][0]["id"]
        col_3_id = board["columns"][3]["id"]
        card = client.post(f"/api/columns/{col_0_id}/cards", json={"title": "Move me"}).json()
        resp = client.put(f"/api/cards/{card['id']}/move", json={"column_id": col_3_id, "position": 0})
        assert resp.status_code == 200
        board = client.get(f"/api/boards/{board_id}").json()
        assert card["id"] not in board["columns"][0]["cardIds"]
        assert card["id"] in board["columns"][3]["cardIds"]

    def test_update_card(self):
        login()
        board_id = get_default_board_id()
        board = client.get(f"/api/boards/{board_id}").json()
        col_id = board["columns"][0]["id"]
        card = client.post(f"/api/columns/{col_id}/cards", json={"title": "Old"}).json()
        resp = client.put(f"/api/cards/{card['id']}", json={"title": "New", "details": "Updated"})
        assert resp.status_code == 200
        assert resp.json()["title"] == "New"
        assert resp.json()["details"] == "Updated"

    def test_health(self):
        resp = client.get("/api/health")
        assert resp.status_code == 200
        assert resp.json() == {"status": "ok"}
