# trivia-server
This is the server that will facilitate:
- game room creation
- user routing to rooms
- host and client controller communications
## Tech
- NodeJS
- Websockets via socket.io
## Tasks
- Server will keep a local list of all active game rooms
- Upon incoming message from host, will create a rooms
- Upon incoming message from client, will funnel socket connection into room
- Upon message from host, will broadcast to all clients in room
- Upon message from client, will send to room host
## Future improvements
- Load balancing so that multiple socket servers can be spun up
- Consolidate storage in redis
  - Multiple servers can reference global list of rooms
  - Incase a socket server goes down, it can maintain list of rooms
