import random

def generate(dimension: str, seed: int = 42) -> str:
    rng = random.Random(seed)

    if dimension == "special_all_min":
        n, m = 1, 1
    elif dimension == "special_all_max":
        n, m = 50, 50
    elif dimension == "special_single":
        if rng.randint(0, 1) == 0:
            n = 1
            m = rng.randint(2, 50)
        else:
            m = 1
            n = rng.randint(2, 50)
    elif dimension == "tiny":
        while True:
            n = rng.randint(2, 4)
            m = rng.randint(2, 4)
            if (n, m) != (3, 4):
                break
    elif dimension == "tiny_plus":
        n = rng.randint(5, 6)
        m = rng.randint(5, 6)
    elif dimension == "small":
        n = rng.randint(7, 10)
        m = rng.randint(7, 10)
    elif dimension == "small_mid":
        n = rng.randint(11, 16)
        m = rng.randint(11, 16)
    elif dimension == "quarter":
        n = rng.randint(17, 24)
        m = rng.randint(17, 24)
    elif dimension == "medium":
        n = rng.randint(25, 32)
        m = rng.randint(25, 32)
    elif dimension == "three_quarter":
        n = rng.randint(33, 45)
        m = rng.randint(33, 45)
    elif dimension == "boundary":
        if rng.randint(0, 1) == 0:
            n = 50
            m = rng.randint(46, 49)
        else:
            m = 50
            n = rng.randint(46, 49)
    elif dimension == "extreme":
        if rng.randint(0, 1) == 0:
            n = 50
            m = 1
        else:
            m = 50
            n = 1
    else:
        raise ValueError(f"Unknown dimension: {dimension}")

    return f"{n} {m}\n"
