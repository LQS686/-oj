#include <iostream>
using namespace std;

int main() {
    int X, Y, Z, Q;
    cin >> X >> Y >> Z >> Q;
    int sum = 2 * X + 5 * Y + 3 * Z; // 计算总花费
    if (sum <= Q) //判断总花费 sum 是否小于等于小明的钱数 Q
    {
        cout << "Yes" << endl;
        cout << Q - sum; //输出剩余钱数
    }
    else
    {
        cout << "No" << endl;
        cout << sum - Q; //输出缺少的钱数
    }
    return 0;
}
