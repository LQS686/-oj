import random

def generate(dimension: str, seed: int = 42) -> str:
    rng = random.Random(seed)

    if dimension == "tiny":
        B = rng.randint(9, 15)
        A = rng.randint(2, B)
        while A == 2 and B == 10:
            B = rng.randint(9, 15)
            A = rng.randint(2, B)
    elif dimension == "tiny_plus":
        B = rng.randint(30, 60)
        A = rng.randint(2, B)
    elif dimension == "small":
        B = rng.randint(100, 250)
        A = rng.randint(2, B)
    elif dimension == "small_mid":
        B = rng.randint(300, 500)
        A = rng.randint(2, B)
    elif dimension == "quarter":
        B = rng.randint(500, 700)
        A = rng.randint(2, B)
    elif dimension == "medium":
        B = rng.randint(700, 850)
        A = rng.randint(2, B)
    elif dimension == "three_quarter":
        B = rng.randint(850, 950)
        A = rng.randint(2, B)
    elif dimension == "boundary":
        A = 2
        B = 1000
    elif dimension == "extreme":
        A = rng.randint(900, 1000)
        B = rng.randint(A, 1000)
    elif dimension == "special_all_min":
        A = 2
        B = 2
    elif dimension == "special_all_max":
        A = 1000
        B = 1000
    elif dimension == "special_single":
        val = rng.randint(2, 1000)
        A = val
        B = val
    else:
        raise ValueError(f"Unknown dimension: {dimension}")

    return f"{A} {B}\n"
