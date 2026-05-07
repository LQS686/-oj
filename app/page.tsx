'use client'

import Link from 'next/link'
import { 
  Code2, 
  Trophy, 
  Users, 
  BookOpen, 
  ArrowRight, 
  Sparkles, 
  Terminal, 
  Cpu, 
  Brain,
  Zap,
  Target,
  Medal,
  TrendingUp,
  Clock,
  CheckCircle2,
  Star,
  Rocket,
  ChevronRight,
  Layers,
  GitBranch,
  Shield
} from 'lucide-react'
import { useSettings } from '@/contexts/SettingsContext'
import { useUser } from '@/contexts/UserContext'
import { motion, easeOut } from 'framer-motion'

const MotionLink = motion(Link)

export default function Home() {
  const { settings } = useSettings()
  const { user } = useUser()
  
  const features = [
    {
      icon: Terminal,
      title: "海量题库",
      description: "涵盖入门到NOI难度，算法、数据结构、数学等多个领域的优质题目",
      gradient: "from-primary to-primary-dark",
      shadowColor: "shadow-primary/30",
      delay: 0.1
    },
    {
      icon: Cpu,
      title: "实时评测",
      description: "支持C++、Python、Java等多种语言，毫秒级响应，精准反馈",
      gradient: "from-secondary to-secondary-dark",
      shadowColor: "shadow-secondary/30",
      delay: 0.2
    },
    {
      icon: Trophy,
      title: "竞赛系统",
      description: "ACM、OI、IOI多种赛制，实时排行榜和详细数据分析",
      gradient: "from-accent to-accent-dark",
      shadowColor: "shadow-accent/30",
      delay: 0.3
    },
    {
      icon: Users,
      title: "社区交流",
      description: "题解分享、讨论区、博客系统，与志同道合的伙伴共同进步",
      gradient: "from-info to-cyan-600",
      shadowColor: "shadow-info/30",
      delay: 0.4
    },
    {
      icon: BookOpen,
      title: "训练计划",
      description: "系统化学习路径，循序渐进提升编程能力和算法思维",
      gradient: "from-primary to-primary-dark",
      shadowColor: "shadow-primary/30",
      delay: 0.5
    },
    {
      icon: Brain,
      title: "能力评估",
      description: "Rating系统、成就徽章，可视化追踪学习进度和能力成长",
      gradient: "from-secondary to-secondary-dark",
      shadowColor: "shadow-secondary/30",
      delay: 0.6
    }
  ]

  const stats = [
    { number: "10,000+", label: "精选题目", icon: BookOpen },
    { number: "100,000+", label: "活跃用户", icon: Users },
    { number: "1,000,000+", label: "代码提交", icon: Code2 },
    { number: "500+", label: "精彩竞赛", icon: Trophy }
  ]

  const highlights = [
    {
      icon: Target,
      title: "精准定位",
      description: "智能推荐适合你水平的题目"
    },
    {
      icon: Medal,
      title: "成就系统",
      description: "解锁徽章，记录成长历程"
    },
    {
      icon: TrendingUp,
      title: "数据分析",
      description: "可视化追踪学习进度"
    },
    {
      icon: Clock,
      title: "实时反馈",
      description: "毫秒级评测，即时结果"
    }
  ]

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  }

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: {
        duration: 0.5,
        ease: easeOut
      }
    }
  }

  return (
    <div className="min-h-screen">
      <section className="relative py-24 md:py-40 overflow-hidden">
        <div className="absolute inset-0">
          <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-primary/8 rounded-full blur-[150px] animate-pulse-slow"></div>
          <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-secondary/6 rounded-full blur-[120px] animate-pulse-slow" style={{ animationDelay: '2s' }}></div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-accent/4 rounded-full blur-[180px]"></div>
        </div>
        
        <div className="container mx-auto px-4 relative z-10">
          <motion.div 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="text-center max-w-5xl mx-auto"
          >
            <div className="inline-flex items-center gap-2.5 px-6 py-3 rounded-full bg-primary/8 border border-primary/20 mb-10 backdrop-blur-md shadow-sm hover:shadow-md transition-shadow">
              <Sparkles className="w-4.5 h-4.5 text-primary-light" />
              <span className="text-primary-light font-semibold text-sm">提升编程能力，从这里开始</span>
            </div>
            
            <h1 className="section-title text-4xl sm:text-5xl md:text-6xl lg:text-7xl mb-8 leading-tight">
              <span className="text-foreground">在线编程</span>
              <br />
              <span className="gradient-text glow">学习平台</span>
            </h1>
            
            <p className="text-lg md:text-xl text-muted-foreground mb-12 max-w-2xl mx-auto leading-relaxed">
              海量精选题库、实时评测系统、专业竞赛平台，<br className="hidden sm:block" />
              助你从入门到精通，成为编程高手
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <MotionLink
                href="/problems"
                className="btn-primary btn text-base px-10 py-4.5 group shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Rocket className="w-5 h-5" />
                开始刷题
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1.5 transition-transform" />
              </MotionLink>
              <MotionLink
                href="/contests"
                className="btn-outline btn text-base px-10 py-4.5"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Trophy className="w-5 h-5" />
                参加竞赛
              </MotionLink>
            </div>
          </motion.div>
        </div>
      </section>

      <section className="py-20 md:py-28">
        <div className="container mx-auto px-4">
          <motion.div 
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="glass-strong rounded-3xl p-10 md:p-16 border border-primary/5"
          >
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 md:gap-12">
              {stats.map((stat, index) => {
                const Icon = stat.icon
                return (
                  <motion.div 
                    key={index} 
                    className="text-center group"
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: index * 0.1 }}
                  >
                    <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/8 mb-5 group-hover:scale-115 transition-all duration-300 group-hover:bg-primary/12">
                      <Icon className="w-7 h-7 text-primary-light" />
                    </div>
                    <div className="text-3xl md:text-4xl lg:text-5xl font-extrabold gradient-text mb-2.5">
                      {stat.number}
                    </div>
                    <div className="text-muted-foreground font-medium text-sm md:text-base">
                      {stat.label}
                    </div>
                  </motion.div>
                )
              })}
            </div>
          </motion.div>
        </div>
      </section>

      <section className="py-20 md:py-32">
        <div className="container mx-auto px-4">
          <motion.div 
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-20"
          >
            <h2 className="section-title text-3xl md:text-4xl lg:text-5xl text-foreground mb-5">
              平台<span className="gradient-text">特色</span>
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              全方位提升你的编程能力，打造专业的学习体验
            </p>
          </motion.div>
          
          <motion.div 
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-7"
          >
            {features.map((feature, index) => {
              const Icon = feature.icon
              return (
                <motion.div 
                  key={index} 
                  variants={itemVariants}
                  transition={{ delay: feature.delay }}
                  className="card p-8 group cursor-pointer hover:border-primary/20"
                >
                  <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${feature.gradient} flex items-center justify-center mb-6 text-white shadow-xl ${feature.shadowColor} group-hover:scale-110 group-hover:rotate-3 transition-all duration-400`}>
                    <Icon className="w-8 h-8" />
                  </div>
                  <h3 className="text-xl font-bold text-foreground mb-3 group-hover:text-primary-light transition-colors">
                    {feature.title}
                  </h3>
                  <p className="text-muted-foreground leading-relaxed">
                    {feature.description}
                  </p>
                </motion.div>
              )
            })}
          </motion.div>
        </div>
      </section>

      <section className="py-20 md:py-32">
        <div className="container mx-auto px-4">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <motion.div 
              initial={{ opacity: 0, x: -40 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7 }}
            >
              <h2 className="section-title text-3xl md:text-4xl text-foreground mb-7">
                为什么选择<span className="gradient-text">我们</span>
              </h2>
              <p className="text-muted-foreground text-lg mb-10 leading-relaxed">
                我们致力于为每一位编程爱好者提供最优质的学习环境和最专业的评测系统，帮助你高效提升编程能力。
              </p>
              
              <div className="grid sm:grid-cols-2 gap-7">
                {highlights.map((item, index) => {
                  const Icon = item.icon
                  return (
                    <motion.div 
                      key={index}
                      initial={{ opacity: 0, y: 15 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.5, delay: index * 0.1 }}
                      className="flex items-start gap-4 group"
                    >
                      <div className="w-12 h-12 rounded-xl bg-primary/8 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/15 group-hover:scale-105 transition-all">
                        <Icon className="w-5.5 h-5.5 text-primary-light" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-foreground mb-1.5 group-hover:text-primary-light transition-colors">{item.title}</h4>
                        <p className="text-sm text-muted-foreground">{item.description}</p>
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            </motion.div>
            
            <motion.div 
              initial={{ opacity: 0, x: 40 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7 }}
              className="relative"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-primary/15 to-secondary/12 rounded-3xl blur-3xl"></div>
              <div className="relative glass-strong rounded-3xl p-9 border border-primary/8 shadow-xl">
                <div className="flex items-center gap-3 mb-7">
                  <div className="flex gap-2">
                    <div className="w-3.5 h-3.5 rounded-full bg-error/100"></div>
                    <div className="w-3.5 h-3.5 rounded-full bg-accent/100"></div>
                    <div className="w-3.5 h-3.5 rounded-full bg-secondary/100"></div>
                  </div>
                  <div className="ml-4 flex-1 text-center py-1.5 px-3 rounded-lg bg-muted/40">
                    <span className="text-xs text-muted-foreground font-mono">solution.cpp</span>
                  </div>
                </div>
                <div className="bg-muted/30 rounded-2xl p-5 overflow-x-auto">
                  <pre className="text-sm font-mono text-foreground leading-relaxed">
                    <code>{`#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    
    int n;
    cin >> n;
    
    // Your solution here
    cout << "Hello, OJ Platform!" << endl;
    
    return 0;
}`}</code>
                  </pre>
                </div>
                <div className="mt-7 flex flex-wrap items-center gap-5">
                  <div className="flex items-center gap-2.5 text-secondary bg-secondary/10 px-4 py-2.5 rounded-xl">
                    <CheckCircle2 className="w-5.5 h-5.5" />
                    <span className="text-sm font-semibold">编译成功</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Clock className="w-4.5 h-4.5" />
                    <span className="text-sm font-medium">耗时: 1ms</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Cpu className="w-4.5 h-4.5" />
                    <span className="text-sm font-medium">内存: 256KB</span>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {!user && (
        <section className="py-20 md:py-32">
          <div className="container mx-auto px-4">
            <motion.div 
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7 }}
              className="relative overflow-hidden rounded-3xl shadow-2xl"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-primary via-purple-600 to-secondary animate-gradient"></div>
              <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAxOGMtOS45NDEgMC0xOCA4LjA1OS0xOCAxOHM4LjA1OSAxOCAxOCAxOCAxOC04LjA1OSAxOC0xOC04LjA1OS0xOC0xOC0xOHptMCAzMmMtNy43MzIgMC0xNC02LjI2OC0xNC0xNHM2LjI2OC0xNCAxNC0xNCAxNCA2LjI2OCAxNCAxNC02LjI2OCAxNC0xNCAxNHoiIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iLjA1Ii8+PC9nPjwvc3ZnPg==')] opacity-25"></div>
              
              <div className="relative p-12 md:p-20 text-center text-white">
                <div className="inline-flex items-center gap-2.5 px-5 py-2.5 rounded-full bg-white/12 backdrop-blur-md mb-8 border border-white/20">
                  <Star className="w-4.5 h-4.5 text-yellow-300" />
                  <span className="text-sm font-medium">免费使用</span>
                </div>
                
                <h2 className="text-3xl md:text-4xl lg:text-5xl font-extrabold mb-6 leading-tight">
                  准备好开始了吗？
                </h2>
                <p className="text-lg md:text-xl text-white/85 mb-12 max-w-2xl mx-auto leading-relaxed">
                  立即注册，加入我们的编程社区，<br className="hidden sm:block" />
                  开启你的编程之旅，挑战无限可能
                </p>
                
                <div className="flex flex-col sm:flex-row gap-5 justify-center">
                  <MotionLink
                    href="/register"
                    className="inline-flex items-center justify-center gap-2.5 bg-white text-primary px-10 py-4.5 rounded-2xl font-bold text-base hover:bg-gray-100 transition-all hover:scale-105 hover:shadow-2xl"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <Zap className="w-5.5 h-5.5" />
                    免费注册
                    <ArrowRight className="w-5.5 h-5.5" />
                  </MotionLink>
                  <MotionLink
                    href="/login"
                    className="inline-flex items-center justify-center gap-2.5 bg-white/12 backdrop-blur-md text-white px-10 py-4.5 rounded-2xl font-bold text-base hover:bg-white/20 transition-all border border-white/30"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    已有账号？登录
                  </MotionLink>
                </div>
              </div>
            </motion.div>
          </div>
        </section>
      )}

      <footer className="py-16 border-t border-border bg-gradient-to-b from-transparent to-muted/10">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 bg-gradient-to-br from-primary to-primary-dark rounded-2xl flex items-center justify-center shadow-lg shadow-primary/25">
                <Code2 className="w-5.5 h-5.5 text-white" />
              </div>
              <div>
                <span className="font-bold text-foreground text-lg">{settings.siteName}</span>
                <p className="text-xs text-muted-foreground mt-0.5">{settings.siteDescription}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-7 text-sm text-muted-foreground">
              <Link href="/problems" className="hover:text-primary-light transition-colors font-medium">题库</Link>
              <Link href="/contests" className="hover:text-primary-light transition-colors font-medium">竞赛</Link>
              <Link href="/discuss" className="hover:text-primary-light transition-colors font-medium">社区</Link>
              <Link href="/rank" className="hover:text-primary-light transition-colors font-medium">排行榜</Link>
            </div>
            
            <div className="text-sm text-muted-foreground">
              &copy; {new Date().getFullYear()} {settings.siteName}. All rights reserved.
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
