<script setup lang="ts">
// 「我的」页面里的提醒方式：站内提醒入口、浏览器推送、日历订阅
import type { PushStatus } from '@/utils/push'
import { disableCalendar, getCalendar, listNotifications, resetCalendar, testPush } from '@/api/notify'
import { copyText, toast } from '@/utils/common'
// #ifdef H5
import { disablePush, enablePush, pushStatus } from '@/utils/push'
// #endif

const unread = ref(0)
const calUrl = ref<string | null>(null)
const calBusy = ref(false)
const pushState = ref<PushStatus>('unsupported')
const pushBusy = ref(false)
const helpOpen = ref(false)

const PUSH_TEXT: Record<PushStatus, string> = {
  'on': '已开启，到点会弹出系统通知',
  'off': '未开启',
  'denied': '通知权限被拒绝，请在浏览器的网站设置里允许通知',
  'unsupported': '当前浏览器不支持推送',
  'insecure': '需要通过 https 访问才能使用推送',
  'no-sw': '后台服务未就绪（请刷新页面；开发环境不支持推送）',
  'ios-install': 'iPhone / iPad 需要先「添加到主屏幕」，再从主屏幕打开才能开启推送',
}

async function refresh() {
  listNotifications().then(d => (unread.value = d.unread)).catch(() => {})
  getCalendar().then(d => (calUrl.value = d.url)).catch(() => {})
  // #ifdef H5
  pushState.value = await pushStatus()
  // #endif
}

async function togglePush() {
  // #ifdef H5
  pushBusy.value = true
  try {
    if (pushState.value === 'on') {
      await disablePush()
      toast('已关闭本浏览器的推送')
    }
    else {
      await enablePush()
      toast('已开启，可以点「发送测试通知」试试', 'success')
    }
  }
  catch (e: any) {
    toast(e?.message || '操作失败')
  }
  finally {
    pushBusy.value = false
    pushState.value = await pushStatus()
  }
  // #endif
}

async function sendTest() {
  try {
    const { subscriptions } = await testPush()
    toast(subscriptions ? '已发送，请留意系统通知' : '已生成一条站内提醒（还没有开启推送的浏览器）')
    unread.value++
  }
  catch {}
}

async function enableCalendar(renew = false) {
  const run = async () => {
    calBusy.value = true
    try {
      calUrl.value = (await resetCalendar()).url
      copyText(calUrl.value)
    }
    catch {}
    finally {
      calBusy.value = false
    }
  }
  if (!renew)
    return run()
  uni.showModal({
    title: '重新生成链接',
    content: '旧链接会立即失效，已订阅的日历需要用新链接重新订阅。确定吗？',
    success: ({ confirm }) => confirm && run(),
  })
}

function turnOffCalendar() {
  uni.showModal({
    title: '关闭日历订阅',
    content: '关闭后链接失效，日历里的待办和纪念日会在下次刷新时消失。',
    confirmColor: '#ef4444',
    success: async ({ confirm }) => {
      if (!confirm)
        return
      await disableCalendar()
      calUrl.value = null
    },
  })
}

/** webcal:// 链接在苹果设备上点击即可订阅 */
const webcalUrl = computed(() => calUrl.value?.replace(/^https?:/, 'webcal:') ?? '')

function goNotify() {
  uni.navigateTo({ url: '/pages/notify/index' })
}

onMounted(refresh)
// 「我的」是 tab 页面，切回来时由页面调用 refresh 更新未读数与推送状态
defineExpose({ refresh })
</script>

