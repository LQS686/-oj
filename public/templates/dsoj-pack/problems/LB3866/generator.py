import random

def generate(dimension: str, seed: int = 42) -> str:
    rng = random.Random(seed)

    def is_valid(n: int) -> bool:
        return 100 <= n <= 999 and len(set(str(n))) == 3

    def pick(low: int, high: int, forbidden: int = -1) -> int:
        while True:
            n = rng.randint(low, high)
            if is_valid(n) and n != forbidden:
                return n

    if dimension == "special_all_min":
        num = 102
    elif dimension == "special_all_max":
        num = 987
    elif dimension == "special_single":
        num = 495
    elif dimension == "tiny":
        # 接近 352 但不同
        num = pick(350, 355, forbidden=352)
    elif dimension == "tiny_plus":
        num = pick(400, 450)
    elif dimension == "small":
        num = pick(200, 280)
    elif dimension == "small_mid":
        num = pick(500, 550)
    elif dimension == "quarter":
        num = pick(600, 650)
    elif dimension == "medium":
        num = pick(700, 750)
    elif dimension == "three_quarter":
        num = pick(800, 850)
    elif dimension == "boundary":
        num = pick(980, 986)
    elif dimension == "extreme":
        num = pick(970, 979)
    else:
        raise ValueError(f"Unknown dimension: {dimension}")

    return f"{num}\n"
