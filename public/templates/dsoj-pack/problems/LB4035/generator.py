import random

def generate(dimension: str, seed: int = 42) -> str:
    rng = random.Random(seed)

    n_mapping = {
        "tiny": 3,
        "tiny_plus": 5,
        "small": 10,
        "small_mid": 100,
        "quarter": 25000,
        "medium": 50000,
        "three_quarter": 75000,
        "boundary": 100000,
        "extreme": 100000,
        "special_all_min": 1,
        "special_all_max": 100000,
        "special_single": 1,
    }
    if dimension not in n_mapping:
        raise ValueError(f"Unknown dimension: {dimension}")
    n = n_mapping[dimension]

    lo_a, hi_a = 1, 100000

    if dimension == "special_all_min":
        values = [lo_a] * n
    elif dimension == "special_all_max":
        values = [hi_a] * n
    else:
        values = [rng.randint(lo_a, hi_a) for _ in range(n)]
        if dimension == "tiny":
            serialized = f"{n}\n" + " ".join(map(str, values)) + "\n"
            while serialized == "3\n1 9 72\n":
                values = [rng.randint(lo_a, hi_a) for _ in range(n)]
                serialized = f"{n}\n" + " ".join(map(str, values)) + "\n"

    return f"{n}\n" + " ".join(map(str, values)) + "\n"
