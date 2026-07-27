import random

def generate(dimension: str, seed: int = 42) -> str:
    rng = random.Random(seed)

    # 规模映射：n 的范围是 [1, 100000]
    if dimension == "tiny":
        n = 3
    elif dimension == "tiny_plus":
        n = 5
    elif dimension == "small":
        n = max(1, 1 + (100000 - 1) // 8)   # 约 12500
    elif dimension == "small_mid":
        n = max(1, 1 + (100000 - 1) // 4)   # 约 25000
    elif dimension == "quarter":
        n = max(1, 1 + (100000 - 1) // 3)   # 约 33334
    elif dimension == "medium":
        n = max(1, 1 + (100000 - 1) // 2)   # 约 50001
    elif dimension == "three_quarter":
        n = max(1, 1 + 3 * (100000 - 1) // 4)  # 约 75001
    elif dimension == "boundary":
        n = 100000
    elif dimension == "extreme":
        n = 100000
    elif dimension == "special_all_min":
        n = 1
    elif dimension == "special_all_max":
        n = 100000
    elif dimension == "special_single":
        n = 1
    else:
        raise ValueError(f"Unknown dimension: {dimension}")

    # 根据维度生成 a_i 列表
    if dimension == "special_all_min":
        values = [1]  # 合法下界
    elif dimension == "special_all_max":
        values = [100000] * n  # 合法上界
    else:
        # 通用随机生成： 1 <= a_i <= 100000
        values = [rng.randint(1, 100000) for _ in range(n)]

    # 拼装：首行 n，接下来每行一个 a_i，以单个 \n 结尾
    out = str(n) + "\n" + "\n".join(str(v) for v in values) + "\n"
    return out
