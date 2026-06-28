"""Google Translate Proxy - Python client helper.

Encapsulates the calling conventions clients must follow when talking to the
Cloudflare Worker described in ``.kiro/specs/google-translate-proxy/design.md``:

* URL encoding of source text (Requirement 7)
* fixed query parameters ``client=gtx`` / ``dt=t`` and ``sl`` defaulting to
  ``auto`` (Requirement 3)
* ``workers.dev`` domain validation (Requirement 8)
* long-text splitting at 5000 characters (Requirement 9)
* exponential-backoff retry (Requirement 10)
* fallback to the ``clients5.google.com`` backup endpoint (Requirement 11)
* business-status determination from the response body (Requirement 6)
"""

from __future__ import annotations

import time
import warnings
from urllib.parse import quote, urlencode

import requests

# Recommended maximum source-text length per single translation request.
SOURCE_TEXT_LENGTH_LIMIT = 5000

# Backup upstream endpoint (different response structure than the primary).
BACKUP_BASE_URL = "https://clients5.google.com"

# Fixed query parameters required by the translation endpoint.
FIXED_CLIENT = "gtx"
FIXED_DT = "t"
DEFAULT_SL = "auto"

# Default path used for the translation endpoint.
TRANSLATE_PATH = "/translate_a/single"


def build_url(base_url, q, tl, sl=DEFAULT_SL):
    """Assemble a translation request URL.

    Applies :func:`urllib.parse.quote` to ``q`` (Requirement 7) and assembles
    the query string with the fixed parameters ``client=gtx`` and ``dt=t``
    (Requirements 3.1, 3.2), ``sl`` defaulting to ``auto`` when omitted
    (Requirement 3.3), and ``tl`` (Requirement 3.4).

    The ``q`` value is encoded with ``quote(..., safe='')`` so that *all*
    reserved/special characters are percent-encoded.
    """
    if sl is None:
        sl = DEFAULT_SL

    base = base_url.rstrip("/")
    encoded_q = quote(q, safe="")
    # Build the non-q parameters via urlencode for correctness, then append the
    # already-encoded q so we control its encoding precisely (Requirement 7).
    params = urlencode(
        {
            "client": FIXED_CLIENT,
            "dt": FIXED_DT,
            "sl": sl,
            "tl": tl,
        }
    )
    return f"{base}{TRANSLATE_PATH}?{params}&q={encoded_q}"


def check_domain(base_url):
    """Warn when ``base_url`` contains the substring ``workers.dev``.

    Emits the blocked-domain warning if and only if the base URL contains
    ``workers.dev`` (Requirement 8.1). Returns ``True`` when a warning was
    emitted, ``False`` otherwise, so callers/tests can observe the decision.
    """
    if "workers.dev" in base_url:
        warnings.warn(
            "The configured domain contains 'workers.dev', which is blocked in "
            "mainland China. Please bind and use a custom domain instead.",
            stacklevel=2,
        )
        return True
    return False


def is_success(response_json):
    """Return ``True`` iff the standardized response indicates success.

    Success is determined *only* from the response body (Requirement 6): the
    ``code`` field equals 0. ``code == 1`` means failure and ``msg`` carries
    the description. The HTTP status code is never inspected.
    """
    return response_json.get("code") == 0


def split_text(text, limit=SOURCE_TEXT_LENGTH_LIMIT):
    """Split ``text`` into ordered segments of at most ``limit`` characters.

    Concatenating the returned segments in order reproduces ``text`` exactly
    (Requirement 9.1). An empty string yields a single empty segment so that a
    request is still issued.
    """
    if len(text) <= limit:
        return [text]
    return [text[i : i + limit] for i in range(0, len(text), limit)]


class TranslationError(Exception):
    """Raised when a translation request ultimately fails."""


def request_with_retry(url, max_retries=5, backoff_base=1.0, session=None,
                       sleep=time.sleep):
    """Issue ``GET url`` with exponential-backoff retry.

    Transient/rate-limit failures are retried with delays that grow
    exponentially (``backoff_base * 2 ** attempt``). Retrying stops once
    ``max_retries`` attempts have been made, and the last failure is reported
    by raising :class:`TranslationError` (Requirement 10).

    Returns the parsed standardized-response JSON on success (``code == 0``).
    """
    requester = session.get if session is not None else requests.get
    last_error = None

    for attempt in range(max_retries):
        try:
            response = requester(url)
            data = response.json()
            if is_success(data):
                return data
            # Business failure (code == 1): treat as a transient error so the
            # retry/backoff machinery can take over.
            last_error = TranslationError(data.get("msg", "translation failed"))
        except Exception as exc:  # network error, JSON error, etc.
            last_error = exc

        # Back off before the next attempt, but never after the final attempt.
        if attempt < max_retries - 1:
            sleep(backoff_base * (2 ** attempt))

    raise TranslationError(
        f"translation failed after {max_retries} attempts: {last_error}"
    )


def parse_backup_response(response_json):
    """Extract translated text from the backup endpoint's response shape.

    The ``clients5.google.com`` endpoint returns sentence objects under a
    ``sentences`` key (rather than the nested array used by the primary
    endpoint). The translated text is the in-order concatenation of each
    sentence's ``trans`` field (Requirement 11.2).
    """
    sentences = response_json.get("sentences", []) if response_json else []
    return "".join(s.get("trans", "") for s in sentences if s.get("trans"))


def request_backup(q, tl, sl=DEFAULT_SL, session=None):
    """Issue a request to the backup endpoint with identical query parameters.

    Uses the same fixed query parameters as the primary request
    (Requirement 11.1) against ``clients5.google.com`` and parses the distinct
    backup response structure (Requirement 11.2).
    """
    if sl is None:
        sl = DEFAULT_SL
    url = build_url(BACKUP_BASE_URL, q, tl, sl)
    requester = session.get if session is not None else requests.get
    response = requester(url)
    return parse_backup_response(response.json())


def translate(text, tl, sl=DEFAULT_SL, base_url="", max_retries=5,
              backoff_base=1.0, session=None, sleep=time.sleep):
    """Translate ``text`` into ``tl``, orchestrating all client conventions.

    Integrates :func:`check_domain`, :func:`build_url`, :func:`split_text`,
    :func:`request_with_retry`, :func:`request_backup`, and :func:`is_success`.
    For split inputs, each segment is translated and the resulting ``text``
    values are concatenated in original order (Requirements 9.1, 9.2).

    If the primary endpoint fails after the configured maximum retries, the
    request falls back to the backup endpoint (Requirement 11).
    """
    check_domain(base_url)

    segments = split_text(text)
    results = []

    for segment in segments:
        url = build_url(base_url, segment, tl, sl)
        try:
            data = request_with_retry(
                url,
                max_retries=max_retries,
                backoff_base=backoff_base,
                session=session,
                sleep=sleep,
            )
            results.append(data.get("text", ""))
        except TranslationError:
            # Primary exhausted its retries -> fall back to the backup endpoint
            # using identical query parameters (Requirement 11.1).
            results.append(request_backup(segment, tl, sl, session=session))

    return "".join(results)
