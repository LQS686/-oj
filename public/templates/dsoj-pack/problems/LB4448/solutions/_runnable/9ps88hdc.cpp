#include <iostream>
#include <cmath>

using namespace std;

int main() {
    int h, w, x;
    cin >> h >> w >> x;
    
    int ans = 0;
    
    // 外层循环遍历行号 r，从 1 到 h
    for (int r = 1; r <= h; r++)
        // 内层循环遍历列号 c，从 1 到 w
        for (int c = 1; c <= w; c++) {
            // 计算不等式左边
            double lhs = sqrt(r * r + c * c);
            // 计算不等式右边
            int rhs = x + r - c;
            if (lhs <= rhs) {
                ans++;
            }
        }
    
    cout << ans << endl;
    
    return 0;
}
