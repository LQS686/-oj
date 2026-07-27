#include <iostream>
using namespace std;

int main() {
    int n;
    cin >> n;
    long long ans = 0; // 定义累加变量 ans
    for (int i = 1; i <= n; i++) { // 使用循环
        ans += (long long)i * i; // 计算出这一层需要的石块数量，累加入总和
    }
    cout << ans << endl; // 输出答案
    return 0;
}
