#include <iostream>
using namespace std;

int main() {
    int shi, fen, miao; // 时，分，秒
    char C;
    cin >> shi >> fen >> miao >> C; // 读入时，分，秒以及一个大写字母
    
    int ans;
    if (C == 'A') {
        ans = shi * 3600 + fen * 60 + miao;
    } else { // 'P'
        ans = (shi + 12) * 3600 + fen * 60 + miao;
    }
    
    cout << ans << endl;
    
    return 0;
}
