import random

def generate(dimension: str, seed: int = 42) -> str:
    rng = random.Random(seed)

    # n 的范围与维度映射，完全覆盖 12 个维度
    n_table = {
        "tiny": 2,              # 与样例结构相同，n = 2
        "tiny_plus": 3,         # 稍大
        "small": 4,
        "small_mid": 5,
        "quarter": 6,
        "medium": 7,
        "three_quarter": 8,
        "boundary": 10,        # 上界
        "extreme": 10,
        "special_all_min": 1,  # 下界
        "special_all_max": 10, # 上界
        "special_single": 1,   # 退化/单元素
    }
    if dimension not in n_table:
        raise ValueError(f"Unknown dimension: {dimension}")

    n = n_table[dimension]
    lo_a, hi_a = 1, 10**6  # a_i 的范围

    if dimension == "special_all_min":
        values = [1] * n
    elif dimension == "special_all_max":
        values = [10**6] * n
    else:
        values = [rng.randint(lo_a, hi_a) for _ in range(n)]

    # 强制 tiny 不与样例字节完全一致 (2\n5\n4\n)
    if dimension == "tiny" and n == 2 and values == [5, 4]:
        values[0] = 6  # 微小修改即可破开样例

    # 构造输出，每行一个 token，末尾有换行
    out_lines = [str(n)] + [str(v) for v in values]
    return "\n".join(out_lines) + "\n"
