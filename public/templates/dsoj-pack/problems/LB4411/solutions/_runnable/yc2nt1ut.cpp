#include <iostream>
using namespace std;

int main() {
    int n;
    cin >> n;
    int ans = 0;
    for (int i = 1; i <= n; ++i) {
        bool flag = true;
        int x = i;
        int d = x % 10;
        while (x > 0) {
            if (x % 10 != d) {
                flag = false;
                break;
            }
            x /= 10;
        }
        if (flag) {
            ++ans;
        }
    }
    cout << ans << endl;
    return 0;
}
