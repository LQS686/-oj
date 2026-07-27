import random

def generate(dimension: str, seed: int = 42) -> str:
    rng = random.Random(seed)

    # 两位数的绝对素数：自身素数且反转后仍为素数
    PRIMES = [11, 13, 17, 31, 37, 71, 73, 79, 97]  # 共9个

    def gen_interval(k, force_i=None):
        """生成包含恰好 k 个绝对素数的区间，返回 'A B' 字符串"""
        max_i = len(PRIMES) - k
        if force_i is not None:
            i = force_i
        else:
            if max_i < 0:
                raise ValueError(f"无法生成包含 {k} 个绝对素数的区间")
            i = rng.randint(0, max_i)

        prev_val = PRIMES[i - 1] if i > 0 else 10
        next_val = PRIMES[i + k] if i + k < len(PRIMES) else 100

        A_low = max(11, prev_val + 1)
        A_high = PRIMES[i]
        B_low = PRIMES[i + k - 1]
        B_high = min(99, next_val - 1)

        # 尝试随机选取 A, B，满足 A < B
        for _ in range(100):
            A = rng.randint(A_low, A_high)
            real_B_low = max(A + 1, B_low)
            if real_B_low > B_high:
                continue
            B = rng.randint(real_B_low, B_high)
            return f"{A} {B}"
        # 保底
        A = min(A_high, B_low - 1) if A_low <= B_low - 1 else A_low
        B = max(B_low, A + 1)
        if A < B and B <= B_high:
            return f"{A} {B}"
        # 极端情况直接返回合法端点
        return f"{A_low} {max(A_low + 1, B_low)}"

    if dimension == "tiny":
        # 规模最小，包含2个绝对素数（样例有3个，确保不同）
        result = gen_interval(2)
    elif dimension == "tiny_plus":
        result = gen_interval(3)
    elif dimension == "small":
        result = gen_interval(4)
    elif dimension == "small_mid":
        result = gen_interval(5)
    elif dimension == "quarter":
        result = gen_interval(6)
    elif dimension == "medium":
        result = gen_interval(7)
    elif dimension == "three_quarter":
        result = gen_interval(8)
    elif dimension == "boundary":
        # 包含8个绝对素数，但A贴近下限，B贴近上限
        result = gen_interval(8, force_i=0)
    elif dimension == "extreme":
        # 包含全部9个绝对素数，A尽量小，B尽量大
        result = gen_interval(9, force_i=0)
    elif dimension == "special_all_min":
        # 尽量取下界：包含1个绝对素数且区间尽可能小
        # 固定为 A=11, B=12
        result = "11 12"
        # 也可略微随机，但满足极值语义
    elif dimension == "special_all_max":
        # 尽量取上界，且区间内无绝对素数；唯一解 A=98,B=99
        result = "98 99"
    elif dimension == "special_single":
        # 单元素：恰好包含1个绝对素数，且不取 11（避免与 special_all_min 完全一致）
        i = rng.randint(1, len(PRIMES) - 1)  # 排除素数11
        result = gen_interval(1, force_i=i)
    else:
        raise ValueError(f"Unknown dimension: {dimension}")

    return result + "\n"
