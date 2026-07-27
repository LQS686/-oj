import random

def generate(dimension: str, seed: int = 42) -> str:
    rng = random.Random(seed)

    # Map dimension to M (1 <= M <= 100)
    if dimension == "tiny":
        m = 3
    elif dimension == "tiny_plus":
        m = 10
    elif dimension == "small":
        m = 20
    elif dimension == "small_mid":
        m = 30
    elif dimension == "quarter":
        m = 40
    elif dimension == "medium":
        m = 50
    elif dimension == "three_quarter":
        m = 75
    elif dimension == "boundary":
        m = 100
    elif dimension == "extreme":
        m = 100
    elif dimension == "special_all_min":
        m = 1
    elif dimension == "special_all_max":
        m = 100
    elif dimension == "special_single":
        m = 1
    else:
        raise ValueError(f"Unknown dimension: {dimension}")

    # Generate M positive integers strictly less than 10^8
    values = [rng.randint(1, 99_999_999) for _ in range(m)]

    lines = [str(m)] + [str(v) for v in values]
    return "\n".join(lines) + "\n"
