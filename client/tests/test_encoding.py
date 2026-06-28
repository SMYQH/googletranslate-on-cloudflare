"""Property 9: URL encoding round-trip."""

import re
from urllib.parse import unquote

from hypothesis import given, settings
from hypothesis import strategies as st

from translate import build_url

# Text including non-ASCII and special characters, excluding lone surrogates
# (which cannot be UTF-8 encoded).
text_strategy = st.text(
    alphabet=st.characters(min_codepoint=1, blacklist_categories=("Cs",)),
    min_size=0,
    max_size=200,
)

# After quote(safe=''), only unreserved characters and the percent sign remain.
UNRESERVED_OR_PERCENT = re.compile(r"^[A-Za-z0-9_.\-~%]*$")


# Feature: google-translate-proxy, Property 9: For any source text string
# (including non-ASCII and special characters), decoding the client's
# URL-encoded q value SHALL reproduce the original source text exactly, and the
# encoded value SHALL contain no raw reserved/special characters.
@settings(max_examples=200)
@given(q=text_strategy)
def test_url_encoding_round_trip(q):
    url = build_url("https://example.com", q, tl="en", sl="auto")
    # The encoded q is the final segment appended as `&q=...`.
    encoded_q = url.rsplit("&q=", 1)[1]

    # Round-trip: decoding reproduces the original text exactly.
    assert unquote(encoded_q) == q

    # No raw reserved/special characters survive in the encoded value.
    assert UNRESERVED_OR_PERCENT.match(encoded_q) is not None
