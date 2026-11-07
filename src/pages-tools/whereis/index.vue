<script lang="ts" setup>
import type { IAccount, IAccountForm, IAsset, IAssetForm, ISubject, ISubjectForm } from '@/api/whereis'
import {
  createAccount,
  createAsset,
  createSubject,
  deleteAccount,
  deleteAsset,
  deleteSubject,
  getWhereisOverview,
  updateAccount,
  updateAsset,
  updateSubject,
} from '@/api/whereis'
import { confirmDelete, copyText, toast } from '@/utils/common'
import { userKey } from '@/utils/user-storage'
import {
  CATEGORIES,
  getCategoryPreset,
  getSubjectTypePreset,
  POPULAR_PLATFORMS,
  SUBJECT_TYPES,
} from './presets'
import { getExpireInfo, groupBySubject, maskSensitive, matchesSearch } from './utils'

definePage({
  style: { navigationBarTitleText: '归属查询' },
})

/* ---------------- 状态与缓存 ---------------- */

const CACHE_KEY = 'ot-whereis-cache'

const subjects = ref<ISubject[]>([])
const accounts = ref<IAccount[]>([])
const assets = ref<IAsset[]>([])
const loading = ref(false)

const keyword = ref('')
const viewMode = ref<'asset' | 'subject'>('asset')
const selectedCategory = ref<string>('all')

const VIEW_OPTIONS = [
  { value: 'asset', label: '找归属 (C在哪)' },
  { value: 'subject', label: '查绑定 (绑了啥)' },
]

// 读取本地缓存 (SWR)
function readLocalCache() {
  try {
    const raw = uni.getStorageSync(userKey(CACHE_KEY))
    if (raw) {
      const data = JSON.parse(raw)
      subjects.value = data.subjects || []
      accounts.value = data.accounts || []
      assets.value = data.assets || []
    }
  }
  catch {}
}

function writeLocalCache() {
  try {
    uni.setStorageSync(
      userKey(CACHE_KEY),
      JSON.stringify({
        subjects: subjects.value,
        accounts: accounts.value,
        assets: assets.value,
      }),
    )
  }
  catch {}
}

async function loadData(silent = false) {
  if (!silent)
    loading.value = true
  try {
    const res = await getWhereisOverview()
    subjects.value = res.subjects || []
    accounts.value = res.accounts || []
    assets.value = res.assets || []
    writeLocalCache()
  }
  catch (e) {
    console.error('加载归属数据失败', e)
  }
  finally {
    loading.value = false
  }
}

onLoad(() => {
  readLocalCache()
  loadData(assets.value.length > 0)
})

/* ---------------- 衍生映射与统计 ---------------- */

const subjectMap = computed(() => new Map(subjects.value.map(s => [s.id, s])))
const accountMap = computed(() => new Map(accounts.value.map(a => [a.id, a])))

const filteredAssets = computed(() => {
  return assets.value.filter((item) => {
    if (selectedCategory.value !== 'all' && item.category !== selectedCategory.value)
      return false
    const acc = accountMap.value.get(item.accountId)
    const subj = acc?.subjectId ? subjectMap.value.get(acc.subjectId) : undefined
    return matchesSearch(item, acc, subj, keyword.value)
  })
})

const subjectGroups = computed(() => {
  return groupBySubject(filteredAssets.value, accounts.value, subjects.value)
})

function getCategoryCount(catId: string) {
  if (catId === 'all')
    return assets.value.length
  return assets.value.filter(a => a.category === catId).length
}

/* ---------------- 弹窗与表单状态 ---------------- */

// 资产弹窗
const showAssetModal = ref(false)
const editingAssetId = ref<number | null>(null)
const assetForm = reactive<IAssetForm>({
  accountId: 0,
  category: 'domain',
  name: '',
  tags: [],
  costCycle: '',
  status: 'active',
  extra: {},
})
const assetTagsInput = ref('')
const assetExpireDate = ref('')
const assetNotes = ref('')

// 平台账号弹窗
const showAccountModal = ref(false)
const editingAccountId = ref<number | null>(null)
const accountForm = reactive<IAccountForm>({
  platform: '',
  accountName: '',
  loginUrl: '',
  icon: 'i-carbon-cloud',
  subjectId: null,
})

// 主体弹窗
const showSubjectModal = ref(false)
const editingSubjectId = ref<number | null>(null)
const subjectForm = reactive<ISubjectForm>({
  type: 'phone',
  name: '',
  maskedValue: '',
  secretData: '',
})
const rawSubjectValue = ref('')

// 详情查看弹窗
const showDetailModal = ref(false)
const currentDetailAsset = ref<IAsset | null>(null)

/* ---------------- 资产 CRUD ---------------- */

function openCreateAsset(defaultAccountId?: number) {
  editingAssetId.value = null
  assetForm.name = ''
  assetForm.category = 'domain'
  assetForm.accountId = defaultAccountId || accounts.value[0]?.id || 0
  assetForm.costCycle = ''
  assetForm.status = 'active'
  assetTagsInput.value = ''
  assetExpireDate.value = ''
  assetNotes.value = ''
  showAssetModal.value = true
}

