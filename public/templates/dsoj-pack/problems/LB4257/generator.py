import random

def generate(dimension: str, seed: int = 42) -> str:
    rng = random.Random(seed)

    # 定义各维度的 n 基准值
    n_map = {
        "tiny": 10,
        "tiny_plus": 20,
        "small": 100,
        "small_mid": 200,
        "quarter": 250,
        "medium": 500,
        "three_quarter": 750,
        "boundary": 1000,
        "extreme": 1000,
        "special_all_min": 1,
        "special_all_max": 1000,
        "special_single": 1,
    }

    if dimension not in n_map:
        raise ValueError(f"Unknown dimension: {dimension}")

    n = n_map[dimension]

    if dimension == "special_all_min":
        # 最小合法值：n=1, x=2, y=1 满足 1 < 1*2 且至少剩一本
        n, x, y = 1, 2, 1
    elif dimension == "special_all_max":
        n, x, y = 1000, 1000, 1000
    else:
        # 通用随机生成，确保至少剩一本：y // x < n
        if n == 1:
            # n=1 时，必须 x > y，取 x>=2
            x = rng.randint(2, 1000)
            y = rng.randint(1, x - 1)
        else:
            x = rng.randint(1, 1000)
            max_y = min(1000, n * x - 1)
            # 防止极端情形（如 n=2, x=1 时 max_y=1，合法）
            if max_y < 1:
                # 迫选 x 使 max_y >=1
                x = rng.randint(2, 1000)
                max_y = min(1000, n * x - 1)
            y = rng.randint(1, max_y)

    # 构造输出字符串
    result = f"{n}\n{x}\n{y}\n"

    # 确保 tiny 维度的内容与样例 "10\n2\n3\n" 不同
    if dimension == "tiny":
        while result == "10\n2\n3\n":
            x = rng.randint(1, 1000)
            max_y = min(1000, n * x - 1)
            if max_y >= 1:
                y = rng.randint(1, max_y)
            else:
                continue
            result = f"{n}\n{x}\n{y}\n"

    return result
