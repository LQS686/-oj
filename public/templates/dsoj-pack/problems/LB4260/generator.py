import random

def generate(dimension: str, seed: int = 42) -> str:
    rng = random.Random(seed)

    valid_dimensions = {
        "tiny", "tiny_plus", "small", "small_mid", "quarter",
        "medium", "three_quarter", "boundary", "extreme",
        "special_all_min", "special_all_max", "special_single"
    }
    if dimension not in valid_dimensions:
        raise ValueError(f"Unknown dimension: {dimension}")

    def is_leap(y: int) -> bool:
        return (y % 400 == 0) or (y % 4 == 0 and y % 100 != 0)

    def days_in_month(y: int, m: int) -> int:
        if m == 2:
            return 29 if is_leap(y) else 28
        if m in (4, 6, 9, 11):
            return 30
        return 31

    def random_date(y_lo: int, y_hi: int):
        y = rng.randint(y_lo, y_hi)
        m = rng.randint(1, 12)
        d = rng.randint(1, days_in_month(y, m))
        h = rng.randint(0, 23)
        k = rng.randint(1, 24)
        return y, m, d, h, k

    if dimension == "special_all_min":
        y, m, d, h, k = 2000, 1, 1, 0, 1
    elif dimension == "special_all_max":
        y, m, d, h, k = 3000, 12, 31, 23, 24
    elif dimension == "special_single":
        # 类似 all_min，但 k 取 2，以示区别
        y, m, d, h, k = 2000, 1, 1, 0, 2
    elif dimension == "boundary":
        # 逼近上界，k 取 1 以避免与 all_max 重复
        y, m, d, h, k = 3000, 12, 31, 23, 1
    elif dimension == "extreme":
        # 上界附近，h 取 0，k 取最大值
        y, m, d, h, k = 3000, 12, 31, 0, 24
    else:
        y_ranges = {
            "tiny": (2005, 2010),
            "tiny_plus": (2010, 2020),
            "small": (2020, 2100),
            "small_mid": (2100, 2300),
            "quarter": (2300, 2500),
            "medium": (2500, 2700),
            "three_quarter": (2700, 2999),
        }
        y_lo, y_hi = y_ranges[dimension]
        while True:
            y, m, d, h, k = random_date(y_lo, y_hi)
            # 确保 tiny 不与样例完全相同
            if dimension == "tiny" and (y, m, d, h, k) == (2008, 2, 28, 23, 1):
                continue
            break

    return f"{y}\n{m}\n{d}\n{h}\n{k}\n"
