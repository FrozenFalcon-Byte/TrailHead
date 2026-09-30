from __future__ import annotations

import pytest

from trailhead.decisions.ratelimit import NoProviderAvailable, ProviderPool, SlotLimiter


def test_slot_limiter_spaces_requests():
    limiter = SlotLimiter(requests_per_minute=1)
    assert limiter.reserve(100.0) == 100.0
    assert limiter.reserve(100.0) == 160.0
    assert limiter.reserve(400.0) == 400.0
    limiter.penalize(400.0, 90)
    assert limiter.reserve(401.0) == 490.0


async def test_pool_uses_the_soonest_provider_and_combines_throughput(clock):
    pool = ProviderPool([("slow", 1), ("fast", 6)], clock=clock, sleep=clock.sleep)
    picks = [(await pool.acquire())[1] for _ in range(4)]
    # slow first (list order breaks the tie), then fast every 10s until slow frees up at +60s
    assert picks == ["slow", "fast", "fast", "fast"]
    assert clock.now == pytest.approx(1020.0)


async def test_pool_skips_penalized_and_disabled_providers(clock):
    pool = ProviderPool([("a", 60), ("b", 60)], clock=clock, sleep=clock.sleep)
    pool.penalize(0, 300)
    assert (await pool.acquire())[1] == "b"
    pool.disable(1, "b: auth")
    assert (await pool.acquire())[1] == "a"
    assert clock.now == pytest.approx(1300.0)
    pool.disable(0, "a: auth")
    with pytest.raises(NoProviderAvailable, match="a: auth"):
        await pool.acquire()
