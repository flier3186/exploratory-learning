import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * 语音输入 Hook（push-to-talk + MediaRecorder + AI API 转录）
 *
 * 核心改进：不依赖 Web Speech API（Google 服务被墙），不依赖 Vosk（42MB 模型下载太慢）
 * 方案：用 MediaRecorder 录音 → 发送到用户已配置的 AI API /audio/transcriptions 端点转录
 *
 * UX 流程：
 * 1. 按下 → 开始录音（显示"正在录音..."）
 * 2. 松开 → 停止录音 → 发送到 API 转录（显示"正在转写..."）
 * 3. 转录成功 → 文本填入输入框
 * 4. 转录失败 → 提示用户（API 不支持音频或网络错误）
 *
 * 此方案在所有支持 MediaRecorder 的浏览器上工作（包括国产浏览器 Alook/小米等）
 */

// ---------------------------------------------------------------------------
// 辅助函数
// ---------------------------------------------------------------------------

/** 触发震动反馈 */
function haptic(pattern: number | number[]) {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(pattern)
    }
  } catch {
    // 静默忽略
  }
}

/** 检查浏览器是否支持必要的 API */
function checkBrowserSupport(): boolean {
  const hasMediaDevices =
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices !== 'undefined' &&
    typeof navigator.mediaDevices.getUserMedia === 'function'
  const hasMediaRecorder = typeof MediaRecorder !== 'undefined'
  return hasMediaDevices && hasMediaRecorder
}

/**
 * 将 chat/completions URL 转换为 audio/transcriptions URL
 * 例: https://api.groq.com/openai/v1/chat/completions → https://api.groq.com/openai/v1/audio/transcriptions
 */
function deriveSttUrl(apiBase: string): string {
  if (!apiBase) return ''
  // 替换 /chat/completions 为 /audio/transcriptions
  if (apiBase.includes('/chat/completions')) {
    return apiBase.replace('/chat/completions', '/audio/transcriptions')
  }
  // 如果 URL 以 /结尾，去掉斜杠
  const base = apiBase.endsWith('/') ? apiBase.slice(0, -1) : apiBase
  // 如果 URL 以 /v1 结尾，追加 /audio/transcriptions
  if (base.endsWith('/v1')) {
    return `${base}/audio/transcriptions`
  }
  // 兜底：直接追加
  return `${base}/audio/transcriptions`
}

/**
 * 调用 AI API 进行语音转文字
 * 使用 OpenAI 兼容的 /audio/transcriptions 端点
 */
