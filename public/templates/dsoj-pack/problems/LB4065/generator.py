import random

def generate(dimension: str, seed: int = 42) -> str:
    rng = random.Random(seed)

    lo_n = 1
    hi_n = 100000

    # Step 1: determine n according to dimension semantics
    if dimension == "tiny":
        n = 3
    elif dimension == "tiny_plus":
        n = 5
    elif dimension == "small":
        n = 10
    elif dimension == "small_mid":
        n = 50
    elif dimension == "quarter":
        n = max(lo_n, hi_n // 4)
    elif dimension == "medium":
        n = max(lo_n, hi_n // 2)
    elif dimension == "three_quarter":
        n = max(lo_n, 3 * hi_n // 4)
    elif dimension == "boundary":
        n = hi_n
    elif dimension == "extreme":
        n = hi_n
    elif dimension == "special_all_min":
        n = lo_n
    elif dimension == "special_all_max":
        n = hi_n
    elif dimension == "special_single":
        n = lo_n
    else:
        raise ValueError(f"Unknown dimension: {dimension}")

    # Step 2: generate data based upon the dimension
    if dimension == "special_all_min":
        values = [1] * n
    elif dimension == "special_all_max":
        # largest integer not exceeding 10^12 with maximum digit sum
        values = [999999999999] * n
    elif dimension == "special_single":
        values = [rng.randint(1, 10**12) for _ in range(n)]
    else:
        values = [rng.randint(1, 10**12) for _ in range(n)]

    # Step 3: format output exactly like the sample
    lines = [str(n)] + [str(v) for v in values] + [""]
    return "\n".join(lines)
