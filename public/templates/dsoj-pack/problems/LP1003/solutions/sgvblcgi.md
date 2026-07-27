# 题解：P1003 [NOIP2011 提高组] 铺地毯

### 思路
后放的地毯在先放的地毯之上，这和栈是一样的，所以可以用栈来模拟。  
按照输入顺序把地毯依次放入栈中，最后取出栈顶，如果栈顶地毯覆盖了 $(x,y)$ 就输出此时栈的中剩余元素数量加一；否则继续取出栈顶。  

如果栈空了还没找到覆盖 $(x,y)$ 的地毯，就输出 `-1`。

时间复杂度为 $O(n)$。

---
### 代码
```cpp
#include<bits/stdc++.h>
using namespace std;
int n;
struct node{
	int sx,sy,ex,ey;
};
stack<node>s;
int mx,my;
int main(){
	ios::sync_with_stdio(0);
	cin.tie(0);cout.tie(0);
	cin>>n;
	while(n--){
		int x,y,g,k;
		cin>>x>>y>>g>>k;
		s.push({x,y,x+g,y+k});
	}
	cin>>mx>>my;
	while(!s.empty()){
		node t=s.top();
		if(t.sx<=mx&&t.ex>=mx&&t.sy<=my&&t.ey>=my){
			cout<<s.size();
			return 0;
		}
		s.pop();
	}
	cout<<-1;
	return 0;
}
```
