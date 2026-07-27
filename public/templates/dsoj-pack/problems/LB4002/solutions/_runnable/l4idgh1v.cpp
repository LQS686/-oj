#include <bits/stdc++.h>
using namespace std;

int main() {
    int n;
    cin >> n;
    while (n--) {
        int a;
        cin >> a;
        bool flag = false;
        for (int x = 1; x * x <= a; ++x) {
            for (int y = 1; y * y + x * x <= a; ++y) {
                if (x * x + y * y == a) {
                    flag = true;
                    cout << "Yes" << endl;
                    break;
                }
            }
            if (flag) break;
        }
        if (!flag) cout << "No" << endl;
    }
    return 0;
}
