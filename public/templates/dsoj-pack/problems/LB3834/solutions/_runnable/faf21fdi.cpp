#include <iostream>
using namespace std;

int main() {
    int A, ans = 0;
    cin >> A;
    for (int i = 1; i * i <= A; ++i)
        if ((A % i) == 0) ++ans;
    cout << ans;
    return 0;
}
