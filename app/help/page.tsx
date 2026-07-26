'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import {
  BookOpen,
  CircleHelp,
  Code2,
  Dumbbell,
  GraduationCap,
  ListChecks,
  Rocket,
  Trophy,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { EducationalPageShell } from '@/components/common'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'

const SECTIONS: { id: string; label: string }[] = [
  { id: 'quickstart', label: '快速上手' },
  { id: 'problems', label: '题库做题' },
  { id: 'contests', label: '竞赛' },
  { id: 'training', label: '题单训练' },
  { id: 'classes', label: '班级作业' },
  { id: 'verdict', label: '评测结果' },
  { id: 'tips', label: '实用技巧' },
]

const QUICK_STEPS: {
  step: string
  title: string
  desc: string
  href: string
  linkLabel: string
  icon: LucideIcon
}[] = [
  {
    step: '1',
    title: '注册并登录',
    desc: '创建账号后即可提交代码、参加竞赛与加入班级。',
    href: '/register',
    linkLabel: '去注册',
    icon: Rocket,
  },
  {
    step: '2',
    title: '从题库练起',
    desc: '阅读题面 → 编写代码 → 提交评测，看懂 AC / WA 等结果。',
    href: '/problems',
    linkLabel: '进入题库',
    icon: BookOpen,
  },
  {
    step: '3',
    title: '按题单系统练习',
    desc: '官方题单与竞赛真题按路径整理，适合循序渐进。',
    href: '/training',
    linkLabel: '题单广场',
    icon: Dumbbell,
  },
  {
    step: '4',
    title: '竞赛与班级',
    desc: '报名正式比赛，或在班级里完成老师布置的作业。',
    href: '/contests',
    linkLabel: '浏览竞赛',
    icon: Trophy,
  },
]

const VERDICTS: { code: string; name: string; meaning: string }[] = [
  { code: 'AC', name: 'Accepted', meaning: '答案正确，通过全部测试点' },
  { code: 'WA', name: 'Wrong Answer', meaning: '输出与期望不符，检查算法与边界' },
  { code: 'TLE', name: 'Time Limit Exceeded', meaning: '运行超时，考虑更优算法或常数优化' },
  { code: 'MLE', name: 'Memory Limit Exceeded', meaning: '内存超限，减少大数组或递归深度' },
  { code: 'RE', name: 'Runtime Error', meaning: '运行时错误，如越界、除零、空指针' },
  { code: 'CE', name: 'Compile Error', meaning: '编译失败，根据编译信息改语法' },
  { code: 'PE', name: 'Presentation Error', meaning: '答案大致正确但格式不符（空格/换行）' },
  { code: 'PC', name: 'Partly Correct', meaning: '部分测试点正确，常见于 OI 赛制' },
]

function Section({
  id,
  icon: Icon,
  title,
  children,
}: {
  id: string
  icon: LucideIcon
  title: string
  children: ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-24 card-static rounded-xl overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-border bg-muted/30">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Icon className="w-4 h-4 text-primary-light" />
        </div>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
      </div>
      <div className="px-5 py-5 space-y-3 text-sm text-foreground/90 leading-relaxed">
        {children}
      </div>
    </section>
  )
}

