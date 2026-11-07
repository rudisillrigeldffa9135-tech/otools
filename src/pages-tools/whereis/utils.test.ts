import type { IAccount, IAsset, ISubject } from '@/api/whereis'
import { describe, expect, it } from 'vitest'
import { getExpireInfo, groupBySubject, maskSensitive, matchesSearch } from './utils'

describe('whereis/utils', () => {
  describe('maskSensitive', () => {
    it('正确脱敏手机号', () => {
      expect(maskSensitive('phone', '13812345678')).toBe('138****5678')
      expect(maskSensitive('phone', '18900001111')).toBe('189****1111')
      expect(maskSensitive('phone', '123')).toBe('123')
    })

    it('正确脱敏邮箱', () => {
      expect(maskSensitive('email', 'alexander@example.com')).toBe('a***r@example.com')
      expect(maskSensitive('email', 'me@domain.com')).toBe('m*@domain.com')
      expect(maskSensitive('email', 'invalid')).toBe('invalid')
    })

    it('正确脱敏银行卡与身份证', () => {
      expect(maskSensitive('bankcard', '6222 0212 3456 8848')).toBe('尾号 8848')
      expect(maskSensitive('idcard', '110101199003072345')).toBe('110101********2345')
    })
  })

  describe('getExpireInfo', () => {
    const NOW = 1700000000

    it('无到期日或0表示长期有效', () => {
      expect(getExpireInfo(0, NOW).status).toBe('active')
      expect(getExpireInfo(0, NOW).text).toBe('长期有效')
    })

    it('过去时间判定为已过期', () => {
      const past = NOW - 86400 * 2
      const info = getExpireInfo(past, NOW)
      expect(info.status).toBe('expired')
      expect(info.text).toContain('已过期 2 天')
    })

    it('30天内判定为临期', () => {
      const soon = NOW + 86400 * 5
      const info = getExpireInfo(soon, NOW)
      expect(info.status).toBe('expiring')
      expect(info.text).toContain('剩余 5 天到期')
    })

    it('长于30天判定为生效中', () => {
      const future = NOW + 86400 * 60
      const info = getExpireInfo(future, NOW)
      expect(info.status).toBe('active')
      expect(info.text).toContain('60 天后到期')
    })
  })

  describe('matchesSearch', () => {
    const mockAsset: IAsset = {
      id: 1,
      accountId: 10,
      category: 'domain',
      name: 'api.example.com',
      tags: ['生产', '核心'],
      expireAt: 0,
      costCycle: '¥99/年',
      status: 'active',
      extra: {},
      createdAt: 0,
      updatedAt: 0,
    }

    const mockAccount: IAccount = {
      id: 10,
      subjectId: 100,
      platform: '阿里云',
      accountName: 'ops_admin',
      loginUrl: 'https://aliyun.com',
      icon: 'i-carbon-cloud',
      createdAt: 0,
      updatedAt: 0,
    }

    const mockSubject: ISubject = {
      id: 100,
      type: 'phone',
      name: '个人主号',
      maskedValue: '138****8888',
      secretData: '',
      sort: 1,
      createdAt: 0,
      updatedAt: 0,
    }

    it('关键词为空时全匹配', () => {
      expect(matchesSearch(mockAsset, mockAccount, mockSubject, '')).toBe(true)
    })

    it('匹配资产名称和标签', () => {
      expect(matchesSearch(mockAsset, mockAccount, mockSubject, 'api')).toBe(true)
      expect(matchesSearch(mockAsset, mockAccount, mockSubject, '生产')).toBe(true)
      expect(matchesSearch(mockAsset, mockAccount, mockSubject, 'notfound')).toBe(false)
    })

    it('匹配平台、账号和主体', () => {
      expect(matchesSearch(mockAsset, mockAccount, mockSubject, '阿里')).toBe(true)
      expect(matchesSearch(mockAsset, mockAccount, mockSubject, 'ops_admin')).toBe(true)
      expect(matchesSearch(mockAsset, mockAccount, mockSubject, '个人主号')).toBe(true)
      expect(matchesSearch(mockAsset, mockAccount, mockSubject, '8888')).toBe(true)
    })
  })

  describe('groupBySubject', () => {
    const subjects: ISubject[] = [
      { id: 1, type: 'phone', name: '手机号A', maskedValue: '138****0000', secretData: '', sort: 1, createdAt: 0, updatedAt: 0 },
    ]

    const accounts: IAccount[] = [
      { id: 10, subjectId: 1, platform: '腾讯云', accountName: 'acc1', loginUrl: '', icon: '', createdAt: 0, updatedAt: 0 },
      { id: 20, subjectId: null, platform: 'GitHub', accountName: 'dev', loginUrl: '', icon: '', createdAt: 0, updatedAt: 0 },
    ]

    const assets: IAsset[] = [
      { id: 101, accountId: 10, category: 'server', name: '43.153.1.1', tags: [], expireAt: 0, costCycle: '', status: 'active', extra: {}, createdAt: 0, updatedAt: 0 },
      { id: 102, accountId: 20, category: 'api_key', name: 'PAT-Key', tags: [], expireAt: 0, costCycle: '', status: 'active', extra: {}, createdAt: 0, updatedAt: 0 },
    ]

    it('正确将资产按主体和未关联分组', () => {
      const groups = groupBySubject(assets, accounts, subjects)
      expect(groups).toHaveLength(2)

      const subGroup = groups.find(g => g.subject?.id === 1)
      expect(subGroup).toBeDefined()
      expect(subGroup?.totalAssetsCount).toBe(1)
      expect(subGroup?.accounts[0].assets[0].name).toBe('43.153.1.1')

      const unassignedGroup = groups.find(g => g.subject === null)
      expect(unassignedGroup).toBeDefined()
      expect(unassignedGroup?.totalAssetsCount).toBe(1)
      expect(unassignedGroup?.accounts[0].account.platform).toBe('GitHub')
    })
  })
})
