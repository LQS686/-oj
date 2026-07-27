import random

def generate(dimension: str, seed: int = 42) -> str:
    rng = random.Random(seed)

    if dimension == "special_all_min":
        prices = [1, 1, 1, 1]
    elif dimension == "special_all_max":
        prices = [10000, 10000, 10000, 10000]
    elif dimension == "special_single":
        # 所有价格相等，体现退化情形
        val = rng.randint(1, 10000)
        prices = [val, val, val, val]
    else:
        ranges = {
            "tiny": (1, 1000),
            "tiny_plus": (10, 2000),
            "small": (100, 3000),
            "small_mid": (200, 4000),
            "quarter": (300, 5000),
            "medium": (400, 6000),
            "three_quarter": (500, 7000),
            "boundary": (9000, 10000),
            "extreme": (1, 10000),
        }
        if dimension not in ranges:
            raise ValueError(f"Unknown dimension: {dimension}")
        lo, hi = ranges[dimension]
        prices = [rng.randint(lo, hi) for _ in range(4)]

    # 确保 tiny 不与样例字节级相同（极小概率，仅做保护）
    if dimension == "tiny" and prices == [999, 105, 699, 588]:
        prices = [500, 200, 300, 400]

    out = "\n".join(str(p) for p in prices) + "\n"
    return out
