#include <iostream>
using namespace std;

int main() {
    int n;
    cin >> n;
    int center = n / 2; // 中心点坐标 (从0开始)
    for (int i = 0; i < n; ++i) {
        for (int j = 0; j < n; ++j) {
            if (abs(i - center) + abs(j - center) == n / 2)
                cout << '#';
            else
                cout << '.';
        }
        cout << '\n';
    }
    return 0;
}
