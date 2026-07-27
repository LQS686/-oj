#include <iostream>
using namespace std;

int main() {
    int k, L, R;
    cin >> k >> L >> R;
    
    int sum = 0;
    for (int i = L; i <= R; i++) {
        if (i % 10 == k || i % k == 0) {
            sum += i;
        }
    }
    
    cout << sum << endl;
    return 0;
}
