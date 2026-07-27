#include <iostream>
using namespace std;

int main() {
    int n;
    cin >> n;
    char c = 'A';
    for (int i = 1; i <= n; i++) {
        for (int j = 1; j <= i; j++) {
            if (c != 'Z') cout << c++;
            else cout << 'Z', c = 'A';
        }
        puts ("");
    }
    return 0;
}
