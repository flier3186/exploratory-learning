import { useCallback, useEffect, useRef, useState } from 'react'
import type { SpeechRecognitionLike } from '../types'

/**
 * 按住说话（push-to-talk）语音输入 Hook
 *
 * 核心设计：
 * 1. 按下 → startInput：同步触发震动 + 乐观设为 listening 状态
 *    同时在 document 上添加 pointerup/pointercancel 监听器
 *    （不在按钮上用 onPointerLeave，因为 CSS transform 会导致按钮边界变化，
 *     在移动端引发 pointerleave 误触发，造成"按住说话/松开结束"循环）
 * 2. 松开 → stopInput（由 document 级 pointerup 触发）：同步重置状态 + 移除监听器
 * 3. onend/onerror 仅作为兜底清理
 * 4. 运行时超时检测：start() 后 2.5 秒内无 onstart/onresult → 判定不支持
 * 5. 失败计数：松开后如果识别器从未启动（confirmedRef=false），累计失败次数
 *    2 次后主动提示浏览器可能不支持，避免用户反复无效尝试
 */

/** 触发震动反馈（静默失败，不支持的平台自动跳过） */
function haptic(pattern: number | number[]) {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(pattern)
    }
  } catch {
    // 某些浏览器在无用户授权时抛异常，静默忽略
  }
}

/** 运行时检测超时时间（毫秒）：start() 后多久没 onstart → 判定不支持 */
const START_TIMEOUT_MS = 2500

/** 结果超时时间（毫秒）：onstart 后多久没 onresult → 判定语音服务被墙 */
const RESULT_TIMEOUT_MS = 6000

/** 连续失败几次后提示浏览器可能不支持 */
const MAX_FAILED_ATTEMPTS = 2

