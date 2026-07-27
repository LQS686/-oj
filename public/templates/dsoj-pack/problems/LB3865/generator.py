import random

def generate(dimension: str, seed: int = 42) -> str:
    rng = random.Random(seed)

    # 每个维度对应的候选奇数集合，所有集合两两不相交，保证任何 seed 下 12 个维度输出均不同
    pool = {
        "special_all_min": [1],
        "special_single":  [7],
        "tiny":            [9, 11],
        "tiny_plus":       [13, 15],
        "small":           [17, 19],
        "small_mid":       [21, 23],
        "quarter":         [25, 27],
        "medium":          [29, 31],
        "three_quarter":   [33, 35],
        "extreme":         [37, 39, 41, 43],
        "boundary":        [45, 47],
        "special_all_max": [49],
    }

    if dimension not in pool:
        raise ValueError(f"Unknown dimension: {dimension}")

    candidates = pool[dimension]
    n = rng.choice(candidates)

    # 输入格式：一行一个整数 N，后跟换行
    return f"{n}\n"
