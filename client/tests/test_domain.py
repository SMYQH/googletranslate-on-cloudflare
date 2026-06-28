"""Property 11: Domain warning condition."""

import warnings

from hypothesis import given, settings
from hypothesis import strategies as st

from translate import check_domain

url_text = st.text(
    alphabet=st.characters(min_codepoint=ord("a"), max_codepoint=ord("z")),
    min_size=0,
    max_size=30,
)


# Feature: google-translate-proxy, Property 11: For any configured base URL, the
# client SHALL emit the blocked-domain warning if and only if the base URL
# contains the substring `workers.dev`.
@settings(max_examples=200)
@given(prefix=url_text, suffix=url_text, inject=st.booleans())
def test_domain_warning_condition(prefix, suffix, inject):
    base_url = f"https://{prefix}.example.com/{suffix}"
    if inject:
        base_url = f"https://{prefix}.workers.dev/{suffix}"

    expected = "workers.dev" in base_url

    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        emitted = check_domain(base_url)

    assert emitted == expected
    assert (len(caught) > 0) == expected
