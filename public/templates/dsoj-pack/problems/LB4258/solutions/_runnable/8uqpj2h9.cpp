#include <iostream>
using namespace std;

int main() {
    int n;
    cin >> n;
    for (int i = 0; i < n; i++) {
        int a;
        cin >> a;
        int ans;
        int gewei = a % 10; // 计算个位数
        if (gewei < 5) {
            // 如果个位数小于 5，“舍去”
            ans = a - gewei;
        } else {
            // 如果个位数大于等于 5，“进位”
            ans = a - gewei + 10;
        }
        cout << ans << endl;
    }
    return 0;
}
