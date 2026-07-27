import random

def generate(dimension: str, seed: int = 42) -> str:
    rng = random.Random(seed)

    dim_to_n = {
        "tiny": 1,
        "tiny_plus": 2,
        "small": 3,
        "small_mid": 4,
        "quarter": 5,
        "medium": 6,
        "three_quarter": 7,
        "boundary": 7,
        "extreme": 7,
        "special_all_min": 1,
        "special_all_max": 7,
        "special_single": 1,
    }

    if dimension not in dim_to_n:
        raise ValueError(f"Unknown dimension: {dimension}")

    n = dim_to_n[dimension]

    # 生成后续的 n 个整数，每个整数范围 1..364
    if dimension == "special_all_min":
        values = [1] * n
    elif dimension == "special_all_max":
        values = [364] * n
    else:
        values = [rng.randint(1, 364) for _ in range(n)]

    # tiny 维度必须与样例字节级不同（样例: 1\n6\n）
    if dimension == "tiny":
        while values[0] == 6:
            values[0] = rng.randint(1, 364)

    # 拼接输出，首行为 n，后续每行一个数
    lines = [str(n)] + [str(v) for v in values]
    return "\n".join(lines) + "\n"
