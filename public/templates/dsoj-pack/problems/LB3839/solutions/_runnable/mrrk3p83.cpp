#include <iostream>
using namespace std;

int main() {
    int n;
    cin >> n;
    int sum = 0;
    //外层循环 从 1 遍历到 n
    for (int i = 1; i <= n; i++)
    {	
        // 内层循环 从 1 遍历 到 i
        for (int j = 1; j <= i; j++)
            sum += j;
    }
    cout << sum << endl;
    return 0;
}
