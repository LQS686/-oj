#include <iostream>
using namespace std;

int main() {
    int T;
    cin >> T;
    while (T--) {
        int P;
        cin >> P;
        if (P <= 10) {
            cout << "R" << endl;
        }
        else if (P <= 20) {
            cout << "L" << endl;
        }
        else {
            cout << P << endl;
        }
    }
    return 0;
}
