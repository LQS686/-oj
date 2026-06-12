'use client'

import { useParams } from 'next/navigation'
import Link from 'next/link'
import { BookOpen, ArrowLeft, Gift, Award, Star, HelpCircle, CheckCircle, BookMarked, Zap, AlertCircle } from 'lucide-react'

export default function PointsRulesPage() {
  const params = useParams()
  const classId = params.id as string

  return (
    <div className="min-h-screen">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="flex items-center gap-2 text-sm mb-6">
          <Link
            href={`/classes/${classId}/points`}
            className="text-muted-foreground hover:text-primary-light transition-colors flex items-center gap-1"
          >
            <ArrowLeft className="w-4 h-4" />
            积分概览
          </Link>
          <span className="text-muted-foreground/50">/</span>
          <span className="text-foreground font-medium">积分规则</span>
        </div>

        <div className="flex items-center gap-4 mb-8">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-info to-cyan-600 flex items-center justify-center shadow-lg shadow-info/30">
            <BookOpen className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">积分规则说明</h1>
            <p className="text-muted-foreground text-sm">了解如何获得和使用积分</p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="card-static rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-secondary/15 flex items-center justify-center">
                <Gift className="w-5 h-5 text-secondary-light" />
              </div>
              <h2 className="text-xl font-bold text-foreground">如何获得积分</h2>
            </div>

            <div className="space-y-4">
              <div className="glass rounded-xl p-4 border-l-4 border-secondary">
                <h3 className="font-bold text-lg text-foreground mb-2 flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-secondary-light" />
                  完成班级作业
                </h3>
                <p className="text-muted-foreground mb-3">
                  当你成功完成作业中的题目（评测结果为 AC）时，系统会自动发放积分奖励。
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <div className="bg-muted/50 rounded-lg p-3 text-center">
                    <p className="text-xs text-muted-foreground mb-1">入门难度</p>
                    <p className="font-bold text-secondary-light">10 积分</p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3 text-center">
                    <p className="text-xs text-muted-foreground mb-1">普及/提高-</p>
                    <p className="font-bold text-secondary-light">20 积分</p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3 text-center">
                    <p className="text-xs text-muted-foreground mb-1">提高+/省选-</p>
                    <p className="font-bold text-secondary-light">30 积分</p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3 text-center">
                    <p className="text-xs text-muted-foreground mb-1">省选/NOI</p>
                    <p className="font-bold text-secondary-light">50 积分</p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mt-3 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-secondary-light" />
                  <span>每道题目只能获得一次积分奖励。</span>
                </p>
              </div>

              <div className="glass rounded-xl p-4 border-l-4 border-info">
                <h3 className="font-bold text-lg text-foreground mb-2 flex items-center gap-2">
                  <BookMarked className="w-5 h-5 text-info" />
                  阅读班级笔记
                </h3>
                <p className="text-muted-foreground mb-3">
                  首次阅读班级内的学习笔记可获得积分奖励，鼓励大家互相学习。
                </p>
                <div className="bg-muted/50 rounded-lg p-3 inline-flex flex-col gap-1">
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-info" />
                    <span>首次阅读笔记可获得奖励：</span>
                  </p>
                  <p className="font-bold text-info text-lg pl-6">5 积分</p>
                </div>
                <p className="text-sm text-muted-foreground mt-3 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-info" />
                  <span>每篇笔记只能获得一次积分奖励。</span>
                </p>
              </div>

              <div className="glass rounded-xl p-4 border-l-4 border-accent">
                <h3 className="font-bold text-lg text-foreground mb-2 flex items-center gap-2">
                  <Star className="w-5 h-5 text-accent-light" />
                  课堂表现优秀
                </h3>
                <p className="text-muted-foreground mb-3">
                  在课堂上积极回答问题、帮助同学、表现优秀的同学，教师可以手动发放积分奖励。
                </p>
                <div className="bg-muted/50 rounded-lg p-3 inline-block">
                  <p className="text-sm text-muted-foreground">积分范围：</p>
                  <p className="font-bold text-accent-light text-lg">1-100 积分</p>
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  发放方式：由教师/管理员手动发放
                </p>
              </div>
            </div>
          </div>

          <div className="card-static rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-accent/100/15 flex items-center justify-center">
                <Zap className="w-5 h-5 text-amber-400" />
              </div>
              <h2 className="text-xl font-bold text-foreground">如何使用积分</h2>
            </div>

            <div className="space-y-4">
              <div className="glass rounded-xl p-4 border-l-4 border-amber-500">
                <h3 className="font-bold text-lg text-foreground mb-2">兑换精美礼品</h3>
                <p className="text-muted-foreground mb-3">
                  在积分商城中，你可以使用积分兑换各种奖品：
                </p>
                <ul className="space-y-2 text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-info"></span>
                    <strong className="text-foreground">虚拟商品</strong>：会员特权、专属称号、头像框等
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-secondary-light"></span>
                    <strong className="text-foreground">实物商品</strong>：书籍、文具、电子产品等
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-accent-light"></span>
                    <strong className="text-foreground">特殊权限</strong>：作业延期券、免做作业券等
                  </li>
                </ul>
              </div>

              <div className="bg-accent/100/10 border border-amber-500/20 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Zap className="w-4 h-4 text-amber-400" />
                  <h4 className="font-bold text-amber-400">温馨提示</h4>
                </div>
                <ul className="text-sm text-accent-light/80 space-y-1 list-disc list-inside">
                  <li>兑换后积分将被扣除，无法恢复。</li>
                  <li>部分实物商品库存有限，先到先得。</li>
                  <li>兑换成功后请到「兑换记录」查看订单状态。</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="card-static rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-error/15 flex items-center justify-center">
                <Award className="w-5 h-5 text-error" />
              </div>
              <h2 className="text-xl font-bold text-foreground">积分统计说明</h2>
            </div>

            <div className="space-y-3">
              <div className="flex items-start gap-4 glass rounded-xl p-4">
                <span className="tag tag-primary shrink-0">总积分</span>
                <p className="text-muted-foreground">
                  你累计获得的所有积分，包括已使用和未使用的
                </p>
              </div>

              <div className="flex items-start gap-4 glass rounded-xl p-4">
                <span className="tag tag-success shrink-0">可用积分</span>
                <p className="text-muted-foreground">
                  当前可以用于兑换商品的积分余额
                </p>
              </div>

              <div className="flex items-start gap-4 glass rounded-xl p-4">
                <span className="tag tag-warning shrink-0">已用积分</span>
                <p className="text-muted-foreground">
                  已经兑换商品消耗的积分
                </p>
              </div>
            </div>
          </div>

          <div className="card-static rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-muted/50 flex items-center justify-center">
                <HelpCircle className="w-5 h-5 text-muted-foreground" />
              </div>
              <h2 className="text-xl font-bold text-foreground">常见问题</h2>
            </div>

            <div className="space-y-4">
              {[
                { q: '积分会过期吗？', a: '目前积分不会过期，但班级管理员可能会在学期结束时清零积分，具体以班级公告为准。' },
                { q: '为什么我完成了作业但没有获得积分？', a: '每道题目只能获得一次积分。如果你之前已经完成过该题目，再次提交不会重复获得积分。' },
                { q: '兑换的实物商品如何领取？', a: '兑换成功后，管理员会在「兑换记录」中处理你的订单。实物商品通常需要你填写收货地址，等待发货。' },
                { q: '可以转赠积分给其他同学吗？', a: '目前不支持积分转赠功能，所有积分只能由本人使用。' },
                { q: '积分被误扣怎么办？', a: '请联系班级管理员或教师，说明情况。管理员可以手动补发积分。' }
              ].map((item, idx) => (
                <div key={idx} className="glass rounded-xl p-4">
                  <h3 className="font-semibold text-foreground mb-1">Q: {item.q}</h3>
                  <p className="text-muted-foreground text-sm pl-4">
                    A: {item.a}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="card-static rounded-2xl p-6 bg-gradient-to-r from-primary/10 to-secondary/10 border border-primary/20">
            <h3 className="font-bold text-lg text-foreground mb-2">开始赚取积分吧</h3>
            <p className="text-muted-foreground mb-4">
              完成作业、阅读笔记、积极表现，轻松获得积分奖励，兑换心仪的礼品！
            </p>
            <div className="flex gap-3 flex-wrap">
              <Link
                href={`/classes/${classId}/assignments`}
                className="btn btn-primary"
              >
                去做作业
              </Link>
              <Link
                href={`/classes/${classId}/notes`}
                className="btn bg-purple-500 hover:bg-purple-600 text-white"
              >
                阅读笔记
              </Link>
              <Link
                href={`/classes/${classId}/points/shop`}
                className="btn bg-secondary hover:bg-secondary-dark text-white"
              >
                积分商城
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
