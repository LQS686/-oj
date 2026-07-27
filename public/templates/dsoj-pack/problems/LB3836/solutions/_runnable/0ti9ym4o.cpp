#include <iostream>
using namespace std;

int main() {
    int x, y, z, n, m;
    cin >> x >> y >> z >> n >> m;
    int ans = 0;
    for (int i = 0; i <= m; i++) {
        for (int j = 0; j <= m - i; j++) {
            int k = m - i - j;
            if (k % z == 0 && x * i + y * j + k / z == n) {
                ans++;
            }
        }
    }
    cout << ans << endl;
    return 0;
}
