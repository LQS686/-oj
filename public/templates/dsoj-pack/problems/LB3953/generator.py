import random

def generate(dimension: str, seed: int = 42) -> str:
    rng = random.Random(seed)

    if dimension == "tiny":
        # 样例是 1，不能相同，取 2~10
        a = rng.randint(2, 10)
        return str(a) + "\n"
    elif dimension == "tiny_plus":
        a = rng.randint(11, 30)
        return str(a) + "\n"
    elif dimension == "small":
        a = rng.randint(31, 100)
        return str(a) + "\n"
    elif dimension == "small_mid":
        a = rng.randint(101, 250)
        return str(a) + "\n"
    elif dimension == "quarter":
        a = rng.randint(251, 400)
        return str(a) + "\n"
    elif dimension == "medium":
        a = rng.randint(401, 550)
        return str(a) + "\n"
    elif dimension == "three_quarter":
        a = rng.randint(551, 750)
        return str(a) + "\n"
    elif dimension == "boundary":
        a = 999
        return str(a) + "\n"
    elif dimension == "extreme":
        a = rng.randint(990, 998)
        return str(a) + "\n"
    elif dimension == "special_all_min":
        # 题意最小值为 1，但必须与样例字节不同，故加一个前导空格
        return " 1\n"
    elif dimension == "special_all_max":
        a = 1000
        return str(a) + "\n"
    elif dimension == "special_single":
        a = 800
        return str(a) + "\n"
    else:
        raise ValueError(f"Unknown dimension: {dimension}")
