#include <iostream>
#include <iomanip>
using namespace std;

int main() {
    int x, y, n, p;
    cin >> x >> y >> n >> p;
    
    double c1;
    if (p >= x) {
        c1 = p - y;
    } else {
        c1 = p;
    }
    
    double c2 = p * n / 10.0;
    
    double ans = (c1 < c2) ? c1 : c2;
    
    cout << fixed << setprecision(2) << ans << endl;
    
    return 0;
}
