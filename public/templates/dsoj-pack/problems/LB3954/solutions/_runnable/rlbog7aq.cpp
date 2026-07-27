#include <iostream>
using namespace std;

int main() {
    int n;
    cin >> n;
    int prod = 1; // 初始化成什么呢？
    for (int i = 1; i <= n; i++) {
        int a;
        cin >> a;
        prod = prod * a; // 更新乘积
        if (prod > 1000000) { // 如果乘积结果大于 1000000，则直接退出循环
            cout << ">1000000";
            break;
        }
    }
    //如果乘积结果不超过 1000000，则输出结果
    if (prod <= 1000000) {
        cout << prod;
    }
    return 0;
}
