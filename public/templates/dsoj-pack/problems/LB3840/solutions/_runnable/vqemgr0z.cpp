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