function openEditAsset(item: IAsset) {
  editingAssetId.value = item.id
  assetForm.name = item.name
  assetForm.category = item.category
  assetForm.accountId = item.accountId
  assetForm.costCycle = item.costCycle || ''
  assetForm.status = item.status || 'active'
  assetTagsInput.value = (item.tags || []).join(' ')
  assetExpireDate.value = item.expireAt ? formatDate(item.expireAt) : ''
  assetNotes.value = item.extra?.notes || ''
  showAssetModal.value = true
}

async function saveAsset() {
  if (!assetForm.name.trim())
    return toast('请填写资产名称')
  if (!assetForm.accountId) {
    if (accounts.value.length === 0)
      return toast('请先新建平台账号')
    return toast('请选择归属平台')
  }

  const tags = assetTagsInput.value
    .split(/[,，\s]+/)
    .map(s => s.trim())
    .filter(Boolean)

  let expireAt = 0
  if (assetExpireDate.value) {
    const t = Math.floor(new Date(assetExpireDate.value).getTime() / 1000)
    if (!Number.isNaN(t))
      expireAt = t
  }

  const data: IAssetForm = {
    name: assetForm.name.trim(),
    category: assetForm.category,
    accountId: assetForm.accountId,
    costCycle: assetForm.costCycle?.trim(),
    status: assetForm.status,
    tags,
    expireAt,
    extra: { ...assetForm.extra, notes: assetNotes.value.trim() },
  }

  try {
    if (editingAssetId.value) {
      await updateAsset(editingAssetId.value, data)
      toast('修改成功', 'success')
    }
    else {
      await createAsset(data)
      toast('添加成功', 'success')
    }
    showAssetModal.value = false
    await loadData(true)
  }
  catch {}
}

function removeAsset(item: IAsset) {
  confirmDelete('确认删除资产', `确定要删除「${item.name}」吗？`, async () => {
    try {
      await deleteAsset(item.id)
      toast('已删除', 'success')
      if (currentDetailAsset.value?.id === item.id)
        showDetailModal.value = false
      await loadData(true)
    }
    catch {}
  })
}

/* ---------------- 平台账号 CRUD ---------------- */

function openCreateAccount(defaultSubjectId?: number | null) {
  editingAccountId.value = null
  accountForm.platform = ''
  accountForm.accountName = ''
  accountForm.loginUrl = ''
  accountForm.icon = 'i-carbon-cloud'
  accountForm.subjectId = defaultSubjectId !== undefined ? defaultSubjectId : (subjects.value[0]?.id || null)
  showAccountModal.value = true
}

function selectPresetPlatform(p: typeof POPULAR_PLATFORMS[0]) {
  accountForm.platform = p.name
  accountForm.icon = p.icon
  if (p.loginUrl)
    accountForm.loginUrl = p.loginUrl
}

async function saveAccount() {
  if (!accountForm.platform.trim())
    return toast('请填写平台名称')

  const data: IAccountForm = {
    platform: accountForm.platform.trim(),
    accountName: accountForm.accountName?.trim() || '',
    loginUrl: accountForm.loginUrl?.trim() || '',
    icon: accountForm.icon || 'i-carbon-cloud',
    subjectId: accountForm.subjectId || null,
  }

  try {
    if (editingAccountId.value) {
      await updateAccount(editingAccountId.value, data)
      toast('平台已更新', 'success')
    }
    else {
      const res = await createAccount(data)
      toast('平台添加成功', 'success')
      if (showAssetModal.value && res.id)
        assetForm.accountId = res.id
    }
    showAccountModal.value = false
    await loadData(true)
  }
  catch {}
}

function removeAccount(acc: IAccount) {
  confirmDelete('确认删除平台账号', `删除平台「${acc.platform}」将同时删除该平台下的所有资产，是否继续？`, async () => {
    try {
      await deleteAccount(acc.id)
      toast('平台已删除', 'success')
      await loadData(true)
    }
    catch {}
  })
}

/* ---------------- 主体 CRUD ---------------- */

function openCreateSubject() {
  editingSubjectId.value = null
  subjectForm.type = 'phone'
  subjectForm.name = ''
  rawSubjectValue.value = ''
  subjectForm.secretData = ''
  showSubjectModal.value = true
}

async function saveSubject() {
  if (!subjectForm.name.trim())
    return toast('请填写主体别名')

  const masked = rawSubjectValue.value.trim()
    ? maskSensitive(subjectForm.type, rawSubjectValue.value.trim())
    : subjectForm.name.trim()

  const data: ISubjectForm = {
    type: subjectForm.type,
    name: subjectForm.name.trim(),
    maskedValue: masked,
    secretData: subjectForm.secretData?.trim() || '',
  }

  try {
    if (editingSubjectId.value) {
      await updateSubject(editingSubjectId.value, data)
      toast('主体已更新', 'success')
    }
    else {
      const res = await createSubject(data)
      toast('主体添加成功', 'success')
      if (showAccountModal.value && res.id)
        accountForm.subjectId = res.id
    }
    showSubjectModal.value = false
    await loadData(true)
  }
  catch {}
}

