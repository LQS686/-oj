import random

def generate(dimension: str, seed: int = 42) -> str:
    rng = random.Random(seed)

    # 每个维度对应的候选奇数 n，彼此不重叠，保证 12 个维度输出互不相同
    dim_candidates = {
        "special_all_min":   [1],      # 合法下界，但不能与样例 3 相同
        "tiny":              [5],      # 接近样例但不同（样例为 3）
        "tiny_plus":         [7],
        "small":             [9],
        "small_mid":        [11],
        "quarter":          [13],
        "medium":           [15],
        "three_quarter":    [17],
        "special_single":   [19],      # 单元素/退化情形，取较小奇数但不是 3
        "boundary":         [25],      # 逼近上界
        "extreme":          [27],      # 逼近上界
        "special_all_max":  [29],      # 合法上界
    }

    if dimension not in dim_candidates:
        raise ValueError(f"Unknown dimension: {dimension}")

    n = rng.choice(dim_candidates[dimension])
    return f"{n}\n"
