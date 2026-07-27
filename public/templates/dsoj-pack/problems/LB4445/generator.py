import random

def generate(dimension: str, seed: int = 42) -> str:
    rng = random.Random(seed)

    # 为不同的维度设定不同的生成范围，确保输出互不相同
    ranges = {
        "tiny": (1, 4000),
        "tiny_plus": (1, 5000),
        "small": (1, 1000),
        "small_mid": (1000, 3000),
        "quarter": (2000, 6000),
        "medium": (3000, 7000),
        "three_quarter": (5000, 9000),
        "boundary": (8000, 10000),
        "extreme": (9000, 10000),
    }

    if dimension in ranges:
        lo, hi = ranges[dimension]
        values = [rng.randint(lo, hi) / 10.0 for _ in range(4)]
    elif dimension == "special_all_min":
        # 尽量取合法下界，正数的一位小数
        values = [0.1 for _ in range(4)]
    elif dimension == "special_all_max":
        # 尽量取合法上界，不超过1000
        values = [1000.0 for _ in range(4)]
    elif dimension == "special_single":
        # 退化情形：四个值全部相同
        single_value = rng.randint(1000, 9000) / 10.0
        values = [single_value for _ in range(4)]
    else:
        raise ValueError(f"Unknown dimension: {dimension}")

    # 构造输出：每行一个一位小数的浮点数，末尾以换行符结束
    out_lines = [f"{v:.1f}" for v in values]
    return "\n".join(out_lines) + "\n"
