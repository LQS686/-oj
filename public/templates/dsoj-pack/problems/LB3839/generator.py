import random

def generate(dimension: str, seed: int = 42) -> str:
    rng = random.Random(seed)
    ranges = {
        "special_all_min": (2, 2),
        "tiny": (4, 4),
        "tiny_plus": (5, 5),
        "small": (6, 8),
        "small_mid": (10, 14),
        "quarter": (25, 30),
        "medium": (50, 55),
        "three_quarter": (75, 80),
        "extreme": (98, 98),
        "boundary": (99, 99),
        "special_all_max": (100, 100),
    }
    if dimension == "special_single":
        # 确保值与样例不同（样例是3）
        allowed = [x for x in range(1, 101) if x != 3]
        n = rng.choice(allowed)
        return str(n) + "\n"
    if dimension not in ranges:
        raise ValueError(f"Unknown dimension: {dimension}")
    lo, hi = ranges[dimension]
    n = rng.randint(lo, hi)
    return str(n) + "\n"
