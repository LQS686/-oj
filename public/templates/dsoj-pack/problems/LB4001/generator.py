import random

def generate(dimension: str, seed: int = 42) -> str:
    rng = random.Random(seed)  # 初始化但不强制使用

    # 保证所有维度输出不同，且 tiny 不同于样例 8
    mapping = {
        "tiny": 7,
        "tiny_plus": 9,
        "small": 27,
        "small_mid": 64,
        "quarter": 125,
        "medium": 216,
        "three_quarter": 343,
        "boundary": 998,
        "extreme": 999,
        "special_all_min": 1,
        "special_all_max": 1000,
        "special_single": 2,
    }

    if dimension not in mapping:
        raise ValueError(f"Unknown dimension: {dimension}")

    n = mapping[dimension]
    return f"{n}\n"
