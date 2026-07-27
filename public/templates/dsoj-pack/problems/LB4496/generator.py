import random

def generate(dimension: str, seed: int = 42) -> str:
    rng = random.Random(seed)
    lo, hi = 0, 10**8

    def get_A() -> int:
        if dimension == "tiny":
            # 与样例规模等同，但不能是样例自身的 8459045
            while True:
                val = rng.randint(1_000_000, 9_999_999)
                if val != 8459045:
                    return val
        elif dimension == "tiny_plus":
            return rng.randint(5_000_000, 20_000_000)
        elif dimension == "small":
            return rng.randint(0, 100)
        elif dimension == "small_mid":
            return rng.randint(1000, 10000)
        elif dimension == "quarter":
            return rng.randint(hi // 4, hi // 4 + 10000)
        elif dimension == "medium":
            return rng.randint(hi // 2, hi // 2 + 10000)
        elif dimension == "three_quarter":
            return rng.randint(3 * hi // 4, 3 * hi // 4 + 10000)
        elif dimension == "boundary":
            return hi - 1
        elif dimension == "extreme":
            return hi - 2
        elif dimension == "special_all_min":
            return lo
        elif dimension == "special_all_max":
            return hi
        elif dimension == "special_single":
            return 1
        else:
            raise ValueError(f"Unknown dimension: {dimension}")

    A = get_A()
    return f"{A}\n"