export function useVoiceInput(
  onTranscript: (text: string) => void,
  onNotice: (msg: string) => void,
) {
  const [isListening, setIsListening] = useState(false)
  const [voiceSupported, setVoiceSupported] = useState(false)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const speechBaseRef = useRef('')
  const finalTranscriptRef = useRef('')
  const interimRef = useRef('')
  // 用 ref 跟踪 listening 状态，避免 state 异步更新导致的竞态
  const isListeningRef = useRef(false)
  // 运行时超时检测定时器
  const startTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 标记是否已确认识别器真正启动（onstart 或 onresult 已触发）
  const confirmedRef = useRef(false)
  // 连续失败次数：松开时 confirmedRef 为 false 则 +1，成功识别时重置为 0
  const failedAttemptsRef = useRef(0)
  // document 级 pointerup 处理函数引用（用于添加/移除监听器）
  const docPointerUpHandlerRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    setVoiceSupported(Boolean(window.SpeechRecognition || window.webkitSpeechRecognition))
    return () => {
      try { recognitionRef.current?.stop() } catch { /* ignore */ }
      recognitionRef.current = null
      isListeningRef.current = false
      if (startTimeoutRef.current) clearTimeout(startTimeoutRef.current)
      // 清理 document 级监听器
      if (docPointerUpHandlerRef.current) {
        document.removeEventListener('pointerup', docPointerUpHandlerRef.current)
        document.removeEventListener('pointercancel', docPointerUpHandlerRef.current)
        docPointerUpHandlerRef.current = null
      }
    }
  }, [])

  /** 清理超时定时器 */
  const clearStartTimeout = useCallback(() => {
    if (startTimeoutRef.current) {
      clearTimeout(startTimeoutRef.current)
      startTimeoutRef.current = null
    }
  }, [])

  /** 停止语音识别（松开按钮时调用） */
  const stopInput = useCallback(() => {
    // 清除超时检测
    clearStartTimeout()
    // 同步立即重置状态 + 震动
    haptic([20, 40, 20])
    isListeningRef.current = false
    setIsListening(false)

    // 移除 document 级 pointerup 监听器
    if (docPointerUpHandlerRef.current) {
      document.removeEventListener('pointerup', docPointerUpHandlerRef.current)
      document.removeEventListener('pointercancel', docPointerUpHandlerRef.current)
      docPointerUpHandlerRef.current = null
    }

    // 写入最终文本：优先 final，fallback 到 interim
    const textToCommit = finalTranscriptRef.current || interimRef.current
    if (textToCommit) {
      const MAX_LENGTH = 500
      const raw = `${speechBaseRef.current}${textToCommit}`.trimStart()
      const combined = raw.length > MAX_LENGTH ? raw.slice(0, MAX_LENGTH) : raw
      onTranscript(combined)
    }

    // 失败计数：如果识别器从未真正启动，累计失败次数
    if (!confirmedRef.current) {
      failedAttemptsRef.current += 1
      if (failedAttemptsRef.current >= MAX_FAILED_ATTEMPTS) {
        setVoiceSupported(false)
        onNotice('语音识别似乎无法在此浏览器上工作。建议使用 Chrome 浏览器，或直接手动输入。')
      }
    } else {
      // 成功过则重置计数
      failedAttemptsRef.current = 0
    }

    // 停止识别器
    const recog = recognitionRef.current
    recognitionRef.current = null
    if (recog) {
      try { recog.stop() } catch { /* 已停止，忽略 */ }
    }
  }, [onTranscript, clearStartTimeout, onNotice])

  /** 开始语音识别（按下按钮时调用） */
  const startInput = useCallback((currentText: string) => {
    // 用 ref 判断，避免 state 异步更新导致的竞态
    if (isListeningRef.current) return

    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!Recognition) {
      onNotice('当前浏览器不支持语音输入，请换用 Chrome 或 Edge 浏览器。')
      return
    }

    speechBaseRef.current = currentText.trim() ? `${currentText.trim()}\n` : ''
    finalTranscriptRef.current = ''
    interimRef.current = ''
    confirmedRef.current = false

    const recognition = new Recognition()
    recognition.lang = 'zh-CN'
    recognition.interimResults = true
    recognition.continuous = true

    // onstart：确认识别器真正启动，切换到结果超时检测
    recognition.onstart = () => {
      confirmedRef.current = true
      clearStartTimeout()
      // onstart 已触发，但可能因 Google 语音服务被墙而永远不返回 onresult
      // 启动结果超时检测：6 秒内无 onresult → 判定服务不可用
      startTimeoutRef.current = setTimeout(() => {
        if (isListeningRef.current && confirmedRef.current) {
          isListeningRef.current = false
          setIsListening(false)
          setVoiceSupported(false)
          if (docPointerUpHandlerRef.current) {
            document.removeEventListener('pointerup', docPointerUpHandlerRef.current)
            document.removeEventListener('pointercancel', docPointerUpHandlerRef.current)
            docPointerUpHandlerRef.current = null
          }
          const recog = recognitionRef.current
          recognitionRef.current = null
          if (recog) {
            try { recog.stop() } catch { /* ignore */ }
          }
          onNotice('语音识别服务不可用（可能需要科学上网访问 Google 语音服务）。建议使用 Chrome 浏览器或直接手动输入。')
        }
      }, RESULT_TIMEOUT_MS)
    }

    recognition.onresult = (event) => {
      // 收到结果也确认识别器工作正常
      confirmedRef.current = true
      clearStartTimeout()
      let interim = ''
      finalTranscriptRef.current = ''
      for (let index = 0; index < event.results.length; index += 1) {
        const result = event.results[index]
        if (result.isFinal) {
          finalTranscriptRef.current += result[0].transcript
        } else {
          interim += result[0].transcript
        }
      }
      interimRef.current = interim
      const MAX_LENGTH = 500
      const raw = `${speechBaseRef.current}${finalTranscriptRef.current}${interim}`.trimStart()
      const combined = raw.length > MAX_LENGTH ? raw.slice(0, MAX_LENGTH) : raw
      onTranscript(combined)
    }

    recognition.onerror = (event) => {
      clearStartTimeout()
      const errorType = event.error || 'unknown'
      if (errorType === 'no-speech' || errorType === 'aborted') return
      // error 后同步重置状态
      isListeningRef.current = false
      setIsListening(false)
      // 移除 document 级监听器
      if (docPointerUpHandlerRef.current) {
        document.removeEventListener('pointerup', docPointerUpHandlerRef.current)
        document.removeEventListener('pointercancel', docPointerUpHandlerRef.current)
        docPointerUpHandlerRef.current = null
      }
      if (errorType === 'not-allowed' || errorType === 'service-not-allowed') {
        setVoiceSupported(false)
        onNotice('麦克风权限被拒绝了。请在浏览器设置里允许使用麦克风，或直接手动输入。')
      } else if (errorType === 'network') {
        onNotice('语音识别需要网络连接，请检查网络后重试。')
      } else if (errorType === 'audio-capture') {
        onNotice('找不到麦克风设备，请检查麦克风是否已连接。')
      } else {
        onNotice('语音识别遇到问题，可以再试一次或直接手动输入。')
      }
    }

    // onend 兜底清理
    recognition.onend = () => {
      clearStartTimeout()
      if (recognitionRef.current === recognition) {
        recognitionRef.current = null
      }
      if (isListeningRef.current) {
        isListeningRef.current = false
        setIsListening(false)
      }
    }

    recognitionRef.current = recognition
    try {
      recognition.start()
    } catch {
      recognitionRef.current = null
      isListeningRef.current = false
      setIsListening(false)
      return
    }

    // 同步立即触发震动 + 设为 listening
    haptic(30)
    isListeningRef.current = true
    setIsListening(true)

    // 在 document 上添加 pointerup/pointercancel 监听器
    // 这样手指滑出按钮也能正确触发停止
    // 不用 onPointerLeave 是因为 CSS transform: scale 会改变按钮边界
    // 导致移动端 pointerleave 误触发，造成 UI 循环
    docPointerUpHandlerRef.current = stopInput
    document.addEventListener('pointerup', stopInput)
    document.addEventListener('pointercancel', stopInput)

    // 运行时超时检测
    clearStartTimeout()
    startTimeoutRef.current = setTimeout(() => {
      if (!confirmedRef.current && isListeningRef.current) {
        // 识别器从未真正启动 → 标记不支持
        isListeningRef.current = false
        setIsListening(false)
        setVoiceSupported(false)
        // 移除 document 级监听器
        if (docPointerUpHandlerRef.current) {
          document.removeEventListener('pointerup', docPointerUpHandlerRef.current)
          document.removeEventListener('pointercancel', docPointerUpHandlerRef.current)
          docPointerUpHandlerRef.current = null
        }
        const recog = recognitionRef.current
        recognitionRef.current = null
        if (recog) {
          try { recog.stop() } catch { /* ignore */ }
        }
        onNotice('该浏览器不支持语音输入，建议使用 Chrome 浏览器或直接手动输入。')
      }
    }, START_TIMEOUT_MS)
  }, [onTranscript, onNotice, clearStartTimeout, stopInput])

  return { isListening, voiceSupported, startInput, stopInput }
}
