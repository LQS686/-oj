#include <iostream>
using namespace std;

int main() {
    // h1 是 Alice，h2, h3, h4 是其他三个小朋友
    int h1, h2, h3, h4;
    // 读入四个小朋友的身高
    cin >> h1 >> h2 >> h3 >> h4; 
    // --- 计算第 2 个小朋友和 Alice 的差距 d2 ---
    int d2;
    if (h2 > h1) {
        d2 = h2 - h1;
    } else {
        d2 = h1 - h2;
    }
    // 计算第 3 个小朋友和 Alice 的差距 d3，第 4 个小朋友和 Alice 的差距 d4
    // 请你根据刚刚的逻辑完成第 3、4 个小朋友的代码。
    int d3;
    if (h3 > h1) {
        d3 = h3 - h1;
    } else {
        d3 = h1 - h3;
    }
    int d4;
    if (h4 > h1) {
        d4 = h4 - h1;
    } else {
        d4 = h1 - h4;
    }
    // ans 用来记下目前最合适的朋友身高，m 记录最小的差距
    // 我们先让第 2 个小朋友当“擂主”
    int ans = h2, m = d2;
    // 让第 3 个小朋友“打擂台”
    if (d3 < m) {
        ans = h3;
        m = d3;
    } 
    // 如果差距一样大，那就看谁更矮，矮的那个赢
    else if (d3 == m) {
        if (h3 < ans) {
            ans = h3;
        }
    }
    // 让第 4 个小朋友来挑战
    // 逻辑和刚才一样：先看差距，再看身高
    // 请你根据刚刚的逻辑完成第 4 个小朋友的代码。
    if (d4 < m) {
        ans = h4;
        m = d4;
    } else if (d4 == m) {
        if (h4 < ans) {
            ans = h4;
        }
    }
    // 想一想，答案是什么，如何输出？
    cout << ans << endl;
    return 0;
}
