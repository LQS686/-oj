# 题解：P1003 [NOIP2011 提高组] 铺地毯

坐标范围是 $10^5$，显然不能开 $10^5\times10^5$ 的空间。但是注意到最后只有一个询问，问一个坐标最上面的地毯的编号，而地毯数量 $n$ 的范围是 $10^4$，因此可以先把所有信息读入进来，再直接判断每个地毯是否覆盖了询问的点，是就更新答案。

```cpp
#include<bits/stdc++.h>
using namespace std;
struct cp{
	int a,b,g,k;
}c[542457];
int main(){
	ios::sync_with_stdio(0);cin.tie(0);
	int n;cin>>n;
	for(int i=1;i<=n;i++){
		cin>>c[i].a>>c[i].b>>c[i].g>>c[i].k;
	}
	int ans=-1;
	int x,y;cin>>x>>y;
	for(int i=1;i<=n;i++){
		if(x>=c[i].a&&x<=c[i].a+c[i].g && y>=c[i].b&&y<=c[i].b+c[i].k){
			ans=i;
		}
	}
	cout<<ans;
	return 0;
}
```
