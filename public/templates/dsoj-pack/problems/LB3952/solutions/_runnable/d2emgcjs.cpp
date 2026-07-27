#include <iostream>
using namespace std;

int main() {
    int m;
    cin >> m;
    int books = m / 13;
    int remain = m % 13;
    cout << books << endl;
    cout << remain << endl;
    return 0;
}