export default function HelpPage() {
  useDocumentTitle('使用帮助')

  return (
    <EducationalPageShell width="standard" title="使用帮助" icon={CircleHelp}>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground tracking-tight">使用帮助</h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
          快速了解大山 OJ：如何做题、参赛、练题单与完成班级作业。按章节跳转，边看边上手。
        </p>
      </div>

      <nav
        aria-label="帮助目录"
        className="mb-6 flex flex-wrap gap-2"
      >
        {SECTIONS.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className="text-xs sm:text-sm px-2.5 py-1.5 rounded-lg border border-border bg-card text-muted-foreground hover:text-primary-light hover:border-primary/30 transition-colors"
          >
            {s.label}
          </a>
        ))}
      </nav>

      <div className="space-y-4">
        <section id="quickstart" className="scroll-mt-24">
          <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <Rocket className="w-4 h-4 text-primary-light" />
            快速上手
          </h2>
          <ol className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {QUICK_STEPS.map((item) => {
              const Icon = item.icon
              return (
                <li
                  key={item.step}
                  className="card-static rounded-xl p-4 flex gap-3 items-start"
                >
                  <span className="shrink-0 w-7 h-7 rounded-lg bg-primary/10 text-primary-light text-xs font-bold flex items-center justify-center">
                    {item.step}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 font-medium text-foreground">
                      <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                      {item.title}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                      {item.desc}
                    </p>
                    <Link
                      href={item.href}
                      className="inline-flex mt-2 text-xs font-medium text-primary-light hover:underline"
                    >
                      {item.linkLabel} →
                    </Link>
                  </div>
                </li>
              )
            })}
          </ol>
        </section>

        <Section id="problems" icon={BookOpen} title="题库做题">
          <ol className="list-decimal pl-5 space-y-1.5">
            <li>
              打开{' '}
              <Link href="/problems" className="text-primary-light hover:underline">
                题库
              </Link>
              ，按难度 / 标签筛选，点进题目。
            </li>
            <li>左侧阅读题面、样例与提示；右侧查看时限、内存与难度。</li>
            <li>选择语言（如 C++17 / Python），在编辑器中编码，可先用「在线测试」跑样例。</li>
            <li>点击「提交代码」，在提交记录中查看评测结果与详情。</li>
          </ol>
          <p className="text-xs text-muted-foreground pt-1">
            提示：未登录也可浏览题面，提交与记录需要登录。
          </p>
        </Section>

        <Section id="contests" icon={Trophy} title="竞赛">
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              在{' '}
              <Link href="/contests" className="text-primary-light hover:underline">
                竞赛
              </Link>{' '}
              查看即将开始 / 进行中的比赛，阅读「概览」中的赛制说明后报名。
            </li>
            <li>比赛开始后进入「题目」作答；可在「提交」「排名」查看自己与榜单情况。</li>
            <li>部分比赛需密码报名；赛时请遵守时间与诚信规则。</li>
          </ul>
        </Section>

        <Section id="training" icon={Dumbbell} title="题单训练">
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              在{' '}
              <Link href="/training" className="text-primary-light hover:underline">
                训练
              </Link>{' '}
              选择官方题单或竞赛真题，先读「简介」了解目标与题目构成。
            </li>
            <li>点击「加入」后开始练习；顶栏显示已通过进度，可按题号顺序刷题。</li>
            <li>题单内可看题解（若开放），适合阶段性巩固。</li>
          </ul>
        </Section>

        <Section id="classes" icon={Users} title="班级与作业">
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              通过邀请加入{' '}
              <Link href="/classes" className="text-primary-light hover:underline">
                班级
              </Link>
              ，在班级中查看公告、作业与同学动态。
            </li>
            <li>
              作业页含「简介」（老师说明与要求）与「题目」作答区；注意起止时间与是否允许补交。
            </li>
            <li>部分作业会统计单题用时；老师可查看「完成情况」。</li>
          </ul>
        </Section>

        <Section id="verdict" icon={ListChecks} title="评测结果怎么读">
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-left text-sm min-w-[28rem]">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="py-2 pr-3 font-medium w-14">代号</th>
                  <th className="py-2 pr-3 font-medium">含义</th>
                  <th className="py-2 font-medium">说明</th>
                </tr>
              </thead>
              <tbody>
                {VERDICTS.map((v) => (
                  <tr key={v.code} className="border-b border-border/60 last:border-0">
                    <td className="py-2 pr-3 font-mono font-semibold text-foreground">{v.code}</td>
                    <td className="py-2 pr-3 text-muted-foreground whitespace-nowrap">{v.name}</td>
                    <td className="py-2 text-foreground/85">{v.meaning}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section id="tips" icon={GraduationCap} title="实用技巧">
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              在{' '}
              <Link href="/settings" className="text-primary-light hover:underline">
                设置
              </Link>{' '}
              中可调整默认语言等个人偏好。
            </li>
            <li>提交前务必对照样例；注意行末空格、换行与题目输出格式要求。</li>
            <li>
              排行榜看整体进度：前往{' '}
              <Link href="/rank" className="text-primary-light hover:underline">
                排行榜
              </Link>
              。
            </li>
            <li>
              代码风格建议：先想清楚输入输出与边界，再写；TLE 时优先分析复杂度。
            </li>
          </ul>
          <div className="mt-4 pt-4 border-t border-border flex flex-wrap gap-2">
            <Link href="/problems" className="btn btn-primary btn-sm">
              <Code2 className="w-3.5 h-3.5" />
              开始做题
            </Link>
            <Link href="/training" className="btn btn-ghost btn-sm border border-border">
              浏览题单
            </Link>
            <Link href="/contests" className="btn btn-ghost btn-sm border border-border">
              查看竞赛
            </Link>
          </div>
        </Section>
      </div>
    </EducationalPageShell>
  )
}
