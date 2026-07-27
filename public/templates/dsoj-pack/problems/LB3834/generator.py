import random

def generate(dimension: str, seed: int = 42) -> str:
    rng = random.Random(seed)

    if dimension == "special_all_min":
        A = 2
    elif dimension == "special_all_max":
        A = 998
    elif dimension == "boundary":
        A = 999
    elif dimension == "extreme":
        A = 1000
    elif dimension == "special_single":
        A = 997  # prime, exactly one rectangle
    elif dimension == "tiny":
        # 样例为 4，此处避开
        A = rng.choice([5, 6])
    elif dimension == "tiny_plus":
        A = rng.randint(7, 10)
    elif dimension == "small":
        A = rng.randint(11, 30)
    elif dimension == "small_mid":
        A = rng.randint(31, 80)
    elif dimension == "quarter":
        A = rng.randint(81, 200)
    elif dimension == "medium":
        A = rng.randint(201, 500)
    elif dimension == "three_quarter":
        A = rng.randint(501, 800)
    else:
        raise ValueError(f"Unknown dimension: {dimension}")

    return f"{A}\n"
