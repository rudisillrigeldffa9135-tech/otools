import { defineComponent, h } from 'vue'

/**
 * H5 原生 textarea（仅 H5 使用）。
 * 模板里写的 <textarea> 会被 uni 编译成内置组件：输入事件节流 100ms、value 变化延迟 100ms 写回，
 * 打字快或输入法组字时旧值会覆盖新输入、光标跳到末尾。这里用渲染函数直接创建原生元素绕开它。
 *
 * value 只在外部替换内容时变化；打字时 value 不变，Vue 不会回写输入框。
 */
export default defineComponent({
  name: 'H5Textarea',
  props: {
    value: { type: String, default: '' },
    placeholder: { type: String, default: '' },
  },
  emits: {
    input: (_e: Event) => true,
    blur: (_e: FocusEvent) => true,
  },
  setup(props, { emit }) {
    return () => h('textarea', {
      value: props.value,
      placeholder: props.placeholder,
      spellcheck: false,
      onInput: (e: Event) => emit('input', e),
      onBlur: (e: FocusEvent) => emit('blur', e),
    })
  },
})
