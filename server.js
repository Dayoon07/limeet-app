const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(express.static('public'));
const rooms = {};   // 사용자 관리를 위한 방

io.on('connection', (socket) => {
    console.log('새 사용자 연결:', socket.id);

    // 방 입장하면
    socket.on('join-room', (roomId) => {
        socket.join(roomId);

        if (!rooms[roomId]) rooms[roomId] = [];                 // 방 정보 초기화
        socket.to(roomId).emit('user-connected', socket.id);    // 기존 사용자들에게 새 사용자 알림
        socket.emit('existing-users', rooms[roomId]);           // 새 사용자에게 기존 사용자 목록 전송
        rooms[roomId].push(socket.id);                          // 방에 사용자 추가

        console.log(`${socket.id}가 방 ${roomId}에 입장. 현재 인원: ${rooms[roomId].length}`);
    });

    // WebRTC Offer 전달
    socket.on('offer', (data) => {
        console.log(`Offer 전달: ${socket.id} -> ${data.target}`);
        io.to(data.target).emit('offer', {
            offer: data.offer,
            from: socket.id
        });
    });

    // WebRTC Answer 전달
    socket.on('answer', (data) => {
        console.log(`Answer 전달: ${socket.id} -> ${data.target}`);
        io.to(data.target).emit('answer', {
            answer: data.answer,
            from: socket.id
        });
    });

    // ICE Candidate 전달
    socket.on('ice-candidate', (data) => {
        io.to(data.target).emit('ice-candidate', {
            candidate: data.candidate,
            from: socket.id
        });
    });

    // 연결 해제
    socket.on('disconnect', () => {
        console.log('사용자 연결 해제:', socket.id);

        // 모든 방에서 사용자 제거
        for (let roomId in rooms) {
            const index = rooms[roomId].indexOf(socket.id);
            if (index !== -1) {
                rooms[roomId].splice(index, 1);
                socket.to(roomId).emit('user-disconnected', socket.id);
                
                // 방이 비었으면 삭제
                if (rooms[roomId].length === 0) {
                    delete rooms[roomId];
                }
                
                console.log(`방 ${roomId}에서 퇴장. 남은 인원: ${rooms[roomId]?.length || 0}`);
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log("+--------------------------------------+");
    console.log(`|                                      |`);
    console.log(`|      http://localhost:${PORT}        |`);
    console.log(`|                                      |`);
    console.log("+--------------------------------------+");
});