import random

def generate(dimension: str, seed: int = 42) -> str:
    rng = random.Random(seed)
    lo, hi = 1, 1000

    if dimension == "special_all_min":
        n = 1
    elif dimension == "special_single":
        n = 2
    elif dimension == "tiny":
        # 不能与样例的 3 相同
        n = rng.choice([4, 5])
    elif dimension == "tiny_plus":
        n = rng.choice([6, 7, 8])
    elif dimension == "small":
        n = rng.randint(10, 20)
    elif dimension == "small_mid":
        n = rng.randint(30, 60)
    elif dimension == "quarter":
        n = rng.randint(100, 200)
    elif dimension == "medium":
        n = rng.randint(300, 400)
    elif dimension == "three_quarter":
        n = rng.randint(600, 800)
    elif dimension == "boundary":
        n = rng.randint(900, 998)
    elif dimension == "extreme":
        n = 1000
    elif dimension == "special_all_max":
        n = 999
    else:
        raise ValueError(f"Unknown dimension: {dimension}")

    return f"{n}\n"
