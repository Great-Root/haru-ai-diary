#!/usr/bin/env python3
"""Gemini Live API WebSocket test client - sends text input"""

import asyncio
import json
import websockets

SERVER_URL = "ws://localhost:8080/ws"

async def test():
    print(f"Connecting to {SERVER_URL}...")
    async with websockets.connect(SERVER_URL) as ws:
        # Wait for connected event
        msg = json.loads(await ws.recv())
        print(f"<< {msg['type']}: {msg.get('data', '')}")

        # Send text input (simulating voice)
        text_msg = {
            "type": "text_input",
            "data": {"text": "안녕! 오늘 카페에서 코딩했어. 라떼도 마셨어."}
        }
        await ws.send(json.dumps(text_msg))
        print(f">> Sent text: {text_msg['data']['text']}")

        # Listen for responses
        try:
            while True:
                raw = await asyncio.wait_for(ws.recv(), timeout=15)
                msg = json.loads(raw)
                t = msg.get("type", "")
                d = msg.get("data", {})

                if t == "ai_response":
                    print(f"<< AI: {d.get('text', '')}")
                elif t == "audio_response":
                    print(f"<< Audio: {len(d.get('data', ''))} bytes")
                elif t == "transcript":
                    print(f"<< Transcript ({d.get('source','')}): {d.get('text','')}")
                elif t == "turn_complete":
                    print("<< Turn complete")
                    break
                elif t == "moment_saved":
                    print(f"<< Moment saved: {d}")
                elif t == "interrupted":
                    print("<< Interrupted")
                else:
                    print(f"<< {t}: {d}")
        except asyncio.TimeoutError:
            print("!! Timeout - no response in 15s")

        # End session
        await ws.send(json.dumps({"type": "end_session"}))
        print(">> Session ended")

if __name__ == "__main__":
    asyncio.run(test())
