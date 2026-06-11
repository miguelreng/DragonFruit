# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Unit tests for plane.llm.wikipedia and the chat lookup_wikipedia tool handler.

All network calls are monkeypatched — the real Wikipedia API is never hit.
"""

import pytest

from plane.llm.wikipedia import search_wikipedia, wikipedia_summary


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

class _MockResponse:
    """Minimal requests.Response stand-in."""

    def __init__(self, status_code: int, payload):
        self.status_code = status_code
        self._payload = payload

    def json(self):
        return self._payload


_CANNED_SEARCH_PAYLOAD = {
    "pages": [
        {
            "key": "Python_(programming_language)",
            "title": "Python (programming language)",
            "description": "High-level programming language",
            "excerpt": "Python is a high-level, general-purpose programming language.",
        },
        {
            "key": "Python_(genus)",
            "title": "Python (genus)",
            "description": "Genus of snakes",
            "excerpt": "",
        },
    ]
}

_CANNED_SUMMARY_PAYLOAD = {
    "title": "Python (programming language)",
    "extract": (
        "Python is a high-level, general-purpose programming language. "
        "Its design philosophy emphasizes code readability."
    ),
    "content_urls": {
        "desktop": {
            "page": "https://en.wikipedia.org/wiki/Python_(programming_language)"
        }
    },
    "thumbnail": {
        "source": "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c3/Python-logo-notext.svg/160px-Python-logo-notext.svg.png"
    },
}


# ---------------------------------------------------------------------------
# search_wikipedia tests
# ---------------------------------------------------------------------------

@pytest.mark.unit
class TestSearchWikipedia:
    def test_returns_parsed_hits(self, monkeypatch):
        def _mock_get(url, **kwargs):
            return _MockResponse(200, _CANNED_SEARCH_PAYLOAD)

        monkeypatch.setattr("plane.llm.wikipedia.requests.get", _mock_get)

        results = search_wikipedia("Python")
        assert len(results) == 2
        assert results[0]["title"] == "Python (programming language)"
        assert results[0]["description"] == "High-level programming language"
        assert results[0]["key"] == "Python_(programming_language)"

    def test_respects_limit(self, monkeypatch):
        def _mock_get(url, **kwargs):
            # Verify limit param was passed
            params = kwargs.get("params", {})
            assert params.get("limit") == 1
            return _MockResponse(200, {"pages": [_CANNED_SEARCH_PAYLOAD["pages"][0]]})

        monkeypatch.setattr("plane.llm.wikipedia.requests.get", _mock_get)
        results = search_wikipedia("Python", limit=1)
        assert len(results) == 1

    def test_empty_query_returns_empty(self, monkeypatch):
        called = []

        def _mock_get(url, **kwargs):
            called.append(True)
            return _MockResponse(200, _CANNED_SEARCH_PAYLOAD)

        monkeypatch.setattr("plane.llm.wikipedia.requests.get", _mock_get)
        results = search_wikipedia("")
        assert results == []
        assert not called  # should not have made a network call

    def test_non_200_returns_empty(self, monkeypatch):
        def _mock_get(url, **kwargs):
            return _MockResponse(404, {})

        monkeypatch.setattr("plane.llm.wikipedia.requests.get", _mock_get)
        results = search_wikipedia("Python")
        assert results == []

    def test_network_error_returns_empty(self, monkeypatch):
        def _mock_get(url, **kwargs):
            raise ConnectionError("timeout")

        monkeypatch.setattr("plane.llm.wikipedia.requests.get", _mock_get)
        results = search_wikipedia("Python")
        assert results == []

    def test_missing_pages_key_returns_empty(self, monkeypatch):
        def _mock_get(url, **kwargs):
            return _MockResponse(200, {"results": []})

        monkeypatch.setattr("plane.llm.wikipedia.requests.get", _mock_get)
        results = search_wikipedia("Python")
        assert results == []


# ---------------------------------------------------------------------------
# wikipedia_summary tests
# ---------------------------------------------------------------------------

@pytest.mark.unit
class TestWikipediaSummary:
    def test_returns_parsed_summary(self, monkeypatch):
        def _mock_get(url, **kwargs):
            return _MockResponse(200, _CANNED_SUMMARY_PAYLOAD)

        monkeypatch.setattr("plane.llm.wikipedia.requests.get", _mock_get)

        result = wikipedia_summary("Python (programming language)")
        assert result is not None
        assert result["title"] == "Python (programming language)"
        assert "high-level" in result["extract"]
        assert result["url"] == "https://en.wikipedia.org/wiki/Python_(programming_language)"
        assert result["thumbnail"] is not None
        assert "Python-logo" in result["thumbnail"]

    def test_empty_title_returns_none(self, monkeypatch):
        called = []

        def _mock_get(url, **kwargs):
            called.append(True)
            return _MockResponse(200, _CANNED_SUMMARY_PAYLOAD)

        monkeypatch.setattr("plane.llm.wikipedia.requests.get", _mock_get)
        result = wikipedia_summary("")
        assert result is None
        assert not called

    def test_non_200_returns_none(self, monkeypatch):
        def _mock_get(url, **kwargs):
            return _MockResponse(404, {})

        monkeypatch.setattr("plane.llm.wikipedia.requests.get", _mock_get)
        result = wikipedia_summary("Nonexistent Article")
        assert result is None

    def test_network_error_returns_none(self, monkeypatch):
        def _mock_get(url, **kwargs):
            raise ConnectionError("timeout")

        monkeypatch.setattr("plane.llm.wikipedia.requests.get", _mock_get)
        result = wikipedia_summary("Python")
        assert result is None

    def test_missing_thumbnail_is_none(self, monkeypatch):
        payload = {**_CANNED_SUMMARY_PAYLOAD, "thumbnail": None}

        def _mock_get(url, **kwargs):
            return _MockResponse(200, payload)

        monkeypatch.setattr("plane.llm.wikipedia.requests.get", _mock_get)
        result = wikipedia_summary("Python")
        assert result is not None
        assert result["thumbnail"] is None

    def test_missing_content_urls_gives_empty_url(self, monkeypatch):
        payload = {**_CANNED_SUMMARY_PAYLOAD, "content_urls": None}

        def _mock_get(url, **kwargs):
            return _MockResponse(200, payload)

        monkeypatch.setattr("plane.llm.wikipedia.requests.get", _mock_get)
        result = wikipedia_summary("Python")
        assert result is not None
        assert result["url"] == ""


# ---------------------------------------------------------------------------
# Tool handler integration tests (search + summary → cited string)
# ---------------------------------------------------------------------------

@pytest.mark.unit
class TestWikipediaLookupToolHandler:
    """Simulate what _make_wikipedia_lookup_tool's handler does end-to-end."""

    def _make_handler(self):
        """Return the handler closure from the real tool factory."""
        from plane.app.views.agent.chat import _make_wikipedia_lookup_tool
        return _make_wikipedia_lookup_tool().handler

    def test_returns_cited_string(self, monkeypatch):
        call_count = []

        def _mock_get(url, **kwargs):
            call_count.append(url)
            if "search/page" in url:
                return _MockResponse(200, _CANNED_SEARCH_PAYLOAD)
            return _MockResponse(200, _CANNED_SUMMARY_PAYLOAD)

        monkeypatch.setattr("plane.llm.wikipedia.requests.get", _mock_get)
        handler = self._make_handler()
        result = handler({"query": "Python"})
        assert "Python (programming language)" in result
        assert "high-level" in result
        assert "https://en.wikipedia.org/wiki/Python_(programming_language)" in result
        assert "(source:" in result
        assert len(call_count) == 2  # search + summary

    def test_not_found_returns_friendly_message(self, monkeypatch):
        def _mock_get(url, **kwargs):
            return _MockResponse(200, {"pages": []})

        monkeypatch.setattr("plane.llm.wikipedia.requests.get", _mock_get)
        handler = self._make_handler()
        result = handler({"query": "xyzzy_nonexistent_qwerty_54321"})
        assert "No Wikipedia article found" in result
        assert "xyzzy_nonexistent_qwerty_54321" in result

    def test_error_returns_error_string(self, monkeypatch):
        def _mock_get(url, **kwargs):
            raise RuntimeError("connection refused")

        monkeypatch.setattr("plane.llm.wikipedia.requests.get", _mock_get)
        handler = self._make_handler()
        result = handler({"query": "Python"})
        # handler catches Exception and returns "wikipedia_error: ..."
        # but our wikipedia.py returns [] on error, so handler gets no hits
        assert "No Wikipedia article found" in result or "wikipedia_error" in result

    def test_missing_query_returns_error(self, monkeypatch):
        # No network calls needed — handler bails early
        handler = self._make_handler()
        result = handler({})
        assert "wikipedia_error" in result

    def test_extract_capped_at_1500_chars(self, monkeypatch):
        long_extract = "A" * 3000
        payload = {**_CANNED_SUMMARY_PAYLOAD, "extract": long_extract}

        def _mock_get(url, **kwargs):
            if "search/page" in url:
                return _MockResponse(200, _CANNED_SEARCH_PAYLOAD)
            return _MockResponse(200, payload)

        monkeypatch.setattr("plane.llm.wikipedia.requests.get", _mock_get)
        handler = self._make_handler()
        result = handler({"query": "Python"})
        # The handler caps extract at 1500 chars; the rest of the string is title + source
        assert len(result) < 3000 + 300  # well under 3000 char extract
        assert result.count("A") <= 1500
