#include <iostream>
using namespace std;

int main() {
    int n;
    cin >> n;
    int max_sum = 0;
    for (int i = 0; i < n; ++i) {
        int x;
        cin >> x;
        int sum = 0;
        while (x) {
            sum += x % 10;
            x /= 10;
        }
        if (sum > max_sum) {
            max_sum = sum;
        }
    }
    cout << max_sum << endl;
    return 0;
}
