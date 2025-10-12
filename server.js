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

// 방별 사용자 정보 저장
const rooms = {};

io.on('connection', (socket) => {
    console.log('새 사용자 연결:', socket.id);

    // 방 입장 (닉네임 포함)
    socket.on('join-room', (data) => {
        const { roomId, nickname } = data;
        socket.join(roomId);

        // 방 초기화
        if (!rooms[roomId]) {
            rooms[roomId] = [];
        }

        // 사용자 정보 저장
        const userInfo = {
            id: socket.id,
            nickname: nickname
        };

        // 기존 사용자들에게 새 사용자 알림
        socket.to(roomId).emit('user-connected', {
            userId: socket.id,
            nickname: nickname
        });

        // 새 사용자에게 기존 사용자 목록 전송
        socket.emit('existing-users', rooms[roomId]);

        // 방에 사용자 추가
        rooms[roomId].push(userInfo);
        socket.currentRoom = roomId;
        socket.nickname = nickname;

        console.log(`${nickname}(${socket.id})가 방 ${roomId}에 입장. 현재 인원: ${rooms[roomId].length}`);
    });

    // WebRTC Offer 전달
    socket.on('offer', (data) => {
        console.log(`Offer 전달: ${socket.id} -> ${data.target}`);
        io.to(data.target).emit('offer', {
            offer: data.offer,
            from: socket.id,
            nickname: socket.nickname
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

    // 채팅 메시지 전달
    socket.on('chat-message', (data) => {
        const roomId = socket.currentRoom;
        if (roomId) {
            socket.to(roomId).emit('chat-message', {
                nickname: data.nickname,
                message: data.message,
                timestamp: new Date().toISOString()
            });
            console.log(`[${roomId}] ${data.nickname}: ${data.message}`);
        }
    });

    // 연결 해제
    socket.on('disconnect', () => {
        console.log('사용자 연결 해제:', socket.id);

        // 모든 방에서 사용자 제거
        for (let roomId in rooms) {
            const userIndex = rooms[roomId].findIndex(user => user.id === socket.id);
            
            if (userIndex !== -1) {
                const user = rooms[roomId][userIndex];
                rooms[roomId].splice(userIndex, 1);
                
                // 다른 사용자들에게 퇴장 알림
                socket.to(roomId).emit('user-disconnected', {
                    userId: socket.id,
                    nickname: user.nickname
                });
                
                // 방이 비었으면 삭제
                if (rooms[roomId].length === 0) {
                    delete rooms[roomId];
                    console.log(`방 ${roomId} 삭제됨`);
                } else {
                    console.log(`${user.nickname}이(가) 방 ${roomId}에서 퇴장. 남은 인원: ${rooms[roomId].length}`);
                }
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log("+----------------------------------------+");
    console.log(`|                                        |`);
    console.log(`|                                        |`);
    console.log(`|         http://localhost:${PORT}       |`);
    console.log(`|                                        |`);
    console.log(`|                                        |`);
    console.log("+----------------------------------------+");
});