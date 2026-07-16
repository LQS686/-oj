import { logger } from '../logger'

interface CodeAnalysisResult {
  safe: boolean;
  warnings: string[];
  errors: string[];
  detectedPatterns: string[];
  codeLength: number;
  estimatedComplexity: 'low' | 'medium' | 'high' | 'very_high';
  recommendations: string[];
}

const MAX_CODE_LENGTH = 65536;

const DANGEROUS_PATTERNS = {
  python: [
    { pattern: /import\s+os\b/g, name: 'os模块' },
    { pattern: /from\s+os\s+import/g, name: 'os模块' },
    { pattern: /import\s+subprocess\b/g, name: 'subprocess模块' },
    { pattern: /from\s+subprocess\s+import/g, name: 'subprocess模块' },
    { pattern: /import\s+sys\b/g, name: 'sys模块' },
    { pattern: /from\s+sys\s+import/g, name: 'sys模块' },
    { pattern: /import\s+socket\b/g, name: 'socket模块' },
    { pattern: /from\s+socket\s+import/g, name: 'socket模块' },
    { pattern: /import\s+pickle\b/g, name: 'pickle模块' },
    { pattern: /from\s+pickle\s+import/g, name: 'pickle模块' },
    { pattern: /import\s+marshal\b/g, name: 'marshal模块' },
    { pattern: /from\s+marshal\s+import/g, name: 'marshal模块' },
    { pattern: /import\s+shelve\b/g, name: 'shelve模块' },
    { pattern: /from\s+shelve\s+import/g, name: 'shelve模块' },
    { pattern: /import\s+imp\b/g, name: 'imp模块' },
    { pattern: /from\s+imp\s+import/g, name: 'imp模块' },
    { pattern: /import\s+importlib\b/g, name: 'importlib模块' },
    { pattern: /from\s+importlib\s+import/g, name: 'importlib模块' },
    { pattern: /__import__\s*\(/g, name: '__import__函数' },
    { pattern: /exec\s*\(/g, name: 'exec函数' },
    { pattern: /eval\s*\(/g, name: 'eval函数' },
    { pattern: /compile\s*\(/g, name: 'compile函数' },
    { pattern: /open\s*\([^)]*['"][wab+]/g, name: '文件写入操作' },
  ],
  javascript: [
    { pattern: /require\s*\(\s*['"]child_process['"]\s*\)/g, name: 'child_process模块' },
    { pattern: /require\s*\(\s*['"]fs['"]\s*\)/g, name: 'fs模块' },
    { pattern: /require\s*\(\s*['"]net['"]\s*\)/g, name: 'net模块' },
    { pattern: /require\s*\(\s*['"]http['"]\s*\)/g, name: 'http模块' },
    { pattern: /require\s*\(\s*['"]https['"]\s*\)/g, name: 'https模块' },
    { pattern: /require\s*\(\s*['"]crypto['"]\s*\)/g, name: 'crypto模块' },
    { pattern: /require\s*\(\s*['"]cluster['"]\s*\)/g, name: 'cluster模块' },
    { pattern: /require\s*\(\s*['"]vm['"]\s*\)/g, name: 'vm模块' },
    { pattern: /eval\s*\(/g, name: 'eval函数' },
    { pattern: /Function\s*\(/g, name: 'Function构造器' },
    { pattern: /process\.env/g, name: 'process.env访问' },
    { pattern: /process\.exit/g, name: 'process.exit调用' },
    { pattern: /process\.kill/g, name: 'process.kill调用' },
    { pattern: /process\.binding/g, name: 'process.binding调用' },
    { pattern: /global\./g, name: 'global对象访问' },
    { pattern: /globalThis\./g, name: 'globalThis对象访问' },
  ],
  cpp: [
    { pattern: /\bsystem\s*\(/g, name: 'system函数' },
    { pattern: /\bpopen\s*\(/g, name: 'popen函数' },
    { pattern: /\bexec[lv][pe]?\s*\(/g, name: 'exec函数族' },
    { pattern: /\bfork\s*\(/g, name: 'fork函数' },
    { pattern: /\bexecl\s*\(/g, name: 'execl函数' },
    { pattern: /\bexecv\s*\(/g, name: 'execv函数' },
    { pattern: /\bexecle\s*\(/g, name: 'execle函数' },
    { pattern: /\bexecve\s*\(/g, name: 'execve函数' },
    { pattern: /\bexeclp\s*\(/g, name: 'execlp函数' },
    { pattern: /\bexecvp\s*\(/g, name: 'execvp函数' },
    { pattern: /#include\s*<stdlib\.h>/g, name: 'stdlib.h头文件' },
    { pattern: /#include\s*<unistd\.h>/g, name: 'unistd.h头文件' },
    { pattern: /\bgetenv\s*\(/g, name: 'getenv函数' },
  ],
  java: [
    { pattern: /Runtime\.getRuntime\(\)/g, name: 'Runtime.getRuntime()' },
    { pattern: /ProcessBuilder/g, name: 'ProcessBuilder类' },
    { pattern: /System\.exit\s*\(/g, name: 'System.exit()' },
    { pattern: /System\.loadLibrary/g, name: 'System.loadLibrary' },
    { pattern: /System\.load\s*\(/g, name: 'System.load' },
    { pattern: /java\.lang\.reflect\./g, name: '反射API' },
    { pattern: /Class\.forName\s*\(/g, name: 'Class.forName动态加载' },
    { pattern: /SecurityManager/g, name: 'SecurityManager类' },
    { pattern: /java\.io\.File/g, name: 'File类' },
    { pattern: /java\.net\./g, name: '网络包' },
  ],
};

const INFINITE_LOOP_PATTERNS = [
  { pattern: /while\s*\(\s*true\s*\)/g, name: 'while(true)无限循环' },
  { pattern: /while\s*\(\s*1\s*\)/g, name: 'while(1)无限循环' },
  { pattern: /for\s*\(\s*;\s*;\s*\)/g, name: 'for(;;)无限循环' },
  { pattern: /while\s*\(\s*True\s*\)/g, name: 'Python while True循环' },
];

const RECURSION_PATTERNS = [
  { pattern: /function\s+(\w+)\s*\([^)]*\)[^{]*\{[^}]*\1\s*\(/g, name: 'JavaScript递归函数' },
  { pattern: /def\s+(\w+)\s*\([^)]*\)[^:]*:[^}]*\1\s*\(/g, name: 'Python递归函数' },
  { pattern: /int\s+(\w+)\s*\([^)]*\)[^{]*\{[^}]*\1\s*\(/g, name: 'C/C++递归函数' },
  { pattern: /void\s+(\w+)\s*\([^)]*\)[^{]*\{[^}]*\1\s*\(/g, name: 'C/C++递归函数' },
];

function estimateComplexity(code: string, language: string): 'low' | 'medium' | 'high' | 'very_high' {
  let score = 0;
  const lines = code.split('\n').length;
  const nestedLoops = (code.match(/for\s*\(/g) || []).length + (code.match(/while\s*\(/g) || []).length;
  const nestedIfs = (code.match(/if\s*\(/g) || []).length;
  const functionCount = (code.match(/function\s+\w+|def\s+\w+|int\s+\w+\s*\(|void\s+\w+\s*\(/g) || []).length;
  
  if (lines > 500) score += 2;
  else if (lines > 200) score += 1;
  
  if (nestedLoops > 5) score += 2;
  else if (nestedLoops > 2) score += 1;
  
  if (nestedIfs > 10) score += 1;
  
  if (functionCount > 10) score += 1;
  
  if (score >= 4) return 'very_high';
  if (score >= 3) return 'high';
  if (score >= 1) return 'medium';
  return 'low';
}

function detectInfiniteLoops(code: string): string[] {
  const warnings: string[] = [];
  
  INFINITE_LOOP_PATTERNS.forEach(({ pattern, name }) => {
    if (pattern.test(code)) {
      const hasBreak = /\bbreak\b/.test(code);
      const hasReturn = /\breturn\b/.test(code);
      if (!hasBreak && !hasReturn) {
        warnings.push(`检测到潜在的无限循环模式: ${name}（无break/return退出）`);
      }
    }
  });
  
  return warnings;
}

function detectDeepRecursion(code: string, language: string): string[] {
  const warnings: string[] = [];
  
  RECURSION_PATTERNS.forEach(({ pattern, name }) => {
    if (pattern.test(code)) {
      warnings.push(`检测到递归调用模式: ${name}，请注意递归深度`);
    }
  });
  
  return warnings;
}

function analyzeCodeComplexity(code: string, language: string): { 
  complexity: 'low' | 'medium' | 'high' | 'very_high'; 
  warnings: string[];
} {
  const warnings: string[] = [];
  
  warnings.push(...detectInfiniteLoops(code));
  warnings.push(...detectDeepRecursion(code, language));
  
  return { 
    complexity: estimateComplexity(code, language), 
    warnings 
  };
}

function getLanguageKey(language: string): string | null {
  // 评测机减负（2026-07）：移除 java/javascript，仅保留 C/C++/Python
  const langMap: Record<string, string> = {
    'python': 'python',
    'python3': 'python',
    'py': 'python',
    'cpp': 'cpp',
    'c++': 'cpp',
    'c': 'cpp',
  };
  return langMap[language.toLowerCase()] || null;
}

function analyzeCode(code: string, language: string): CodeAnalysisResult {
  const result: CodeAnalysisResult = {
    safe: true,
    warnings: [],
    errors: [],
    detectedPatterns: [],
    codeLength: code.length,
    estimatedComplexity: 'low',
    recommendations: [],
  };
  
  if (code.length > MAX_CODE_LENGTH) {
    result.safe = false;
    result.errors.push(`代码长度超过限制: ${code.length} 字符（最大允许 ${MAX_CODE_LENGTH} 字符）`);
    return result;
  }
  
  const langKey = getLanguageKey(language);
  
  if (langKey && DANGEROUS_PATTERNS[langKey as keyof typeof DANGEROUS_PATTERNS]) {
    // 安全说明：以下正则仅做静态告警，真正的安全边界是评测沙箱（seccomp/cgroups/命名空间隔离）。
    // 静态正则存在大量绕过手段（字符串拼接、宏、编码），不能作为安全防线，因此降级为 warnings。
    const patterns = DANGEROUS_PATTERNS[langKey as keyof typeof DANGEROUS_PATTERNS];
    patterns.forEach(({ pattern, name }) => {
      const regex = new RegExp(pattern.source, pattern.flags);
      if (regex.test(code)) {
        result.warnings.push(`检测到可能受限的模式: ${name}（最终是否放行由沙箱决定）`);
        result.detectedPatterns.push(name);
      }
    });
  }
  
  const complexityResult = analyzeCodeComplexity(code, language);
  result.estimatedComplexity = complexityResult.complexity;
  result.warnings.push(...complexityResult.warnings);
  
  if (result.estimatedComplexity === 'very_high') {
    result.recommendations.push('代码复杂度较高，建议简化逻辑或拆分函数');
  }
  
  if (result.estimatedComplexity === 'high') {
    result.recommendations.push('代码复杂度中等偏高，注意运行时间限制');
  }
  
  if (code.length > 30000) {
    result.recommendations.push('代码较长，建议检查是否有冗余代码');
  }
  
  if (result.warnings.length > 0) {
    result.recommendations.push('检测到潜在的资源消耗问题，请确保代码有正确的终止条件');
  }
  
  return result;
}

export function validateCodeSafety(code: string, language: string): CodeAnalysisResult {
  logger.info('分析代码安全性...');
  logger.info(`代码长度: ${code.length} 字符`);
  logger.info(`语言: ${language}`);
  
  const result = analyzeCode(code, language);
  
  if (!result.safe) {
    logger.error('代码检测到安全问题');
    result.errors.forEach(error => logger.error(`  - ${error}`));
  } else if (result.warnings.length > 0) {
    logger.warn('代码检测到潜在问题');
    result.warnings.forEach(warning => logger.warn(`  - ${warning}`));
  } else {
    logger.info('代码安全检查通过');
  }
  
  if (result.recommendations.length > 0) {
    logger.info('建议:');
    result.recommendations.forEach(rec => logger.info(`  - ${rec}`));
  }
  
  logger.info(`复杂度评估: ${result.estimatedComplexity}`);
  
  return result;
}
