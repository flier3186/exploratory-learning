import { useCallback, useEffect, useRef, useState } from 'react'
import type { SpeechRecognitionLike } from '../types'

/**
 * 按住说话（push-to-talk）语音输入 Hook
 *
 * 核心设计：
 * 1. 按下 → startInput：同步触发震动 + 乐观设为 listening 状态
 * 2. 松开 → stopInput：同步重置状态 + 触发震动，不依赖 onend 回调
 * 3. onend/onerror 仅作为兜底清理，不作为主要状态更新路径
 *
 * 这样即使 onend 从不触发（微信内置浏览器等环境），
 * 松开按钮后 UI 也能立即恢复正常。
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
  // 关键：用 ref 跟踪 listening 状态，避免 state 异步更新导致的竞态
  // 场景：快速松开→按下时，state 还没更新，startInput 闭包读到旧值导致第二次按下被忽略
  const isListeningRef = useRef(false)

  useEffect(() => {
    setVoiceSupported(Boolean(window.SpeechRecognition || window.webkitSpeechRecognition))
    return () => {
      try { recognitionRef.current?.stop() } catch { /* ignore */ }
      recognitionRef.current = null
      isListeningRef.current = false
    }
  }, [])

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

    const recognition = new Recognition()
    recognition.lang = 'zh-CN'
    recognition.interimResults = true
    recognition.continuous = true

    recognition.onresult = (event) => {
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
      const errorType = event.error || 'unknown'
      if (errorType === 'no-speech' || errorType === 'aborted') return
      // 关键：error 后同步重置状态，避免 UI 卡在"松开结束"
      isListeningRef.current = false
      setIsListening(false)
      if (errorType === 'not-allowed' || errorType === 'service-not-allowed') {
        onNotice('麦克风权限被拒绝了，请在浏览器设置里允许使用麦克风。')
      } else if (errorType === 'network') {
        onNotice('语音识别需要网络连接，请检查网络后重试。')
      } else if (errorType === 'audio-capture') {
        onNotice('找不到麦克风设备，请检查麦克风是否已连接。')
      } else {
        onNotice('语音识别遇到问题，可以再试一次或直接手动输入。')
      }
    }

    // onend 做兜底清理：如果识别器自行结束但状态还没重置，在此修正
    recognition.onend = () => {
      if (recognitionRef.current === recognition) {
        recognitionRef.current = null
      }
      // 兜底：识别器自行结束（超时/错误后）但用户还按着按钮，重置 UI 状态
      if (isListeningRef.current) {
        isListeningRef.current = false
        setIsListening(false)
      }
    }

    recognitionRef.current = recognition
    try {
      recognition.start()
    } catch {
      // start() 失败时，清理状态，不要让 UI 卡在 listening
      recognitionRef.current = null
      isListeningRef.current = false
      setIsListening(false)
      return
    }

    // 关键：同步立即触发震动 + 设为 listening
    // 不等 onstart 回调（很多浏览器不触发 onstart，或延迟严重）
    haptic(30)
    isListeningRef.current = true
    setIsListening(true)
  }, [onTranscript, onNotice])

  /** 停止语音识别（松开按钮时调用） */
  const stopInput = useCallback(() => {
    // 关键：同步立即重置状态 + 震动
    // 不依赖 onend 回调（很多环境 onend 不触发，导致 UI 卡死）
    haptic([20, 40, 20])
    isListeningRef.current = false
    setIsListening(false)

    // 写入最终文本：优先 final，fallback 到 interim（用户说完立即松开时 final 可能还没生成）
    const textToCommit = finalTranscriptRef.current || interimRef.current
    if (textToCommit) {
      const MAX_LENGTH = 500
      const raw = `${speechBaseRef.current}${textToCommit}`.trimStart()
      const combined = raw.length > MAX_LENGTH ? raw.slice(0, MAX_LENGTH) : raw
      onTranscript(combined)
    }

    // 停止识别器
    const recog = recognitionRef.current
    recognitionRef.current = null
    if (recog) {
      try { recog.stop() } catch { /* 已停止，忽略 */ }
    }
  }, [onTranscript])

  return { isListening, voiceSupported, startInput, stopInput }
}
