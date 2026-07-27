# P1003 [NOIP2011 提高组] 铺地毯

简单枚举题。

### 思路

$n^2$ 去枚举每个格子明显是行不通的做法，会喜提超空间。

我们先把每个地毯都存起来，直接考虑筛一遍所有毯子，每次判断有没有覆盖这个点，若覆盖就更新答案即可。

### AC Code

```cpp
#include<bits/stdc++.h>
#define int long long
using namespace std;
const int N=1e6+5;
int a[N],b[N],g[N],k[N],n,m,t,ans=-1;
signed main(){
	cin>>n;
	for(int i=1;i<=n;i++) cin>>a[i]>>b[i]>>g[i]>>k[i];
	int x,y;
	cin>>x>>y;//点的坐标
	for(int i=1;i<=n;i++){
		if((x>=a[i]&&x<=a[i]+g[i])&&(y>=b[i]&&y<=b[i]+k[i]))//判断是否覆盖点位
			ans=i;//更新答案
	}
	cout<<ans;
	return 0;
}
```
