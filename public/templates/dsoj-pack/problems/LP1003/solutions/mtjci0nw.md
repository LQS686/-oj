# 题解 P1003 【铺地毯】

用两个数组存每张地毯的左下角和右上角，再从后向前一张一张推，遇到要求的点在地毯内就输出并退出。（这样比顺着推会快一些）

```cpp

#include <iostream>  
using namespace std;  
int a[10001][2],b[10001][2],x,y,i,n,m;  
int main()  
{  
scanf ("%d",&i);   
for (int j=1;j<=i;j++) {scanf("%d%d%d%d",&a[j][0],&a[j][1],&n,&m); b[j][0]=a[j][0]+n; b[j][1]=a[j][1]+m;}  
scanf ("%d%d",&x,&y);  
for (int j=i;j>=1;j--)  
if (x>=a[j][0]&&x<=b[j][0]&&y>=a[j][1]&&y<=b[j][1]) {printf("%d",j);  return 0;}  
cout <<-1;  return 0;  
}  
```
