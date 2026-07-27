import random

def generate(dimension: str, seed: int = 42) -> str:
    rng = random.Random(seed)

    # 固定输出映射（确保互不相同且符合边界语义）
    fixed_map = {
        "special_all_min": 0.01,
        "special_single": 0.02,
        "boundary": 99999.98,
        "extreme": 99999.97,
        "special_all_max": 99999.99,
    }

    # 带区间随机生成的维度（区间无重叠，保证任意 seed 下输出都不与其他维度相同）
    interval_map = {
        "tiny": (0.02, 100.00),
        "tiny_plus": (100.01, 1000.00),
        "small": (1000.01, 5000.00),
        "small_mid": (5000.01, 20000.00),
        "quarter": (20000.01, 40000.00),
        "medium": (40000.01, 60000.00),
        "three_quarter": (60000.01, 80000.00),
    }

    if dimension in fixed_map:
        val = fixed_map[dimension]
    elif dimension in interval_map:
        lo, hi = interval_map[dimension]
        val = round(rng.uniform(lo, hi), 2)
    else:
        raise ValueError(f"Unknown dimension: {dimension}")

    return f"{val:.2f}\n"
