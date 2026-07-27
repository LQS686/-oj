#include <iostream>
using namespace std;

int main() {
    int n, x, y;
    cin >> n >> x >> y;
    int d;
    if (y % x == 0) {
        // 如果 y 小时刚好够啃完整数本书
        d = y / x;
    } else {
        // 如果 y 小时啃完一些书后还有剩余时间，老鼠会开始啃下一本
        d = y / x + 1;
    }
    cout << n - d << endl;
    return 0;
}
