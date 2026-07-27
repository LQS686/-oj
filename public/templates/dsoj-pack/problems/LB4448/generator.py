import random

def generate(dimension: str, seed: int = 42) -> str:
    rng = random.Random(seed)

    def get_params():
        if dimension == "tiny":
            while True:
                H = rng.randint(3, 5)
                W = rng.randint(3, 5)
                x = rng.randint(1, 4)
                if (H, W, x) != (4, 4, 2):
                    return H, W, x
        elif dimension == "tiny_plus":
            H = rng.randint(5, 7)
            W = rng.randint(5, 7)
            x = rng.randint(3, 6)
            return H, W, x
        elif dimension == "small":
            H = rng.randint(10, 20)
            W = rng.randint(10, 20)
            x = rng.randint(5, 20)
            return H, W, x
        elif dimension == "small_mid":
            H = rng.randint(30, 50)
            W = rng.randint(30, 50)
            x = rng.randint(20, 50)
            return H, W, x
        elif dimension == "quarter":
            H = rng.randint(100, 150)
            W = rng.randint(100, 150)
            x = rng.randint(80, 150)
            return H, W, x
        elif dimension == "medium":
            H = rng.randint(250, 350)
            W = rng.randint(250, 350)
            x = rng.randint(200, 350)
            return H, W, x
        elif dimension == "three_quarter":
            H = rng.randint(600, 750)
            W = rng.randint(600, 750)
            x = rng.randint(500, 750)
            return H, W, x
        elif dimension == "boundary":
            return (1000, 1000, 999)
        elif dimension == "extreme":
            return (1000, 999, 1000)
        elif dimension == "special_all_min":
            return (1, 1, 1)
        elif dimension == "special_all_max":
            return (1000, 1000, 1000)
        elif dimension == "special_single":
            return (1, 1, 2)
        else:
            raise ValueError(f"Unknown dimension: {dimension}")

    H, W, x = get_params()
    return f"{H}\n{W}\n{x}\n"
