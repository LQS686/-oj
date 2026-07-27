#include <bits/stdc++.h>
using namespace std;
int n;
int main(){
	cin>>n;
	for(int i=1;i<=n;i++){	// 输出共 n 行
		char c='a';
		if(i==(n+1)/2)c='-';	// 设置当前行要输出的内容
		putchar('|');
		for(int j=3;j<=n;j++)putchar(c);	// 按照格式输出
		putchar('|');
		if(i!=n)putchar('\n');	// 换行问题
	}
	return 0;
}
