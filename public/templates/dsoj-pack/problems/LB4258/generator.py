import random

def generate(dimension: str, seed: int = 42) -> str:
    rng = random.Random(seed)

    # 根据维度决定 n 的取值，范围 1..100
    def scale_n() -> int:
        mapping = {
            "tiny": 5,               # 与样例结构一致（行数+每行 token 数）
            "tiny_plus": 10,
            "small": 12,
            "small_mid": 25,
            "quarter": 33,
            "medium": 50,
            "three_quarter": 75,
            "boundary": 100,         # 题目上限
            "extreme": 100,          # 同样上限，但 seed 不同保证数据不同
            "special_all_min": 1,    # 下界情形
            "special_all_max": 100,  # 上界情形
            "special_single": 1,     # 单元素退化
        }
        if dimension not in mapping:
            raise ValueError(f"Unknown dimension: {dimension}")
        return mapping[dimension]

    n = scale_n()

    # 特殊维度决定数据生成方式
    if dimension == "special_all_min":
        values = [1] * n
    elif dimension == "special_all_max":
        values = [10000] * n
    else:
        values = [rng.randint(1, 10000) for _ in range(n)]

    # 组装字符串：首行 n，然后每行一个数，末尾一个换行
    out = str(n) + "\n"
    for v in values:
        out += str(v) + "\n"
    return out
