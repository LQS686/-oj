import random

def generate(dimension: str, seed: int = 42) -> str:
    rng = random.Random(seed)

    if dimension == "special_all_min":
        k, L, R = 2, 1, 1
    elif dimension == "special_all_max":
        k, L, R = 9, 1000, 1000
    elif dimension == "special_single":
        L = rng.randint(1, 1000)
        R = L
        k = rng.randint(2, 9)
    elif dimension == "tiny":
        # 接近样例，但避免与 (7, 1, 10) 完全相同
        while True:
            k = rng.randint(2, 9)
            L = rng.randint(1, 3)
            R = rng.randint(max(L, 5), 15)
            if not (k == 7 and L == 1 and R == 10):
                break
    elif dimension == "tiny_plus":
        k = rng.randint(2, 9)
        L = rng.randint(1, 10)
        R = rng.randint(L, min(L + 15, 1000))
    elif dimension == "small":
        k = rng.randint(2, 9)
        L = rng.randint(1, 50)
        R = rng.randint(L, min(L + 30, 1000))
    elif dimension == "small_mid":
        k = rng.randint(2, 9)
        L = rng.randint(1, 200)
        R = rng.randint(L, min(L + 100, 1000))
    elif dimension == "quarter":
        k = rng.randint(2, 9)
        L = rng.randint(10, 300)
        R = rng.randint(L, min(L + 250, 1000))
    elif dimension == "medium":
        k = rng.randint(2, 9)
        L = rng.randint(50, 500)
        R = rng.randint(L, min(L + 450, 1000))
    elif dimension == "three_quarter":
        k = rng.randint(2, 9)
        L = rng.randint(100, 750)
        R = rng.randint(L, min(L + 650, 1000))
    elif dimension == "boundary":
        k = rng.randint(2, 9)
        if rng.random() < 0.5:
            L = rng.randint(990, 1000)
        else:
            L = rng.randint(1, 10)
        R = rng.randint(max(L, 990), 1000)
    elif dimension == "extreme":
        choices = [
            (rng.randint(2, 9), 1, 1000),
            (rng.randint(2, 9), 1000, 1000),
            (rng.randint(2, 9), 1, 999),
        ]
        k, L, R = rng.choice(choices)
    else:
        raise ValueError(f"Unknown dimension: {dimension}")

    # 安全性检查
    if not (2 <= k <= 9 and 1 <= L <= R <= 1000):
        raise RuntimeError("Generated values out of allowed range")
    return f"{k}\n{L}\n{R}\n"
