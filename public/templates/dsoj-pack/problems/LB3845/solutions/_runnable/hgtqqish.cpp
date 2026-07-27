#include <iostream>
#include <cmath>

int main() {
	int n, ans = 0; std::cin >> n;
	for (int a = 1; a <= n; ++a)
		for (int b = a; b <= n; ++b) {
			int c = sqrt(a * a + b * b);
			if (c > n || c * c != a * a + b * b) continue;
			++ans;
		}
	std::cout << ans;
	return 0;
}
