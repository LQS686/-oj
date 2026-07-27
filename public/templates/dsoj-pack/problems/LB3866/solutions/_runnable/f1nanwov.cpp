#include <iostream>
#include <algorithm>
using namespace std;

int main() {
    int n;
    cin >> n;
    int count = 0;
    while (n != 495) {
        int a[3];
        a[0] = n / 100;
        a[1] = n / 10 % 10;
        a[2] = n % 10;
        sort(a, a + 3);
        int max_num = a[2] * 100 + a[1] * 10 + a[0];
        int min_num = a[0] * 100 + a[1] * 10 + a[2];
        n = max_num - min_num;
        count++;
    }
    cout << count << endl;
    return 0;
}
