import random

def generate(dimension: str, seed: int = 42) -> str:
    rng = random.Random(seed)

    def scale_n(lo: int, hi: int) -> int:
        table = {
            "tiny": max(lo, min(hi, 3)),
            "tiny_plus": max(lo, min(hi, 4)),
            "small": max(lo, lo + (hi - lo) // 8 or lo),
            "small_mid": max(lo, lo + (hi - lo) // 4 or lo),
            "quarter": max(lo, lo + (hi - lo) // 3 or lo),
            "medium": max(lo, lo + (hi - lo) // 2 or lo),
            "three_quarter": max(lo, lo + 3 * (hi - lo) // 4 or lo),
            "boundary": hi,
            "extreme": hi,
            "special_all_min": lo,
            "special_all_max": hi,
            "special_single": max(lo, min(hi, 1)),
        }
        if dimension not in table:
            raise ValueError(f"Unknown dimension: {dimension}")
        return table[dimension]

    n = scale_n(0, 10000)
    MAX_COORD = 100000
    MAX_LEN = 100000
    lines = []
    for _ in range(n):
        a = rng.randint(0, MAX_COORD)
        b = rng.randint(0, MAX_COORD)
        g = rng.randint(0, MAX_LEN)
        k = rng.randint(0, MAX_LEN)
        lines.append(f"{a} {b} {g} {k}")
    x = rng.randint(0, MAX_COORD + MAX_LEN)
    y = rng.randint(0, MAX_COORD + MAX_LEN)

    out = f"{n}\n"
    for line in lines:
        out += line + "\n"
    out += f"{x} {y}\n"

    SAMPLE = "3\n1 0 2 3\n0 2 3 3\n2 1 3 3\n2 2\n"
    if dimension == "tiny" and out == SAMPLE:
        x = (x + 1) % (MAX_COORD + MAX_LEN + 1)
        y = (y + 1) % (MAX_COORD + MAX_LEN + 1)
        out = f"{n}\n"
        for line in lines:
            out += line + "\n"
        out += f"{x} {y}\n"

    return out
