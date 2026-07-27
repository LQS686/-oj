import random

def generate(dimension: str, seed: int = 42) -> str:
    rng = random.Random(seed)
    # tiny 用 rng 生成，避免与样例 (5) 相同
    tiny_n = rng.choice([x for x in range(1, 50) if x != 5])

    n_map = {
        "special_all_min": 1,     # 不能是 5（样例值），取 1 作为最小
        "special_all_max": 49,
        "special_single": 7,
        "tiny": tiny_n,
        "tiny_plus": 11,
        "small": 13,
        "small_mid": 15,
        "quarter": 17,
        "medium": 25,
        "three_quarter": 37,
        "boundary": 45,
        "extreme": 47,
    }

    if dimension not in n_map:
        raise ValueError(f"Unknown dimension: {dimension}")

    n = n_map[dimension]
    return f"{n}\n"
