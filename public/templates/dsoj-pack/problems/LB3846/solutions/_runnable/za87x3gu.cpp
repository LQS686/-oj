#include <iostream>
using namespace std;

int main() {
    int start, end;
    cin >> start >> end;
    int ans = 0;
    
    for (int i = start + 1; i < end; i++) {
        if (i % 400 == 0 || (i % 4 == 0 && i % 100 != 0)) {
            ans = ans + i;
        }
    }
    
    cout << ans << endl;
    return 0;
}
