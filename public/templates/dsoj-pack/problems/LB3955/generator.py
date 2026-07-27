import random

def generate(dimension: str, seed: int = 42) -> str:
    rng = random.Random(seed)

    if dimension == "special_all_min":
        # 原 candidates = [5] 与样例完全相同，改为最小值1以避免 clone
        candidates = [1]
    elif dimension == "special_single":
        candidates = [7]
    elif dimension == "tiny":
        # 必须用 rng 生成且不能与样例相同，避免写死样例原文
        n = rng.randint(1, 20)
        while n == 5:          # 确保不会输出样例值
            n = rng.randint(1, 20)
        candidates = [n]
    elif dimension == "tiny_plus":
        candidates = [11]
    elif dimension == "small":
        candidates = [13, 15]
    elif dimension == "small_mid":
        candidates = [17, 19]
    elif dimension == "quarter":
        candidates = [21, 23, 25]
    elif dimension == "medium":
        candidates = [27, 29, 31]
    elif dimension == "three_quarter":
        candidates = [33, 35, 37]
    elif dimension == "boundary":
        candidates = [39, 41, 43]
    elif dimension == "extreme":
        candidates = [45, 47]
    elif dimension == "special_all_max":
        candidates = [49]
    else:
        raise ValueError(f"Unknown dimension: {dimension}")

    n = rng.choice(candidates)
    return f"{n}\n"
