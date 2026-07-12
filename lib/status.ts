export interface StatusConfig {
  icon: string
  className: string
  iconBg: string
  text: string
  color: string
}

export function getStatusConfig(status: string): StatusConfig {
  const configs: Record<string, StatusConfig> = {
    'AC': {
      icon: 'check-circle-2',
      className: 'status-ac',
      iconBg: 'bg-[var(--difficulty-easy-bg)]',
      text: 'Accepted',
      color: 'text-[var(--difficulty-easy)]'
    },
    'Accepted': {
      icon: 'check-circle-2',
      className: 'status-ac',
      iconBg: 'bg-[var(--difficulty-easy-bg)]',
      text: 'Accepted',
      color: 'text-[var(--difficulty-easy)]'
    },
    'WA': {
      icon: 'x-circle',
      className: 'status-wa',
      iconBg: 'bg-[var(--difficulty-hard-bg)]',
      text: 'Wrong Answer',
      color: 'text-[var(--difficulty-hard)]'
    },
    'Wrong Answer': {
      icon: 'x-circle',
      className: 'status-wa',
      iconBg: 'bg-[var(--difficulty-hard-bg)]',
      text: 'Wrong Answer',
      color: 'text-[var(--difficulty-hard)]'
    },
    'TLE': {
      icon: 'timer',
      className: 'status-tle',
      iconBg: 'bg-[var(--difficulty-medium-bg)]',
      text: 'Time Limit Exceeded',
      color: 'text-[var(--difficulty-medium)]'
    },
    'Time Limit Exceeded': {
      icon: 'timer',
      className: 'status-tle',
      iconBg: 'bg-[var(--difficulty-medium-bg)]',
      text: 'Time Limit Exceeded',
      color: 'text-[var(--difficulty-medium)]'
    },
    'MLE': {
      icon: 'alert-circle',
      className: 'status-mle',
      iconBg: 'bg-[var(--difficulty-expert-bg)]',
      text: 'Memory Limit Exceeded',
      color: 'text-[var(--difficulty-expert)]'
    },
    'Memory Limit Exceeded': {
      icon: 'alert-circle',
      className: 'status-mle',
      iconBg: 'bg-[var(--difficulty-expert-bg)]',
      text: 'Memory Limit Exceeded',
      color: 'text-[var(--difficulty-expert)]'
    },
    'RE': {
      icon: 'x-circle',
      className: 'status-re',
      iconBg: 'bg-[var(--difficulty-hard-bg)]',
      text: 'Runtime Error',
      color: 'text-[var(--difficulty-hard)]'
    },
    'Runtime Error': {
      icon: 'x-circle',
      className: 'status-re',
      iconBg: 'bg-[var(--difficulty-hard-bg)]',
      text: 'Runtime Error',
      color: 'text-[var(--difficulty-hard)]'
    },
    'CE': {
      icon: 'alert-circle',
      className: 'status-ce',
      iconBg: 'bg-[var(--difficulty-expert-bg)]',
      text: 'Compile Error',
      color: 'text-[var(--difficulty-expert)]'
    },
    'Compile Error': {
      icon: 'alert-circle',
      className: 'status-ce',
      iconBg: 'bg-[var(--difficulty-expert-bg)]',
      text: 'Compile Error',
      color: 'text-[var(--difficulty-expert)]'
    },
    'SE': {
      icon: 'alert-circle',
      className: 'bg-muted text-muted-foreground',
      iconBg: 'bg-muted',
      text: 'System Error',
      color: 'text-muted-foreground'
    },
    'System Error': {
      icon: 'alert-circle',
      className: 'bg-muted text-muted-foreground',
      iconBg: 'bg-muted',
      text: 'System Error',
      color: 'text-muted-foreground'
    },
    'Pending': {
      icon: 'loader-2',
      className: 'status-pending',
      iconBg: 'bg-primary-50',
      text: 'Pending',
      color: 'text-primary'
    },
    'Judging': {
      icon: 'loader-2',
      className: 'status-pending',
      iconBg: 'bg-primary-50',
      text: 'Judging',
      color: 'text-primary'
    },
    'Running': {
      icon: 'loader-2',
      className: 'status-pending',
      iconBg: 'bg-primary-50',
      text: 'Running',
      color: 'text-primary'
    },
    'PE': {
      icon: 'alert-triangle',
      className: 'status-pe',
      iconBg: 'bg-amber-50',
      text: 'Presentation Error',
      color: 'text-amber-600'
    },
    'Presentation Error': {
      icon: 'alert-triangle',
      className: 'status-pe',
      iconBg: 'bg-amber-50',
      text: 'Presentation Error',
      color: 'text-amber-600'
    },
    'OLE': {
      icon: 'alert-triangle',
      className: 'status-ole',
      iconBg: 'bg-amber-50',
      text: 'Output Limit Exceeded',
      color: 'text-amber-600'
    },
    'Output Limit Exceeded': {
      icon: 'alert-triangle',
      className: 'status-ole',
      iconBg: 'bg-amber-50',
      text: 'Output Limit Exceeded',
      color: 'text-amber-600'
    },
    'CSP': {
      icon: 'x-circle',
      className: 'status-csp',
      iconBg: 'bg-[var(--difficulty-hard-bg)]',
      text: 'Checker Special Problem',
      color: 'text-[var(--difficulty-hard)]'
    },
    'PC': {
      icon: 'check-circle-2',
      className: 'status-pc',
      iconBg: 'bg-[var(--difficulty-medium-bg)]',
      text: 'Partly Correct',
      color: 'text-[var(--difficulty-medium)]'
    },
    'Partly Correct': {
      icon: 'check-circle-2',
      className: 'status-pc',
      iconBg: 'bg-[var(--difficulty-medium-bg)]',
      text: 'Partly Correct',
      color: 'text-[var(--difficulty-medium)]'
    }
  }

  return configs[status] || {
    icon: 'alert-circle',
    className: 'bg-muted text-muted-foreground',
    iconBg: 'bg-muted',
    text: status,
    color: 'text-muted-foreground'
  }
}

export function getStatusColor(status: string): string {
  return getStatusConfig(status).color
}

export function getStatusText(status: string): string {
  return getStatusConfig(status).text
}

export function getDifficultyColor(difficulty: string): string {
  const classMap: Record<string, string> = {
    '入门': 'difficulty-easy',
    '普及-': 'difficulty-medium-easy',
    '普及': 'difficulty-medium-easy',
    '普及+': 'difficulty-medium',
    '提高': 'difficulty-medium',
    '提高+': 'difficulty-medium-hard',
    '省选': 'difficulty-hard',
    'NOI': 'difficulty-expert',
    '简单': 'difficulty-easy',
    '中等': 'difficulty-medium',
    '困难': 'difficulty-hard',
    'easy': 'difficulty-easy',
    'Easy': 'difficulty-easy',
    'medium': 'difficulty-medium',
    'Medium': 'difficulty-medium',
    'hard': 'difficulty-hard',
    'Hard': 'difficulty-hard'
  }
  return classMap[difficulty] || 'difficulty-easy'
}