function removeSubject(subj: ISubject) {
  confirmDelete('确认删除主体', `删除主体「${subj.name}」将解绑关联的平台账号，是否继续？`, async () => {
    try {
      await deleteSubject(subj.id)
      toast('主体已删除', 'success')
      await loadData(true)
    }
    catch {}
  })
}

/* ---------------- 快捷动作与展示辅助 ---------------- */

function formatDate(ts: number) {
  const d = new Date(ts * 1000)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function openUrl(url: string) {
  if (!url)
    return
  // #ifdef H5
  window.open(url, '_blank', 'noopener')
  // #endif
  // #ifndef H5
  copyText(url)
  toast('已复制登录后台链接')
  // #endif
}

function openDetail(item: IAsset) {
  currentDetailAsset.value = item
  showDetailModal.value = true
}

// 快速导入预设样例
async function seedSampleData() {
  loading.value = true
  try {
    // 1. 创建主体
    const subjRes = await createSubject({
      type: 'phone',
      name: '个人工作手机号',
      maskedValue: '138****8888',
      secretData: '用于所有云厂商与开发者平台注册',
    })

    // 2. 创建平台账号
    const acc1 = await createAccount({
      platform: '阿里云',
      accountName: 'work_admin@example.com',
      loginUrl: 'https://aliyun.com',
      icon: 'i-carbon-cloud',
      subjectId: subjRes.id,
    })

    const acc2 = await createAccount({
      platform: 'Cloudflare',
      accountName: 'devops@mycorp.com',
      loginUrl: 'https://dash.cloudflare.com',
      icon: 'i-carbon-cloud',
      subjectId: subjRes.id,
    })

    const acc3 = await createAccount({
      platform: 'GitHub',
      accountName: 'tech-team-lead',
      loginUrl: 'https://github.com',
      icon: 'i-carbon-logo-github',
      subjectId: subjRes.id,
    })

    // 3. 创建资产
    await createAsset({
      name: 'myapp.com (主站域名)',
      category: 'domain',
      accountId: acc2.id,
      costCycle: '$9.15/年',
      expireAt: Math.floor(Date.now() / 1000) + 86400 * 250,
      tags: ['生产', '主域名'],
      status: 'active',
      extra: { notes: 'DNS 解析挂在 Cloudflare，原注册商在阿里云' },
    })

    await createAsset({
      name: '43.153.22.11 (香港生产服务器)',
      category: 'server',
      accountId: acc1.id,
      costCycle: '¥288/年',
      expireAt: Math.floor(Date.now() / 1000) + 86400 * 15,
      tags: ['生产', 'VPS', '香港'],
      status: 'expiring',
      extra: { notes: '轻量应用服务器，跑 Docker 服务集群' },
    })

    await createAsset({
      name: 'GitHub Copilot 订阅',
      category: 'subscription',
      accountId: acc3.id,
      costCycle: '$10/月',
      expireAt: 0,
      tags: ['SaaS', 'AI'],
      status: 'active',
      extra: { notes: '按月自动续费' },
    })

    toast('演示数据导入成功', 'success')
    await loadData(true)
  }
  catch (e) {
    console.error('导入失败', e)
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <ot-tool-layout :max-width="960">
    <!-- 顶部操作栏与搜索条 -->
    <ot-panel>
      <view class="flex flex-col gap-3">
        <!-- 搜索与新建 -->
        <view class="flex items-center gap-2">
          <view class="flex-1">
            <wd-search
              v-model="keyword"
              placeholder="搜索资产 C、平台、账号、主体或标签…"
              hide-cancel
            />
          </view>
          <wd-button size="small" type="primary" @click="openCreateAsset()">
            <view class="i-carbon-add mr-1 text-14px" />
            记归属
          </wd-button>
        </view>

        <!-- 视图切换与主体维护入口 -->
        <view class="flex flex-wrap items-center justify-between gap-2 pt-1">
          <ot-segmented
            v-model="viewMode"
            :options="VIEW_OPTIONS"
            size="small"
          />
          <view class="flex items-center gap-2">
            <wd-button size="small" plain @click="openCreateAccount()">
              + 平台账号
            </wd-button>
            <wd-button size="small" plain @click="openCreateSubject()">
              + 根主体
            </wd-button>
          </view>
        </view>

        <!-- 分类滚动筛选 (仅正向模式显示) -->
        <scroll-view v-if="viewMode === 'asset'" scroll-x class="whitespace-nowrap pt-1">
          <view class="inline-flex gap-1.5 pb-1">
            <view
              class="ot-cat-chip"
              :class="{ 'is-active': selectedCategory === 'all' }"
              @click="selectedCategory = 'all'"
            >
              全部 ({{ getCategoryCount('all') }})
            </view>
            <view
              v-for="cat in CATEGORIES"
              :key="cat.id"
              class="ot-cat-chip"
              :class="{ 'is-active': selectedCategory === cat.id }"
              @click="selectedCategory = cat.id"
            >
              <view :class="cat.icon" class="mr-1 text-12px" />
              {{ cat.name }} ({{ getCategoryCount(cat.id) }})
            </view>
          </view>
        </scroll-view>
      </view>
    </ot-panel>

    <!-- 加载中 -->
    <view v-if="loading && !assets.length" class="py-12 text-center text-13px text-muted">
      正在同步云端归属图谱…
    </view>

    <!-- 空状态 -->
    <ot-panel v-else-if="filteredAssets.length === 0">
      <view class="flex flex-col items-center gap-3 py-10">
        <view class="i-carbon-query text-48px text-muted" />
        <view class="text-15px text-main font-600">
          {{ keyword ? '未搜到匹配的资产归属' : '还没有添加任何资产归属' }}
        </view>
        <view class="max-w-320px text-center text-12px text-muted">
          {{ keyword ? '试试搜平台名、手机号后四位或标签' : '工作生活中想要使用 C 却记不清属于哪个账号？立即记录，随时秒搜。' }}
        </view>
        <view v-if="!keyword" class="mt-2 flex gap-3">
          <wd-button size="small" type="primary" @click="openCreateAsset()">
            添加第一笔资产
          </wd-button>
          <wd-button size="small" plain @click="seedSampleData()">
            导入演示样例体验
          </wd-button>
        </view>
      </view>
    </ot-panel>

    <!-- 视角 1: 正向列表 (找 C 在哪) -->
    <view v-else-if="viewMode === 'asset'" class="flex flex-col gap-3">
      <view
        v-for="item in filteredAssets"
        :key="item.id"
        class="ot-card hover:border-[var(--wot-color-theme)]"
        @click="openDetail(item)"
      >
        <!-- 头部: 分类徽标 + 资产名称 + 到期标签 -->
        <view class="flex items-start justify-between gap-2">
          <view class="min-w-0 flex flex-1 items-center gap-2">
            <view
              class="ot-icon-badge"
              :style="{
                backgroundColor: `${getCategoryPreset(item.category).color}1a`,
                color: getCategoryPreset(item.category).color,
              }"
            >
              <view :class="getCategoryPreset(item.category).icon" class="text-16px" />
            </view>
            <view class="min-w-0 flex-1">
              <view class="truncate text-15px text-main font-600">
                {{ item.name }}
              </view>
              <view v-if="item.costCycle" class="mt-0.5 text-12px text-amber-600 dark:text-amber-400">
                {{ item.costCycle }}
              </view>
            </view>
          </view>

          <!-- 状态与到期 -->
          <view
            class="ot-expire-badge"
            :class="`is-${getExpireInfo(item.expireAt).status}`"
          >
            {{ getExpireInfo(item.expireAt).text }}
          </view>
        </view>

        <!-- 核心归属链路 -->
        <view class="mt-3 rounded-8px bg-slate-50 p-2 text-12px dark:bg-slate-800/50">
          <view class="flex flex-wrap items-center gap-1.5 text-muted">
            <!-- 平台账号 -->
            <view class="flex items-center gap-1 text-slate-800 font-500 dark:text-slate-200">
              <view :class="accountMap.get(item.accountId)?.icon || 'i-carbon-cloud'" class="text-14px text-blue-500" />
              <text>{{ accountMap.get(item.accountId)?.platform || '未知平台' }}</text>
              <text v-if="accountMap.get(item.accountId)?.accountName" class="text-slate-500">
                ({{ accountMap.get(item.accountId)?.accountName }})
              </text>
            </view>

            <!-- 关系箭头 -->
            <view class="i-carbon-arrow-left text-12px opacity-50" />

            <!-- 归属根主体 -->
            <template v-if="accountMap.get(item.accountId)?.subjectId">
              <view class="flex items-center gap-1 text-slate-700 dark:text-slate-300">
                <view
                  :class="getSubjectTypePreset(subjectMap.get(accountMap.get(item.accountId)!.subjectId!)?.type || 'other').icon"
                  class="text-13px text-emerald-500"
                />
                <text>{{ subjectMap.get(accountMap.get(item.accountId)!.subjectId!)?.name }}</text>
                <text class="text-muted">
                  [{{ subjectMap.get(accountMap.get(item.accountId)!.subjectId!)?.maskedValue }}]
                </text>
              </view>
            </template>
            <template v-else>
              <text class="text-muted opacity-75">未绑定根主体</text>
            </template>
          </view>
        </view>

        <!-- 标签与备注 -->
        <view v-if="item.tags?.length || item.extra?.notes" class="mt-2.5 flex flex-wrap items-center gap-1.5">
          <wd-tag
            v-for="t in item.tags"
            :key="t"
            size="small"
            plain
          >
            #{{ t }}
          </wd-tag>
          <text v-if="item.extra?.notes" class="truncate text-12px text-muted">
            {{ item.extra.notes }}
          </text>
        </view>

        <!-- 快捷操作栏 -->
        <view class="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-12px dark:border-slate-800" @click.stop>
          <view class="flex items-center gap-2">
            <view
              v-if="accountMap.get(item.accountId)?.loginUrl"
              class="ot-action-btn text-blue-600 hover:underline"
              @click="openUrl(accountMap.get(item.accountId)!.loginUrl)"
            >
              <view class="i-carbon-launch mr-0.5 text-12px" />
              后台
            </view>
            <view
              v-if="accountMap.get(item.accountId)?.accountName"
              class="ot-action-btn text-muted hover:text-main"
              @click="copyText(accountMap.get(item.accountId)!.accountName)"
            >
              <view class="i-carbon-copy mr-0.5 text-12px" />
              复制账号
            </view>
          </view>

          <view class="flex items-center gap-3 text-muted">
            <view class="cursor-pointer hover:text-blue-500" @click="openEditAsset(item)">
              编辑
            </view>
            <view class="cursor-pointer hover:text-rose-500" @click="removeAsset(item)">
              删除
            </view>
          </view>
        </view>
      </view>
    </view>

    <!-- 视角 2: 反向列表 (查主体绑了啥) -->
    <view v-else-if="viewMode === 'subject'" class="flex flex-col gap-3">
      <view
        v-for="grp in subjectGroups"
        :key="grp.subject?.id || 'unassigned'"
        class="ot-card"
      >
        <!-- 主体卡片头 -->
        <view class="flex items-center justify-between border-b border-slate-100 pb-2.5 dark:border-slate-800">
          <view class="flex items-center gap-2">
            <view
              class="ot-icon-badge"
              :class="grp.subject ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40' : 'bg-slate-100 text-slate-500'"
            >
              <view :class="grp.subject ? getSubjectTypePreset(grp.subject.type).icon : 'i-carbon-help'" class="text-18px" />
            </view>
            <view>
              <view class="text-15px text-main font-600">
                {{ grp.subject ? grp.subject.name : '未绑定主体资源' }}
              </view>
              <view class="text-12px text-muted">
                {{ grp.subject ? `${getSubjectTypePreset(grp.subject.type).name}: ${grp.subject.maskedValue}` : '直接在平台下管理' }}
              </view>
            </view>
          </view>

          <!-- 数量徽标与操作 -->
          <view class="flex items-center gap-2">
            <wd-tag size="small" type="primary" plain>
              {{ grp.totalAssetsCount }} 项资产
            </wd-tag>
            <view v-if="grp.subject" class="i-carbon-trash-can cursor-pointer text-14px text-muted hover:text-rose-500" @click="removeSubject(grp.subject)" />
          </view>
        </view>

        <!-- 平台与所属资产列表 -->
        <view class="mt-3 flex flex-col gap-3">
          <view
            v-for="accGroup in grp.accounts"
            :key="accGroup.account.id"
            class="rounded-8px bg-slate-50/80 p-2.5 dark:bg-slate-800/40"
          >
            <!-- 平台标题 -->
            <view class="flex items-center justify-between pb-1.5">
              <view class="flex items-center gap-1.5 font-500">
                <view :class="accGroup.account.icon || 'i-carbon-cloud'" class="text-14px text-blue-500" />
                <text class="text-13px text-main">{{ accGroup.account.platform }}</text>
                <text v-if="accGroup.account.accountName" class="text-12px text-muted">
                  ({{ accGroup.account.accountName }})
                </text>
              </view>
              <view class="flex items-center gap-2 text-11px text-muted">
                <text class="cursor-pointer hover:text-blue-500" @click="openCreateAsset(accGroup.account.id)">+ 挂载资产</text>
                <text class="cursor-pointer hover:text-rose-500" @click="removeAccount(accGroup.account)">删除平台</text>
              </view>
            </view>

            <!-- 资产子清单 -->
            <view v-if="accGroup.assets.length" class="flex flex-col gap-1.5 pt-1">
              <view
                v-for="ast in accGroup.assets"
                :key="ast.id"
                class="flex cursor-pointer items-center justify-between rounded-6px bg-white px-2.5 py-1.5 text-12px shadow-sm dark:bg-slate-900 hover:shadow"
                @click="openDetail(ast)"
              >
                <view class="min-w-0 flex flex-1 items-center gap-1.5">
                  <view :class="getCategoryPreset(ast.category).icon" class="text-13px text-muted" />
                  <text class="truncate text-main font-500">{{ ast.name }}</text>
                  <text v-if="ast.costCycle" class="text-11px text-amber-600">({{ ast.costCycle }})</text>
                </view>
                <view class="shrink-0 text-11px" :class="`text-${getExpireInfo(ast.expireAt).status === 'expired' ? 'rose-500' : 'muted'}`">
                  {{ getExpireInfo(ast.expireAt).text }}
                </view>
              </view>
            </view>
            <view v-else class="py-1 text-center text-11px text-muted">
              该平台下暂无资产
            </view>
          </view>
        </view>
      </view>
    </view>

    <!-- 弹窗：新建 / 编辑资产 C -->
    <wd-popup
      v-model="showAssetModal"
      position="center"
      custom-style="border-radius: 16px; width: min(92vw, 480px); max-height: 90vh; overflow: hidden;"
    >
      <view class="p-4">
        <view class="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
          <text class="text-16px text-main font-600">
            {{ editingAssetId ? '编辑资产归属' : '登记新资产 (C)' }}
          </text>
          <view class="i-carbon-close cursor-pointer text-18px text-muted" @click="showAssetModal = false" />
        </view>

        <scroll-view scroll-y class="max-h-[65vh] pt-3">
          <view class="flex flex-col gap-3">
            <!-- 资产名称 -->
            <view>
              <view class="mb-1 text-13px text-main font-500">
                资产名称 / 标识 <text class="text-rose-500">*</text>
              </view>
              <wd-input
                v-model="assetForm.name"
                placeholder="如: api.myblog.com / 43.153.x.x / Claude Pro"
                clearable
              />
            </view>

            <!-- 类别单选 -->
            <view>
              <view class="mb-1.5 text-13px text-main font-500">
                资产类别
              </view>
              <view class="flex flex-wrap gap-1.5">
                <view
                  v-for="c in CATEGORIES"
                  :key="c.id"
                  class="ot-tag-btn"
                  :class="{ 'is-selected': assetForm.category === c.id }"
                  @click="assetForm.category = c.id"
                >
                  <view :class="c.icon" class="mr-1 text-12px" />
                  {{ c.name }}
                </view>
              </view>
            </view>

            <!-- 所属平台账号 -->
            <view>
              <view class="mb-1 flex items-center justify-between">
                <text class="text-13px text-main font-500">归属平台账号 <text class="text-rose-500">*</text></text>
                <text class="cursor-pointer text-12px text-blue-500" @click="openCreateAccount()">+ 新建平台账号</text>
              </view>
              <view v-if="accounts.length === 0" class="rounded-8px bg-amber-50 p-2 text-12px text-amber-700 dark:bg-amber-950/40">
                还未创建任何平台账号，请先点击右上角新建。
              </view>
              <view v-else class="flex flex-wrap gap-1.5">
                <view
                  v-for="acc in accounts"
                  :key="acc.id"
                  class="ot-tag-btn"
                  :class="{ 'is-selected': assetForm.accountId === acc.id }"
                  @click="assetForm.accountId = acc.id"
                >
                  <view :class="acc.icon || 'i-carbon-cloud'" class="mr-1 text-12px" />
                  {{ acc.platform }}{{ acc.accountName ? ` (${acc.accountName})` : '' }}
                </view>
              </view>
            </view>

            <!-- 费用周期 -->
            <view>
              <view class="mb-1 text-13px text-main font-500">
                费用周期 (选填)
              </view>
              <wd-input
                v-model="assetForm.costCycle"
                placeholder="如: ¥99/年, $20/月, 免费"
                clearable
              />
            </view>

            <!-- 到期日 -->
            <view>
              <view class="mb-1 text-13px text-main font-500">
                到期日期 (选填)
              </view>
              <wd-input
                v-model="assetExpireDate"
                placeholder="格式: 2027-10-01 (留空为长期有效)"
                clearable
              />
            </view>

            <!-- 标签 -->
            <view>
              <view class="mb-1 text-13px text-main font-500">
                自定义标签 (空格或逗号分隔)
              </view>
              <wd-input
                v-model="assetTagsInput"
                placeholder="如: 生产 域名续费 外包"
                clearable
              />
            </view>

            <!-- 备注 -->
            <view>
              <view class="mb-1 text-13px text-main font-500">
                详细备注说明
              </view>
              <wd-input
                v-model="assetNotes"
                placeholder="补充具体用途、解析配置或关联事项"
                clearable
              />
            </view>
          </view>
        </scroll-view>

        <view class="mt-4 flex gap-2 pt-2">
          <wd-button class="flex-1" plain @click="showAssetModal = false">
            取消
          </wd-button>
          <wd-button class="flex-1" type="primary" @click="saveAsset()">
            确定保存
          </wd-button>
        </view>
      </view>
    </wd-popup>

    <!-- 弹窗：新建 / 编辑平台账号 -->
    <wd-popup
      v-model="showAccountModal"
      position="center"
      custom-style="border-radius: 16px; width: min(92vw, 440px);"
    >
      <view class="p-4">
        <view class="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
          <text class="text-16px text-main font-600">新建/管理平台账号</text>
          <view class="i-carbon-close cursor-pointer text-18px text-muted" @click="showAccountModal = false" />
        </view>

        <view class="flex flex-col gap-3 pt-3">
          <!-- 常用推荐平台 -->
          <view>
            <view class="mb-1 text-12px text-muted">
              点选常用预设平台：
            </view>
            <scroll-view scroll-x class="whitespace-nowrap">
              <view class="inline-flex gap-1.5 pb-1">
                <view
                  v-for="p in POPULAR_PLATFORMS"
                  :key="p.name"
                  class="ot-tag-btn"
                  @click="selectPresetPlatform(p)"
                >
                  <view :class="p.icon" class="mr-1 text-12px" />
                  {{ p.name }}
                </view>
              </view>
            </scroll-view>
          </view>

          <!-- 平台名称 -->
          <view>
            <view class="mb-1 text-13px text-main font-500">
              平台名称 <text class="text-rose-500">*</text>
            </view>
            <wd-input
              v-model="accountForm.platform"
              placeholder="如: 阿里云、Cloudflare、GitHub"
              clearable
            />
          </view>

          <!-- 账号名称 -->
          <view>
            <view class="mb-1 text-13px text-main font-500">
              登录账号标识
            </view>
            <wd-input
              v-model="accountForm.accountName"
              placeholder="如: admin@qq.com / 子账号 dev"
              clearable
            />
          </view>

          <!-- 登录入口 URL -->
          <view>
            <view class="mb-1 text-13px text-main font-500">
              管理后台网址
            </view>
            <wd-input
              v-model="accountForm.loginUrl"
              placeholder="如: https://dash.cloudflare.com"
              clearable
            />
          </view>

          <!-- 关联主体 -->
          <view>
            <view class="mb-1 flex items-center justify-between">
              <text class="text-13px text-main font-500">归属根主体 (手机号/卡号)</text>
              <text class="cursor-pointer text-12px text-blue-500" @click="openCreateSubject()">+ 新建主体</text>
            </view>
            <view class="flex flex-wrap gap-1.5">
              <view
                class="ot-tag-btn"
                :class="{ 'is-selected': accountForm.subjectId === null }"
                @click="accountForm.subjectId = null"
              >
                不指定主体
              </view>
              <view
                v-for="s in subjects"
                :key="s.id"
                class="ot-tag-btn"
                :class="{ 'is-selected': accountForm.subjectId === s.id }"
                @click="accountForm.subjectId = s.id"
              >
                <view :class="getSubjectTypePreset(s.type).icon" class="mr-1 text-12px" />
                {{ s.name }} ({{ s.maskedValue }})
              </view>
            </view>
          </view>
        </view>

        <view class="mt-4 flex gap-2 pt-2">
          <wd-button class="flex-1" plain @click="showAccountModal = false">
            取消
          </wd-button>
          <wd-button class="flex-1" type="primary" @click="saveAccount()">
            保存平台
          </wd-button>
        </view>
      </view>
    </wd-popup>

    <!-- 弹窗：新建 / 编辑主体 -->
    <wd-popup
      v-model="showSubjectModal"
      position="center"
      custom-style="border-radius: 16px; width: min(92vw, 420px);"
    >
      <view class="p-4">
        <view class="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
          <text class="text-16px text-main font-600">添加归属主体 (根凭据)</text>
          <view class="i-carbon-close cursor-pointer text-18px text-muted" @click="showSubjectModal = false" />
        </view>

        <view class="flex flex-col gap-3 pt-3">
          <!-- 主体类型 -->
          <view>
            <view class="mb-1.5 text-13px text-main font-500">
              主体类别
            </view>
            <view class="flex flex-wrap gap-1.5">
              <view
                v-for="st in SUBJECT_TYPES"
                :key="st.type"
                class="ot-tag-btn"
                :class="{ 'is-selected': subjectForm.type === st.type }"
                @click="subjectForm.type = st.type"
              >
                <view :class="st.icon" class="mr-1 text-12px" />
                {{ st.name }}
              </view>
            </view>
          </view>

          <!-- 别名 -->
          <view>
            <view class="mb-1 text-13px text-main font-500">
              别名标签 <text class="text-rose-500">*</text>
            </view>
            <wd-input
              v-model="subjectForm.name"
              placeholder="如: 个人主号、公司招行公户、爸妈副卡"
              clearable
            />
          </view>

          <!-- 真实值 (自动脱敏) -->
          <view>
            <view class="mb-1 text-13px text-main font-500">
              真实标识内容 (自动脱敏保护)
            </view>
            <wd-input
              v-model="rawSubjectValue"
              :placeholder="getSubjectTypePreset(subjectForm.type).placeholder"
              clearable
            />
          </view>

          <!-- 补充保密备注 -->
          <view>
            <view class="mb-1 text-13px text-main font-500">
              补充备注说明
            </view>
            <wd-input
              v-model="subjectForm.secretData"
              placeholder="如: 办卡网点、主卡副卡信息"
              clearable
            />
          </view>
        </view>

        <view class="mt-4 flex gap-2 pt-2">
          <wd-button class="flex-1" plain @click="showSubjectModal = false">
            取消
          </wd-button>
          <wd-button class="flex-1" type="primary" @click="saveSubject()">
            保存主体
          </wd-button>
        </view>
      </view>
    </wd-popup>

    <!-- 弹窗：查看资产详情全景 -->
    <wd-popup
      v-model="showDetailModal"
      position="center"
      custom-style="border-radius: 16px; width: min(92vw, 440px);"
    >
      <view v-if="currentDetailAsset" class="p-4">
        <view class="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
          <text class="text-16px text-main font-600">资产归属全景</text>
          <view class="i-carbon-close cursor-pointer text-18px text-muted" @click="showDetailModal = false" />
        </view>

        <view class="flex flex-col gap-3 pt-3 text-13px">
          <view class="flex items-center justify-between">
            <text class="text-muted">资产名称：</text>
            <text class="font-600" user-select selectable>{{ currentDetailAsset.name }}</text>
          </view>

          <view class="flex items-center justify-between">
            <text class="text-muted">资产分类：</text>
            <view class="flex items-center gap-1 font-500">
              <view :class="getCategoryPreset(currentDetailAsset.category).icon" />
              {{ getCategoryPreset(currentDetailAsset.category).name }}
            </view>
          </view>

          <view class="flex items-center justify-between">
            <text class="text-muted">承载平台：</text>
            <text class="font-500">{{ accountMap.get(currentDetailAsset.accountId)?.platform || '—' }}</text>
          </view>

          <view class="flex items-center justify-between">
            <text class="text-muted">平台账号：</text>
            <view class="flex items-center gap-1">
              <text user-select selectable>{{ accountMap.get(currentDetailAsset.accountId)?.accountName || '—' }}</text>
              <view
                v-if="accountMap.get(currentDetailAsset.accountId)?.accountName"
                class="i-carbon-copy cursor-pointer text-12px text-blue-500"
                @click="copyText(accountMap.get(currentDetailAsset.accountId)!.accountName)"
              />
            </view>
          </view>

          <view class="flex items-center justify-between">
            <text class="text-muted">归属主体：</text>
            <text>
              {{ accountMap.get(currentDetailAsset.accountId)?.subjectId ? subjectMap.get(accountMap.get(currentDetailAsset.accountId)!.subjectId!)?.name : '未绑定' }}
              ({{ accountMap.get(currentDetailAsset.accountId)?.subjectId ? subjectMap.get(accountMap.get(currentDetailAsset.accountId)!.subjectId!)?.maskedValue : '—' }})
            </text>
          </view>

          <view class="flex items-center justify-between">
            <text class="text-muted">费用周期：</text>
            <text class="text-amber-600 font-500">{{ currentDetailAsset.costCycle || '免费 / 无周期' }}</text>
          </view>

          <view class="flex items-center justify-between">
            <text class="text-muted">到期状态：</text>
            <text :class="`text-${getExpireInfo(currentDetailAsset.expireAt).status === 'expired' ? 'rose-500' : 'emerald-600'}`">
              {{ getExpireInfo(currentDetailAsset.expireAt).text }}
              {{ currentDetailAsset.expireAt ? `(${formatDate(currentDetailAsset.expireAt)})` : '' }}
            </text>
          </view>

          <view v-if="currentDetailAsset.extra?.notes" class="rounded-8px bg-slate-50 p-2.5 text-12px text-muted dark:bg-slate-800">
            <view class="mb-1 text-slate-700 font-500 dark:text-slate-300">
              备忘说明：
            </view>
            <text user-select selectable>{{ currentDetailAsset.extra.notes }}</text>
          </view>
        </view>

        <view class="mt-4 flex gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
          <wd-button
            class="flex-1"
            size="small"
            plain
            @click="openEditAsset(currentDetailAsset)"
          >
            编辑
          </wd-button>
          <wd-button
            class="flex-1"
            size="small"
            type="error"
            plain
            @click="removeAsset(currentDetailAsset)"
          >
            删除
          </wd-button>
        </view>
      </view>
    </wd-popup>
  </ot-tool-layout>
</template>

<style lang="scss" scoped>
.ot-cat-chip {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  font-size: 12px;
  border-radius: 9999px;
  background-color: var(--ot-bg-subtle, #f1f5f9);
  color: var(--ot-text-muted, #64748b);
  cursor: pointer;
  transition: all 0.2s;

  &.is-active {
    background-color: var(--wot-color-theme, #3b82f6);
    color: #ffffff;
    font-weight: 500;
  }
}

.ot-card {
  padding: 14px;
  border-radius: 12px;
  background: var(--ot-card, #ffffff);
  border: 1px solid var(--ot-border, #e2e8f0);
  box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  cursor: pointer;
  transition:
    border-color 0.2s,
    box-shadow 0.2s;
}

.ot-icon-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 8px;
  flex-shrink: 0;
}

.ot-expire-badge {
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 500;

  &.is-active {
    background-color: #ecfdf5;
    color: #059669;
  }

  &.is-expiring {
    background-color: #fffbeb;
    color: #d97706;
  }

  &.is-expired {
    background-color: #fef2f2;
    color: #dc2626;
  }
}

.ot-action-btn {
  display: inline-flex;
  align-items: center;
  cursor: pointer;
}

.ot-tag-btn {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 12px;
  background: var(--ot-bg-subtle, #f8fafc);
  border: 1px solid var(--ot-border, #e2e8f0);
  color: var(--ot-text-muted, #475569);
  cursor: pointer;

  &.is-selected {
    background: #eff6ff;
    border-color: #3b82f6;
    color: #1d4ed8;
    font-weight: 500;
  }
}
</style>
