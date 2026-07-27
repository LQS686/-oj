import random

def generate(dimension: str, seed: int = 42) -> str:
    rng = random.Random(seed)

    t_map = {
        "tiny": 3,
        "tiny_plus": 5,
        "small": 10,
        "small_mid": 25,
        "quarter": 50,
        "medium": 70,
        "three_quarter": 85,
        "boundary": 100,
        "extreme": 100,
        "special_all_min": 1,
        "special_all_max": 100,
        "special_single": 1,
    }
    if dimension not in t_map:
        raise ValueError(f"Unknown dimension: {dimension}")
    t = t_map[dimension]

    max_n_x_map = {
        "tiny": 10,
        "tiny_plus": 20,
        "small": 50,
        "small_mid": 200,
        "quarter": 400,
        "medium": 600,
        "three_quarter": 800,
        "boundary": 1000,
        "extreme": 1000,
        "special_all_min": 1,
        "special_all_max": 1000,
        "special_single": 1000,
    }
    max_val = max_n_x_map[dimension]

    out_lines = [str(t)]

    for i in range(t):
        if dimension == "special_all_min":
            n, x = 1, 1
        elif dimension == "special_all_max":
            n, x = 1000, 1000
        else:
            n = rng.randint(1, max_val)
            x = rng.randint(1, max_val)
            if dimension == "tiny":
                # 保证不与样例完全相同
                for _ in range(200):
                    if (i == 0 and n == 5 and x == 2) or \
                       (i == 1 and n == 10 and x == 3) or \
                       (i == 2 and n == 2 and x == 5):
                        n = rng.randint(1, max_val)
                        x = rng.randint(1, max_val)
                    else:
                        break
        out_lines.append(str(n))
        out_lines.append(str(x))

    return "\n".join(out_lines) + "\n"
