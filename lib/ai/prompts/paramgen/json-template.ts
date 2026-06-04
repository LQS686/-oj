/**
 * AI 出题 JSON 模板
 *
 * 字段与 [app/api/problems/route.ts](file:///e:/桌面/oj/app/api/problems/route.ts) `requiredFields` + `testCases` schema 1:1 对应
 * AI 只需按占位符填空，不要自由发挥字段名/结构
 */

export const PROBLEM_JSON_TEMPLATE = `{
  "title": "<4-10字中文题目名>",
  "description": "<Markdown 格式详细题目描述，含背景、要求、约束，用简体中文>",
  "input": "<输入格式说明，中文>",
  "output": "<输出格式说明，中文>",
  "samples": [
    {
      "input": "<样例1输入字符串>",
      "output": "<样例1输出字符串>",
      "explanation": "<样例1解释，用中文，1-2 句话>"
    },
    {
      "input": "<样例2输入字符串>",
      "output": "<样例2输出字符串>",
      "explanation": "<样例2解释，用中文，1-2 句话>"
    }
  ],
  "hint": "<1-2 句数据范围提示，不要直接透露算法>",
  "tags": ["<中文标签1>", "<中文标签2>"],
  "difficulty": "<难度字符串，必须与传入的 difficulty 完全一致>",
  "timeLimit": <1000|1500|2000|3000|5000 整数毫秒>,
  "memoryLimit": <64|128|256|512|1024 整数MB>,
  "testCases": [
    {
      "input": "<测试1输入>",
      "output": "<测试1输出>",
      "isSample": false,
      "score": 0
    }
    /* 至少 15 组测试数据。
       覆盖以下 10 个维度的至少 9 个：
       a. 最小值情形（n=1、空集合、单元素、全零）
       b. 最大值/压力测试（n 达到数据范围上限）
       c. 边界条件（恰好等于阈值）
       d. 特殊/反例（重复元素、负数、浮点精度）
       e. 随机典型（中等规模随机数据）
       f. 全相同（所有元素相等）
       g. 严格单调（严格递增/递减序列）
       h. 极端比例（1 极大 + 9999 极小，偏斜分布）
       i. 倒数边界（n=上限-1、第 2 大）
       j. 随机压力（接近上限的随机数据）
    */
  ],
  "solutionCpp": "<完整可编译的 C++17 标程，以 #include <bits/stdc++.h> 开头，变量命名清晰>",
  "solutionPython": "<完整可运行的 Python3 标程，可使用 sys.stdin.read() 加速>"
}`;

/**
 * 把 difficulty / timeLimit / memoryLimit 三个变量嵌入模板
 */
export function fillTemplate(difficulty: string, timeLimit: number, memoryLimit: number): string {
  return PROBLEM_JSON_TEMPLATE
    .replace(/<难度字符串[^>]*>/, difficulty)
    .replace(/<1000\|1500\|2000\|3000\|5000 整数毫秒>/, String(timeLimit))
    .replace(/<64\|128\|256\|512\|1024 整数MB>/, String(memoryLimit));
}
