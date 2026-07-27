import random

def generate(dimension: str, seed: int = 42) -> str:
    rng = random.Random(seed)

    # 根据维度确定 T (样例 tiny 的 T=5)
    if dimension == "tiny":
        T = 5
    elif dimension == "tiny_plus":
        T = 6
    elif dimension == "small":
        T = 8
    elif dimension == "small_mid":
        T = 10
    elif dimension == "quarter":
        T = 13
    elif dimension == "medium":
        T = 16
    elif dimension == "three_quarter":
        T = 18
    elif dimension == "boundary":
        T = 20
    elif dimension == "extreme":
        T = 20
    elif dimension == "special_all_min":
        T = 1
    elif dimension == "special_all_max":
        T = 20
    elif dimension == "special_single":
        T = 1
    else:
        raise ValueError(f"Unknown dimension: {dimension}")

    # 生成 P 列表
    if dimension == "special_all_min":
        # 尽量取合法下界：P 全部取 1
        P_list = [1] * T
    elif dimension == "special_all_max":
        # 尽量取合法上界：P 全部取 100
        P_list = [100] * T
    else:
        P_list = [rng.randint(1, 100) for _ in range(T)]

    # 构造输出
    lines = [str(T)] + [str(p) for p in P_list]
    result = "\n".join(lines) + "\n"

    # tiny 维度必须与样例字节级不同
    sample_tiny_str = "5\n10\n1\n20\n99\n19\n"
    if dimension == "tiny" and result == sample_tiny_str:
        # 修改最后一个数字以避免与样例完全相同
        P_list[-1] = 100 if P_list[-1] != 100 else 99
        lines = [str(T)] + [str(p) for p in P_list]
        result = "\n".join(lines) + "\n"

    return result
