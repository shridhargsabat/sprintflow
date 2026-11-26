"""Unit tests for backend/ratelimit.py (in-memory login token buckets)."""
import pytest

import ratelimit


@pytest.fixture(autouse=True)
def _clean_buckets():
    ratelimit.reset()
    yield
    ratelimit.reset()


def test_fresh_key_allowed_with_zero_retry_after():
    allowed, retry_after = ratelimit.is_allowed("1.2.3.4:a@x.local")
    assert allowed is True
    assert retry_after == 0.0


def test_failures_beyond_capacity_deny_with_retry_after():
    key = "1.2.3.4:b@x.local"
    for _ in range(ratelimit.MAX_ATTEMPTS):
        assert ratelimit.is_allowed(key)[0] is True
        ratelimit.record_failure(key)
    allowed, retry_after = ratelimit.is_allowed(key)
    assert allowed is False
    assert retry_after > 0.0
    assert int(ratelimit.retry_after_header(retry_after)) >= 1


def test_buckets_are_independent_per_ip_and_email():
    ratelimit.record_failure(ratelimit.key_for("1.2.3.4", "a@x.local"))
    assert ratelimit.is_allowed(ratelimit.key_for("9.9.9.9", "a@x.local"))[0] is True
    assert ratelimit.is_allowed(ratelimit.key_for("1.2.3.4", "b@x.local"))[0] is True


def test_key_normalizes_email_case_and_whitespace():
    assert ratelimit.key_for("1.2.3.4", "  A@X.local ") == ratelimit.key_for(
        "1.2.3.4", "a@x.local"
    )


def test_bucket_refills_after_window(monkeypatch):
    now = [1000.0]
    monkeypatch.setattr(ratelimit, "_clock", lambda: now[0])
    key = "1.2.3.4:c@x.local"
    for _ in range(ratelimit.MAX_ATTEMPTS):
        ratelimit.record_failure(key)
    assert ratelimit.is_allowed(key)[0] is False
    now[0] += ratelimit.WINDOW_SECONDS + 1.0
    assert ratelimit.is_allowed(key)[0] is True


def test_reset_clears_denied_buckets():
    key = "1.2.3.4:d@x.local"
    for _ in range(ratelimit.MAX_ATTEMPTS):
        ratelimit.record_failure(key)
    assert ratelimit.is_allowed(key)[0] is False
    ratelimit.reset()
    assert ratelimit.is_allowed(key)[0] is True
