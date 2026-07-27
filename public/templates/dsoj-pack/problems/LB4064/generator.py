import random

def generate(dimension: str, seed: int = 42) -> str:
    rng = random.Random(seed)

    def gen_rand(n, lo=1, hi=10**8):
        return [rng.randint(lo, hi) for _ in range(n)]

    # 根据维度确定 t 和值生成方式
    if dimension == "tiny":
        t = 3
        # 避开样例 (16,81,10)，生成一组随机数即可（概率极高）
        values = gen_rand(t)
        # 兜底：如果极巧合与样例相同，再生成一次
        while values == [16, 81, 10]:
            values = gen_rand(t)
    elif dimension == "tiny_plus":
        t = 5
        values = gen_rand(t)
    elif dimension == "small":
        t = 10
        values = gen_rand(t)
    elif dimension == "small_mid":
        t = 100
        values = gen_rand(t)
    elif dimension == "quarter":
        t = 25000
        values = gen_rand(t)
    elif dimension == "medium":
        t = 50000
        values = gen_rand(t)
    elif dimension == "three_quarter":
        t = 75000
        values = gen_rand(t)
    elif dimension == "boundary":
        t = 100000
        values = gen_rand(t)
    elif dimension == "extreme":
        t = 100000
        values = gen_rand(t)
    elif dimension == "special_all_min":
        t = 1
        values = [1]
    elif dimension == "special_all_max":
        t = 100000
        values = [10**8] * t
    elif dimension == "special_single":
        t = 1
        values = gen_rand(t)
    else:
        raise ValueError(f"Unknown dimension: {dimension}")

    # 确保声明的数量与实际一致
    assert len(values) == t, "actual data count does not match declared t"

    out = str(t) + "\n" + "\n".join(map(str, values)) + "\n"
    return out
