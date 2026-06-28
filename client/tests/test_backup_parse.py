"""Property 15: Backup response parsing."""

from hypothesis import given, settings
from hypothesis import strategies as st

from translate import parse_backup_response

trans_text = st.text(
    alphabet=st.characters(min_codepoint=1, blacklist_categories=("Cs",)),
    min_size=0,
    max_size=40,
)


# Feature: google-translate-proxy, Property 15: For any backup-endpoint response,
# the client's backup parser SHALL extract the translated text from the backup
# response structure.
@settings(max_examples=200)
@given(
    sentences=st.lists(
        st.fixed_dictionaries({"trans": trans_text, "orig": trans_text}),
        max_size=15,
    )
)
def test_backup_response_parsing(sentences):
    response_json = {"sentences": sentences, "src": "en"}

    result = parse_backup_response(response_json)

    # Expected: in-order concatenation of non-empty `trans` fields.
    expected = "".join(s["trans"] for s in sentences if s["trans"])
    assert result == expected
