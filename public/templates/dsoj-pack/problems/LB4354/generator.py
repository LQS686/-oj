import random

def generate(dimension: str, seed: int = 42) -> str:
    rng = random.Random(seed)
    MAX_VAL = 1000
    MIN_VAL = 1

    if dimension == "tiny":
        n = rng.randint(4, 10)
        k = rng.randint(2, 6)
        t = rng.randint(1, 5)
        # 避免与样例 8 3 2 完全相同
        while n == 8 and k == 3 and t == 2:
            n = rng.randint(4, 10)
            k = rng.randint(2, 6)
            t = rng.randint(1, 5)
    elif dimension == "tiny_plus":
        n = rng.randint(11, 30)
        k = rng.randint(5, 20)
        t = rng.randint(3, 15)
    elif dimension == "small":
        n = rng.randint(31, 100)
        k = rng.randint(10, 80)
        t = rng.randint(10, 50)
    elif dimension == "small_mid":
        n = rng.randint(101, 200)
        k = rng.randint(50, 150)
        t = rng.randint(20, 100)
    elif dimension == "quarter":
        n = rng.randint(201, 333)
        k = rng.randint(100, 250)
        t = rng.randint(50, 200)
    elif dimension == "medium":
        n = rng.randint(334, 500)
        k = rng.randint(200, 400)
        t = rng.randint(100, 300)
    elif dimension == "three_quarter":
        n = rng.randint(501, 750)
        k = rng.randint(300, 600)
        t = rng.randint(200, 500)
    elif dimension == "boundary":
        n = rng.randint(951, MAX_VAL)
        k = rng.randint(951, MAX_VAL)
        t = rng.randint(951, MAX_VAL)
    elif dimension == "extreme":
        n = MAX_VAL
        k = MAX_VAL
        t = MAX_VAL
    elif dimension == "special_all_min":
        n = MIN_VAL
        k = MIN_VAL
        t = MIN_VAL
    elif dimension == "special_all_max":
        # 与 extreme (1000,1000,1000) 区分开
        n = MAX_VAL - 1 if MAX_VAL > 1 else MAX_VAL
        k = MAX_VAL
        t = MAX_VAL
    elif dimension == "special_single":
        # 退化情形：仅 1 页，单日容量极大，假期仅 1 天
        n = 1
        k = MAX_VAL
        t = 1
    else:
        raise ValueError(f"Unknown dimension: {dimension}")

    return f"{n}\n{k}\n{t}\n"
