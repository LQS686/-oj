import random

def generate(dimension: str, seed: int = 42) -> str:
    rng = random.Random(seed)

    # (N_range, M_range)  N,M 闭区间
    dim_map = {
        "tiny":             ((2, 8),    (2, 10)),   # 刻意避开样例 N=5
        "tiny_plus":        ((9, 20),   (2, 10)),
        "small":            ((100, 150), (2, 100)),
        "small_mid":        ((200, 280), (2, 100)),
        "quarter":          ((300, 400), (2, 100)),
        "medium":           ((450, 550), (2, 100)),
        "three_quarter":    ((700, 800), (2, 100)),
        "boundary":         ((1000, 1000), (99, 99)),
        "extreme":          ((1000, 1000), (98, 98)),
        "special_all_min":  ((1, 1),    (2, 2)),
        "special_all_max":  ((1000, 1000), (100, 100)),
        "special_single":   ((1, 1),    (3, 3)),
    }

    if dimension not in dim_map:
        raise ValueError(f"Unknown dimension: {dimension}")

    n_range, m_range = dim_map[dimension]

    # 生成 N
    if dimension == "tiny":
        # 排除 5，保证与样例字节不同
        candidates = [x for x in range(n_range[0], n_range[1] + 1) if x != 5]
        n = rng.choice(candidates)
    elif n_range[0] == n_range[1]:
        n = n_range[0]
    else:
        n = rng.randint(n_range[0], n_range[1])

    # 生成 M
    if m_range[0] == m_range[1]:
        m = m_range[0]
    else:
        m = rng.randint(m_range[0], m_range[1])

    return f"{n}\n{m}\n"
