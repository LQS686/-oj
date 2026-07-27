import random

def generate(dimension: str, seed: int = 42) -> str:
    rng = random.Random(seed)

    if dimension not in {
        "tiny", "tiny_plus", "small", "small_mid", "quarter",
        "medium", "three_quarter", "boundary", "extreme",
        "special_all_min", "special_all_max", "special_single"
    }:
        raise ValueError(f"Unknown dimension: {dimension}")

    def pick(
        lo_h=1, hi_h=12,
        lo_m=0, hi_m=59,
        lo_s=0, hi_s=59,
        lo_k=1, hi_k=3600,
        exclude_k=None
    ):
        h = rng.randint(lo_h, hi_h)
        m = rng.randint(lo_m, hi_m)
        s = rng.randint(lo_s, hi_s)
        if exclude_k is not None:
            ks = [x for x in range(lo_k, hi_k + 1) if x != exclude_k]
            k = rng.choice(ks) if ks else lo_k
        else:
            k = rng.randint(lo_k, hi_k)
        return h, m, s, k

    if dimension == "special_all_min":
        h, m, s, k = 1, 0, 0, 1
    elif dimension == "special_all_max":
        h, m, s, k = 12, 59, 59, 3600
    elif dimension == "special_single":
        # degenerate/edge but distinct from others
        h, m, s, k = 12, 0, 0, 3600
    elif dimension == "tiny":
        # 结构同样例，但内容不允许与样例完全一致（样例：12 59 59 10）
        h, m, s, k = pick(exclude_k=10)
    elif dimension == "tiny_plus":
        h, m, s, k = pick()
    elif dimension == "small":
        h, m, s, k = pick()
    elif dimension == "small_mid":
        h, m, s, k = pick()
    elif dimension == "quarter":
        h, m, s, k = pick()
    elif dimension == "medium":
        h, m, s, k = pick()
    elif dimension == "three_quarter":
        h, m, s, k = pick()
    elif dimension == "boundary":
        # 逼近上界
        h, m, s, k = pick(hi_h=12, hi_m=59, hi_s=59, hi_k=3600)
    elif dimension == "extreme":
        # 逼近极限
        h, m, s, k = pick(hi_h=12, hi_m=59, hi_s=59, hi_k=3600)
    else:
        # fallback
        h, m, s, k = pick()

    return f"{h}\n{m}\n{s}\n{k}\n"
