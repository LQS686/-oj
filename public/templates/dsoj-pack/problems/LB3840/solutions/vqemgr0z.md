# B3840 题解

## 思路分析
这道题的重点就在**如何判断一个数是不是质数**。
### 方法1
枚举所有可能为 $x$ 因数的数 $\forall 2\le a\le x-1$，如果 $x\bmod a=0$，那么 $x$ 就是合数；反之，$x$ 就是质数。

可以得出，这样的时间复杂度是 $\mathcal O(n)$，对于本题来说已经足够了，但是还有更快的方法吗？
### 方法2
容易发现，$x=a\times b$，其中 $a\le\sqrt{x},b\ge\sqrt{x}$，那么如果 $x\bmod a=0$，那么我们无需再去查询 $x\bmod b$ 是否为 $0$。根据这个思路，我们无需枚举 $2\sim x-1$，只需枚举 $2\sim\sqrt{x}$ 即可。这样的时间复杂度是 $\mathcal O(\sqrt{n})$ 的。

---
但是对于可能 $x<2$ 的情况，那么 $x$ 就一定不是质数了。
## 代码实现
```cpp
#include <iostream>

bool isPrime(int x) { // 根据方法2判断是否为质数
	if (x < 2) return false;
	for (int i = 2; i * i <= x; ++i)
		if (x % i == 0) return false;
	return true;
}

int main() {
	int A, B, ans = 0; std::cin >> A >> B;
	for (int i = A; i <= B; ++i) {
		if (isPrime(i)) ans++;
	}
	std::cout << ans;
	return 0;
}
```
