"""Property 12: Split/join round-trip and size bound."""

from hypothesis import given, settings
from hypothesis import strategies as st

from translate import split_text

# Generate text that comfortably crosses the 5000-char boundary, plus small
# inputs and boundary lengths.
text_strategy = st.text(
    alphabet=st.characters(min_codepoint=1, blacklist_categories=("Cs",)),
    min_size=0,
    max_size=12000,
)


# Feature: google-translate-proxy, Property 12: For any source text, splitting
# SHALL produce ordered segments each of length at most 5000 characters, and
# concatenating the segments in order SHALL reproduce the original text exactly.
# Consequently, splitting then translating (identity) then concatenating SHALL
# reconstruct the original input in order.
@settings(max_examples=200)
@given(text=text_strategy, limit=st.integers(min_value=1, max_value=5000))
def test_split_join_round_trip_and_size_bound(text, limit):
    segments = split_text(text, limit=limit)

    # Size bound: every segment is at most `limit` characters.
    assert all(len(seg) <= limit for seg in segments)

    # Round-trip: concatenation in order reproduces the original exactly.
    assert "".join(segments) == text

    # Identity-translate then join reconstructs the input in order.
    translated = [seg for seg in segments]  # identity translation
    assert "".join(translated) == text
