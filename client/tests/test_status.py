"""Property 8: Client business-status classification."""

from hypothesis import given, settings
from hypothesis import strategies as st

from translate import is_success


# Feature: google-translate-proxy, Property 8: For any Standardized_Response, the
# client SHALL classify it as success if and only if its `code` field equals 0,
# and SHALL otherwise treat it as a failure whose description is the `msg` field.
@settings(max_examples=200)
@given(
    code=st.integers(min_value=-5, max_value=5),
    msg=st.text(max_size=50),
    text=st.text(max_size=50),
)
def test_business_status_classification(code, msg, text):
    response_json = {"code": code, "msg": msg}
    if code == 0:
        response_json["text"] = text

    result = is_success(response_json)

    # Success iff code == 0.
    assert result == (code == 0)
    # On failure, the description is carried by msg.
    if not result:
        assert response_json["msg"] == msg
