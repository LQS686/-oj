import random

def generate(dimension: str, seed: int = 42) -> str:
    rng = random.Random(seed)

    # Special deterministic cases (must not depend on seed)
    if dimension == "special_all_min":
        x, y, n, p = 2, 1, 1, 1
    elif dimension == "special_all_max":
        x, y, n, p = 100, 99, 9, 100
    elif dimension == "special_single":
        # degenerate/simple case, distinct from special_all_min
        x, y, n, p = 9, 1, 8, 9
    else:
        # parameter ranges depend on dimension
        limits = {
            "tiny":           (2, 10, 1, 20),
            "tiny_plus":      (2, 15, 1, 30),
            "small":          (2, 30, 1, 50),
            "small_mid":      (2, 50, 1, 70),
            "quarter":        (2, 60, 1, 80),
            "medium":         (2, 80, 1, 90),
            "three_quarter":  (2, 90, 1, 95),
            "boundary":       (90, 100, 1, 100),
            "extreme":        (95, 100, 1, 100),
        }
        if dimension not in limits:
            raise ValueError(f"Unknown dimension: {dimension}")

        x_min, x_max, p_min, p_max = limits[dimension]
        # Generate x, ensure y < x, n < 10
        x = rng.randint(x_min, x_max)
        y = rng.randint(1, x - 1)
        n = rng.randint(1, 9)
        p = rng.randint(p_min, p_max)

        # tiny must differ from sample input (8,7,9,10)
        if dimension == "tiny" and x == 8 and y == 7 and n == 9 and p == 10:
            # tweak numbers while respecting constraints
            if x < 10:
                x += 1
            else:
                x -= 1
            # adjust y if necessary
            if y >= x:
                y = 1
            # ensure n != 9 or change p
            n = 8 if n == 9 else 9
            p = 11 if p == 10 else 10

    return f"{x}\n{y}\n{n}\n{p}\n"
