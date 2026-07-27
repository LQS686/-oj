import random

def generate(dimension: str, seed: int = 42) -> str:
    rng = random.Random(seed)

    if dimension == "special_all_min":
        a, b, m, N = 0, 0, 1, 3
    elif dimension == "special_all_max":
        a, b, m, N = 10, 10, 999999, 364
    elif dimension == "special_single":
        a, b, m, N = 0, 1, 2, 3
    elif dimension == "boundary":
        a = rng.randint(0, 10)
        b = rng.randint(0, 10)
        m = 999998 + rng.randint(0, 1)
        N = 363 + rng.randint(0, 1)
        m = max(m, max(a, b) + 1)
        if m > 999999:
            m = 999999
    elif dimension == "extreme":
        a = rng.randint(0, 10)
        b = rng.randint(0, 10)
        m = rng.randint(999990, 999999)
        N = rng.randint(360, 364)
        m = max(m, max(a, b) + 1)
        if m > 999999:
            m = 999999
    else:
        # 规模映射
        n_ranges = {
            "tiny": (4, 6),
            "tiny_plus": (7, 15),
            "small": (16, 40),
            "small_mid": (41, 80),
            "quarter": (81, 130),
            "medium": (131, 220),
            "three_quarter": (221, 320),
        }
        m_ranges = {
            "tiny": (4, 20),
            "tiny_plus": (15, 50),
            "small": (30, 200),
            "small_mid": (100, 1000),
            "quarter": (500, 10000),
            "medium": (5000, 100000),
            "three_quarter": (50000, 500000),
        }
        if dimension not in n_ranges:
            raise ValueError(f"Unknown dimension: {dimension}")
        N = rng.randint(n_ranges[dimension][0], n_ranges[dimension][1])
        m_lo, m_hi = m_ranges[dimension]
        m = rng.randint(m_lo, m_hi)
        max_ab = min(m - 1, 10)
        a = rng.randint(0, max_ab)
        b = rng.randint(0, max_ab)

    # 保证 tiny 不与样例相同
    if dimension == "tiny" and a == 1 and b == 2 and m == 10 and N == 5:
        a += 1
        if a > min(10, m - 1):
            a = 0

    return f"{a}\n{b}\n{m}\n{N}\n"
