<script lang="ts" setup>
// 按需引入各算法，避免打入整个 crypto-js
import HmacSHA256 from 'crypto-js/hmac-sha256'
import MD5 from 'crypto-js/md5'
import SHA1 from 'crypto-js/sha1'
import SHA256 from 'crypto-js/sha256'
import SHA512 from 'crypto-js/sha512'

definePage({
  style: { navigationBarTitleText: '哈希计算' },
})

const input = ref('')
const hmacKey = ref('')
const upper = ref(false)

const results = computed(() => {
  if (!input.value)
    return []
  const list = [
    { label: 'MD5', value: MD5(input.value).toString() },
    { label: 'SHA1', value: SHA1(input.value).toString() },
    { label: 'SHA256', value: SHA256(input.value).toString() },
    { label: 'SHA512', value: SHA512(input.value).toString() },
  ]
  if (hmacKey.value)
    list.push({ label: 'HMAC-SHA256', value: HmacSHA256(input.value, hmacKey.value).toString() })
  return upper.value ? list.map(r => ({ ...r, value: r.value.toUpperCase() })) : list
})
</script>

<template>
  <ot-tool-layout>
    <ot-panel title="输入">
      <ot-textarea v-model="input" :height="140" :mono="false" placeholder="输入要计算摘要的文本（UTF-8）" />
      <input v-model="hmacKey" class="ot-input mt-3" type="text" placeholder="HMAC 密钥（可选）">
    </ot-panel>

    <ot-panel title="结果">
      <template #extra>
        <view class="flex items-center gap-2 text-13px text-sub">
          <wd-switch v-model="upper" size="18px" />
          大写
        </view>
      </template>
      <template v-if="results.length">
        <ot-result v-for="r in results" :key="r.label" :label="r.label" :value="r.value" />
      </template>
      <view v-else class="py-4 text-center text-13px text-muted">
        输入内容后实时计算
      </view>
    </ot-panel>
  </ot-tool-layout>
</template>
