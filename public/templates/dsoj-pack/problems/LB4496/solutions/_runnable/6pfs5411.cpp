#include <iostream>
using namespace std;

int main() {
    int A;
    cin >> A;
    
    int B = 0, w = 1;
    while (A > 0) {
        int c = A % 10; // 获取最低位
        if (c == 4) c = 8; // 改为 8
        B = B + c * w; // 将修正后的数字与之相乘并累加到结果变量中
        w = w * 10; // 更新位权 w
        A = A / 10; // 继续拆解原数字
    }
    cout << B << endl;
    return 0;
}
