"""Property 14: Backup fallback trigger with preserved parameters."""

from urllib.parse import urlsplit

from hypothesis import given, settings
from hypothesis import strategies as st

from translate import translate

lang_code = st.text(
    alphabet=st.characters(min_codepoint=ord("a"), max_codepoint=ord("z")),
    min_size=2,
    max_size=5,
)


class _FakeResponse:
    def __init__(self, payload):
        self._payload = payload

    def json(self):
        return self._payload


class _RecordingSession:
    """Primary requests always fail (code 1); backup returns a valid shape."""

    def __init__(self):
        self.urls = []

    def get(self, url):
        self.urls.append(url)
        if "clients5.google.com" in url:
            return _FakeResponse({"sentences": [{"trans": "backup"}]})
        return _FakeResponse({"code": 1, "msg": "fail"})


# Feature: google-translate-proxy, Property 14: For any request where the primary
# endpoint fails after the configured maximum retries, the client SHALL issue a
# request to the backup endpoint `clients5.google.com` carrying query parameters
# identical to the primary request.
@settings(max_examples=200, deadline=None)
@given(
    # Short text -> single segment so query params compare cleanly.
    q=st.text(alphabet=st.characters(min_codepoint=ord("a"),
                                      max_codepoint=ord("z")),
              min_size=1, max_size=20),
    tl=lang_code,
    sl=st.one_of(st.none(), lang_code),
)
def test_backup_fallback_trigger(q, tl, sl):
    session = _RecordingSession()

    result = translate(
        q,
        tl=tl,
        sl=sl,
        base_url="https://proxy.example.com",
        max_retries=2,
        backoff_base=0.0,
        session=session,
        sleep=lambda s: None,
    )

    # The backup endpoint was contacted.
    backup_urls = [u for u in session.urls if "clients5.google.com" in u]
    primary_urls = [u for u in session.urls if "clients5.google.com" not in u]
    assert backup_urls, "expected a fallback request to the backup endpoint"
    assert primary_urls, "expected primary attempts before fallback"

    # The backup request preserves the primary request's query parameters.
    primary_query = urlsplit(primary_urls[-1]).query
    backup_query = urlsplit(backup_urls[-1]).query
    assert primary_query == backup_query

    # The parsed backup text propagated to the result.
    assert result == "backup"
