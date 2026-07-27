import random

def generate(dimension: str, seed: int = 42) -> str:
    rng = random.Random(seed)
    max_val = 10**6

    if dimension == "tiny":
        while True:
            L = rng.randint(2000, 3000)
            R = L + rng.randint(0, 2)
            if not (L == 2221 and R == 2223):
                break
    elif dimension == "tiny_plus":
        L = rng.randint(1000, 5000)
        R = L + rng.randint(3, 10)
        if R > max_val:
            R = max_val
    elif dimension == "small":
        L = rng.randint(1, 1000)
        R = L + rng.randint(100, 200)
        if R > max_val:
            R = max_val
    elif dimension == "small_mid":
        L = rng.randint(1000, 10000)
        R = L + rng.randint(500, 1500)
        if R > max_val:
            R = max_val
    elif dimension == "quarter":
        L = rng.randint(1, 250000)
        R = L + rng.randint(200000, 250000)
        if R > max_val:
            R = max_val
    elif dimension == "medium":
        L = rng.randint(1, 500000)
        R = L + rng.randint(400000, 500000)
        if R > max_val:
            R = max_val
    elif dimension == "three_quarter":
        L = rng.randint(1, 750000)
        R = L + rng.randint(600000, 700000)
        if R > max_val:
            R = max_val
    elif dimension == "boundary":
        L = rng.randint(990000, 1000000)
        R = min(max_val, L + rng.randint(0, 10000))
    elif dimension == "extreme":
        L = 1
        R = max_val
    elif dimension == "special_all_min":
        L = R = 1
    elif dimension == "special_all_max":
        L = R = max_val
    elif dimension == "special_single":
        L = R = rng.randint(1, max_val)
    else:
        raise ValueError(f"Unknown dimension: {dimension}")

    if L > R:
        L, R = R, L
    if R > max_val:
        R = max_val
    if L < 1:
        L = 1

    return f"{L}\n{R}\n"
