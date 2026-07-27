#include <iostream>
using namespace std;

int main() {
    int n, k, t;
    cin >> n >> k >> t;
    int max_read = k * t; // 计算假期中的总阅读量上限
    if (max_read > n) max_read = n; // 和书本的总页数取较小值
    else max_read = max_read;
    cout << max_read << endl; // 输出答案
    return 0;
}
