import type { IAccount, IAsset, ISubject, SubjectType } from '@/api/whereis'

/** 脱敏显示敏感数据 */
export function maskSensitive(type: SubjectType, val: string): string {
  const s = val.trim()
  if (!s)
    return ''

  switch (type) {
    case 'phone': {
      // 11位手机号保留前3后4
      if (/^\d{11}$/.test(s))
        return `${s.slice(0, 3)}****${s.slice(7)}`
      if (s.length > 7)
        return `${s.slice(0, 3)}****${s.slice(-4)}`
      return s
    }
    case 'email': {
      const at = s.indexOf('@')
      if (at > 1) {
        const user = s.slice(0, at)
        const domain = s.slice(at)
        if (user.length <= 2)
          return `${user[0]}*${domain}`
        return `${user[0]}***${user.slice(-1)}${domain}`
      }
      return s
    }
    case 'bankcard': {
      const digits = s.replace(/\s+/g, '')
      if (digits.length >= 4)
        return `尾号 ${digits.slice(-4)}`
      return s
    }
    case 'idcard': {
      if (s.length >= 15)
        return `${s.slice(0, 6)}********${s.slice(-4)}`
      return s
    }
    default:
      return s
  }
}

export interface ExpireInfo {
  status: 'active' | 'expiring' | 'expired'
  text: string
  daysLeft: number
}

/** 计算到期状态与剩余天数 */
export function getExpireInfo(expireAt: number, currentTimestamp = Math.floor(Date.now() / 1000)): ExpireInfo {
  if (!expireAt || expireAt <= 0) {
    return { status: 'active', text: '长期有效', daysLeft: Number.POSITIVE_INFINITY }
  }

  const diffSec = expireAt - currentTimestamp
  const daysLeft = Math.ceil(diffSec / 86400)

  if (daysLeft < 0) {
    return { status: 'expired', text: `已过期 ${Math.abs(daysLeft)} 天`, daysLeft }
  }
  if (daysLeft === 0) {
    return { status: 'expiring', text: '今日到期', daysLeft: 0 }
  }
  if (daysLeft <= 30) {
    return { status: 'expiring', text: `剩余 ${daysLeft} 天到期`, daysLeft }
  }
  return { status: 'active', text: `${daysLeft} 天后到期`, daysLeft }
}

/** 资产搜索匹配 */
export function matchesSearch(
  asset: IAsset,
  account?: IAccount,
  subject?: ISubject,
  keyword = '',
): boolean {
  const kw = keyword.trim().toLowerCase()
  if (!kw)
    return true

  const fields = [
    asset.name,
    asset.category,
    asset.costCycle,
    ...(asset.tags || []),
    account?.platform || '',
    account?.accountName || '',
    subject?.name || '',
    subject?.maskedValue || '',
  ]

  return fields.some(f => f.toLowerCase().includes(kw))
}

export interface SubjectGroup {
  subject: ISubject | null
  accounts: {
    account: IAccount
    assets: IAsset[]
  }[]
  totalAssetsCount: number
}

/** 按主体聚合（反向视图：查 A 关联了什么） */
export function groupBySubject(
  assets: IAsset[],
  accounts: IAccount[],
  subjects: ISubject[],
): SubjectGroup[] {
  const accountMap = new Map(accounts.map(a => [a.id, a]))
  const assetsByAccount = new Map<number, IAsset[]>()

  for (const asset of assets) {
    const list = assetsByAccount.get(asset.accountId) || []
    list.push(asset)
    assetsByAccount.set(asset.accountId, list)
  }

  // 1. 对应已知主体的
  const result: SubjectGroup[] = subjects.map((subj) => {
    const matchedAccounts = accounts.filter(acc => acc.subjectId === subj.id)
    const accGroups = matchedAccounts.map(acc => ({
      account: acc,
      assets: assetsByAccount.get(acc.id) || [],
    }))
    const totalAssetsCount = accGroups.reduce((acc, curr) => acc + curr.assets.length, 0)

    return {
      subject: subj,
      accounts: accGroups,
      totalAssetsCount,
    }
  })

  // 2. 未关联主体的平台账号
  const unassignedAccounts = accounts.filter(acc => !acc.subjectId)
  if (unassignedAccounts.length > 0) {
    const accGroups = unassignedAccounts.map(acc => ({
      account: acc,
      assets: assetsByAccount.get(acc.id) || [],
    }))
    const totalAssetsCount = accGroups.reduce((acc, curr) => acc + curr.assets.length, 0)
    result.push({
      subject: null,
      accounts: accGroups,
      totalAssetsCount,
    })
  }

  return result
}
