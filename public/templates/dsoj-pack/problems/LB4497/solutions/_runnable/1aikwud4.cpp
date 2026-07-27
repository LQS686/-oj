#include <iostream>
using namespace std;

int main() {
    int L, R;
    cin >> L >> R;
    int ans = 0;
    for(int i = L; i <= R; i++) {
        int t = i, c = 0;
        while(t > 0) {
            if(t % 10 == 2) c++;
            t /= 10;
        }
        if(c == 3) ans++;
    }
    cout << ans << endl;
    return 0;
}
