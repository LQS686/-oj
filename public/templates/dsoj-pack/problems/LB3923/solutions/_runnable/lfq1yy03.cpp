#include <iostream>
using namespace std;

int main() {
    int a, b, m, n;
    cin >> a >> b >> m >> n;
    
    long long total = 0;
    int day1 = a, day2 = b;
    int prev2 = a, prev1 = b;
    
    for (int i = 1; i <= n; i++) {
        int current;
        if (i == 1) {
            current = a;
        } else if (i == 2) {
            current = b;
        } else {
            current = prev1 + prev2;
        }
        
        total += current;
        if (current >= m) {
            break;
        }
        
        prev2 = prev1;
        prev1 = current;
    }
    
    cout << total << endl;
    return 0;
}
