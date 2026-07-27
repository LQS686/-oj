#include <bits/stdc++.h>
using namespace std;

int main() {
    int l, r;
    cin >> l >> r;
    int ans = 0;
    for (int n = l; n <= r; ++n) { // 枚举 l~r 的每一个数
        bool flag = false;
        for (int x = 0; (1 << x) <= n; ++x) { // 枚举 x
            int px = 1 << x; // 计算 2 的 x 次方
            for (int y = 0; (1 << y) <= n; ++y) { // 枚举 y
                int py = 1 << y; // 计算 2 的 y 次方
                if (px + py == n) // 判断是否是幂和数
                    flag = true;
            }
        }
        if (flag) ++ans; // 更新答案
    }
    cout << ans << endl;
    return 0;
}
