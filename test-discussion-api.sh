#!/bin/bash

# 测试讨论功能API

echo "=== 测试讨论功能API ==="
echo ""

# 测试1: 获取分类列表
echo "1. 测试获取分类列表"
curl -X GET "http://localhost:3000/api/categories"
echo ""
echo ""

# 测试2: 获取帖子列表
echo "2. 测试获取帖子列表"
curl -X GET "http://localhost:3000/api/posts"
echo ""
echo ""

# 测试3: 测试帖子列表排序
echo "3. 测试帖子列表排序（热门）"
curl -X GET "http://localhost:3000/api/posts?sort=hot"
echo ""
echo ""

# 测试4: 测试帖子列表分页
echo "4. 测试帖子列表分页"
curl -X GET "http://localhost:3000/api/posts?page=1&limit=5"
echo ""
echo ""

# 测试5: 测试帖子搜索
echo "5. 测试帖子搜索"
curl -X GET "http://localhost:3000/api/posts?search=动态规划"
echo ""
echo ""

# 测试6: 测试帖子详情
echo "6. 测试帖子详情"
curl -X GET "http://localhost:3000/api/posts/1"
echo ""
echo ""

# 测试7: 测试评论列表
echo "7. 测试评论列表"
curl -X GET "http://localhost:3000/api/posts/1/comments"
echo ""
echo ""

echo "=== 测试完成 ==="
