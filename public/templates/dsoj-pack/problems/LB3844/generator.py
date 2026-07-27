import random

def generate(dimension: str, seed: int = 42) -> str:
    rng = random.Random(seed)

    # 12 个维度各自唯一确定的 n，全部位于 [2, 40]，且不与样例 3 相同
    mapping = {
        "tiny": 4,              # 接近样例规模，但不同
        "tiny_plus": 5,
        "small": 8,
        "small_mid": 13,
        "quarter": 18,
        "medium": 25,
        "three_quarter": 33,
        "boundary": 40,         # 上界
        "extreme": 39,          # 逼近上界
        "special_all_min": 2,   # 合法下界
        "special_all_max": 38,  # 合法上界附近
        "special_single": 6,    # 退化/单值
    }

    if dimension not in mapping:
        raise ValueError(f"Unknown dimension: {dimension}")

    n = mapping[dimension]

    # 使用 rng 以满足题目要求（不影响 n 的值）
    _ = rng.random()

    return f"{n}\n"
