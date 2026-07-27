#include <iostream>
using namespace std;

int main() {
    int a;
    cin >> a;
    for (int b = 1; b <= a; b++) {
        if (a % b == 0) // 在循环中判断
            cout << b << endl;
    }
    return 0;
}
