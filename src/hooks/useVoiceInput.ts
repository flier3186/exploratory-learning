import { useCallback, useEffect, useRef, useState } from 'react'
import type { SpeechRecognitionLike } from '../types'

/**
 * 按住说话（push-to-talk）语音输入 Hook
 *
 * 用法：
 *   const { isListening, voiceSupported, startInput, stopInput } = useVoiceInput(...)
 *   <button
 *     onPointerDown={() => startInput(currentText)}
 *     onPointerUp={stopInput}
 *     onPointerLeave={stopInput}
 *     onPointerCancel={stopInput}
 *   />
 *
 * 设计要点：
 * 1. 按下按钮 → 开始识别；松开按钮 → 停止识别并保留最终文本
 * 2. 按下和松开时触发震动反馈（navigator.vibrate）
 * 3. continuous=true 保证按住期间持续识别
 * 4. 松开时调用 recognition.stop()，onend 中不再自动重启
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
  const isStartingRef = useRef(false) // 防止 pointerdown 快速重复触发

  useEffect(() => {
    setVoiceSupported(Boolean(window.SpeechRecognition || window.webkitSpeechRecognition))
    return () => {
      // 组件卸载时停止识别
      try {
        recognitionRef.current?.stop()
      } catch {
        // ignore
      }
      recognitionRef.current = null
    }
  }, [])

  /** 开始语音识别（按住按钮时调用） */
  const startInput = useCallback((currentText: string) => {
    // 如果正在识别或正在启动，不重复启动
    if (isListening || isStartingRef.current) return

    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!Recognition) {
      onNotice('当前浏览器不支持语音输入，请换用 Chrome 或 Edge 浏览器。')
      return
    }

    isStartingRef.current = true
    speechBaseRef.current = currentText.trim() ? `${currentText.trim()}\n` : ''
    finalTranscriptRef.current = ''

    const recognition = new Recognition()
    recognition.lang = 'zh-CN'
    recognition.interimResults = true
    recognition.continuous = true

    recognition.onstart = () => {
      isStartingRef.current = false
      // 按下反馈：短震动 30ms
      haptic(30)
      setIsListening(true)
    }

    recognition.onresult = (event) => {
      let interim = ''
      // 重新计算 finalTranscript（results 是累积的）
      finalTranscriptRef.current = ''
      for (let index = 0; index < event.results.length; index += 1) {
        const result = event.results[index]
        if (result.isFinal) {
          finalTranscriptRef.current += result[0].transcript
        } else {
          interim += result[0].transcript
        }
      }
      // 限制总文本长度
      const MAX_LENGTH = 500
      const raw = `${speechBaseRef.current}${finalTranscriptRef.current}${interim}`.trimStart()
      const combined = raw.length > MAX_LENGTH ? raw.slice(0, MAX_LENGTH) : raw
      onTranscript(combined)
    }

    recognition.onerror = (event) => {
      const errorType = event.error || 'unknown'
      // no-speech / aborted 是正常行为，不提示
      if (errorType === 'no-speech' || errorType === 'aborted') {
        isStartingRef.current = false
        setIsListening(false)
        return
      }
      if (errorType === 'not-allowed' || errorType === 'service-not-allowed') {
        onNotice('麦克风权限被拒绝了，请在浏览器设置里允许使用麦克风。')
      } else if (errorType === 'network') {
        onNotice('语音识别需要网络连接，请检查网络后重试。')
      } else if (errorType === 'audio-capture') {
        onNotice('找不到麦克风设备，请检查麦克风是否已连接。')
      } else {
        onNotice('语音识别遇到问题，可以再试一次或直接手动输入。')
      }
      isStartingRef.current = false
      setIsListening(false)
    }

    recognition.onend = () => {
      // 松开停止时不再自动重启
      isStartingRef.current = false
      setIsListening(false)
      recognitionRef.current = null
      // 松开反馈：双短震动 20ms + 20ms
      haptic([20, 40, 20])
      // 确保最终文本写入（stop 后 onresult 可能已给出 final）
      if (finalTranscriptRef.current) {
        const MAX_LENGTH = 500
        const raw = `${speechBaseRef.current}${finalTranscriptRef.current}`.trimStart()
        const combined = raw.length > MAX_LENGTH ? raw.slice(0, MAX_LENGTH) : raw
        onTranscript(combined)
      }
    }

    recognitionRef.current = recognition
    try {
      recognition.start()
      // 注意：onstart 回调会设置 isListening = true
      // 但某些浏览器 onstart 触发有延迟，这里先乐观设为 true 保证 UI 即时响应
      // 如果 start() 抛异常，下面 catch 会处理
      setTimeout(() => {
        // 如果 500ms 后 onstart 仍未触发，仍然显示聆听状态（某些浏览器不触发 onstart）
        if (isStartingRef.current) {
          isStartingRef.current = false
          haptic(30)
          setIsListening(true)
        }
      }, 500)
    } catch {
      isStartingRef.current = false
      onNotice('语音识别启动失败，请稍等再试。')
    }
  }, [isListening, onTranscript, onNotice])

  /** 停止语音识别（松开按钮时调用） */
  const stopInput = useCallback(() => {
    if (!recognitionRef.current) {
      isStartingRef.current = false
      return
    }
    try {
      recognitionRef.current.stop()
    } catch {
      // stop() 可能抛异常（如果已停止），静默处理
    }
    // onend 会处理状态清理和最终文本
  }, [])

  return { isListening, voiceSupported, startInput, stopInput }
}
