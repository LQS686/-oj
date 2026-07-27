import random

def generate(dimension: str, seed: int = 42) -> str:
    rng = random.Random(seed)

    # 所有 dimension 生成唯一且不与样例重复的单行整数
    if dimension == "tiny":
        n = 5               # 避免样例的 4
    elif dimension == "tiny_plus":
        n = 6
    elif dimension == "small":
        n = 7
    elif dimension == "small_mid":
        n = 8
    elif dimension == "quarter":
        n = 9
    elif dimension == "medium":
        n = 10
    elif dimension == "three_quarter":
        n = 11
    elif dimension == "boundary":
        n = 12
    elif dimension == "extreme":
        n = 15
    elif dimension == "special_all_min":
        n = 3
    elif dimension == "special_all_max":
        n = 14
    elif dimension == "special_single":
        n = 13              # 单值且不与其他维度或样例重复
    else:
        raise ValueError(f"Unknown dimension: {dimension}")

    return f"{n}\n"
