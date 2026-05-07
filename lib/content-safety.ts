import { sensitiveWords } from './sensitive-words';

const allSensitiveWords = sensitiveWords.all ?? []

interface ContentCheckResult {
  isSafe: boolean;
  hasSensitive: boolean;
  matchedWords: string[];
  filteredContent: string;
}

interface SensitiveWordMatch {
  word: string;
  index: number;
  length: number;
}

function findSensitiveWords(content: string): SensitiveWordMatch[] {
  const matches: SensitiveWordMatch[] = [];
  const lowerContent = content.toLowerCase();
  
  for (const word of allSensitiveWords) {
    const lowerWord = word.toLowerCase();
    let index = 0;
    while ((index = lowerContent.indexOf(lowerWord, index)) !== -1) {
      matches.push({
        word: word,
        index: index,
        length: word.length
      });
      index += 1;
    }
  }
  
  return matches.sort((a, b) => a.index - b.index);
}

export function filterSensitiveWords(content: string): string {
  if (!content || typeof content !== 'string') {
    return content;
  }
  
  let filteredContent = content;
  const lowerContent = content.toLowerCase();
  
  for (const word of allSensitiveWords) {
    const lowerWord = word.toLowerCase();
    const regex = new RegExp(escapeRegExp(lowerWord), 'gi');
    filteredContent = filteredContent.replace(regex, '*'.repeat(word.length));
  }
  
  return filteredContent;
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function sanitizeHTML(content: string): string {
  if (!content || typeof content !== 'string') {
    return content;
  }
  
  const escapeMap: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;'
  };
  
  return content.replace(/[&<>"'\/]/g, char => escapeMap[char] || char);
}

export function handleContentSafety(content: string): string {
  const filtered = filterSensitiveWords(content);
  return sanitizeHTML(filtered);
}

export function checkContentSafety(content: string): ContentCheckResult {
  if (!content || typeof content !== 'string') {
    return {
      isSafe: true,
      hasSensitive: false,
      matchedWords: [],
      filteredContent: content || ''
    };
  }
  
  const matches = findSensitiveWords(content);
  const matchedWords = [...new Set(matches.map(m => m.word))];
  const hasSensitive = matchedWords.length > 0;
  const filteredContent = filterSensitiveWords(content);
  
  return {
    isSafe: !hasSensitive,
    hasSensitive,
    matchedWords,
    filteredContent
  };
}

export function hasSensitiveWords(content: string): boolean {
  if (!content || typeof content !== 'string') {
    return false;
  }
  
  const lowerContent = content.toLowerCase();
  for (const word of allSensitiveWords) {
    if (lowerContent.includes(word.toLowerCase())) {
      return true;
    }
  }
  return false;
}

export function getSensitiveCategories(): string[] {
  return ['political', 'violence', 'pornographic', 'advertising', 'other'];
}

export function getSensitiveWordsCount(): number {
  return allSensitiveWords.length;
}

export function getWordsByCategory(category: string): string[] {
  switch (category) {
    case 'political':
      return sensitiveWords.political;
    case 'violence':
      return sensitiveWords.violence;
    case 'pornographic':
      return sensitiveWords.pornographic;
    case 'advertising':
      return sensitiveWords.advertising;
    case 'other':
      return sensitiveWords.other;
    default:
      return [];
  }
}