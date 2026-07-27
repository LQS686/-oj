# 题解：P1003 [NOIP2011 提高组] 铺地毯

## 思路
根据题意，因为前面的地毯会被后面的地毯覆盖，所以可以从后往前遍历地毯，找出最后一个（从后往前遍历的第一个）覆盖所求位置的地毯并输出。若未找到，按题目要求输出 $-1$。
## 代码
```cpp
#include <bits/stdc++.h>
using namespace std;
int a[10003],b[10003],g[10003],k[10003],n,x,y;
int main()
{
	cin>>n;
	for(int i=1;i<=n;i++)cin>>a[i]>>b[i]>>g[i]>>k[i];
	cin>>x>>y;
	for(int i=n;i>=1;i--)
	{
		if(a[i]<=x&&a[i]+g[i]>=x&&b[i]<=y&&b[i]+k[i]>=y)
		//判断所求位置是否被地毯覆盖
		{
			cout<<i;
			return 0;//输出并结束
		}
		 	
	
	}
	cout<<-1;//没有找到输出-1
  	return 0;
}


```
