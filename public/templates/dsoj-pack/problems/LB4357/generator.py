import random

def generate(dimension: str, seed: int = 42) -> str:
    rng = random.Random(seed)

    if dimension == 'special_all_min':
        return "1 1\n"
    elif dimension == 'special_all_max':
        return "10000 10000\n"
    elif dimension == 'special_single':
        x = rng.randint(2, 12)
        return f"{x} {x}\n"
    elif dimension == 'tiny':
        l = rng.randint(1, 5)
        r = rng.randint(max(l, 5), 12)
        # 禁止与样例字节级相同
        if l == 2 and r == 8:
            l = 1
        return f"{l} {r}\n"
    elif dimension == 'tiny_plus':
        l = rng.randint(13, 200)
        r = rng.randint(l, min(l + rng.randint(0, 500), 10000))
        return f"{l} {r}\n"
    elif dimension == 'small':
        l = rng.randint(201, 500)
        r = rng.randint(l, min(l + rng.randint(0, 600), 10000))
        return f"{l} {r}\n"
    elif dimension == 'small_mid':
        l = rng.randint(501, 2000)
        r = rng.randint(l, min(l + rng.randint(0, 800), 10000))
        return f"{l} {r}\n"
    elif dimension == 'quarter':
        l = rng.randint(2001, 4000)
        r = rng.randint(l, min(l + rng.randint(0, 1000), 10000))
        return f"{l} {r}\n"
    elif dimension == 'medium':
        l = rng.randint(4001, 7000)
        r = rng.randint(l, min(l + rng.randint(0, 2000), 10000))
        return f"{l} {r}\n"
    elif dimension == 'three_quarter':
        l = rng.randint(8001, 9500)
        r = rng.randint(l, min(l + rng.randint(0, 2000), 9998))
        return f"{l} {r}\n"
    elif dimension == 'boundary':
        l = rng.randint(9501, 9999)
        r = rng.randint(l, 9999)
        return f"{l} {r}\n"
    elif dimension == 'extreme':
        l = rng.randint(9995, 9999)
        r = 10000
        return f"{l} {r}\n"
    else:
        raise ValueError(f"Unknown dimension: {dimension}")
