#include <iostream>
using namespace std;

int main() {
    int h, m, s, k;
    cin >> h >> m >> s >> k;
    int t = h * 3600 + m * 60 + s + k;
    int h2 = t / 3600;
    int m2 = (t % 3600) / 60;
    int s2 = t % 60;
    cout << h2 << " " << m2 << " " << s2 << endl;
    return 0;
}
