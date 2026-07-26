import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * 语音输入 Hook（push-to-talk + Vosk 离线语音识别）
 *
 * 核心方案：使用 vosk-browser (WebAssembly) 在浏览器内离线识别语音
 * - 不依赖 Web Speech API（Google 服务被墙）
 * - 不依赖 AI API 的音频转写端点（DeepSeek 等不支持）
 * - 首次使用需下载 ~42MB 中文模型，之后浏览器缓存
 *
 * UX 流程：
 * 1. 首次按下 → 提示"正在加载语音模型..." → 下载模型（约42MB，仅一次）
 * 2. 模型加载完成 → 开始录音识别（显示"正在聆听..."）
 * 3. 松开 → 停止录音 → 输出识别文本
 * 4. 后续按下 → 直接开始录音（模型已缓存）
 */

// vosk-browser 的类型声明（库自带 .d.ts，但导入方式特殊）
// 我们用动态导入避免打包问题
interface VoskModel {
  ready: boolean
  terminate(): void
  setLogLevel(level: number): void
  KaldiRecognizer: new (sampleRate: number, grammar?: string) => VoskRecognizer
}

interface VoskRecognizer {
  id: string
  on(event: 'result', listener: (message: { event: 'result'; result: { text: string } }) => void): void
  on(event: 'partialresult', listener: (message: { event: 'partialresult'; result: { partial: string } }) => void): void
  acceptWaveform(buffer: AudioBuffer): void
  setWords(words: boolean): void
  remove(): void
}

interface VoskModule {
  createModel(modelUrl: string, logLevel?: number): Promise<VoskModel>
}

// 模型 URL — 同源加载（部署时从 GitHub Release 下载到 public/models/）
// Cloudflare Pages 单文件限制 26.2MB，模型 42MB 需拆分为 2 个分片
// deploy.yml 在构建时自动下载模型并拆分到 public/models/
const MODEL_BASE = '/models'
const MODEL_MANIFEST = `${MODEL_BASE}/manifest.json`

// 全局模型单例（避免重复加载）
let globalModel: VoskModel | null = null
let globalModelLoading: Promise<VoskModel> | null = null

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
  const hasAudioContext =
    typeof window !== 'undefined' &&
    (typeof AudioContext !== 'undefined' || typeof (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext !== 'undefined')
  return hasMediaDevices && hasAudioContext
}

