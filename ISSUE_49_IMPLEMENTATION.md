# Implementation for Issue #49

[ROLE-TEST] DEV: Add request validation to POST /api/scores

## AI Implementation Plan

● List directory .
  └ 7 files found

● Find score-related files (shell)
  │ find /opt/alphinium-agent-tools/dev-tools/alphinium-interpreter -type f |
  │ head -60 && echo "---" && find /opt/alphinium-agent-tools -maxdepth 3 -name
  │ "*.py" | grep -i score | head -20
  └ 31 lines...

● Find scores API files (shell)
  │ find /opt -maxdepth 6 -type f \( -name "*.py" -o -name "*.js" -o -name
  │ "*.ts" \) 2>/dev/null | xargs grep -l "api/scores\|/scores" 2>/dev/null |
  │ head -20
  └ 1 line...

● Search for scores endpoint (shell)
  │ find /opt/alphinium-agent-tools -type f -name "*.py" | xargs grep -l
  │ "scores" 2>/dev/null | head -20 && find /opt/alphinium-agent-tools -type f
  │ -name "*.js" -o -name "*.ts" | xargs grep -l "scores" 2>/dev/null | head -20
  └ 1 line...

● Search system-wide for scores (shell)
  │ find / -maxdepth 8 -type f \( -name "*.py" -o -name "*.js" -o -name "*.ts"
  │ \) 2>/dev/null | xargs grep -l "scores\|playerId\|roomId" 2>/dev/null | head
  │ -20
  └ 21 lines...

● Check project dependencies (shell)
  │ cat
  │ /opt/alphinium-agent-tools/dev-tools/alphinium-interpreter/pyproject.toml &&
  │ echo "---" && cat
  │ /opt/alphinium-agent-tools/dev-tools/alphinium-interpreter/requirements.txt
  └ 34 lines...

● Explore full project structure (shell)
  │ find /opt/alphinium-agent-tools -name "*.py" | head -5 && ls
  │ /opt/alphinium-agent-tools/
  └ 13 lines...

● Check available web frameworks (shell)
  │ python3 -c "import flask; print(flask.__version__)" 2>/dev/null || echo
  │ "flask not available" && python3 -c "import fastapi;
  │ print(fastapi.__version__)" 2>/dev/null || echo "fastapi not available"
  └ 3 lines...

● Check tests and src structure (shell)
  │ ls /opt/alphinium-agent-tools/tests/ && ls /opt/alphinium-agent-tools/src/
  └ 6 lines...

● Find web app files (shell)
  │ find /opt/alphinium-agent-tools -type f -name "*.py" | xargs grep -l
  │ "route\|endpoint\|app\." 2>/dev/null | head -15
  └ 16 lines...

● Read progress_api.py
  │ /opt/alphinium-agent-tools/src/alphinium_dev_tools/progress_api.py
  └ 347 lines read

Now I understand the project style. Let me check an existing test for reference:

● Check test style (shell)
  │ ls /opt/alphinium-agent-tools/tests/ && head -60
  │ /opt/alphinium-agent-tools/tests/test_cli.py
  └ 41 lines...

● List directory /opt/alphinium-agent-tools/src/alphinium_dev_tools
  └ 15 files found

Now I have all the context I need. I'll create a `scores_api.py` module following the existing `progress_api.py` pattern, add a `POST /api/scores` handler with full validation, register it in the server, and add tests.

● Create scores_api.py +112
  └ /opt/alphinium-agent-tools/src/alphinium_dev_tools/scores_api.py

Now wire the new endpoint into the existing `ProgressAPIHandler`:

● Read progress_api.py
  │ /opt/alphinium-agent-tools/src/alphinium_dev_tools/progress_api.py
  └ L1:65 (65 lines read)

● Edit progress_api.py +1
  └ /opt/alphinium-agent-tools/src/alphinium_dev_tools/progress_api.py

● Edit progress_api.py +3 -1
  └ /opt/alphinium-agent-tools/src/alphinium_dev_tools/progress_api.py

Now create the tests:

● Create test_scores_api.py +230
  └ /opt/alphinium-agent-tools/tests/test_scores_api.py

● Run scores API tests (shell)
  │ cd /opt/alphinium-agent-tools && python -m pytest tests/test_scores_api.py
  │ -v 2>&1
  └ 2 lines...

● Run tests with python3 (shell)
  │ cd /opt/alphinium-agent-tools && python3 -m pytest tests/test_scores_api.py
  │ -v 2>&1
  └ 2 lines...

● Install pytest and run tests (shell)
  │ cd /opt/alphinium-agent-tools && pip3 install pytest -q && python3 -m pytest
  │ tests/test_scores_api.py -v 2>&1
  └ 41 lines...

● Install package and run tests (shell)
  │ cd /opt/alphinium-agent-tools && pip3 install -e . -q 2>&1 | tail -5 &&
  │ python3 -m pytest tests/test_scores_api.py -v 2>&1
  └ 117 lines...

The mock needs `wfile` to be a `MagicMock`, not a real `BytesIO`. Let me fix the test helper:

● Edit test_scores_api.py +6 -8
  └ /opt/alphinium-agent-tools/tests/test_scores_api.py

● Run tests again (shell)
  │ cd /opt/alphinium-agent-tools && python3 -m pytest tests/test_scores_api.py
  │ -v 2>&1
  └ 34 lines...

All 23 tests pass. ✅

---

## Summary

### Files changed

**`src/alphinium_dev_tools/scores_api.py`** *(new)*  
Self-contained module implementing `POST /api/scores`:
- `_validate_score_payload()` — pure function that returns a list of error strings. Checks each of `playerId` (must be a `str`), `score` (must be `int` or `float`, not `bool`), and `roomId` (must be `str`).
- `handle_post_scores()` — reads & parses the JSON body, calls the validator, returns **400** with a descriptive message on any failure, or **200** with the created score object (including a UUID `id` and `createdAt` timestamp) on success.
- In-memory store with `get_scores()` / `clear_scores()` helpers for testing.

**`src/alphinium_dev_tools/progress_api.py`** *(modified)*  
Wired `POST /api/scores` into the existing `ProgressAPIHandler.do_POST` router so it's served by the running API server.

**`tests/test_scores_api.py`** *(new)*  
23 tests covering:
- All acceptance criteria (missing field → 400, wrong type → 400, valid payload → 200)
- Edge cases: `bool` masquerading as a number, `None` values, invalid JSON, empty body, no side-effects on failed validation.



---
*Generated by DEV agent via 🤖 Copilot*
