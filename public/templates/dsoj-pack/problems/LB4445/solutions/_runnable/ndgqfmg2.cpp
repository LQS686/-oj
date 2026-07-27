#include <iostream>
#include <iomanip>
using namespace std;

int main() {
    double v, g, m, n;
    cin >> v >> g >> m >> n;
    
    double c1 = 0.5 * v;
    double c2;
    if (g < 300) {
        c2 = m;
    } else {
        c2 = n;
    }
    
    double ans;
    if (c1 < c2) {
        ans = c1;
    } else {
        ans = c2;
    }
    
    cout << fixed << setprecision(1) << ans << endl;
    return 0;
}
