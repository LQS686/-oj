import random

def generate(dimension: str, seed: int = 42) -> str:
    rng = random.Random(seed)

    # 数据范围
    LO = 1
    HI = 100000

    # 根据维度决定 n 的范围，并保证“相同数量”购买问题下 n,a,b 均合法
    if dimension == "special_all_min":
        n = LO
        a = LO
        b = LO
        return f"{n}\n{a}\n{b}\n"

    if dimension == "special_all_max":
        n = HI
        a = HI
        b = HI
        return f"{n}\n{a}\n{b}\n"

    if dimension == "special_single":
        # 退化情形：n 很小，但一件商品极贵
        n = LO
        a = HI
        b = rng.randint(LO, HI)
        return f"{n}\n{a}\n{b}\n"

    # 其余维度：n 基于规模缩放，a,b 随机
    scale_map = {
        "tiny": (10, 20),             # 接近样例 12
        "tiny_plus": (21, 50),
        "small": (100, 500),
        "small_mid": (1000, 5000),
        "quarter": (20000, 30000),
        "medium": (45000, 55000),
        "three_quarter": (70000, 80000),
        "boundary": (HI, HI),
        "extreme": (HI, HI),
    }

    if dimension not in scale_map:
        raise ValueError(f"Unknown dimension: {dimension}")

    lo_n, hi_n = scale_map[dimension]
    # 确保 lo_n <= hi_n
    if lo_n > hi_n:
        lo_n, hi_n = hi_n, lo_n
    n = rng.randint(lo_n, hi_n)

    # tiny 维度需要避免与样例完全一致 (12,1,2)
    if dimension == "tiny":
        while True:
            n = rng.randint(lo_n, hi_n)
            a = rng.randint(LO, min(5, HI))
            b = rng.randint(LO, min(5, HI))
            if not (n == 12 and a == 1 and b == 2):
                break
        return f"{n}\n{a}\n{b}\n"

    a = rng.randint(LO, HI)
    b = rng.randint(LO, HI)
    return f"{n}\n{a}\n{b}\n"
