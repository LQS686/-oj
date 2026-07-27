import random

def generate(dimension: str, seed: int = 42) -> str:
    rng = random.Random(seed)

    year_lo, year_hi = 2000, 3000
    month_lo, month_hi = 1, 12

    # 默认随机生成年月
    year = rng.randint(year_lo, year_hi)
    month = rng.randint(month_lo, month_hi)

    # 特殊维度处理
    if dimension == "special_all_min":
        year = year_lo
        month = month_lo
    elif dimension == "special_all_max":
        year = year_hi
        month = month_hi
    elif dimension == "special_single":
        # 退化情形：固定为2月（天数特殊），年份随机但保证不同
        year = rng.randint(year_lo, year_hi)
        month = 2
    elif dimension == "boundary":
        # 在边界附近取值
        if rng.choice([True, False]):  # 随机选择边界年或边界月
            year = rng.choice([year_lo, year_hi])
            month = rng.randint(month_lo, month_hi)
        else:
            year = rng.randint(year_lo, year_hi)
            month = rng.choice([month_lo, month_hi])
    elif dimension == "extreme":
        # 极端情况：闰年2月（天数最少）、大月等
        coin = rng.randint(0, 2)
        if coin == 0:
            # 闰年2月，选择能被400整除或能被4整除但不能被100整除的年份
            leap_years = [y for y in [2000, 2400, 2800] if year_lo <= y <= year_hi]
            if not leap_years:
                leap_years = [y for y in range(year_lo, year_hi + 1) if (y % 400 == 0 or (y % 4 == 0 and y % 100 != 0))]
            year = rng.choice(leap_years)
            month = 2
        elif coin == 1:
            # 平年2月
            non_leap = [y for y in [2100, 2200, 2300, 2500, 2600, 2700, 2900, 3000] if year_lo <= y <= year_hi]
            if not non_leap:
                non_leap = [y for y in range(year_lo, year_hi + 1) if not (y % 400 == 0 or (y % 4 == 0 and y % 100 != 0))]
            year = rng.choice(non_leap)
            month = 2
        else:
            # 大月31天（1,3,5,7,8,10,12）或小月30天
            year = rng.randint(year_lo, year_hi)
            month = rng.choice([1, 3, 5, 7, 8, 10, 12])  # 大月
    elif dimension == "tiny":
        # 确保不与样例"2022 1"相同
        while (year, month) == (2022, 1):
            year = rng.randint(year_lo, year_hi)
            month = rng.randint(month_lo, month_hi)
    # 其他维度（tiny_plus, small, small_mid, quarter, medium, three_quarter）保持随机

    return f"{year} {month}\n"