<template>
  <ot-panel title="提醒方式">
    <view class="ot-row" @click="goNotify">
      <view class="flex items-center gap-2">
        <view class="i-carbon-notification text-muted" />
        <text>站内提醒</text>
      </view>
      <view class="flex items-center gap-2">
        <text v-if="unread" class="ot-rs__badge">{{ unread > 99 ? '99+' : unread }}</text>
        <view class="i-carbon-chevron-right text-muted" />
      </view>
    </view>

    <!-- 浏览器推送 -->
    <view class="ot-rs__block">
      <view class="flex items-center gap-2">
        <view class="i-carbon-application-web text-muted" />
        <text class="flex-1">浏览器推送</text>
        <!-- #ifdef H5 -->
        <wd-button
          v-if="pushState === 'on' || pushState === 'off'" size="small" :type="pushState === 'on' ? 'info' : 'primary'"
          :plain="pushState === 'on'" :loading="pushBusy" @click="togglePush"
        >
          {{ pushState === 'on' ? '关闭' : '开启' }}
        </wd-button>
        <!-- #endif -->
      </view>
      <!-- #ifdef H5 -->
      <text class="ot-rs__desc">{{ PUSH_TEXT[pushState] }}。每个浏览器需要分别开启。</text>
      <!-- #endif -->
      <!-- #ifndef H5 -->
      <text class="ot-rs__desc">小程序里无法使用浏览器推送，请使用下方的日历订阅，或在电脑 / 手机浏览器里开启。</text>
      <!-- #endif -->
      <text class="ot-rs__link" @click="sendTest">发送测试通知</text>
    </view>

    <!-- 日历订阅 -->
    <view class="ot-rs__block">
      <view class="flex items-center gap-2">
        <view class="i-carbon-calendar text-muted" />
        <text class="flex-1">日历订阅</text>
        <wd-button v-if="!calUrl" size="small" :loading="calBusy" @click="enableCalendar(false)">
          开启
        </wd-button>
      </view>
      <text class="ot-rs__desc">把待办和纪念日（含农历日期与提醒）订阅到手机或电脑自带的日历，由系统日历按时提醒，不打开网站也能收到。日历一般每隔几小时刷新一次。</text>
      <template v-if="calUrl">
        <view class="ot-rs__url ot-mono" @click="copyText(calUrl)">
          {{ calUrl }}
        </view>
        <view class="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          <text class="ot-rs__link" @click="copyText(calUrl)">复制链接</text>
          <!-- #ifdef H5 -->
          <a class="ot-rs__link" :href="webcalUrl">用系统日历打开</a>
          <!-- #endif -->
          <text class="ot-rs__link" @click="helpOpen = !helpOpen">{{ helpOpen ? '收起说明' : '怎么订阅' }}</text>
          <text class="ot-rs__link is-muted" @click="enableCalendar(true)">重新生成</text>
          <text class="ot-rs__link is-danger" @click="turnOffCalendar">关闭</text>
        </view>
        <view v-if="helpOpen" class="ot-rs__help">
          <text class="block"><text class="font-600">iPhone / iPad：</text>设置 → 日历 → 账户 → 添加账户 → 其他 → 添加已订阅的日历，粘贴链接。</text>
          <text class="block"><text class="font-600">Mac：</text>日历 App → 文件 → 新建日历订阅，粘贴链接。</text>
          <text class="block"><text class="font-600">安卓 / Google 日历：</text>电脑打开 calendar.google.com → 其他日历「+」→ 通过网址添加，手机上的 Google 日历会同步。</text>
          <text class="block"><text class="font-600">Outlook：</text>添加日历 → 从 Internet 订阅，粘贴链接。</text>
          <text class="block text-muted">链接相当于钥匙，拿到的人能看到你的待办和纪念日标题；泄露后点「重新生成」，旧链接立即失效。</text>
        </view>
      </template>
    </view>
  </ot-panel>
</template>

<style lang="scss" scoped>
.ot-rs__badge {
  min-width: 18px;
  padding: 0 6px;
  border-radius: 999px;
  font-size: 11px;
  line-height: 18px;
  text-align: center;
  color: #fff;
  background: #ef4444;
}

.ot-rs__block {
  padding: 12px 0;
  border-top: 1px solid var(--ot-border);
  font-size: 14px;
  color: var(--ot-text);
}

.ot-rs__desc {
  display: block;
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--ot-text-3);
}

.ot-rs__link {
  display: inline-block;
  margin-top: 6px;
  font-size: 13px;
  color: var(--wot-color-theme);
  text-decoration: none;
  cursor: pointer;

  &.is-muted {
    color: var(--ot-text-2);
  }

  &.is-danger {
    color: #ef4444;
  }
}

.ot-rs__url {
  margin-top: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 12px;
  word-break: break-all;
  color: var(--ot-text);
  background: var(--ot-fill);
  cursor: pointer;
}

.ot-rs__help {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--ot-text-2);
  background: var(--ot-fill);
}
</style>
