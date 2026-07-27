#include <iostream>
#include <cstdio>
using namespace std;

int main() {
    double K, C, F;
    cin >> K;
    C = K - 273.15;
    F = C * 1.8 + 32;
    if (F > 212)
        cout << "Temperature is too high!";
    else
        printf("%.2lf %.2lf", C, F);
    return 0;
}
