import random

def generate(dimension: str, seed: int = 42) -> str:
    rng = random.Random(seed)

    def scale_n(lo: int, hi: int) -> int:
        table = {
            "tiny": 2,                     # 与样例 n 相同但内容必须不同
            "tiny_plus": max(lo, min(hi, lo + 1)),   # 2
            "small": max(lo, lo + (hi - lo) // 8),   # 1 + 6 = 7
            "small_mid": max(lo, lo + (hi - lo) // 4), # 13
            "quarter": max(lo, lo + (hi - lo) // 3),  # 17
            "medium": max(lo, lo + (hi - lo) // 2),   # 25
            "three_quarter": max(lo, lo + 3 * (hi - lo) // 4), # 37
            "boundary": hi,              # 50
            "extreme": hi,               # 50
            "special_all_min": lo,       # 1
            "special_all_max": hi,       # 50
            "special_single": lo,        # 1
        }
        if dimension not in table:
            raise ValueError(f"Unknown dimension: {dimension}")
        return table[dimension]

    n = scale_n(1, 50)

    # 根据维度生成数据，确保声明数与实际一致
    if dimension == "special_all_min":
        values = [1] * n
    elif dimension == "special_all_max":
        values = [100] * n
    elif dimension == "special_single":
        # 确保与 special_all_min 不同，生成 > 1 的数
        a = rng.randint(2, 100)
        values = [a]
    elif dimension == "tiny":
        # 避免与样例 "2\n3\n5\n" 完全相同
        while True:
            values = [rng.randint(1, 100) for _ in range(n)]
            if values != [3, 5]:
                break
    else:
        values = [rng.randint(1, 100) for _ in range(n)]

    lines = [str(n)] + [str(v) for v in values]
    return "\n".join(lines) + "\n"
