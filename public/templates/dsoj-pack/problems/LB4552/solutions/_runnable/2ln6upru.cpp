#include <iostream>
#include <iomanip>
using namespace std;

int main() {
    double x, ans = 0.0;
    for (int i = 0; i < 12; ++i) {
        cin >> x;
        if (x > 800.0)
            ans += (x - 800.0) * 0.2;
    }
    cout << fixed << setprecision(2) << ans;
    return 0;
}
