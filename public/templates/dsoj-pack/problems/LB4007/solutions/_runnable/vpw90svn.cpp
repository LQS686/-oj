#include <iostream>
using namespace std;

int main() {
    int n, k;
    cin >> n >> k;
    int count = 0;
    for (int i = 1; i <= n; i++) {
        int cur = i;
        while (cur > 0) {
            int digit = cur % 10; // 取出最低位
            if (digit == k)
                count++;
            cur /= 10; // 去掉最低位
        }
    }
    cout << count << endl;
    return 0;
}
