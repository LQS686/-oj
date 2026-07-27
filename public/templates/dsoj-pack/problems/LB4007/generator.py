import random

def generate(dimension: str, seed: int = 42) -> str:
    rng = random.Random(seed)
    lo, hi = 1, 1000

    if dimension == "tiny":
        n = 25
        # k must not be 2 to avoid byte-identical with the sample input
        k_candidates = [1, 3, 4, 5, 6, 7, 8, 9]
        k = rng.choice(k_candidates)
    elif dimension == "tiny_plus":
        n = rng.randint(26, 60)
        k = rng.randint(1, 9)
    elif dimension == "small":
        n = rng.randint(61, 150)
        k = rng.randint(1, 9)
    elif dimension == "small_mid":
        n = rng.randint(200, 300)
        k = rng.randint(1, 9)
    elif dimension == "quarter":
        n = rng.randint(300, 400)
        k = rng.randint(1, 9)
    elif dimension == "medium":
        n = rng.randint(450, 550)
        k = rng.randint(1, 9)
    elif dimension == "three_quarter":
        n = rng.randint(700, 800)
        k = rng.randint(1, 9)
    elif dimension == "boundary":
        # pick very small or very large n to stress boundaries
        n = rng.choice([1, 2, 999, 1000])
        k = rng.randint(1, 9)
    elif dimension == "extreme":
        # n at maximum, but avoid exactly (1000, 9) to differ from special_all_max
        n = hi
        k = rng.randint(1, 8)
    elif dimension == "special_all_min":
        n = lo
        k = 1
    elif dimension == "special_all_max":
        n = hi
        k = 9
    elif dimension == "special_single":
        n = lo
        k = rng.randint(1, 9)
    else:
        raise ValueError(f"Unknown dimension: {dimension}")

    return f"{n}\n{k}\n"
