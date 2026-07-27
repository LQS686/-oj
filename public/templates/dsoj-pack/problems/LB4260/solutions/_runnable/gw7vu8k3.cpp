#include <bits/stdc++.h>
using namespace std;

int main() {
    int y, m, d, h, k;
    cin >> y >> m >> d >> h >> k;
    
    h += k;
    while (h >= 24) {
        h -= 24;
        d += 1;
        int days;
        if (m == 1 || m == 3 || m == 5 || m == 7 || m == 8 || m == 10 || m == 12) {
            days = 31;
        } else if (m == 4 || m == 6 || m == 9 || m == 11) {
            days = 30;
        } else if (m == 2) {
            if ((y % 400 == 0) || (y % 4 == 0 && y % 100 != 0)) {
                days = 29;
            } else {
                days = 28;
            }
        }
        if (d > days) {
            d = 1;
            m += 1;
            if (m > 12) {
                m = 1;
                y += 1;
            }
        }
    }
    
    cout << y << " " << m << " " << d << " " << h << endl;
    
    return 0;
}
