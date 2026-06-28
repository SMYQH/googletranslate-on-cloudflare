"""Integration tests for the translate() orchestration (mocked transport)."""

from urllib.parse import parse_qs, unquote, urlsplit

from translate import translate


class _FakeResponse:
    def __init__(self, payload):
        self._payload = payload

    def json(self):
        return self._payload


class _PrimaryEchoSession:
    """Primary endpoint that echoes the decoded q as the translated text."""

    def __init__(self):
        self.calls = []

    def get(self, url):
        self.calls.append(url)
        q = parse_qs(urlsplit(url).query)["q"][0]
        return _FakeResponse({"code": 0, "msg": "ok", "text": unquote(q)})


class _FallbackSession:
    """Primary always fails; backup returns a fixed translation."""

    def __init__(self):
        self.calls = []

    def get(self, url):
        self.calls.append(url)
        if "clients5.google.com" in url:
            return _FakeResponse({"sentences": [{"trans": "FB"}]})
        return _FakeResponse({"code": 1, "msg": "boom"})


def test_long_text_is_split_translated_and_joined_in_order():
    # 12000 chars -> three segments of 5000, 5000, 2000.
    text = ("A" * 5000) + ("B" * 5000) + ("C" * 2000)
    session = _PrimaryEchoSession()

    result = translate(
        text,
        tl="en",
        base_url="https://proxy.example.com",
        session=session,
        sleep=lambda s: None,
    )

    # Three segment requests were issued.
    assert len(session.calls) == 3
    # The echoed segments were concatenated in original order -> original text.
    assert result == text


def test_short_text_single_request():
    session = _PrimaryEchoSession()
    result = translate(
        "hello",
        tl="fr",
        base_url="https://proxy.example.com",
        session=session,
        sleep=lambda s: None,
    )
    assert len(session.calls) == 1
    assert result == "hello"


def test_fallback_path_produces_a_result():
    session = _FallbackSession()
    result = translate(
        "hello",
        tl="fr",
        base_url="https://proxy.example.com",
        max_retries=2,
        backoff_base=0.0,
        session=session,
        sleep=lambda s: None,
    )
    # Primary attempts happened, then the backup produced the result.
    assert any("clients5.google.com" in u for u in session.calls)
    assert result == "FB"
