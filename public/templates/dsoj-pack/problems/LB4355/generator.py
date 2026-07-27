import random

def generate(dimension: str, seed: int = 42) -> str:
    rng = random.Random(seed)

    # 已知的固定特殊组合（用于避免重复）
    special_combos = {(1, 1), (100, 100), (50, 50)}

    def pick_non_special(lo: int, hi: int):
        """在两个闭区间内随机选择 m, n，避开 special_combos"""
        while True:
            m = rng.randint(lo, hi)
            n = rng.randint(lo, hi)
            if (m, n) not in special_combos:
                return m, n

    if dimension == "special_all_min":
        m, n = 1, 1
    elif dimension == "special_all_max":
        m, n = 100, 100
    elif dimension == "special_single":
        m = n = 50
    elif dimension == "tiny":
        m, n = pick_non_special(2, 4)
    elif dimension == "tiny_plus":
        m, n = pick_non_special(3, 7)
    elif dimension == "small":
        m, n = pick_non_special(4, 15)
    elif dimension == "small_mid":
        m, n = pick_non_special(8, 30)
    elif dimension == "quarter":
        m, n = pick_non_special(15, 50)
    elif dimension == "medium":
        m, n = pick_non_special(30, 70)
    elif dimension == "three_quarter":
        m, n = pick_non_special(50, 90)
    elif dimension == "boundary":
        # 逼近上限，但避免 (100, 100) 与 special_all_max 冲突
        m, n = pick_non_special(90, 100)
    elif dimension == "extreme":
        m, n = pick_non_special(95, 100)
    else:
        raise ValueError(f"Unknown dimension: {dimension}")

    return f"{m}\n{n}\n"
