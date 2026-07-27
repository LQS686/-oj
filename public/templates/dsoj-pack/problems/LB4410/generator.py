import random

def generate(dimension: str, seed: int = 42) -> str:
    rng = random.Random(seed)

    bounds = {
        "special_all_min": (1, 1),
        "special_single":   (3, 3),      # 避开样例的 2
        "special_all_max": (50, 50),
        "tiny":             (4, 5),      # 用 rng 生成的区间，保证内容 ≠ 样例
        "tiny_plus":        (6, 7),
        "small":            (8, 13),
        "small_mid":        (14, 18),
        "quarter":          (19, 25),
        "medium":           (26, 32),
        "three_quarter":    (33, 40),
        "boundary":         (41, 45),
        "extreme":          (46, 49),
    }

    if dimension not in bounds:
        raise ValueError(f"Unknown dimension: {dimension}")

    lo, hi = bounds[dimension]
    n = rng.randint(lo, hi)
    return f"{n}\n"
