import random

def generate(dimension: str, seed: int = 42) -> str:
    rng = random.Random(seed)

    # 各维度对应的年份范围（上界按题意不超过2022，下界不低于1）
    dims_range = {
        "tiny": (2010, 2022),            # 邻近样例，但排除 (2018,2022)
        "tiny_plus": (1990, 2022),
        "small": (1900, 2022),
        "small_mid": (1800, 2022),
        "quarter": (1500, 2022),
        "medium": (1000, 2022),
        "three_quarter": (500, 2022),
        "boundary": (1, 2022),
        "extreme": (1, 2022),            # 同样全范围，但不同 seed 随机结果不同
        "special_all_min": (1, 2),       # 合法下界，区间内无年份
        "special_all_max": (2021, 2022), # 合法上界，区间内无年份
        "special_single": (0, 0),        # 占位，实际会随机取同一年份
    }

    if dimension not in dims_range:
        raise ValueError(f"Unknown dimension: {dimension}")

    lo, hi = dims_range[dimension]

    if dimension == "special_all_min":
        y1, y2 = 1, 2
    elif dimension == "special_all_max":
        y1, y2 = 2021, 2022
    elif dimension == "special_single":
        y = rng.randint(1, 2022)
        y1, y2 = y, y
    else:
        # 生成严格递增的年份
        y1 = rng.randint(lo, hi - 1)
        y2 = rng.randint(y1 + 1, hi)
        # tiny 维度必须避开样例的 (2018, 2022)
        if dimension == "tiny":
            while (y1, y2) == (2018, 2022):
                y1 = rng.randint(lo, hi - 1)
                y2 = rng.randint(y1 + 1, hi)

    return f"{y1} {y2}\n"
