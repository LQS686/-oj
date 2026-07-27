import random

def generate(dimension: str, seed: int = 42) -> str:
    rng = random.Random(seed)

    if dimension == "special_all_min":
        n = 3
    elif dimension == "special_single":
        n = 4
    elif dimension == "tiny":
        n = 6
    elif dimension == "tiny_plus":
        n = 7
    elif dimension == "small":
        n = rng.randint(8, 15)
    elif dimension == "small_mid":
        n = rng.randint(16, 25)
    elif dimension == "quarter":
        n = rng.randint(26, 35)
    elif dimension == "medium":
        n = rng.randint(36, 55)
    elif dimension == "three_quarter":
        n = rng.randint(56, 75)
    elif dimension == "boundary":
        n = rng.randint(76, 95)
    elif dimension == "extreme":
        n = rng.randint(96, 99)
    elif dimension == "special_all_max":
        n = 100
    else:
        raise ValueError(f"Unknown dimension: {dimension}")

    return f"{n}\n"
