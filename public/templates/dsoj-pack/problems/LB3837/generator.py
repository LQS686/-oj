import random

def generate(dimension: str, seed: int = 42) -> str:
    rng = random.Random(seed)

    n_map = {
        "special_all_min": 2,
        "special_single": 3,  # 仅作为维度识别，不使用固定值
        "tiny": 4,
        "tiny_plus": 5,
        "small": 6,
        "small_mid": 7,
        "quarter": 8,
        "medium": 20,
        "three_quarter": 30,
        "boundary": 38,
        "extreme": 39,
        "special_all_max": 40,
    }

    if dimension not in n_map:
        raise ValueError(f"Unknown dimension: {dimension}")

    # special_single 与 tiny 必须产生与样例 3 不同的内容
    if dimension in ("special_single", "tiny"):
        n = rng.randint(2, 100)
        while n == 3:
            n = rng.randint(2, 100)
    else:
        n = n_map[dimension]

    return str(n) + "\n"
