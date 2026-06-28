"""Property 13: Retry with exponential backoff."""

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from translate import TranslationError, request_with_retry


class _FakeResponse:
    def __init__(self, payload):
        self._payload = payload

    def json(self):
        return self._payload


class _FakeSession:
    """A session whose .get returns a failure payload until ``succeed_at``."""

    def __init__(self, succeed_at):
        # succeed_at is the 0-based attempt index that returns code 0, or None
        # if every attempt should fail with code 1.
        self._succeed_at = succeed_at
        self.calls = 0

    def get(self, url):
        idx = self.calls
        self.calls += 1
        if self._succeed_at is not None and idx >= self._succeed_at:
            return _FakeResponse({"code": 0, "msg": "ok", "text": "done"})
        return _FakeResponse({"code": 1, "msg": "rate limited"})


# Feature: google-translate-proxy, Property 13: For any sequence of transient
# failures, the client SHALL retry with delays that grow exponentially between
# attempts, SHALL succeed if a success occurs within the configured maximum
# number of attempts, and SHALL otherwise make exactly the configured maximum
# number of attempts before reporting the last failure.
@settings(max_examples=200)
@given(
    max_retries=st.integers(min_value=1, max_value=8),
    backoff_base=st.floats(min_value=0.1, max_value=4.0,
                           allow_nan=False, allow_infinity=False),
    succeed_offset=st.integers(min_value=0, max_value=10),
)
def test_retry_exponential_backoff(max_retries, backoff_base, succeed_offset):
    # succeed_at within range => eventual success; otherwise never succeeds.
    succeed_at = succeed_offset if succeed_offset < max_retries else None
    session = _FakeSession(succeed_at)

    delays = []

    def fake_sleep(seconds):
        delays.append(seconds)

    if succeed_at is not None:
        data = request_with_retry(
            "http://x/translate_a/single",
            max_retries=max_retries,
            backoff_base=backoff_base,
            session=session,
            sleep=fake_sleep,
        )
        assert data["code"] == 0
        # Succeeded at attempt index succeed_at => succeed_at+1 get calls.
        assert session.calls == succeed_at + 1
        # Slept once before each retried attempt (none after success).
        assert len(delays) == succeed_at
    else:
        with pytest.raises(TranslationError):
            request_with_retry(
                "http://x/translate_a/single",
                max_retries=max_retries,
                backoff_base=backoff_base,
                session=session,
                sleep=fake_sleep,
            )
        # Exactly max_retries attempts were made.
        assert session.calls == max_retries
        # Slept between attempts but not after the final one.
        assert len(delays) == max_retries - 1

    # Delays grow exponentially: delay[i] == backoff_base * 2**i.
    for i, d in enumerate(delays):
        assert d == pytest.approx(backoff_base * (2 ** i))
