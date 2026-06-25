'use client'

import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  BookOpen,
  Gift,
  Award,
  Star,
  HelpCircle,
  CheckCircle,
  BookMarked,
  Zap,
  AlertCircle,
} from 'lucide-react'
import { ClassWorkspaceShell } from '@/components/common'
import { useClass } from '@/hooks/useClass'

export default function PointsRulesPage() {
  const params = useParams()
  const classId = params.id as string
  const { classData } = useClass(classId)

  return (
    <ClassWorkspaceShell
      classId={classId}
      className={classData?.name}
      title="积分规则"
      description="了解如何获得和使用积分"
      icon={BookOpen}
      actions={
        <Link href={`/classes/${classId}/points`} className="btn btn-ghost btn-sm">
          积分概览
        </Link>
      }
      width="narrow"
    >
      <div className="space-y-6">
        <section className="bg-card rounded-lg border border-border p-5">
          <div className="flex items-center gap-3 mb-4">
            <Gift className="w-5 h-5 text-secondary" />
            <h2 className="text-lg font-semibold text-foreground">如何获得积分</h2>
          </div>

          <div className="space-y-4">
            <div className="rounded-lg border border-border border-l-4 border-l-secondary p-4">
              <h3 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-secondary" />
                完成班级作业
              </h3>
              <p className="text-sm text-muted-foreground mb-3">
                当你成功完成作业中的题目（评测结果为 AC）时，系统会自动发放积分奖励。
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {[
                  ['入门难度', '10 积分'],
                  ['普及/提高-', '20 积分'],
                  ['提高+/省选-', '30 积分'],
                  ['省选/NOI', '50 积分'],
                ].map(([label, pts]) => (
                  <div key={label} className="bg-muted rounded-lg p-3 text-center">
                    <p className="text-xs text-muted-foreground mb-1">{label}</p>
                    <p className="font-semibold text-secondary text-sm">{pts}</p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-3 flex items-center gap-2">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                每道题目只能获得一次积分奖励。
              </p>
            </div>

            <div className="rounded-lg border border-border border-l-4 border-l-info p-4">
              <h3 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                <BookMarked className="w-4 h-4 text-info" />
                阅读班级笔记
              </h3>
              <p className="text-sm text-muted-foreground mb-2">
                首次阅读班级内的学习笔记可获得积分奖励，鼓励大家互相学习。
              </p>
              <p className="font-semibold text-info">首次阅读：5 积分</p>
              <p className="text-xs text-muted-foreground mt-2">每篇笔记只能获得一次积分奖励。</p>
            </div>

            <div className="rounded-lg border border-border border-l-4 border-l-accent p-4">
              <h3 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                <Star className="w-4 h-4 text-accent" />
                课堂表现优秀
              </h3>
              <p className="text-sm text-muted-foreground mb-2">
                教师可手动为积极回答问题、帮助同学的同学发放积分（1–100 积分）。
              </p>
            </div>
          </div>
        </section>

        <section className="bg-card rounded-lg border border-border p-5">
          <div className="flex items-center gap-3 mb-4">
            <Zap className="w-5 h-5 text-accent" />
            <h2 className="text-lg font-semibold text-foreground">如何使用积分</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-3">在积分商城兑换虚拟商品、实物礼品或特殊权限。</p>
          <ul className="text-sm text-muted-foreground space-y-2 list-disc list-inside">
            <li>兑换后积分将被扣除，无法恢复。</li>
            <li>部分实物商品库存有限，先到先得。</li>
            <li>兑换成功后请到「兑换记录」查看订单状态。</li>
          </ul>
        </section>

        <section className="bg-card rounded-lg border border-border p-5">
          <div className="flex items-center gap-3 mb-4">
            <Award className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">积分统计说明</h2>
          </div>
          <div className="space-y-3 text-sm">
            <div className="flex gap-3 items-start">
              <span className="tag tag-primary shrink-0">总积分</span>
              <p className="text-muted-foreground">累计获得的所有积分，包括已使用和未使用的。</p>
            </div>
            <div className="flex gap-3 items-start">
              <span className="tag tag-success shrink-0">可用积分</span>
              <p className="text-muted-foreground">当前可以用于兑换商品的积分余额。</p>
            </div>
            <div className="flex gap-3 items-start">
              <span className="tag tag-warning shrink-0">已用积分</span>
              <p className="text-muted-foreground">已经兑换商品消耗的积分。</p>
            </div>
          </div>
        </section>

        <section className="bg-card rounded-lg border border-border p-5">
          <div className="flex items-center gap-3 mb-4">
            <HelpCircle className="w-5 h-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold text-foreground">常见问题</h2>
          </div>
          <div className="space-y-3">
            {[
              {
                q: '积分会过期吗？',
                a: '目前积分不会过期，但班级管理员可能会在学期结束时清零积分，具体以班级公告为准。',
              },
              {
                q: '为什么我完成了作业但没有获得积分？',
                a: '每道题目只能获得一次积分。如果你之前已经完成过该题目，再次提交不会重复获得积分。',
              },
              {
                q: '兑换的实物商品如何领取？',
                a: '兑换成功后，管理员会在「兑换记录」中处理订单；实物商品需填写收货地址等待发货。',
              },
              {
                q: '可以转赠积分给其他同学吗？',
                a: '目前不支持积分转赠，所有积分只能由本人使用。',
              },
              {
                q: '积分被误扣怎么办？',
                a: '请联系班级管理员或教师说明情况，管理员可以手动补发积分。',
              },
            ].map((item) => (
              <div key={item.q} className="rounded-lg border border-border p-3">
                <h3 className="font-medium text-foreground text-sm mb-1">Q: {item.q}</h3>
                <p className="text-muted-foreground text-sm pl-0">A: {item.a}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="bg-card rounded-lg border border-border p-5">
          <h3 className="font-semibold text-foreground mb-2">开始赚取积分</h3>
          <p className="text-sm text-muted-foreground mb-4">
            完成作业、阅读笔记、积极表现，兑换心仪的礼品。
          </p>
          <div className="flex gap-2 flex-wrap">
            <Link href={`/classes/${classId}/assignments`} className="btn btn-primary btn-sm">
              去做作业
            </Link>
            <Link href={`/classes/${classId}/notes`} className="btn btn-secondary btn-sm">
              阅读笔记
            </Link>
            <Link href={`/classes/${classId}/points/shop`} className="btn btn-ghost btn-sm">
              积分商城
            </Link>
          </div>
        </div>
      </div>
    </ClassWorkspaceShell>
  )
}