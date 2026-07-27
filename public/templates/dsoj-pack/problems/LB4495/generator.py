import random

def generate(dimension: str, seed: int = 42) -> str:
    rng = random.Random(seed)
    lo, hi = 100, 199
    all_heights = list(range(lo, hi + 1))

    # Deal with each dimension
    if dimension == "special_all_min":
        heights = all_heights[:4]  # 100,101,102,103
    elif dimension == "special_all_max":
        heights = all_heights[-4:]  # 196,197,198,199
    elif dimension == "special_single":
        heights = [lo, lo+1, lo+2, hi]  # 100,101,102,199
    elif dimension in {
        "tiny", "tiny_plus", "small", "small_mid",
        "quarter", "medium", "three_quarter", "boundary", "extreme"
    }:
        # The exact values are drawn randomly, but must differ from the sample for tiny.
        sample_heights = [150, 165, 135, 133]  # the sample we must avoid byte‑identical output
        while True:
            heights = rng.sample(all_heights, 4)
            if dimension != "tiny":
                break
            # tiny: must not equal sample_heights
            if heights != sample_heights:
                break
            # else try again (extremely unlikely loop)
    else:
        raise ValueError(f"Unknown dimension: {dimension}")

    # Ensure the output exactly matches the required pattern: 4 lines with one integer each
    result = "\n".join(str(h) for h in heights) + "\n"
    return result
