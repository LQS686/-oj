#include <iostream>
using namespace std;

int main() {
    int a, b, c, d;
    cin >> a >> b >> c >> d;
    
    int s1 = a;                 // 方案 1：直飞
    int s2 = b + c;             // 方案 2：高铁到 C，再坐飞机
    int s3 = b + d;             // 方案 3：高铁到 C，再坐高铁
    int ans = s1;               // 先认为方案 1 最便宜
    if (s2 < ans) {             // 如果第二种更便宜，就改成第二种
        ans = s2;
    }
    if (s3 < ans) {             // 如果第三种更便宜，就改成第三种
        ans = s3;
    }
    cout << ans;
    return 0;
}
