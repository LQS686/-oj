#include <iostream>
using namespace std;

int main() {
    int n;
    cin >> n;
    int m = 2 * n - 1; // 图形的行列数
    for (int i = 1; i <= m; i++) { // 行数 i
        int p; // 计算这一行按上半部分来看是第几行
        if (i <= n) {
            p = i;
        } else {
            p = m - i + 1;
        }
        int l = n - p + 1; // 左边加号的位置
        int r = n + p - 1; // 右边加号的位置
        for (int j = 1; j <= m; j++) { // 列数 j
            if (j == l || j == r) { // 如果等于这两个位置之一
                cout << "+";
            } else {
                cout << ".";
            }
        }
        cout << endl;
    }
    return 0;
}
