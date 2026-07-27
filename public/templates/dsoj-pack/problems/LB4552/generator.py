import random

def generate(dimension: str, seed: int = 42) -> str:
    rng = random.Random(seed)
    n = 12  # 固定为12个月

    if dimension == "tiny":
        # 混合小值和大值，与样例结构相同但内容不同
        values = []
        for _ in range(n):
            if rng.random() < 0.3:
                v = rng.randint(1, 8000) / 10.0       # 0.1 ~ 800.0
            else:
                v = rng.randint(8001, 40000) / 10.0   # 800.1 ~ 4000.0
            values.append(v)
    elif dimension == "tiny_plus":
        # 整体略向大值偏移
        values = [rng.randint(1000, 30000) / 10.0 for _ in range(n)]
    elif dimension == "small":
        # 大部分不超过800
        values = []
        for _ in range(n):
            if rng.random() < 0.75:
                v = rng.randint(1, 8000) / 10.0
            else:
                v = rng.randint(8001, 15000) / 10.0
            values.append(v)
    elif dimension == "small_mid":
        # 较低到中等
        values = [rng.randint(1, 20000) / 10.0 for _ in range(n)]
    elif dimension == "quarter":
        # 中偏低
        values = [rng.randint(5000, 30000) / 10.0 for _ in range(n)]
    elif dimension == "medium":
        # 中等范围
        values = [rng.randint(10000, 35000) / 10.0 for _ in range(n)]
    elif dimension == "three_quarter":
        # 中偏高
        values = [rng.randint(20000, 40000) / 10.0 for _ in range(n)]
    elif dimension == "boundary":
        # 包含边界值：极小、临界800、极限4000
        candidates = [
            0.1, 800.0, 800.1, 4000.0, 3999.9, 0.2, 800.5, 799.9
        ]
        # 用rng打乱并填充至12个，不足则随机生成附近值
        base = candidates.copy()
        rng.shuffle(base)
        values = base[:n]
        while len(values) < n:
            # 在边界附近生成随机值
            if rng.random() < 0.2:
                v = rng.randint(1, 300) / 10.0           # 很小
            elif rng.random() < 0.5:
                v = rng.randint(7900, 8100) / 10.0       # 800附近
            else:
                v = rng.randint(39000, 40000) / 10.0     # 4000附近
            values.append(v)
    elif dimension == "extreme":
        # 几乎都逼近4000.0
        values = [rng.randint(35000, 40000) / 10.0 for _ in range(n)]
    elif dimension == "special_all_min":
        # 全部取下界 0.1
        values = [0.1] * n
    elif dimension == "special_all_max":
        # 全部取上界 4000.0
        values = [4000.0] * n
    elif dimension == "special_single":
        # 所有值相同，取一个普通值
        single_val = rng.randint(8001, 30000) / 10.0
        values = [single_val] * n
    else:
        raise ValueError(f"Unknown dimension: {dimension}")

    # 确保所有值合法：正，一位小数，<=4000.0
    for i, v in enumerate(values):
        if v <= 0.0:
            values[i] = 0.1
        if v > 4000.0:
            values[i] = 4000.0

    # 生成输出字符串，每行一个浮点数，保留一位小数，末尾加换行
    out = "\n".join(f"{v:.1f}" for v in values) + "\n"
    # 对于 tiny 维度，确保不与样例字节级相同（样例内容为特定序列）
    if dimension == "tiny" and out == (
        "932.0\n1634.3\n1790.4\n2172.9\n378.1\n283.4\n"
        "2761.9\n3583.5\n10.1\n2324.9\n1111.6\n3812.3\n"
    ):
        # 极罕见情况，重新调用自身并更换种子
        return generate(dimension, seed + 1)
    return out
