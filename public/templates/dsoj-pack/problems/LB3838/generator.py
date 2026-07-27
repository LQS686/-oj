import random

def generate(dimension: str, seed: int = 42) -> str:
    rng = random.Random(seed ^ hash(dimension))

    def gen_time_pair(delta_lo: int, delta_hi: int):
        """随机生成一对合法的 (sh, sm, eh, em)，满足 delta_lo <= end-start <= delta_hi"""
        max_start = 24 * 60 - 1 - delta_lo
        if max_start < 0:
            max_start = 0
        start = rng.randint(0, max_start)
        max_delta = min(delta_hi, 24 * 60 - 1 - start)
        if max_delta < delta_lo:
            delta = delta_lo
        else:
            delta = rng.randint(delta_lo, max_delta)
        end = start + delta
        sh, sm = divmod(start, 60)
        eh, em = divmod(end, 60)
        return sh, sm, eh, em

    if dimension == "tiny":
        # 接近样例 (9,5,9,6) 但不相同，相差 1~3 分钟，开始小时 8~10
        while True:
            sh = rng.randint(8, 10)
            sm = rng.randint(0, 59)
            start_min = sh * 60 + sm
            delta = rng.randint(1, 3)
            if start_min + delta > 1439:
                continue
            eh, em = divmod(start_min + delta, 60)
            if (sh, sm, eh, em) == (9, 5, 9, 6):
                continue
            break
    elif dimension == "tiny_plus":
        sh, sm, eh, em = gen_time_pair(5, 25)
    elif dimension == "small":
        sh, sm, eh, em = gen_time_pair(20, 90)
    elif dimension == "small_mid":
        sh, sm, eh, em = gen_time_pair(90, 240)
    elif dimension == "quarter":
        sh, sm, eh, em = gen_time_pair(240, 480)
    elif dimension == "medium":
        sh, sm, eh, em = gen_time_pair(480, 720)
    elif dimension == "three_quarter":
        sh, sm, eh, em = gen_time_pair(720, 1200)
    elif dimension == "boundary":
        # 边界：最大跨度
        sh, sm, eh, em = 0, 0, 23, 59
    elif dimension == "extreme":
        # 极端：最小跨度靠边界
        sh, sm, eh, em = 23, 58, 23, 59
    elif dimension == "special_all_min":
        # 尽量取下界
        sh, sm, eh, em = 0, 0, 0, 1
    elif dimension == "special_all_max":
        # 尽量取上界且合法，与 extreme 不同
        sh, sm, eh, em = 23, 57, 23, 59
    elif dimension == "special_single":
        # 退化情形：单一小时差 1 分钟
        sh, sm, eh, em = 12, 30, 12, 31
    else:
        raise ValueError(f"Unknown dimension: {dimension}")

    return f"{sh}\n{sm}\n{eh}\n{em}\n"