async function transcribeAudio(
  audioBlob: Blob,
  apiBase: string,
  apiKey: string,
): Promise<string> {
  const sttUrl = deriveSttUrl(apiBase)

  const formData = new FormData()
  // 根据浏览器支持的格式选择 MIME 类型
  const mimeType = audioBlob.type || 'audio/webm'
  const ext = mimeType.includes('webm') ? 'webm' : mimeType.includes('mp4') ? 'mp4' : 'webm'
  formData.append('file', audioBlob, `recording.${ext}`)
  // 使用 whisper-1 作为默认模型名（OpenAI 兼容格式）
  formData.append('model', 'whisper-1')
  formData.append('language', 'zh')
  formData.append('response_format', 'json')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30_000)

  try {
    const response = await fetch(sttUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
      signal: controller.signal,
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      if (response.status === 404) {
        throw new Error('STT_NOT_SUPPORTED')
      }
      throw new Error(`API 返回 ${response.status}: ${errorText.slice(0, 200)}`)
    }

    const result = await response.json()
    const text = result.text || result.transcript || ''
    if (!text) {
      throw new Error('API 返回了空结果')
    }
    return text.trim()
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('语音转写超时，请缩短录音时长后重试')
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export type VoiceStatus = 'idle' | 'recording' | 'transcribing' | 'error'

export function useVoiceInput(
  onTranscript: (text: string) => void,
  onNotice: (msg: string) => void,
  apiConfig?: { apiBase: string; apiKey: string; model: string },
) {
  const [isListening, setIsListening] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [voiceSupported, setVoiceSupported] = useState(true)

  // Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const isListeningRef = useRef(false)
  const speechBaseRef = useRef('')
  const docPointerUpHandlerRef = useRef<(() => void) | null>(null)
  // 标记是否真正开始录音（权限获取成功后）
  const recordingStartedRef = useRef(false)
  // 保存最新的 API 配置（避免闭包陷阱）
  const apiConfigRef = useRef(apiConfig)

  useEffect(() => {
    apiConfigRef.current = apiConfig
  }, [apiConfig])

  // 初始检测浏览器支持
  useEffect(() => {
    const supported = checkBrowserSupport()
    setVoiceSupported(supported)
    if (!supported) return

    return () => {
      cleanupRecording()
      if (docPointerUpHandlerRef.current) {
        document.removeEventListener('pointerup', docPointerUpHandlerRef.current)
        document.removeEventListener('pointercancel', docPointerUpHandlerRef.current)
        docPointerUpHandlerRef.current = null
      }
    }
  }, [])

  /** 清理录音资源 */
  const cleanupRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.ondataavailable = null
        mediaRecorderRef.current.onstop = null
        mediaRecorderRef.current.stop()
      } catch { /* ignore */ }
    }
    mediaRecorderRef.current = null

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(t => t.stop())
      mediaStreamRef.current = null
    }
    audioChunksRef.current = []
  }, [])

  /** 停止录音并转录 */
  const stopAndTranscribe = useCallback(async () => {
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

    // 只有在真正开始录音后才进行转录
    if (!recordingStartedRef.current) {
      cleanupRecording()
      return
    }
    recordingStartedRef.current = false

    // 收集录音数据
    const recorder = mediaRecorderRef.current
    if (!recorder || recorder.state === 'inactive') {
      cleanupRecording()
      return
    }

    // 使用 Promise 包装 recorder.onstop
    const audioBlob = await new Promise<Blob | null>((resolve) => {
      recorder.onstop = () => {
        const chunks = audioChunksRef.current
        if (chunks.length === 0) {
          resolve(null)
          return
        }
        const blob = new Blob(chunks, { type: chunks[0]?.type || 'audio/webm' })
        resolve(blob)
      }
      try {
        recorder.stop()
      } catch {
        resolve(null)
      }
    })

    // 停止媒体流
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(t => t.stop())
      mediaStreamRef.current = null
    }

    if (!audioBlob || audioBlob.size < 100) {
      // 录音太短，忽略
      cleanupRecording()
      return
    }

    // 检查 API 配置
    const config = apiConfigRef.current
    if (!config?.apiKey?.trim()) {
      cleanupRecording()
      onNotice('语音转文字需要 API Key。请先在设置中配置 API。')
      return
    }

    // 开始转录
    setIsTranscribing(true)
    try {
      const text = await transcribeAudio(
        audioBlob,
        config.apiBase,
        config.apiKey.trim(),
      )
      const MAX_LENGTH = 500
      const raw = `${speechBaseRef.current}${text}`.trimStart()
      const combined = raw.length > MAX_LENGTH ? raw.slice(0, MAX_LENGTH) : raw
      onTranscript(combined)
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      if (errorMsg === 'STT_NOT_SUPPORTED') {
        onNotice('当前 API 不支持语音转文字。建议使用 Groq API（免费），或在输入框中使用键盘的语音输入。')
      } else {
        onNotice(`语音转写失败：${errorMsg}。可以重试或直接手动输入。`)
      }
    } finally {
      setIsTranscribing(false)
      cleanupRecording()
    }
  }, [onTranscript, onNotice, cleanupRecording])

  /** 开始录音（按下按钮时调用） */
  const startInput = useCallback((currentText: string) => {
    // 防止重复触发
    if (isListeningRef.current || isTranscribing) return
    if (!voiceSupported) {
      onNotice('当前浏览器不支持语音录音。请直接手动输入，或在输入框中使用键盘的语音输入。')
      return
    }

    speechBaseRef.current = currentText.trim() ? `${currentText.trim()}\n` : ''
    audioChunksRef.current = []
    recordingStartedRef.current = false

    // 添加 document 级 pointerup 监听器
    const handler = () => { void stopAndTranscribe() }
    docPointerUpHandlerRef.current = handler
    document.addEventListener('pointerup', handler)
    document.addEventListener('pointercancel', handler)

    // 异步获取麦克风权限并开始录音
    navigator.mediaDevices
      .getUserMedia({
        video: false,
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          channelCount: 1,
        },
      })
      .then((stream) => {
        mediaStreamRef.current = stream

        // 选择支持的 MIME 类型
        const mimeTypes = [
          'audio/webm;codecs=opus',
          'audio/webm',
          'audio/mp4',
          'audio/ogg;codecs=opus',
        ]
        let mimeType = ''
        for (const type of mimeTypes) {
          if (MediaRecorder.isTypeSupported(type)) {
            mimeType = type
            break
          }
        }

        const recorder = mimeType
          ? new MediaRecorder(stream, { mimeType })
          : new MediaRecorder(stream)

        mediaRecorderRef.current = recorder

        recorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            audioChunksRef.current.push(event.data)
          }
        }

        recorder.onerror = (event) => {
          console.error('[MediaRecorder] error:', event)
        }

        recorder.start()
        recordingStartedRef.current = true
        isListeningRef.current = true
        setIsListening(true)
        haptic(30)
      })
      .catch((err) => {
        console.error('[VoiceInput] getUserMedia failed:', err)
        // 移除监听器
        if (docPointerUpHandlerRef.current) {
          document.removeEventListener('pointerup', docPointerUpHandlerRef.current)
          document.removeEventListener('pointercancel', docPointerUpHandlerRef.current)
          docPointerUpHandlerRef.current = null
        }
        isListeningRef.current = false
        setIsListening(false)

        const errorMsg = err instanceof Error ? err.message : String(err)
        if (errorMsg.includes('Permission') || errorMsg.includes('denied') || errorMsg.includes('NotAllowed')) {
          onNotice('麦克风权限被拒绝了。请在浏览器设置里允许使用麦克风。')
        } else if (errorMsg.includes('NotFound') || errorMsg.includes('DevicesNotFoundError')) {
          onNotice('未检测到麦克风设备。请检查设备连接。')
        } else {
          onNotice('无法启动录音，可以重试或直接手动输入。')
        }
      })
  }, [voiceSupported, isTranscribing, onNotice, stopAndTranscribe])

  /** 手动停止（用于 UI 按钮点击） */
  const stopInput = useCallback(() => {
    void stopAndTranscribe()
  }, [stopAndTranscribe])

  return {
    isListening,
    isTranscribing,
    voiceSupported,
    startInput,
    stopInput,
  }
}
