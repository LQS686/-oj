import ContestProblemsWorkspaceLayout from './ContestProblemsWorkspaceLayout'

/** 题目标题由 [problemId] 页 useProblemDocumentTitle；列表页由 DocumentTitleProvider */
export default function ContestProblemsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <ContestProblemsWorkspaceLayout>{children}</ContestProblemsWorkspaceLayout>
}