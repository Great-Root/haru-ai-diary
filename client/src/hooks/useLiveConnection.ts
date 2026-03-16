import { useState, useRef, useCallback } from "react";
import { arrayBufferToBase64, base64ToArrayBuffer, pcm16ToFloat32 } from "@/utils/encoding";
import { t } from "@/i18n";

export interface HaruMessage {
  type: string;
  data?: Record<string, unknown>;
}

export interface Weather {
  icon: string;
  desc: string;
  temp: number;
  high: number;
  low: number;
  humidity: number;
  wind_speed: number;
}

export interface Moment {
  id: number;
  content: string;
  emotion: string;
  time: string;
  image_url?: string;
  ref_photo?: string;
  weather?: Weather;
}

export interface Diary {
  id: number;
  date: string;
  content: string;
}

export interface ChatEntry {
  id: string;
  role: "user" | "ai" | "moment" | "diary";
  text?: string;
  imageUrl?: string;
  moment?: Moment;
  diary?: Diary;
  timestamp?: number;
}

type ConnectionState = "idle" | "connecting" | "connected" | "closing" | "closed" | "error";

export function useLiveConnection(persona: string = "warm", gender: string = "female", lang: string = "ko", autoMute: boolean = true, userId: string = "", speakerMode: boolean = true, volume: number = 0.8) {
  const [connectionState, setConnectionState] = useState<ConnectionState>("idle");
  const [statusText, setStatusText] = useState("Ready");
  const [chatEntries, setChatEntries] = useState<ChatEntry[]>([]);
  const [aiSpeaking, _setAiSpeaking] = useState(false);
  const [muted, setMuted] = useState(false);
  const [pendingImageApproval, setPendingImageApproval] = useState<number | null>(null);
  const [pendingDiaryApproval, setPendingDiaryApproval] = useState(false);
  const aiSpeakingRef = useRef(false);
  const setAiSpeaking = useCallback((v: boolean) => {
    aiSpeakingRef.current = v;
    _setAiSpeaking(v);
  }, []);

  // Keep latest settings in refs so connect() always uses current values
  const personaRef = useRef(persona);
  const genderRef = useRef(gender);
  const langRef = useRef(lang);
  const autoMuteRef = useRef(autoMute);
  const speakerModeRef = useRef(speakerMode);
  const volumeRef = useRef(volume);
  const gainNodeRef = useRef<GainNode | null>(null);
  personaRef.current = persona;
  genderRef.current = gender;
  langRef.current = lang;
  autoMuteRef.current = autoMute;
  speakerModeRef.current = speakerMode;
  volumeRef.current = volume;
  // Update gain in real-time
  if (gainNodeRef.current) gainNodeRef.current.gain.value = volume;

  const wsRef = useRef<WebSocket | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const intentionalCloseRef = useRef(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectCountRef = useRef(0);
  const MAX_CLIENT_RECONNECTS = 5;
  const pendingImagesRef = useRef<Map<number, string>>(new Map());
  const turnCompleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Audio recording
  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);


  // Audio playback
  const playbackContextRef = useRef<AudioContext | null>(null);
  const playbackNodeRef = useRef<AudioWorkletNode | null>(null);
  const playbackReadyRef = useRef(false);
  const loopbackAudioRef = useRef<HTMLAudioElement | null>(null);
  const loopbackPcRef = useRef<RTCPeerConnection | null>(null);
  const loopbackPcRemoteRef = useRef<RTCPeerConnection | null>(null);

  // aiSpeaking is controlled by:
  // - true: audio_response or ai transcription (partial)
  // - false: turn_complete or interrupted

  // Streaming transcript accumulators
  const currentUserTextRef = useRef("");
  const currentUserIdRef = useRef<string | null>(null);
  const currentAiTextRef = useRef("");
  const currentAiIdRef = useRef<string | null>(null);
  // Prevent late-arriving user transcription from creating new bubbles
  // after AI already started responding (bidi-demo pattern)
  const inputTranscriptionDoneRef = useRef(false);

  const resetStreamingState = useCallback(() => {
    currentUserTextRef.current = "";
    currentUserIdRef.current = null;
    currentAiTextRef.current = "";
    currentAiIdRef.current = null;
    inputTranscriptionDoneRef.current = false;
  }, []);

  const updateOrCreateBubble = useCallback((role: "user" | "ai", text: string) => {
    if (role === "user") {
      if (!currentUserIdRef.current) {
        const id = crypto.randomUUID();
        currentUserIdRef.current = id;
        setChatEntries((prev) => [...prev, { id, role: "user", text, timestamp: Date.now() }]);
      } else {
        const entryId = currentUserIdRef.current;
        setChatEntries((prev) =>
          prev.map((e) => (e.id === entryId ? { ...e, text } : e))
        );
      }
    } else {
      if (!currentAiIdRef.current) {
        const id = crypto.randomUUID();
        currentAiIdRef.current = id;
        setChatEntries((prev) => [...prev, { id, role: "ai", text, timestamp: Date.now() }]);
      } else {
        const entryId = currentAiIdRef.current;
        setChatEntries((prev) =>
          prev.map((e) => (e.id === entryId ? { ...e, text } : e))
        );
      }
    }
  }, []);

  const playAudio = useCallback((base64Data: string) => {
    const node = playbackNodeRef.current;
    const ctx = playbackContextRef.current;
    if (!node || !ctx) return;
    if (ctx.state === "suspended") ctx.resume();

    const raw = base64ToArrayBuffer(base64Data);
    const float32 = pcm16ToFloat32(new Uint8Array(raw));
    node.port.postMessage(float32);
  }, []);

  const stopPlayback = useCallback(() => {
    playbackNodeRef.current?.port.postMessage("interrupt");
  }, []);

  const sendMessage = useCallback((data: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  const handleServerMessageRef = useRef<(msg: HaruMessage) => void>();
  const handleServerMessage = useCallback(
    (msg: HaruMessage) => {
      switch (msg.type) {
        case "connected":
          setConnectionState("connected");
          setStatusText("Haru is ready! Talk or type...");
          reconnectCountRef.current = 0;
          break;

        case "transcript":
          if (msg.data?.text) {
            const text = (msg.data.text as string).replace(/<[^>]+>/g, "");
            if (text === "") break;

            if (msg.data.source === "user") {
              // Ignore late user transcription after AI started responding
              if (inputTranscriptionDoneRef.current) break;
              if (msg.data.is_final) {
                // Final — complete text, replace entirely
                currentUserTextRef.current = text;
              } else {
                // Partial — incremental, append
                currentUserTextRef.current += text;
              }
              updateOrCreateBubble("user", currentUserTextRef.current);
            } else if (msg.data.source === "ai") {
              // Finalize user transcription when AI starts responding
              if (!inputTranscriptionDoneRef.current) {
                inputTranscriptionDoneRef.current = true;
              }
              // Keep aiSpeaking active while transcription arrives
              if (!aiSpeakingRef.current) {
                setAiSpeaking(true);
                setStatusText("Haru is speaking...");
              }
              if (msg.data.is_final) {
                // Final transcription — complete text, replace entirely
                currentAiTextRef.current = text;
                // aiSpeaking released by playbackEnd event (after audio finishes playing)
              } else {
                // Partial transcription — incremental, append
                currentAiTextRef.current += text;
              }
              updateOrCreateBubble("ai", currentAiTextRef.current);
            }
          }
          break;

        case "audio_response":
          if (msg.data?.data) {
            setAiSpeaking(true);
            setStatusText("Haru is speaking...");
            playAudio(msg.data.data as string);
          }
          break;

        case "turn_complete":
          // Don't release aiSpeaking here — let playbackEnd handle it
          // so auto-mute stays active until audio finishes playing.
          // Fallback: if playbackEnd doesn't fire within 3s, release anyway
          if (aiSpeakingRef.current) {
            if (turnCompleteTimerRef.current) clearTimeout(turnCompleteTimerRef.current);
            turnCompleteTimerRef.current = setTimeout(() => {
              if (aiSpeakingRef.current) {
                setAiSpeaking(false);
                setStatusText("Listening...");
              }
            }, 3000);
          }
          resetStreamingState();
          break;

        case "interrupted":
          setAiSpeaking(false);
          stopPlayback();
          setStatusText("Listening...");
          resetStreamingState();
          break;

        case "moment_saved":
          if (msg.data) {
            const moment = msg.data as unknown as Moment;
            // Apply pending image if it arrived before the card
            const pendingUrl = pendingImagesRef.current.get(moment.id);
            if (pendingUrl) {
              moment.image_url = pendingUrl;
              pendingImagesRef.current.delete(moment.id);
            }
            setChatEntries((prev) => [
              ...prev,
              { id: crypto.randomUUID(), role: "moment", moment, timestamp: Date.now() },
            ]);
          }
          break;

        case "moment_updated":
          if (msg.data) {
            const updated = msg.data as unknown as Moment;
            setChatEntries((prev) => {
              const exists = prev.some((e) => e.role === "moment" && e.moment?.id === updated.id);
              if (exists) {
                return prev.map((e) =>
                  e.role === "moment" && e.moment?.id === updated.id
                    ? { ...e, moment: { ...e.moment!, ...updated } }
                    : e
                );
              }
              // Card doesn't exist — create it
              return [
                ...prev,
                { id: crypto.randomUUID(), role: "moment" as const, moment: updated, timestamp: Date.now() },
              ];
            });
          }
          break;

        case "moment_deleted":
          if (msg.data) {
            const { moment_id } = msg.data as { moment_id: number };
            setChatEntries((prev) =>
              prev.filter((e) => !(e.role === "moment" && e.moment?.id === moment_id))
            );
          }
          break;

        case "image_generated":
          // Remove loading indicator
          setChatEntries((prev) => prev.filter((e) => e.id !== "loading-generate_image"));
          if (msg.data) {
            const { moment_id, image_url, moment: momentData } = msg.data as {
              moment_id: number; image_url: string; moment?: Moment;
            };
            pendingImagesRef.current.set(moment_id, image_url);
            setChatEntries((prev) => {
              const exists = prev.some((e) => e.role === "moment" && e.moment?.id === moment_id);
              if (exists) {
                // Update existing card + add same card at bottom so user sees it
                const existingEntry = prev.find((e) => e.role === "moment" && e.moment?.id === moment_id);
                const updatedMoment = { ...existingEntry!.moment!, image_url };
                const updated = prev.map((e) =>
                  e.role === "moment" && e.moment?.id === moment_id
                    ? { ...e, moment: updatedMoment }
                    : e
                );
                return [
                  ...updated,
                  { id: crypto.randomUUID(), role: "moment" as const, moment: updatedMoment, timestamp: Date.now() },
                ];
              }
              // Card doesn't exist yet — create it if we have moment data
              if (momentData) {
                return [
                  ...prev,
                  { id: crypto.randomUUID(), role: "moment" as const, moment: { ...momentData, image_url }, timestamp: Date.now() },
                ];
              }
              return prev;
            });
          }
          break;

        case "image_approval_request":
          if (msg.data?.moment_id != null) {
            setPendingImageApproval(msg.data.moment_id as number);
          }
          break;

        case "diary_approval_request":
          setPendingDiaryApproval(true);
          break;

        case "tool_loading":
          if (msg.data?.tool) {
            const label = msg.data.tool === "generate_diary" ? t("writingDiary") : t("generatingImage");
            setChatEntries((prev) => [
              ...prev,
              { id: `loading-${msg.data!.tool}`, role: "ai" as const, text: label, timestamp: Date.now() },
            ]);
          }
          break;

        case "diary_generated":
          // Remove loading indicator
          setChatEntries((prev) => prev.filter((e) => e.id !== "loading-generate_diary"));
          if (msg.data && msg.data.content) {
            const diary = msg.data as unknown as Diary;
            setChatEntries((prev) => [
              ...prev,
              { id: crypto.randomUUID(), role: "diary" as const, diary, timestamp: Date.now() },
            ]);
          }
          break;

        case "error":
          setStatusText("Error: " + ((msg.data?.message as string) || "Unknown error"));
          break;
      }
    },
    [updateOrCreateBubble, playAudio, stopPlayback, resetStreamingState, setAiSpeaking]
  );

  handleServerMessageRef.current = handleServerMessage;

  const initPlayback = useCallback(async () => {
    if (!playbackContextRef.current) {
      playbackContextRef.current = new AudioContext({ sampleRate: 24000 });
    }
    const ctx = playbackContextRef.current;
    if (ctx.state === "suspended") await ctx.resume();

    if (!playbackReadyRef.current) {
      await ctx.audioWorklet.addModule("/playback-processor.js");
      const node = new AudioWorkletNode(ctx, "playback-processor");

      // Listen for playback end — release aiSpeaking after audio finishes playing
      node.port.onmessage = (e) => {
        if (e.data === "playbackEnd") {
          if (turnCompleteTimerRef.current) {
            clearTimeout(turnCompleteTimerRef.current);
            turnCompleteTimerRef.current = null;
          }
          setAiSpeaking(false);
          setStatusText("Listening...");
        }
      };

      // Volume control via GainNode
      const gain = ctx.createGain();
      gain.gain.value = volumeRef.current;
      gainNodeRef.current = gain;

      {
        // WebRTC loopback: routes through call audio channel
        // so mobile hardware volume buttons control output correctly
        const dest = ctx.createMediaStreamDestination();
        node.connect(gain).connect(dest);

        const pc1 = new RTCPeerConnection();
        const pc2 = new RTCPeerConnection();
        loopbackPcRef.current = pc1;
        loopbackPcRemoteRef.current = pc2;

        pc1.onicecandidate = (e) => e.candidate && pc2.addIceCandidate(e.candidate);
        pc2.onicecandidate = (e) => e.candidate && pc1.addIceCandidate(e.candidate);

        const loopbackStream = new MediaStream();
        pc2.ontrack = (e) => e.streams[0].getTracks().forEach((t) => loopbackStream.addTrack(t));

        dest.stream.getTracks().forEach((t) => pc1.addTrack(t, dest.stream));

        const offer = await pc1.createOffer();
        await pc1.setLocalDescription(offer);
        await pc2.setRemoteDescription(offer);
        const answer = await pc2.createAnswer();
        await pc2.setLocalDescription(answer);
        await pc1.setRemoteDescription(answer);

        const audioEl = new Audio();
        audioEl.srcObject = loopbackStream;
        audioEl.autoplay = true;
        loopbackAudioRef.current = audioEl;
      }

      playbackNodeRef.current = node;
      playbackReadyRef.current = true;
    }
  }, []);

  const startRecording = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: 16000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: false,
        autoGainControl: true,
      },
    });
    mediaStreamRef.current = stream;

    const ctx = new AudioContext({ sampleRate: 16000 });
    audioContextRef.current = ctx;
    await ctx.audioWorklet.addModule("/audio-processor.js");

    const source = ctx.createMediaStreamSource(stream);
    const worklet = new AudioWorkletNode(ctx, "pcm-processor");

    worklet.port.onmessage = (e) => {
      if (autoMuteRef.current && aiSpeakingRef.current) return;
      const base64 = arrayBufferToBase64(e.data);
      sendMessage({ type: "audio_chunk", data: { data: base64 } });
    };

    source.connect(worklet);
    workletNodeRef.current = worklet;
  }, [sendMessage]);

  const stopRecording = useCallback(() => {
    workletNodeRef.current?.disconnect();
    workletNodeRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
    audioContextRef.current?.close();
    audioContextRef.current = null;

    // Cleanup WebRTC loopback
    loopbackPcRef.current?.close();
    loopbackPcRef.current = null;
    loopbackPcRemoteRef.current?.close();
    loopbackPcRemoteRef.current = null;
    if (loopbackAudioRef.current) {
      loopbackAudioRef.current.srcObject = null;
      loopbackAudioRef.current = null;
    }
    playbackReadyRef.current = false;
  }, []);

  const connect = useCallback(async (isReconnect = false) => {
    setConnectionState("connecting");
    setStatusText(isReconnect ? "Reconnecting..." : "Connecting...");
    if (!isReconnect) {
      setChatEntries([]);
      setMuted(false);
    }
    resetStreamingState();
    intentionalCloseRef.current = false;

    await initPlayback();

    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    const ws = new WebSocket(`${protocol}//${location.host}/ws?persona=${personaRef.current}&gender=${genderRef.current}&lang=${langRef.current}&uid=${encodeURIComponent(userId)}&tz=${encodeURIComponent(tz)}`);
    wsRef.current = ws;

    ws.onopen = async () => {
      reconnectCountRef.current = 0; // Reset on successful connect
      setStatusText("Connected, waiting for AI...");
      try {
        await startRecording();
        setStatusText("Listening...");
      } catch {
        setStatusText("Microphone access denied");
      }
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as HaruMessage;
        handleServerMessageRef.current?.(msg);
      } catch (e) {
        console.error("[WS] Parse error:", e);
      }
    };

    ws.onclose = () => {
      stopRecording();
      stopPlayback();
      if (!intentionalCloseRef.current && reconnectCountRef.current < MAX_CLIENT_RECONNECTS) {
        reconnectCountRef.current++;
        setStatusText(`Reconnecting... (${reconnectCountRef.current}/${MAX_CLIENT_RECONNECTS})`);
        resetStreamingState();
        reconnectTimerRef.current = setTimeout(() => {
          connect(true);
        }, 2000);
      } else if (!intentionalCloseRef.current) {
        setConnectionState("error");
        setStatusText("Connection lost. Please restart.");
      } else {
        setConnectionState("closed");
        setStatusText("Disconnected");
      }
    };

    ws.onerror = () => {
      setConnectionState("error");
    };
  }, [initPlayback, startRecording, stopRecording, handleServerMessage, stopPlayback, resetStreamingState]);

  const disconnect = useCallback(() => {
    intentionalCloseRef.current = true;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    if (turnCompleteTimerRef.current) {
      clearTimeout(turnCompleteTimerRef.current);
      turnCompleteTimerRef.current = null;
    }
    sendMessage({ type: "end_session" });
    stopRecording();
    stopPlayback();

    wsRef.current?.close();
    wsRef.current = null;

    setAiSpeaking(false);
    setConnectionState("idle");
    setStatusText("Conversation ended");
    resetStreamingState();
  }, [sendMessage, stopRecording, stopPlayback, resetStreamingState]);

  const sendTextInput = useCallback(
    (text: string) => {
      if (!text.trim()) return;
      const id = crypto.randomUUID();
      setChatEntries((prev) => [...prev, { id, role: "user", text, timestamp: Date.now() }]);
      currentUserIdRef.current = id;
      currentUserTextRef.current = text;
      sendMessage({ type: "text_input", data: { text } });
    },
    [sendMessage]
  );

  const sendPhoto = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(",")[1];
        const mime = file.type;

        setChatEntries((prev) => [
          ...prev,
          { id: crypto.randomUUID(), role: "user", imageUrl: result, timestamp: Date.now() },
        ]);

        sendMessage({
          type: "image_upload",
          data: { id: Date.now().toString(), data: base64, mime },
        });
      };
      reader.readAsDataURL(file);
    },
    [sendMessage]
  );

  const interrupt = useCallback(() => {
    if (aiSpeakingRef.current) {
      stopPlayback();
      setAiSpeaking(false);
      setStatusText("Listening...");
    }
  }, [stopPlayback, setAiSpeaking]);

  const approveImage = useCallback(() => {
    if (pendingImageApproval == null) return;
    sendMessage({ type: "approve_image", data: { moment_id: pendingImageApproval } });
    setPendingImageApproval(null);
    setChatEntries((prev) => [
      ...prev,
      { id: "loading-generate_image", role: "ai" as const, text: t("generatingImage"), timestamp: Date.now() },
    ]);
  }, [sendMessage, pendingImageApproval]);

  const rejectImage = useCallback(() => {
    if (pendingImageApproval == null) return;
    sendMessage({ type: "reject_image", data: { moment_id: pendingImageApproval } });
    setPendingImageApproval(null);
  }, [sendMessage, pendingImageApproval]);

  const approveDiary = useCallback(() => {
    sendMessage({ type: "approve_diary", data: {} });
    setPendingDiaryApproval(false);
    setChatEntries((prev) => [
      ...prev,
      { id: "loading-generate_diary", role: "ai" as const, text: t("writingDiary"), timestamp: Date.now() },
    ]);
  }, [sendMessage]);

  const rejectDiary = useCallback(() => {
    sendMessage({ type: "reject_diary", data: {} });
    setPendingDiaryApproval(false);
  }, [sendMessage]);

  const toggleMute = useCallback(() => {
    const tracks = mediaStreamRef.current?.getAudioTracks();
    if (tracks && tracks.length > 0) {
      const newMuted = tracks[0].enabled; // enabled → muting, disabled → unmuting
      tracks.forEach((t) => (t.enabled = !newMuted));
      setMuted(newMuted);
    }
  }, []);

  return {
    connectionState,
    statusText,
    chatEntries,
    aiSpeaking,
    muted,
    connect,
    disconnect,
    sendTextInput,
    sendPhoto,
    interrupt,
    toggleMute,
    stopPlayback,
    pendingImageApproval,
    approveImage,
    rejectImage,
    pendingDiaryApproval,
    approveDiary,
    rejectDiary,
  };
}
