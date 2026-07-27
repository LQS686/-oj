#include <iostream>
using namespace std;

int main() {
    int A, B;
    cin >> A >> B;
    
    if (B == 1 || B == 3 || B == 5 || B == 7 || B == 8 || B == 10 || B == 12) {
        cout << 31;
    } 
    else if (B == 4 || B == 6 || B == 9 || B == 11) {
        cout << 30;
    } 
    else if (B == 2) {
        if ((A % 4 == 0 && A % 100 != 0) || A % 400 == 0) {
            cout << 29;
        } else {
            cout << 28;
        }
    }
    
    return 0;
}
