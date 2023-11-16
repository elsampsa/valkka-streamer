import asyncio, websockets

async def hello():
    uri = "ws://localhost:3001/ws/stream/mummocamera1"
    async with websockets.connect(uri) as websocket:
        b = await websocket.recv()
        print("got", len(b), "bytes")

if __name__ == "__main__":
    asyncio.run(hello())
