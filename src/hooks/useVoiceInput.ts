import { useCallback, useEffect, useRef, useState } from 'react'
import type { SpeechRecognitionLike } from '../types'

export function useVoiceInput(
  onTranscript: (text: string) => void,
  onNotice: (msg: string) => void,
) {
  const [isListening, setIsListening] = useState(false)
  const [voiceSupported, setVoiceSupported] = useState(false)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const speechBaseRef = useRef('')
  const shouldStopRef = useRef(false)

  useEffect(() => {
    setVoiceSupported(Boolean(window.SpeechRecognition || window.webkitSpeechRecognition))
    return () => {
      recognitionRef.current?.stop()
    }
  }, [])

  const toggleVoiceInput = useCallback((currentText: string) => {
    if (isListening) {
      shouldStopRef.current = true
      recognitionRef.current?.stop()
      return
    }

    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!Recognition) {
      onNotice('当前浏览器不支持原生语音输入。可以换用 Chrome 或 Edge，或继续手动输入。')
      return
    }

    const recognition = new Recognition()
    recognition.lang = 'zh-CN'
    recognition.interimResults = true
    recognition.continuous = true
    speechBaseRef.current = currentText.trim() ? `${currentText.trim()}\n` : ''

    let finalTranscript = ''

    recognition.onresult = (event) => {
      let interim = ''
      for (let index = 0; index < event.results.length; index += 1) {
        const result = event.results[index]
        if (result.isFinal) {
          finalTranscript += result[0].transcript
        } else {
          interim += result[0].transcript
        }
      }
      // 限制总文本长度，避免过长
      const MAX_LENGTH = 500
      const raw = `${speechBaseRef.current}${finalTranscript}${interim}`.trimStart()
      const combined = raw.length > MAX_LENGTH ? raw.slice(0, MAX_LENGTH) : raw
      onTranscript(combined)
    }

    recognition.onerror = (event) => {
      const errorType = event.error || 'unknown'
      // no-speech is normal when user pauses; don't alarm the user
      if (errorType === 'no-speech' || errorType === 'aborted') {
        setIsListening(false)
        return
      }
      if (errorType === 'not-allowed' || errorType === 'service-not-allowed') {
        onNotice('麦克风权限被拒绝了。请在浏览器设置里允许使用麦克风。')
      } else if (errorType === 'network') {
        onNotice('语音识别需要网络连接，请检查网络后重试。')
      } else {
        onNotice('语音识别遇到问题，可以再试一次或直接手动输入。')
      }
      setIsListening(false)
    }

    recognition.onend = () => {
      if (shouldStopRef.current) {
        // 用户主动停止
        setIsListening(false)
        recognitionRef.current = null
      } else {
        // Chrome continuous 模式自动重启
        try {
          recognition.start()
        } catch {
          setIsListening(false)
          recognitionRef.current = null
        }
      }
    }

    shouldStopRef.current = false
    recognitionRef.current = recognition
    onNotice('正在听你说。说完后可以编辑文字，再生成学习卡片。')
    setIsListening(true)
    try {
      recognition.start()
    } catch {
      // start() can throw if called too quickly after stop()
      onNotice('语音识别启动失败，请稍等再试。')
      setIsListening(false)
    }
  }, [isListening, onTranscript, onNotice])

  return { isListening, voiceSupported, toggleVoiceInput }
}