/** 获取 AudioContext 构造器（兼容 webkit 前缀） */
function getAudioContextClass(): typeof AudioContext | null {
  if (typeof AudioContext !== 'undefined') return AudioContext
  if (typeof window !== 'undefined' && typeof (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext !== 'undefined') {
    return (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  }
  return null
}

/** 从分片下载并合并模型文件，返回 Blob URL */
async function downloadAndMergeModel(
  onProgress?: (msg: string) => void,
): Promise<string> {
  // 获取 manifest
  onProgress?.('正在获取模型清单...')
  const manifestResp = await fetch(MODEL_MANIFEST)
  if (!manifestResp.ok) {
    throw new Error(`无法获取模型清单: ${manifestResp.status}`)
  }
  const manifest = (await manifestResp.json()) as {
    total_size: number
    num_parts: number
    parts: string[]
  }

  // 逐个下载分片
  const chunks: ArrayBuffer[] = []
  for (let i = 0; i < manifest.parts.length; i++) {
    const partName = manifest.parts[i]
    onProgress?.(`正在下载模型分片 ${i + 1}/${manifest.parts.length}...`)
    const partResp = await fetch(`${MODEL_BASE}/${partName}`)
    if (!partResp.ok) {
      throw new Error(`下载分片 ${i + 1} 失败: ${partResp.status}`)
    }
    const buf = await partResp.arrayBuffer()
    chunks.push(buf)
  }

  // 合并分片
  onProgress?.('正在合并模型文件...')
  const blob = new Blob(chunks, { type: 'application/gzip' })
  const blobUrl = URL.createObjectURL(blob)

  // 注意：Blob URL 在页面关闭时自动释放，无需手动清理
  return blobUrl
}

/** 通过 script 标签加载 vosk-browser（绕过 Vite 动态 import 的 5.7MB chunk 问题） */
function loadVoskScript(): Promise<VoskModule> {
  return new Promise((resolve, reject) => {
    // 如果已加载，直接返回
    const w = window as unknown as { Vosk?: VoskModule }
    if (w.Vosk) {
      resolve(w.Vosk)
      return
    }

    // 检查是否已有 script 标签
    const existing = document.getElementById('vosk-script') as HTMLScriptElement | null
    if (existing) {
      existing.addEventListener('load', () => {
        if (w.Vosk) resolve(w.Vosk)
        else reject(new Error('Vosk 脚本加载完成但未定义全局变量'))
      })
      existing.addEventListener('error', () => reject(new Error('Vosk 脚本加载失败')))
      return
    }

    // 创建 script 标签
    const script = document.createElement('script')
    script.id = 'vosk-script'
    script.src = '/vosk.js'
    script.async = true
    script.onload = () => {
      if (w.Vosk) {
        resolve(w.Vosk)
      } else {
        reject(new Error('Vosk 脚本加载完成但未定义全局变量'))
      }
    }
    script.onerror = () => reject(new Error('Vosk 脚本加载失败，请检查网络连接'))
    document.head.appendChild(script)
  })
}

/** 加载 Vosk 模型（单例模式，避免重复下载） */
async function loadVoskModel(
  onProgress?: (msg: string) => void,
): Promise<VoskModel> {
  // 如果模型已加载，直接返回
  if (globalModel) {
    return globalModel
  }

  // 如果正在加载，等待已有 Promise
  if (globalModelLoading) {
    return globalModelLoading
  }

  // 开始加载
  globalModelLoading = (async () => {
    onProgress?.('正在加载语音识别引擎...')

    // 通过 script 标签加载 vosk-browser（不依赖 Vite 动态 import）
    const Vosk = await loadVoskScript()

    // 从分片下载并合并模型
    const modelUrl = await downloadAndMergeModel(onProgress)

    // 创建模型
    const model = await Vosk.createModel(modelUrl, -1) // -1 = Warning log level

    // 等待模型就绪
    if (!model.ready) {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('模型加载超时'))
        }, 120_000) // 2分钟超时

        // 轮询检查模型就绪状态
        const checkReady = setInterval(() => {
          if (model.ready) {
            clearTimeout(timeout)
            clearInterval(checkReady)
            resolve()
          }
        }, 500)
      })
    }

    globalModel = model
    onProgress?.('语音模型加载完成')
    return model
  })()

  try {
    return await globalModelLoading
  } catch (err) {
    // 加载失败，清除状态以便重试
    globalModelLoading = null
    throw err
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export type VoiceStatus = 'idle' | 'loading-model' | 'recording' | 'error'

export function useVoiceInput(
  onTranscript: (text: string) => void,
  onNotice: (msg: string) => void,
) {
  const [isListening, setIsListening] = useState(false)
  const [isModelLoading, setIsModelLoading] = useState(false)
  const [voiceSupported, setVoiceSupported] = useState(true)

  // Refs
  const modelRef = useRef<VoskModel | null>(null)
  const recognizerRef = useRef<VoskRecognizer | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null)
  const isListeningRef = useRef(false)
  const speechBaseRef = useRef('')
  const finalTextRef = useRef('')
  const docPointerUpHandlerRef = useRef<(() => void) | null>(null)

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
    // 停止 ScriptProcessor
    if (scriptProcessorRef.current) {
      try {
        scriptProcessorRef.current.onaudioprocess = null
        scriptProcessorRef.current.disconnect()
      } catch { /* ignore */ }
      scriptProcessorRef.current = null
    }

    // 停止媒体流
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(t => t.stop())
      mediaStreamRef.current = null
    }

    // 关闭 AudioContext
    if (audioContextRef.current) {
      try {
        if (audioContextRef.current.state !== 'closed') {
          audioContextRef.current.close()
        }
      } catch { /* ignore */ }
      audioContextRef.current = null
    }

    // 移除识别器（保留模型供下次使用）
    if (recognizerRef.current) {
      try {
        recognizerRef.current.remove()
      } catch { /* ignore */ }
      recognizerRef.current = null
    }
  }, [])

  /** 停止录音并输出结果 */
  const stopRecording = useCallback(() => {
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

    // 获取最终文本
    const text = finalTextRef.current.trim()

    // 清理资源
    cleanupRecording()

    // 输出识别结果
    if (text) {
      const MAX_LENGTH = 500
      const raw = `${speechBaseRef.current}${text}`.trimStart()
      const combined = raw.length > MAX_LENGTH ? raw.slice(0, MAX_LENGTH) : raw
      onTranscript(combined)
    }

    finalTextRef.current = ''
  }, [onTranscript, cleanupRecording])

  /** 开始录音识别 */
  const startRecording = useCallback(async (currentText: string) => {
    if (isListeningRef.current) return

    speechBaseRef.current = currentText.trim() ? `${currentText.trim()}\n` : ''
    finalTextRef.current = ''

    // 添加 document 级 pointerup 监听器
    const handler = () => { stopRecording() }
    docPointerUpHandlerRef.current = handler
    document.addEventListener('pointerup', handler)
    document.addEventListener('pointercancel', handler)

    try {
      // 1. 加载模型（如果尚未加载）
      if (!modelRef.current) {
        setIsModelLoading(true)
        modelRef.current = await loadVoskModel((msg) => {
          onNotice(msg)
        })
        setIsModelLoading(false)
      }

      // 如果在加载模型期间用户已经松开了按钮，直接返回
      if (!isListeningRef.current) {
        return
      }

      const model = modelRef.current

      // 2. 获取麦克风权限
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          channelCount: 1,
          sampleRate: 16000,
        },
      })
      mediaStreamRef.current = mediaStream

      // 如果在获取权限期间用户已经松开了按钮，清理并返回
      if (!isListeningRef.current) {
        mediaStream.getTracks().forEach(t => t.stop())
        mediaStreamRef.current = null
        return
      }

      // 3. 创建 AudioContext
      const AudioCtxClass = getAudioContextClass()
      if (!AudioCtxClass) {
        throw new Error('浏览器不支持 AudioContext')
      }
      const audioContext = new AudioCtxClass({ sampleRate: 16000 })
      audioContextRef.current = audioContext

      // 4. 创建识别器
      const recognizer = new model.KaldiRecognizer(16000)
      recognizerRef.current = recognizer

      recognizer.on('result', (message) => {
        const text = message.result.text
        if (text) {
          finalTextRef.current = text
        }
      })

      recognizer.on('partialresult', (message) => {
        // 部分结果可以用于实时显示，但为了简化，我们只在最终结果时输出
        // 如果有部分结果，更新 finalTextRef 以防最终结果丢失
        const partial = message.result.partial
        if (partial) {
          // 保留部分结果作为兜底（有些情况下 result 事件可能不触发）
          finalTextRef.current = partial
        }
      })

      // 5. 设置音频处理管线
      const source = audioContext.createMediaStreamSource(mediaStream)
      // ScriptProcessorNode 虽然已废弃，但在所有浏览器上仍然可用
      // AudioWorklet 更现代但兼容性较差，这里优先兼容性
      const scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1)
      scriptProcessorRef.current = scriptProcessor

      scriptProcessor.onaudioprocess = (event) => {
        try {
          if (recognizerRef.current && isListeningRef.current) {
            recognizerRef.current.acceptWaveform(event.inputBuffer)
          }
        } catch (err) {
          console.error('[Vosk] acceptWaveform failed:', err)
        }
      }

      // 连接音频管线
      source.connect(scriptProcessor)
      // ScriptProcessorNode 需要连接到 destination 才能工作（即使不输出声音）
      // 但我们不希望输出到扬声器，所以用 gain=0 的 GainNode 中转
      const silentGain = audioContext.createGain()
      silentGain.gain.value = 0
      scriptProcessor.connect(silentGain)
      silentGain.connect(audioContext.destination)

      // 6. 开始识别
      isListeningRef.current = true
      setIsListening(true)
      haptic(30)

    } catch (err) {
      console.error('[VoiceInput] startRecording failed:', err)
      setIsModelLoading(false)
      isListeningRef.current = false
      setIsListening(false)

      // 移除监听器
      if (docPointerUpHandlerRef.current) {
        document.removeEventListener('pointerup', docPointerUpHandlerRef.current)
        document.removeEventListener('pointercancel', docPointerUpHandlerRef.current)
        docPointerUpHandlerRef.current = null
      }

      cleanupRecording()

      const errorMsg = err instanceof Error ? err.message : String(err)
      if (errorMsg.includes('Permission') || errorMsg.includes('denied') || errorMsg.includes('NotAllowed')) {
        onNotice('麦克风权限被拒绝了。请在浏览器设置里允许使用麦克风。')
      } else if (errorMsg.includes('NotFound') || errorMsg.includes('DevicesNotFoundError')) {
        onNotice('未检测到麦克风设备。请检查设备连接。')
      } else if (errorMsg.includes('模型加载超时') || errorMsg.includes('模型')) {
        onNotice(`语音模型加载失败：${errorMsg}。请检查网络连接后重试。`)
      } else {
        onNotice(`无法启动语音识别：${errorMsg}。可以重试或直接手动输入。`)
      }
    }
  }, [onNotice, stopRecording, cleanupRecording])

  /** 开始语音输入（按下按钮时调用） */
  const startInput = useCallback((currentText: string) => {
    // 防止重复触发
    if (isListeningRef.current || isModelLoading) return
    if (!voiceSupported) {
      onNotice('当前浏览器不支持语音录音。请直接手动输入，或在输入框中使用键盘的语音输入。')
      return
    }

    // 异步开始录音
    void startRecording(currentText)
  }, [voiceSupported, isModelLoading, onNotice, startRecording])

  /** 手动停止（用于 UI 按钮点击） */
  const stopInput = useCallback(() => {
    stopRecording()
  }, [stopRecording])

  return {
    isListening,
    isModelLoading,
    voiceSupported,
    startInput,
    stopInput,
  }
}
