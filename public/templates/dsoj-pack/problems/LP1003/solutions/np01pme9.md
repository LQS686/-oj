# 题解 P1003 【铺地毯】

开二维数组可能会爆所以就没有试，直接用了一个结构体数组存储数据，或许评测机的内存允许开的数组比较大吧

直接模拟，先读入数据之后再开始模拟，判断点是否在这一长方形上面，如果在的话就更新答案到现在的这一块上面

这样说应该都清楚的吧，反正就是覆盖就更新，否则继续枚举地毯并且判断




```cpp
#include<cstdio>
#include<cstring>
#include<iostream>
using namespace std;
int n,x,y,ans = -1;  //最开始赋值答案为-1那么就可以输出没有地毯的情况了 
struct dt{
    int x,y,d1,d2;
}all[10000+10];
int main()
{
    cin>>n;
    for(int i = 1;i<=n;i++)
        cin>>all[i].x>>all[i].y>>all[i].d1>>all[i].d2;
    cin>>x>>y;
    for(int i = 1;i<=n;i++)
    {
        int tmpx = all[i].x + all[i].d1;
        int tmpy = all[i].y + all[i].d2;
        if(x<=tmpx&&x>=all[i].x&&y<=tmpy&&y>=all[i].y) ans = i;//判断并且更新答案 
    }
    cout<<ans<<endl;
    return 0;
}

```
