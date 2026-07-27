import random

def generate(dimension: str, seed: int = 42) -> str:
    rng = random.Random(seed)

    # 固定极端/特殊维度
    if dimension == "special_all_min":
        return "1 1 1 1 1\n"
    if dimension == "special_all_max":
        return "10 10 10 1000 1000\n"
    if dimension == "special_single":
        return "3 3 3 10 10\n"
    if dimension == "extreme":
        return "10 10 1 1000 1000\n"

    # 边界维度：随机选择极值
    if dimension == "boundary":
        x = rng.choice([1, 10])
        y = rng.choice([1, 10])
        z = rng.choice([1, 10])
        n = rng.choice([1, 1000])
        m = rng.choice([1, 1000])
        return f"{x} {y} {z} {n} {m}\n"

    # 一般维度：规模映射
    scale_map = {
        "tiny": (90, 110),
        "tiny_plus": (80, 120),
        "small": (50, 200),
        "small_mid": (50, 350),
        "quarter": (50, 500),
        "medium": (100, 700),
        "three_quarter": (200, 900),
    }
    if dimension not in scale_map:
        raise ValueError(f"Unknown dimension: {dimension}")

    lo, hi = scale_map[dimension]

    # 生成参数
    x = rng.randint(1, 10)
    y = rng.randint(1, 10)
    z = rng.randint(1, 10)
    n = rng.randint(lo, hi)
    m = rng.randint(lo, hi)

    # tiny 禁止与样例字节级相同
    if dimension == "tiny":
        while (x, y, z, n, m) == (5, 3, 3, 100, 100):
            x = rng.randint(1, 10)
            y = rng.randint(1, 10)
            z = rng.randint(1, 10)
            n = rng.randint(lo, hi)
            m = rng.randint(lo, hi)

    return f"{x} {y} {z} {n} {m}\n"
