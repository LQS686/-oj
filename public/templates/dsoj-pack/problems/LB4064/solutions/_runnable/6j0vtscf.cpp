#include <iostream>
#include <cmath>
using namespace std;

int main() {
    int t;
    cin >> t;
    while (t--) {
        long long a;
        cin >> a;
        bool flag = false;
        for (long long b = 1; b * b * b * b <= a; b++) {
            if (b * b * b * b == a) {
                cout << b << endl;
                flag = true;
                break;
            }
        }
        if (!flag) {
            cout << -1 << endl;
        }
    }
    return 0;
}
