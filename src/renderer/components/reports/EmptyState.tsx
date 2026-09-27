// ============================================================================
//  Postie POS - EmptyState: khối "chưa có dữ liệu" — giữ nguyên phong cách
//  của màn Báo cáo cũ (icon Inbox trong hình tròn nền secondary).
// ============================================================================

import { Inbox } from 'lucide-react'

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-secondary">
        <Inbox className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="font-medium">{title}</p>
      {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
    </div>
  )
}
