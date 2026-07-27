import random

def generate(dimension: str, seed: int = 42) -> str:
    rng = random.Random(seed)

    if dimension == "tiny":
        m = rng.randint(95, 105)
        while m == 100:
            m = rng.randint(95, 105)
        return f"{m}\n"
    elif dimension == "tiny_plus":
        m = rng.randint(106, 120)
        return f"{m}\n"
    elif dimension == "small":
        m = rng.randint(10, 30)
        return f"{m}\n"
    elif dimension == "small_mid":
        m = rng.randint(31, 60)
        return f"{m}\n"
    elif dimension == "quarter":
        m = rng.randint(45, 55)
        return f"{m}\n"
    elif dimension == "medium":
        m = rng.randint(85, 115)
        while m == 100:
            m = rng.randint(85, 115)
        return f"{m}\n"
    elif dimension == "three_quarter":
        m = rng.randint(140, 170)
        return f"{m}\n"
    elif dimension == "boundary":
        m = rng.randint(197, 198)
        return f"{m}\n"
    elif dimension == "extreme":
        m = rng.randint(195, 196)
        return f"{m}\n"
    elif dimension == "special_all_min":
        return "1\n"
    elif dimension == "special_all_max":
        return "199\n"
    elif dimension == "special_single":
        return "13\n"
    else:
        raise ValueError(f"Unknown dimension: {dimension}")
