import random

def generate(dimension: str, seed: int = 42) -> str:
    rng = random.Random(seed)

    # Map dimension to (x_lo, x_hi, y_lo, y_hi, z_lo, z_hi, q_lo, q_hi)
    ranges = {
        "tiny":            (1, 3,   1, 3,   1, 3,   5, 30),
        "tiny_plus":       (1, 4,   1, 4,   1, 4,  10, 40),
        "small":           (1, 5,   1, 5,   1, 5,  10, 50),
        "small_mid":       (1, 7,   1, 7,   1, 7,  15, 70),
        "quarter":         (2, 8,   2, 8,   2, 8,  20, 90),
        "medium":          (3, 10,  3, 10,  3, 10, 30, 120),
        "three_quarter":   (5, 10,  5, 10,  5, 10, 40, 160),
        "boundary":        (1, 10,  1, 10,  1, 10,  1, 200),
    }

    if dimension in ranges:
        x_lo, x_hi, y_lo, y_hi, z_lo, z_hi, q_lo, q_hi = ranges[dimension]
        X = rng.randint(x_lo, x_hi)
        Y = rng.randint(y_lo, y_hi)
        Z = rng.randint(z_lo, z_hi)
        Q = rng.randint(q_lo, q_hi)
        # Avoid exact match with sample for tiny
        if dimension == "tiny":
            while (X, Y, Z, Q) == (1, 1, 1, 20):
                X = rng.randint(x_lo, x_hi)
                Y = rng.randint(y_lo, y_hi)
                Z = rng.randint(z_lo, z_hi)
                Q = rng.randint(q_lo, q_hi)
        return f"{X}\n{Y}\n{Z}\n{Q}\n"

    elif dimension == "extreme":
        X = Y = Z = 10
        Q = rng.randint(500, 1000)
        return f"{X}\n{Y}\n{Z}\n{Q}\n"

    elif dimension == "special_all_min":
        X = Y = Z = 1
        Q = rng.randint(1, 5)
        return f"{X}\n{Y}\n{Z}\n{Q}\n"

    elif dimension == "special_all_max":
        X = Y = Z = 10
        Q = rng.randint(150, 300)
        return f"{X}\n{Y}\n{Z}\n{Q}\n"

    elif dimension == "special_single":
        s = rng.randint(2, 8)
        X = Y = Z = s
        Q = 10 * s  # exactly enough, balance 0
        return f"{X}\n{Y}\n{Z}\n{Q}\n"

    else:
        raise ValueError(f"Unknown dimension: {dimension}")
