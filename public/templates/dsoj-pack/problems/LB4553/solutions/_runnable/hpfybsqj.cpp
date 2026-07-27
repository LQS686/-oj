#include <iostream>
using namespace std;

int main() {
    int l, r;
    cin >> l >> r;
    int c = 0;
    for (int i = 1; i * i <= r; i++) {
        int x = i * i;
        if (x >= l && x <= r)
            c++;
    }
    cout << c;
    return 0;
}
