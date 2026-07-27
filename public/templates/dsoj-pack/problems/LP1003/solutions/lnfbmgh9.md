# 题解：P1003 [NOIP2011 提高组] 铺地毯

很简单的一道题。

地毯覆盖的范围是一个矩形，左上角是点 $(a,b)$，右下角是点 $(a+g,b+k)$。若点 $(x,y)$ 在地毯内，则 $a \le x \le a+g$ 且 $b \le y \le b+k$。


```cpp
#include <bits/stdc++.h>
using namespace std;
int n, ans = -1;
int a[10005], b[10005], c[10005], d[10005];
int x, y;
int main() {
  cin >> n;
  for (int i = 1; i <= n; i++) {
    cin >> a[i] >> b[i] >> c[i] >> d[i];
  }
  cin >> x >> y;
  for (int i = 1; i <= n; i++) {
    if (x >= a[i] && x <= a[i] + c[i] && y >= b[i] && y <= b[i] + d[i]) ans = i;
  }
  cout << ans;
  return 0;
}
```
