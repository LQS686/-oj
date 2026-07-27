#include <iostream>
using namespace std;

int main() {
    int n;
    cin >> n;
    for (int i = 1; i <= n; i++) {
        for (int j = 1; j <= n; j++) {
            bool r = (i == 1 || i == n);
            bool c = (j == 1 || j == n);
            if (r && c) cout << '+';
            else if (r) cout << '-';
            else if (c) cout << '|';
            else cout << '*';
        }
        cout << '\n';
    }
    return 0;
}
