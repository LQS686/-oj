#include <iostream>
using namespace std;

int main() {
    int n;
    cin >> n;
    int count = 0;
    for (int i = 0; i < n; i++) {
        int a;
        cin >> a;
        if (a % 9 == 0 && a % 8 != 0) {
            count++;
        }
    }
    cout << count << endl;
    return 0;
}
