#include <iostream>
#include <cmath>
using namespace std;

int main() {
    int n;
    cin >> n;
    int x = (int)round(pow(n, 1.0 / 3)); // 计算 x 的立方根
    if (x * x * x == n) // 根据上述文字说明判断
        cout << "Yes";
    else
        cout << "No";
    return 0;
}
