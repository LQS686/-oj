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
      className: 'bg-secondary/15 text-secondary-light border-secondary/25',
      iconBg: 'bg-secondary/20',
      text: 'Accepted',
      color: 'text-secondary-light'
    },
    'Accepted': {
      icon: 'check-circle-2',
      className: 'bg-secondary/15 text-secondary-light border-secondary/25',
      iconBg: 'bg-secondary/20',
      text: 'Accepted',
      color: 'text-secondary-light'
    },
    'WA': {
      icon: 'x-circle',
      className: 'bg-error/15 text-error border-error/25',
      iconBg: 'bg-error/20',
      text: 'Wrong Answer',
      color: 'text-error'
    },
    'Wrong Answer': {
      icon: 'x-circle',
      className: 'bg-error/15 text-error border-error/25',
      iconBg: 'bg-error/20',
      text: 'Wrong Answer',
      color: 'text-error'
    },
    'TLE': {
      icon: 'timer',
      className: 'bg-accent/15 text-accent border-accent/25',
      iconBg: 'bg-accent/20',
      text: 'Time Limit Exceeded',
      color: 'text-accent'
    },
    'Time Limit Exceeded': {
      icon: 'timer',
      className: 'bg-accent/15 text-accent border-accent/25',
      iconBg: 'bg-accent/20',
      text: 'Time Limit Exceeded',
      color: 'text-accent'
    },
    'MLE': {
      icon: 'alert-circle',
      className: 'bg-purple-500/15 text-purple-400 border-purple-500/25',
      iconBg: 'bg-purple-500/20',
      text: 'Memory Limit Exceeded',
      color: 'text-purple-400'
    },
    'Memory Limit Exceeded': {
      icon: 'alert-circle',
      className: 'bg-purple-500/15 text-purple-400 border-purple-500/25',
      iconBg: 'bg-purple-500/20',
      text: 'Memory Limit Exceeded',
      color: 'text-purple-400'
    },
    'RE': {
      icon: 'x-circle',
      className: 'bg-error/15 text-error border-error/25',
      iconBg: 'bg-error/20',
      text: 'Runtime Error',
      color: 'text-error'
    },
    'Runtime Error': {
      icon: 'x-circle',
      className: 'bg-error/15 text-error border-error/25',
      iconBg: 'bg-error/20',
      text: 'Runtime Error',
      color: 'text-error'
    },
    'CE': {
      icon: 'alert-circle',
      className: 'bg-purple-500/15 text-purple-400 border-purple-500/25',
      iconBg: 'bg-purple-500/20',
      text: 'Compile Error',
      color: 'text-purple-400'
    },
    'Compile Error': {
      icon: 'alert-circle',
      className: 'bg-purple-500/15 text-purple-400 border-purple-500/25',
      iconBg: 'bg-purple-500/20',
      text: 'Compile Error',
      color: 'text-purple-400'
    },
    'SE': {
      icon: 'alert-circle',
      className: 'bg-muted/50 text-muted-foreground border-border',
      iconBg: 'bg-muted',
      text: 'System Error',
      color: 'text-muted-foreground'
    },
    'System Error': {
      icon: 'alert-circle',
      className: 'bg-muted/50 text-muted-foreground border-border',
      iconBg: 'bg-muted',
      text: 'System Error',
      color: 'text-muted-foreground'
    },
    'Pending': {
      icon: 'loader-2',
      className: 'bg-primary/15 text-primary-light border-primary/25',
      iconBg: 'bg-primary/20',
      text: 'Pending',
      color: 'text-primary-light'
    },
    'Judging': {
      icon: 'loader-2',
      className: 'bg-primary/15 text-primary-light border-primary/25',
      iconBg: 'bg-primary/20',
      text: 'Judging',
      color: 'text-primary-light'
    },
    'Running': {
      icon: 'loader-2',
      className: 'bg-primary/15 text-primary-light border-primary/25',
      iconBg: 'bg-primary/20',
      text: 'Running',
      color: 'text-primary-light'
    }
  }

  return configs[status] || {
    icon: 'alert-circle',
    className: 'bg-muted/50 text-muted-foreground border-border',
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
  const colorMap: Record<string, string> = {
    '入门': 'bg-muted/50 text-muted-foreground border border-border',
    '普及-': 'bg-secondary/15 text-secondary-light border border-secondary/25',
    '普及': 'bg-info/15 text-cyan-400 border border-info/25',
    '普及+': 'bg-accent/15 text-accent-light border border-accent/25',
    '提高': 'bg-accent/15 text-accent-light border border-accent/25',
    '提高+': 'bg-error/15 text-red-400 border border-error/25',
    '省选': 'bg-error/15 text-red-400 border border-error/25',
    'NOI': 'bg-purple-500/15 text-purple-400 border border-purple-500/25',
    '简单': 'bg-secondary/15 text-secondary-light border border-secondary/25',
    '中等': 'bg-accent/15 text-accent-light border border-accent/25',
    '困难': 'bg-error/15 text-red-400 border border-error/25',
    'easy': 'bg-secondary/15 text-secondary-light border border-secondary/25',
    'medium': 'bg-accent/15 text-accent-light border border-accent/25',
    'hard': 'bg-error/15 text-red-400 border border-error/25',
    'Easy': 'bg-secondary/15 text-secondary-light border border-secondary/25',
    'Medium': 'bg-accent/15 text-accent-light border border-accent/25',
    'Hard': 'bg-error/15 text-red-400 border border-error/25'
  }
  return colorMap[difficulty] || 'bg-muted/50 text-muted-foreground border border-border'
}