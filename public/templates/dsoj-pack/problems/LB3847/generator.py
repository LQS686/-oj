import random

def generate(dimension: str, seed: int = 42) -> str:
    rng = random.Random(seed)

    lo, hi = 0, 86399  # 一天总秒数的合法范围 [0, 86399]

    # 用 rng 生成 tiny 与 special_all_min，确保不与样例 ("0 0 0 A") 相同
    # tiny 生成一个很小的非零秒数，special_all_min 生成一个略大于 0 的秒数
    table = {
        "tiny":             rng.randint(1, 59),            # 非零随机小值
        "tiny_plus":        max(lo, min(hi, 2)),          # 2
        "small":            lo + (hi - lo) // 8,          # 10799
        "small_mid":        lo + (hi - lo) // 4,          # 21599
        "quarter":          lo + (hi - lo) // 3,          # 28799
        "medium":           lo + (hi - lo) // 2,          # 43199
        "three_quarter":    lo + 3 * (hi - lo) // 4,      # 64799
        "boundary":         hi - 1,                       # 86398
        "extreme":          hi - 2,                       # 86397
        "special_all_min":  rng.randint(1, 10),           # 非零极小值
        "special_all_max":  hi,                           # 86399
        "special_single":   43200,                        # 12:00:00
    }

    if dimension not in table:
        raise ValueError(f"Unknown dimension: {dimension}")

    total = table[dimension]

    # 转换成 12 小时制
    h24 = total // 3600
    m = (total % 3600) // 60
    s = total % 60

    if h24 < 12:
        ampm = 'A'
        h = h24
    else:
        ampm = 'P'
        h = h24 - 12

    return f"{h} {m} {s} {ampm}\n"
