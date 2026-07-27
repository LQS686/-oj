import random

def generate(dimension: str, seed: int = 42) -> str:
    rng = random.Random(seed)

    # 各维度的 n 值
    n_map = {
        "tiny": 5,
        "tiny_plus": 6,
        "small": 12,
        "small_mid": 25,
        "quarter": 2500,
        "medium": 50000,
        "three_quarter": 75000,
        "boundary": 100000,
        "extreme": 100000,
        "special_all_min": 1,
        "special_all_max": 100000,
        "special_single": 1,
    }

    if dimension not in n_map:
        raise ValueError(f"Unknown dimension: {dimension}")

    n = n_map[dimension]
    min_val, max_val = 1, 100000

    # 根据维度生成数值列表
    if dimension == "special_all_min":
        values = [min_val] * n
    elif dimension == "special_all_max":
        values = [max_val] * n
    elif dimension == "special_single":
        values = [rng.randint(min_val, max_val)]
    else:
        values = [rng.randint(min_val, max_val) for _ in range(n)]

    # 构建输出：首行 n，再 n 行数值，最后带一个换行
    lines = [str(n)] + [str(v) for v in values]
    return "\n".join(lines) + "\n"
