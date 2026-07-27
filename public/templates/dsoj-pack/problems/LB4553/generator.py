import random

def generate(dimension: str, seed: int = 42) -> str:
    rng = random.Random(seed)

    known = {
        "tiny", "tiny_plus", "small", "small_mid", "quarter",
        "medium", "three_quarter", "boundary", "extreme",
        "special_all_min", "special_all_max", "special_single",
    }
    if dimension not in known:
        raise ValueError(f"Unknown dimension: {dimension}")

    # 为每个维度确定需要生成的数据行数 n，以及每条数据的生成规则
    if dimension == "tiny":
        # 必须严格保持样例结构：首行 n=1，第二个整数 ≠ 21
        n = 1
        # 生成与样例不同的数据
        vals = [rng.choice([x for x in range(1, 101) if x != 21])]

    elif dimension == "special_all_min":
        n = rng.randint(1, 10)
        vals = [1] * n

    elif dimension == "special_all_max":
        n = rng.randint(1, 10)
        vals = [2000] * n

    elif dimension == "special_single":
        n = rng.randint(1, 10)
        x = rng.randint(2, 1999)          # 避开 1 和 2000 以免与其他特殊维度混淆
        vals = [x] * n

    elif dimension == "boundary":
        n = rng.randint(10, 100)
        vals = [rng.randint(1990, 2000) for _ in range(n)]

    elif dimension == "extreme":
        n = rng.randint(1000, 2000)
        vals = [rng.randint(1, 2000) for _ in range(n)]

    else:
        # 规模维度：tiny_plus, small, small_mid, quarter, medium, three_quarter
        n_ranges = {
            "tiny_plus": (2, 10),
            "small": (10, 50),
            "small_mid": (50, 200),
            "quarter": (200, 500),
            "medium": (500, 1000),
            "three_quarter": (1000, 1500),
        }
        n_low, n_high = n_ranges[dimension]
        n = rng.randint(n_low, n_high)

        val_ranges = {
            "tiny_plus": (1, 100),
            "small": (1, 500),
            "small_mid": (1, 1000),
            "quarter": (1, 1500),
            "medium": (1, 2000),
            "three_quarter": (1, 2000),
        }
        v_low, v_high = val_ranges[dimension]
        vals = [rng.randint(v_low, v_high) for _ in range(n)]

    # 按照 n_then_n_lines 格式输出：第一行 n，接下来 n 行每行一个整数
    out = str(n)
    for v in vals:
        out += "\n" + str(v)
    out += "\n"
    return out
