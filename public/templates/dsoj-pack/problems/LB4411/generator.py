import random

def generate(dimension: str, seed: int = 42) -> str:
    rng = random.Random(seed)

    if dimension == "tiny":
        # 与样例结构一致但不能字节级相同（样例是6），同时避免与 special 维度冲突
        candidates = [3, 4, 5, 7, 8, 9, 10]
        n = rng.choice(candidates)
    elif dimension == "tiny_plus":
        n = rng.randint(11, 30)
    elif dimension == "small":
        n = rng.randint(31, 200)
    elif dimension == "small_mid":
        n = rng.randint(250, 500)
    elif dimension == "quarter":
        n = rng.randint(600, 800)
    elif dimension == "medium":
        n = rng.randint(1000, 1300)
    elif dimension == "three_quarter":
        n = rng.randint(1500, 1800)
    elif dimension == "boundary":
        n = rng.randint(2024, 2024)  # 逼近上限，但与 special_all_max 区分
    elif dimension == "extreme":
        n = rng.randint(2023, 2023)  # 逼近上限
    elif dimension == "special_all_min":
        n = rng.randint(1, 1)        # 合法下界
    elif dimension == "special_all_max":
        n = rng.randint(2025, 2025)  # 合法上界
    elif dimension == "special_single":
        n = rng.randint(2, 2)        # 单元素情况，与 all_min 区分
    else:
        raise ValueError(f"Unknown dimension: {dimension}")

    # 保证 n 在题目数据范围内（设计上已满足，兜底用）
    n = max(1, min(2025, n))
    return f"{n}\n"
