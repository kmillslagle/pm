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
        resp = client.post("/api/auth/register", json={"username": "short", "password": "abcdefg"})
        assert resp.status_code == 400
        assert "8 characters" in resp.json()["detail"]

    def test_register_short_password_boundary(self):
        """7-character password should be rejected (minimum is 8)."""
        resp = client.post("/api/auth/register", json={"username": "short7", "password": "abcdefg"})
        assert resp.status_code == 400
        # 8-character password should be accepted
        resp = client.post("/api/auth/register", json={"username": "exact8", "password": "abcdefgh"})
        assert resp.status_code == 200

    def test_register_then_login(self):
        client.post("/api/auth/register", json={"username": "alice", "password": "mypass123"})
        client.post("/api/auth/logout")
        resp = client.post("/api/auth/login", json={"username": "alice", "password": "mypass123"})
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

    def test_db_sessions(self):
        """Test that sessions are stored in the DB and survive lookup."""
        login()
        # Verify the session token exists in the DB
        conn = db_module.get_connection()
        row = conn.execute(
            "SELECT username FROM sessions WHERE username = 'user'"
        ).fetchone()
        conn.close()
        assert row is not None
        assert row["username"] == "user"
        # Verify we can use the session
        resp = client.get("/api/auth/me")
        assert resp.status_code == 200
        assert resp.json() == {"username": "user"}


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

    def test_create_board_with_custom_columns(self):
        """POST /api/boards with custom column names should create those columns."""
        login()
        resp = client.post("/api/boards", json={"name": "Custom", "columns": ["Todo", "Doing", "Done"]})
        assert resp.status_code == 200
        board_id = resp.json()["id"]
        board = client.get(f"/api/boards/{board_id}").json()
        assert len(board["columns"]) == 3
        assert board["columns"][0]["title"] == "Todo"
        assert board["columns"][1]["title"] == "Doing"
        assert board["columns"][2]["title"] == "Done"

    def test_create_board_no_columns_gets_defaults(self):
        """POST /api/boards with no columns should get 5 default columns."""
        login()
        resp = client.post("/api/boards", json={"name": "Default Cols"})
        assert resp.status_code == 200
        board_id = resp.json()["id"]
        board = client.get(f"/api/boards/{board_id}").json()
        assert len(board["columns"]) == 5
        titles = [c["title"] for c in board["columns"]]
        assert titles == ["Backlog", "Discovery", "In Progress", "Review", "Done"]

    def test_create_board_from_ai(self):
        """POST /api/boards/from-ai with multi-column multi-card payload."""
        login()
        payload = {
            "name": "AI Board",
            "columns": [
                {
                    "title": "Backlog",
                    "cards": [
                        {"title": "Card A", "details": "Details A"},
                        {"title": "Card B", "details": "Details B"},
                    ],
                },
                {
                    "title": "In Progress",
                    "cards": [
                        {"title": "Card C", "details": "Details C"},
                    ],
                },
                {
                    "title": "Done",
                    "cards": [],
                },
            ],
        }
        resp = client.post("/api/boards/from-ai", json=payload)
        assert resp.status_code == 200
        board_id = resp.json()["id"]
        assert resp.json()["name"] == "AI Board"
        board = client.get(f"/api/boards/{board_id}").json()
        assert len(board["columns"]) == 3
        assert board["columns"][0]["title"] == "Backlog"
        assert len(board["columns"][0]["cardIds"]) == 2
        assert board["columns"][1]["title"] == "In Progress"
        assert len(board["columns"][1]["cardIds"]) == 1
        assert board["columns"][2]["title"] == "Done"
        assert len(board["columns"][2]["cardIds"]) == 0
        # Verify card data
        card_ids = board["columns"][0]["cardIds"]
        assert board["cards"][card_ids[0]]["title"] == "Card A"
        assert board["cards"][card_ids[0]]["details"] == "Details A"

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

    def test_create_card_with_rich_fields(self):
        """Test creating a card with priority, notes, due_date, subtasks."""
        login()
        board_id = get_default_board_id()
        board = client.get(f"/api/boards/{board_id}").json()
        col_id = board["columns"][0]["id"]
        resp = client.post(f"/api/columns/{col_id}/cards", json={
            "title": "Rich Card",
            "details": "Some details",
            "priority": "high",
            "notes": "Important note",
            "due_date": "2026-04-01",
            "subtasks": '[{"text": "Sub 1", "done": false}]',
        })
        assert resp.status_code == 200
        card = resp.json()
        assert card["title"] == "Rich Card"
        assert card["priority"] == "high"
        assert card["notes"] == "Important note"
        assert card["due_date"] == "2026-04-01"
        assert "Sub 1" in card["subtasks"]
        # Verify rich fields appear when fetching the board
        board = client.get(f"/api/boards/{board_id}").json()
        fetched = board["cards"][card["id"]]
        assert fetched["priority"] == "high"
        assert fetched["notes"] == "Important note"
        assert fetched["due_date"] == "2026-04-01"

    def test_update_card_partial_priority(self):
        """Test updating only the priority field."""
        login()
        board_id = get_default_board_id()
        board = client.get(f"/api/boards/{board_id}").json()
        col_id = board["columns"][0]["id"]
        card = client.post(f"/api/columns/{col_id}/cards", json={"title": "Partial"}).json()
        resp = client.put(f"/api/cards/{card['id']}", json={"priority": "medium"})
        assert resp.status_code == 200
        assert resp.json()["priority"] == "medium"
        assert resp.json()["title"] == "Partial"  # unchanged

    def test_update_card_partial_notes(self):
        """Test updating only the notes field."""
        login()
        board_id = get_default_board_id()
        board = client.get(f"/api/boards/{board_id}").json()
        col_id = board["columns"][0]["id"]
        card = client.post(f"/api/columns/{col_id}/cards", json={"title": "NoteCard"}).json()
        resp = client.put(f"/api/cards/{card['id']}", json={"notes": "Updated notes"})
        assert resp.status_code == 200
        assert resp.json()["notes"] == "Updated notes"
        assert resp.json()["title"] == "NoteCard"  # unchanged

    def test_update_card_partial_due_date_and_subtasks(self):
        """Test updating due_date and subtasks without touching other fields."""
        login()
        board_id = get_default_board_id()
        board = client.get(f"/api/boards/{board_id}").json()
        col_id = board["columns"][0]["id"]
        card = client.post(f"/api/columns/{col_id}/cards", json={
            "title": "DateCard", "priority": "low",
        }).json()
        resp = client.put(f"/api/cards/{card['id']}", json={
            "due_date": "2026-06-15",
            "subtasks": '[{"text": "Task 1", "done": true}]',
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["due_date"] == "2026-06-15"
        assert "Task 1" in data["subtasks"]
        assert data["priority"] == "low"  # unchanged
        assert data["title"] == "DateCard"  # unchanged

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
