"""Property 10: Source-language default and fixed parameters."""

from urllib.parse import parse_qs, urlsplit

from hypothesis import given, settings
from hypothesis import strategies as st

from translate import build_url

lang_code = st.text(
    alphabet=st.characters(min_codepoint=ord("a"), max_codepoint=ord("z")),
    min_size=2,
    max_size=5,
)


def _query(url):
    return parse_qs(urlsplit(url).query, keep_blank_values=True)


# Feature: google-translate-proxy, Property 10: For any translation request,
# when sl is omitted the request the client builds SHALL carry sl=auto, and when
# sl is provided it SHALL be preserved unchanged. The fixed parameters
# client=gtx and dt=t SHALL always be present.
@settings(max_examples=200)
@given(
    q=st.text(max_size=50),
    tl=lang_code,
    sl=st.one_of(st.none(), lang_code),
)
def test_sl_default_and_fixed_params(q, tl, sl):
    if sl is None:
        url = build_url("https://example.com", q, tl=tl)
        expected_sl = "auto"
    else:
        url = build_url("https://example.com", q, tl=tl, sl=sl)
        expected_sl = sl

    params = _query(url)

    # Fixed parameters always present with fixed values.
    assert params["client"] == ["gtx"]
    assert params["dt"] == ["t"]
    # sl default / preservation.
    assert params["sl"] == [expected_sl]
    # tl preserved.
    assert params["tl"] == [tl]
