#include <bits/stdc++.h>

int n;

int main() {
    std::cin >> n;
    for (int i = 0; i < n; ++i) { // 遍历每一行
        for (int j = 0; j < n; ++j) { // 遍历每一列
            std::cout << (char)((i + j) % 26 + 'A'); // 不要忘记要加上 'A'
        }
        std::cout << std::endl;
    }
    return 0;
}
