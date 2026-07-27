import random

def generate(dimension: str, seed: int = 42) -> str:
    rng = random.Random(seed)

    if dimension == "tiny":
        n = rng.choice([4, 6])
    elif dimension == "tiny_plus":
        n = rng.randint(7, 10)
    elif dimension == "small":
        n = rng.randint(20, 50)
    elif dimension == "small_mid":
        n = rng.randint(100, 200)
    elif dimension == "quarter":
        n = rng.randint(250, 350)
    elif dimension == "medium":
        n = rng.randint(495, 505)
    elif dimension == "three_quarter":
        n = rng.randint(745, 755)
    elif dimension == "boundary":
        n = rng.randint(990, 998)
    elif dimension == "extreme":
        n = 1000
    elif dimension == "special_all_min":
        n = 1
    elif dimension == "special_all_max":
        n = 999
    elif dimension == "special_single":
        n = rng.randint(2, 3)
    else:
        raise ValueError(f"Unknown dimension: {dimension}")

    return f"{n}\n"
