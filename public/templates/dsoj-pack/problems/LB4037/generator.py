import random

def generate(dimension: str, seed: int = 42) -> str:
    rng = random.Random(seed)
    # 固定大多数维度的映射，special_single 需要动态生成以避免克隆样例值 5
    base_mapping = {
        "tiny": 7,
        "tiny_plus": 9,
        "small": 11,
        "small_mid": 13,
        "quarter": 15,
        "medium": 17,
        "three_quarter": 19,
        "boundary": 47,
        "extreme": 45,
        "special_all_min": 3,
        "special_all_max": 49,
    }
    # 已占用的奇数
    used = set(base_mapping.values())
    # 在 [3, 49] 范围内选取一个奇数，不能与已有值重复，且不能为样例值 5
    candidates = [x for x in range(3, 50, 2) if x not in used and x != 5]
    special_single_value = rng.choice(candidates)
    base_mapping["special_single"] = special_single_value

    mapping = base_mapping

    if dimension not in mapping:
        raise ValueError(f"Unknown dimension: {dimension}")

    m = mapping[dimension]
    return str(m) + "\n"
